const express = require("express");
const fs = require("fs");
const mongoose = require("mongoose");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { protect } = require("../middleware/authMiddleware");
const AiAlertSession = require("../models/AiAlertSession");
const {
  createEmergencyIncidentAndNotify,
} = require("../controllers/contactController");

const router = express.Router();
const AI_SERVICE_ENV_PATH = path.resolve(__dirname, "../../../ai-service/.env");
const AI_SERVICE_DIR = path.resolve(__dirname, "../../../ai-service");
const AI_VIDEO_SCRIPT_PATH = path.join(AI_SERVICE_DIR, "scripts", "predict_video_cli.py");
const AI_SERVICE_PYTHON_PATH = path.join(AI_SERVICE_DIR, ".venv", "Scripts", "python.exe");
const DEFAULT_ROBOFLOW_API_URL = "https://serverless.roboflow.com";
const DEFAULT_ROBOFLOW_MODEL_ID = "car-accident-dashcam/1";
const ACCIDENT_LABEL = "vehicle-accident";
const ALERT_CONFIRMATION_WINDOW_MS = 10000;
const pendingAlertTimers = new Map();

const imageBodyParser = express.raw({
  limit: "20mb",
  type: (req) => {
    const contentType = String(req.headers["content-type"] || "").toLowerCase();
    return contentType.startsWith("image/") || contentType === "application/octet-stream";
  },
});

const videoBodyParser = express.raw({
  limit: "100mb",
  type: (req) => {
    const contentType = String(req.headers["content-type"] || "").toLowerCase();
    return contentType.startsWith("video/") || contentType === "application/octet-stream";
  },
});

const getAiServiceUrl = () =>
  String(process.env.AI_SERVICE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const isFetchFailedError = (error) =>
  Boolean(error) &&
  (error.message === "fetch failed" ||
    error.cause?.code === "ECONNREFUSED" ||
    error.cause?.code === "UND_ERR_CONNECT_TIMEOUT");

const runLocalVideoPredictionFallback = (videoBuffer, filename) =>
  new Promise((resolve, reject) => {
    if (!fs.existsSync(AI_SERVICE_PYTHON_PATH) || !fs.existsSync(AI_VIDEO_SCRIPT_PATH)) {
      reject(new Error("Local AI video fallback is not configured."));
      return;
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prana-raksha-video-"));
    const tempVideoPath = path.join(tempDir, filename || "upload.mp4");
    fs.writeFileSync(tempVideoPath, videoBuffer);

    const child = spawn(AI_SERVICE_PYTHON_PATH, [AI_VIDEO_SCRIPT_PATH, tempVideoPath], {
      cwd: AI_SERVICE_DIR,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      fs.rmSync(tempDir, { recursive: true, force: true });
      reject(error);
    });

    child.on("close", (code) => {
      fs.rmSync(tempDir, { recursive: true, force: true });

      if (code !== 0) {
        reject(new Error(stderr.trim() || "Local AI video fallback failed."));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("Local AI video fallback returned an invalid response."));
      }
    });
  });

const loadEnvFileValues = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce((accumulator, line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        return accumulator;
      }

      const separatorIndex = trimmed.indexOf("=");
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");

      accumulator[key] = value;
      return accumulator;
    }, {});
};

const getRoboflowConfig = () => {
  const fileEnv = loadEnvFileValues(AI_SERVICE_ENV_PATH);

  return {
    apiKey: process.env.ROBOFLOW_API_KEY || fileEnv.ROBOFLOW_API_KEY || "",
    modelId:
      process.env.ROBOFLOW_MODEL_ID ||
      fileEnv.ROBOFLOW_MODEL_ID ||
      DEFAULT_ROBOFLOW_MODEL_ID,
    apiUrl:
      (process.env.ROBOFLOW_API_URL ||
        fileEnv.ROBOFLOW_API_URL ||
        DEFAULT_ROBOFLOW_API_URL).replace(/\/$/, ""),
    confidenceThreshold: Number(
      process.env.ROBOFLOW_CONFIDENCE_THRESHOLD ||
        fileEnv.ROBOFLOW_CONFIDENCE_THRESHOLD ||
        "0.4"
    ),
  };
};

const normalizeRoboflowPrediction = (prediction) => {
  const x = Number(prediction.x || 0);
  const y = Number(prediction.y || 0);
  const width = Number(prediction.width || 0);
  const height = Number(prediction.height || 0);
  const confidence = Number(prediction.confidence || 0);

  return {
    label: prediction.class || "unknown",
    confidence: Number.isFinite(confidence) ? confidence : 0,
    box: [
      Number((x - width / 2).toFixed(2)),
      Number((y - height / 2).toFixed(2)),
      Number((x + width / 2).toFixed(2)),
      Number((y + height / 2).toFixed(2)),
    ],
  };
};

const summarizePredictions = (predictions, confidenceThreshold, modelId, provider) => {
  const accidentPredictions = predictions.filter(
    (prediction) =>
      prediction.label === ACCIDENT_LABEL &&
      prediction.confidence >= confidenceThreshold
  );

  return {
    detected: predictions.length > 0,
    accidentDetected: accidentPredictions.length > 0,
    accidentConfidence: accidentPredictions.reduce(
      (highest, prediction) => Math.max(highest, prediction.confidence),
      0
    ),
    predictions,
    provider,
    modelId,
  };
};

const predictWithRoboflowFallback = async (imageBuffer) => {
  const { apiKey, modelId, apiUrl, confidenceThreshold } = getRoboflowConfig();

  if (!apiKey) {
    throw new Error("Roboflow fallback is not configured");
  }

  const response = await fetch(`${apiUrl}/${modelId}?api_key=${encodeURIComponent(apiKey)}&format=json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: imageBuffer.toString("base64"),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.detail || data.message || "Roboflow fallback prediction failed");
  }

  const predictions = Array.isArray(data.predictions)
    ? data.predictions.map(normalizeRoboflowPrediction)
    : [];

  return {
    ...summarizePredictions(predictions, confidenceThreshold, modelId, "roboflow"),
    message: "Roboflow fallback prediction complete",
  };
};

const decodeHeaderValue = (value, fallback) => {
  if (!value || typeof value !== "string") {
    return fallback;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return fallback;
  }
};

const getSourceDescription = (contentType) => {
  const normalizedType = String(contentType || "").toLowerCase();

  if (normalizedType.startsWith("video/")) {
    return "an uploaded video";
  }

  return "an uploaded image";
};

const buildAiAlertMessage = (prediction, contentType) => {
  const confidence = Number(prediction.accidentConfidence || 0);
  const confidencePercent = Number.isFinite(confidence)
    ? `${Math.round(confidence * 100)}%`
    : "unknown";

  return [
    "Emergency alert from Prana Raksha.",
    `AI accident detection found a possible accident in ${getSourceDescription(contentType)}.`,
    `Model: ${prediction.modelId || "Roboflow accident model"}`,
    `Accident confidence: ${confidencePercent}`,
    "Please respond immediately.",
  ].join(" ");
};

const serializeAlertSession = (session) => {
  if (!session) {
    return null;
  }

  const expiresAtTime = new Date(session.expiresAt).getTime();
  const secondsRemaining =
    session.status === "pending"
      ? Math.max(0, Math.ceil((expiresAtTime - Date.now()) / 1000))
      : 0;

  return {
    id: session._id.toString(),
    status: session.status,
    expiresAt: session.expiresAt,
    cancelledAt: session.cancelledAt,
    sentAt: session.sentAt,
    failedAt: session.failedAt,
    errorMessage: session.errorMessage || "",
    incidentAlertId: session.incidentAlertId?.toString?.() || "",
    secondsRemaining,
  };
};

const clearPendingAlertTimer = (sessionId) => {
  const key = String(sessionId);
  const activeTimer = pendingAlertTimers.get(key);

  if (activeTimer) {
    clearTimeout(activeTimer);
    pendingAlertTimers.delete(key);
  }
};

const dispatchPendingAlertSession = async (sessionId) => {
  clearPendingAlertTimer(sessionId);

  const claimedSession = await AiAlertSession.findOneAndUpdate(
    { _id: sessionId, status: "pending" },
    { $set: { status: "processing", errorMessage: "" } },
    { new: true }
  ).populate("userId");

  if (!claimedSession?.userId) {
    return null;
  }

  try {
    const alertResult = await createEmergencyIncidentAndNotify({
      user: claimedSession.userId,
      message: claimedSession.alertMessage,
      incidentLocation: claimedSession.incidentLocation || {},
      title: claimedSession.title || "AI Accident Detected",
      triggerType: claimedSession.triggerType || "ai-accident-detected",
      requireContacts: true,
    });

    return AiAlertSession.findByIdAndUpdate(
      sessionId,
      {
        $set: {
          status: "sent",
          sentAt: new Date(),
          incidentAlertId: alertResult.incidentAlert?._id || null,
          errorMessage: "",
        },
      },
      { new: true }
    );
  } catch (error) {
    console.error("AI auto alert dispatch failed:", {
      sessionId: String(sessionId),
      detail: error.message,
    });

    return AiAlertSession.findByIdAndUpdate(
      sessionId,
      {
        $set: {
          status: "failed",
          failedAt: new Date(),
          errorMessage: error.message || "Automatic alert dispatch failed",
        },
      },
      { new: true }
    );
  }
};

const schedulePendingAlertSession = (session) => {
  const delayMs = Math.max(
    0,
    new Date(session.expiresAt).getTime() - Date.now()
  );

  clearPendingAlertTimer(session._id);

  const timerId = setTimeout(() => {
    dispatchPendingAlertSession(session._id).catch((error) => {
      console.error("AI pending alert timer failed:", {
        sessionId: session._id.toString(),
        detail: error.message,
      });
    });
  }, delayMs);

  pendingAlertTimers.set(session._id.toString(), timerId);
};

const createPendingAlertSession = async ({
  user,
  prediction,
  incidentLocation,
  filename,
  contentType,
}) => {
  const session = await AiAlertSession.create({
    userId: user._id,
    status: "pending",
    alertMessage: buildAiAlertMessage(prediction, contentType),
    title: "AI Accident Detected",
    triggerType: "ai-accident-detected",
    sourceFile: {
      filename,
      contentType,
    },
    incidentLocation,
    prediction: {
      provider: prediction.provider || "",
      modelId: prediction.modelId || "",
      accidentConfidence: Number(prediction.accidentConfidence || 0),
    },
    expiresAt: new Date(Date.now() + ALERT_CONFIRMATION_WINDOW_MS),
  });

  schedulePendingAlertSession(session);

  return session;
};

const cancelExistingPendingAlertSessionsForUser = async (userId) => {
  const pendingSessions = await AiAlertSession.find({
    userId,
    status: "pending",
  }).select("_id");

  if (!pendingSessions.length) {
    return;
  }

  pendingSessions.forEach((session) => {
    clearPendingAlertTimer(session._id);
  });

  await AiAlertSession.updateMany(
    {
      _id: {
        $in: pendingSessions.map((session) => session._id),
      },
    },
    {
      $set: {
        status: "cancelled",
        cancelledAt: new Date(),
        errorMessage: "",
      },
    }
  );
};

const getIncidentLocationFromHeaders = (headers) => {
  const latitude = Number(headers["x-incident-latitude"]);
  const longitude = Number(headers["x-incident-longitude"]);
  const address = decodeHeaderValue(headers["x-incident-address"], "");

  return {
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    address,
  };
};

const getIncidentLocation = (req) => {
  if (req.body && !Buffer.isBuffer(req.body) && typeof req.body === "object") {
    const incidentLocation = req.body.incidentLocation || {};
    const latitude = Number(incidentLocation.latitude);
    const longitude = Number(incidentLocation.longitude);
    const address =
      typeof incidentLocation.address === "string"
        ? incidentLocation.address.trim()
        : "";

    return {
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      address,
    };
  }

  return getIncidentLocationFromHeaders(req.headers);
};

const extractImagePayload = (req) => {
  if (Buffer.isBuffer(req.body)) {
    return {
      buffer: req.body,
      contentType: req.headers["content-type"] || "application/octet-stream",
      filename: decodeHeaderValue(req.headers["x-file-name"], "upload.jpg"),
    };
  }

  if (req.body && typeof req.body === "object") {
    const imageBase64 = String(req.body.imageBase64 || "").trim();

    if (!imageBase64) {
      return null;
    }

    try {
      return {
        buffer: Buffer.from(imageBase64, "base64"),
        contentType:
          String(req.body.contentType || "image/jpeg").trim() ||
          "image/jpeg",
        filename:
          String(req.body.filename || "upload.jpg").trim() || "upload.jpg",
      };
    } catch {
      return null;
    }
  }

  return null;
};

const extractVideoPayload = (req) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    return null;
  }

  return {
    buffer: req.body,
    contentType: req.headers["content-type"] || "application/octet-stream",
    filename: decodeHeaderValue(req.headers["x-file-name"], "upload.mp4"),
  };
};

const restorePendingAlertSessions = async () => {
  try {
    const pendingSessions = await AiAlertSession.find({
      status: "pending",
    }).select("_id expiresAt");

    pendingSessions.forEach((session) => {
      schedulePendingAlertSession(session);
    });
  } catch (error) {
    console.error("Unable to restore pending AI alert sessions:", error.message);
  }
};

if (mongoose.connection.readyState === 1) {
  restorePendingAlertSessions().catch(() => null);
} else {
  mongoose.connection.once("open", () => {
    restorePendingAlertSessions().catch(() => null);
  });
}

router.get("/status", protect, async (req, res) => {
  try {
    const response = await fetch(`${getAiServiceUrl()}/model-status`);
    const data = await response.json();

    return res.status(response.ok ? 200 : 502).json(data);
  } catch (error) {
    return res.status(502).json({
      message: "AI service is not reachable",
      detail: error.message,
    });
  }
});

router.post("/predict-image", protect, imageBodyParser, async (req, res) => {
  const imagePayload = extractImagePayload(req);

  if (!imagePayload?.buffer?.length) {
    return res.status(400).json({ message: "No image uploaded" });
  }

  const { buffer: imageBuffer, contentType, filename } = imagePayload;
  const incidentLocation = getIncidentLocation(req);

  await cancelExistingPendingAlertSessionsForUser(req.user._id);

  try {
    const formData = new FormData();
    const imageBlob = new Blob([imageBuffer], { type: contentType });
    formData.append("file", imageBlob, filename);

    const response = await fetch(`${getAiServiceUrl()}/predict/image`, {
      method: "POST",
      body: formData,
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(502).json({
        message: data.detail || data.message || "AI prediction failed",
      });
    }

    const pendingAlertSession = data.accidentDetected
      ? await createPendingAlertSession({
          user: req.user,
          prediction: data,
          incidentLocation,
          filename,
          contentType,
        })
      : null;

    return res.json({
      ...data,
      autoAlertSent: false,
      pendingAlertSession: serializeAlertSession(pendingAlertSession),
    });
  } catch (error) {
    let fallbackPrediction = null;

    try {
      fallbackPrediction = await predictWithRoboflowFallback(imageBuffer);
    } catch (fallbackError) {
      const aiServiceUnavailable = isFetchFailedError(error);
      const fallbackUnavailable =
        fallbackError.message === "Roboflow fallback is not configured";

      console.error("AI image prediction proxy failed:", {
        filename,
        contentType,
        size: imageBuffer.length,
        detail: error.message,
        fallbackDetail: fallbackError.message,
      });

      return res.status(error.statusCode || 502).json({
        message:
          aiServiceUnavailable && fallbackUnavailable
            ? "Image upload failed because the AI service is offline and the fallback model is not configured."
            : fallbackError.message || error.message || "AI service prediction failed",
        detail: aiServiceUnavailable
          ? "Local AI service is not reachable."
          : error.message,
      });
    }

    const pendingAlertSession = fallbackPrediction.accidentDetected
      ? await createPendingAlertSession({
          user: req.user,
          prediction: fallbackPrediction,
          incidentLocation,
          filename,
          contentType,
        })
      : null;

    return res.json({
      ...fallbackPrediction,
      autoAlertSent: false,
      pendingAlertSession: serializeAlertSession(pendingAlertSession),
    });
  }
});

router.post("/predict-video", protect, videoBodyParser, async (req, res) => {
  const videoPayload = extractVideoPayload(req);

  if (!videoPayload?.buffer?.length) {
    return res.status(400).json({ message: "No video uploaded" });
  }

  const { buffer: videoBuffer, contentType, filename } = videoPayload;
  const incidentLocation = getIncidentLocation(req);

  await cancelExistingPendingAlertSessionsForUser(req.user._id);

  try {
    const formData = new FormData();
    const videoBlob = new Blob([videoBuffer], { type: contentType });
    formData.append("file", videoBlob, filename);

    const response = await fetch(`${getAiServiceUrl()}/predict/video`, {
      method: "POST",
      body: formData,
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(502).json({
        message: data.detail || data.message || "AI video prediction failed",
      });
    }

    const pendingAlertSession = data.accidentDetected
      ? await createPendingAlertSession({
          user: req.user,
          prediction: data,
          incidentLocation,
          filename,
          contentType,
        })
      : null;

    return res.json({
      ...data,
      autoAlertSent: false,
      pendingAlertSession: serializeAlertSession(pendingAlertSession),
    });
  } catch (error) {
    let fallbackPrediction = null;

    try {
      fallbackPrediction = await runLocalVideoPredictionFallback(videoBuffer, filename);
    } catch (fallbackError) {
      console.error("AI video prediction proxy failed:", {
        filename,
        contentType,
        size: videoBuffer.length,
        detail: error.message,
        fallbackDetail: fallbackError.message,
      });

      return res.status(error.statusCode || 502).json({
        message: fallbackError.message || error.message || "AI service video prediction failed",
      });
    }

    const pendingAlertSession = fallbackPrediction.accidentDetected
      ? await createPendingAlertSession({
          user: req.user,
          prediction: fallbackPrediction,
          incidentLocation,
          filename,
          contentType,
        })
      : null;

    return res.json({
      ...fallbackPrediction,
      autoAlertSent: false,
      pendingAlertSession: serializeAlertSession(pendingAlertSession),
    });
  }
});

router.get("/alert-sessions/:id", protect, async (req, res) => {
  try {
    const session = await AiAlertSession.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ message: "AI alert session not found" });
    }

    return res.status(200).json({
      session: serializeAlertSession(session),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/alert-sessions/:id/cancel", protect, async (req, res) => {
  try {
    const session = await AiAlertSession.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user._id,
        status: "pending",
      },
      {
        $set: {
          status: "cancelled",
          cancelledAt: new Date(),
          errorMessage: "",
        },
      },
      { new: true }
    );

    if (session) {
      clearPendingAlertTimer(session._id);

      return res.status(200).json({
        message: "Automatic alert cancelled",
        session: serializeAlertSession(session),
      });
    }

    const existingSession = await AiAlertSession.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!existingSession) {
      return res.status(404).json({ message: "AI alert session not found" });
    }

    return res.status(409).json({
      message: `Alert is already ${existingSession.status}`,
      session: serializeAlertSession(existingSession),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;

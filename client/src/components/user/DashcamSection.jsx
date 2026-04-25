import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";

const AI_PREDICT_URL = "/api/ai/predict-image";
const AI_PREDICT_VIDEO_URL = "/api/ai/predict-video";
const AI_ALERT_SESSIONS_URL = "/api/ai/alert-sessions";
const MAX_UPLOAD_DIMENSION = 1600;
const JPEG_UPLOAD_QUALITY = 0.86;

const getCurrentPosition = () =>
  new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 60000,
      }
    );
  });

const loadImageFromFile = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read the selected image."));
    };

    image.src = objectUrl;
  });

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("Unable to prepare image for upload."));
    }, type, quality);
  });

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      const [, base64 = ""] = result.split(",", 2);
      resolve(base64);
    };

    reader.onerror = () => reject(new Error("Unable to encode image for upload."));
    reader.readAsDataURL(file);
  });

const normalizeImageForUpload = async (file) => {
  if (!file || !String(file.type || "").startsWith("image/")) {
    return file;
  }

  const image = await loadImageFromFile(file);
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const requiresResize = longestSide > MAX_UPLOAD_DIMENSION;
  const requiresConversion = file.type !== "image/jpeg";

  if (!requiresResize && !requiresConversion) {
    return file;
  }

  const scale = requiresResize ? MAX_UPLOAD_DIMENSION / longestSide : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_UPLOAD_QUALITY);
  const baseName = String(file.name || "upload").replace(/\.[^.]+$/, "");

  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
};

export default function DashcamSection({
  setActiveSection,
  dashcamStream,
  dashcamError,
  isStartingDashcam,
  onStartDashcam,
  onStopDashcam,
}) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFileType, setSelectedFileType] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [result, setResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pendingAlertSession, setPendingAlertSession] = useState(null);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [isCancellingAlert, setIsCancellingAlert] = useState(false);
  const [error, setError] = useState("");
  const imageRef = useRef(null);
  const canvasRef = useRef(null);
  const dashcamVideoRef = useRef(null);
  const previewVideoRef = useRef(null);

  const predictions = useMemo(() => result?.predictions || [], [result]);

  useEffect(() => {
    if (!dashcamVideoRef.current) {
      return;
    }

    dashcamVideoRef.current.srcObject = dashcamStream || null;
  }, [dashcamStream]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!previewVideoRef.current || selectedFileType !== "video") {
      return;
    }

    previewVideoRef.current.load();
  }, [previewUrl, selectedFileType]);

  const syncAlertResultState = useCallback((session) => {
    if (!session) {
      return;
    }

    setPendingAlertSession(session);

    if (session.status === "sent") {
      setResult((currentResult) =>
        currentResult
          ? {
              ...currentResult,
              autoAlertSent: true,
            }
          : currentResult
      );
      setError("");
      return;
    }

    if (session.status === "failed") {
      setResult((currentResult) =>
        currentResult
          ? {
              ...currentResult,
              autoAlertSent: false,
            }
          : currentResult
      );
      setError(session.errorMessage || "Automatic alert dispatch failed.");
      return;
    }

    if (session.status === "cancelled") {
      setResult((currentResult) =>
        currentResult
          ? {
              ...currentResult,
              autoAlertSent: false,
            }
          : currentResult
      );
    }
  }, []);

  const refreshPendingAlertSession = useCallback(
    async (sessionId) => {
      if (!sessionId) {
        return null;
      }

      const response = await apiFetch(`${AI_ALERT_SESSIONS_URL}/${sessionId}`);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Unable to refresh AI alert status.");
      }

      syncAlertResultState(data.session || null);
      return data.session || null;
    },
    [syncAlertResultState]
  );

  const cancelPendingAlertSession = useCallback(
    async (sessionId) => {
      if (!sessionId) {
        return null;
      }

      setIsCancellingAlert(true);

      try {
        const response = await apiFetch(`${AI_ALERT_SESSIONS_URL}/${sessionId}/cancel`, {
          method: "PATCH",
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.message || "Unable to cancel automatic alert.");
        }

        syncAlertResultState(data.session || null);
        setError("");
        return data.session || null;
      } finally {
        setIsCancellingAlert(false);
      }
    },
    [syncAlertResultState]
  );

  const drawPredictions = () => {
    const image = imageRef.current;
    const canvas = canvasRef.current;

    if (!image || !canvas || !image.naturalWidth || !image.naturalHeight) {
      return;
    }

    const context = canvas.getContext("2d");
    const imageRect = image.getBoundingClientRect();
    const frameRect = image.parentElement.getBoundingClientRect();

    canvas.width = frameRect.width;
    canvas.height = frameRect.height;
    context.clearRect(0, 0, canvas.width, canvas.height);

    const offsetX = imageRect.left - frameRect.left;
    const offsetY = imageRect.top - frameRect.top;
    const scaleX = imageRect.width / image.naturalWidth;
    const scaleY = imageRect.height / image.naturalHeight;

    predictions.forEach((prediction) => {
      if (!prediction.box) {
        return;
      }

      const [x1, y1, x2, y2] = prediction.box;
      const isAccident = prediction.label === "vehicle-accident";
      const color = isAccident ? "#ff7f6d" : "#22c55e";
      const left = offsetX + x1 * scaleX;
      const top = offsetY + y1 * scaleY;
      const width = (x2 - x1) * scaleX;
      const height = (y2 - y1) * scaleY;
      const label = `${prediction.label} ${(prediction.confidence * 100).toFixed(1)}%`;

      context.strokeStyle = color;
      context.lineWidth = 3;
      context.strokeRect(left, top, width, height);

      context.font = "700 13px Segoe UI, Arial, sans-serif";
      const labelWidth = context.measureText(label).width + 14;
      const labelY = Math.max(top - 27, 0);
      context.fillStyle = color;
      context.fillRect(left, labelY, labelWidth, 23);
      context.fillStyle = "#ffffff";
      context.fillText(label, left + 7, labelY + 16);
    });
  };

  useEffect(() => {
    drawPredictions();
    window.addEventListener("resize", drawPredictions);

    return () => {
      window.removeEventListener("resize", drawPredictions);
    };
  }, [predictions, previewUrl]);

  const handleMediaChange = (event, fileType) => {
    const file = event.target.files?.[0];

    if (pendingAlertSession?.status === "pending") {
      cancelPendingAlertSession(pendingAlertSession.id).catch(() => null);
    }

    setResult(null);
    setPendingAlertSession(null);
    setCountdownSeconds(0);
    setError("");
    setSelectedFile(file || null);
    setSelectedFileType(file ? fileType : "");

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(file ? URL.createObjectURL(file) : "");
    event.target.value = "";
  };

  const analyzeImage = async () => {
    if (!selectedFile) {
      setError("Choose an image first.");
      return;
    }

    setIsAnalyzing(true);
    setError("");
    setResult(null);
    setCountdownSeconds(0);

    try {
      if (pendingAlertSession?.status === "pending") {
        await cancelPendingAlertSession(pendingAlertSession.id).catch(() => null);
      }

      const uploadFile = await normalizeImageForUpload(selectedFile);
      const imageBase64 = await fileToBase64(uploadFile);
      const location = await getCurrentPosition();

      const response = await apiFetch(AI_PREDICT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: uploadFile.name || "upload.jpg",
          contentType: uploadFile.type || "image/jpeg",
          imageBase64,
          incidentLocation: location
            ? {
                latitude: location.latitude,
                longitude: location.longitude,
                address: "",
              }
            : null,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message ||
            data.detail ||
            `AI prediction failed with status ${response.status}.`
        );
      }

      setResult(data);
      setPendingAlertSession(data.pendingAlertSession || null);
      setCountdownSeconds(data.pendingAlertSession?.secondsRemaining || 0);
    } catch (predictionError) {
      setPendingAlertSession(null);
      setError(predictionError.message || "AI prediction failed.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeVideo = async () => {
    if (!selectedFile) {
      setError("Choose a video first.");
      return;
    }

    setIsAnalyzing(true);
    setError("");
    setResult(null);
    setCountdownSeconds(0);

    try {
      if (pendingAlertSession?.status === "pending") {
        await cancelPendingAlertSession(pendingAlertSession.id).catch(() => null);
      }

      const location = await getCurrentPosition();
      const headers = {
        "Content-Type": selectedFile.type || "application/octet-stream",
        "x-file-name": encodeURIComponent(selectedFile.name || "upload.mp4"),
      };

      if (location) {
        headers["x-incident-latitude"] = String(location.latitude);
        headers["x-incident-longitude"] = String(location.longitude);
      }

      const response = await apiFetch(AI_PREDICT_VIDEO_URL, {
        method: "POST",
        headers,
        body: selectedFile,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message ||
            data.detail ||
            `AI video prediction failed with status ${response.status}.`
        );
      }

      setResult(data);
      setPendingAlertSession(data.pendingAlertSession || null);
      setCountdownSeconds(data.pendingAlertSession?.secondsRemaining || 0);
    } catch (predictionError) {
      setPendingAlertSession(null);
      setError(predictionError.message || "AI video prediction failed.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (!pendingAlertSession?.id || pendingAlertSession.status !== "pending") {
      return undefined;
    }

    const expiresAtTime = new Date(pendingAlertSession.expiresAt).getTime();
    const updateCountdown = () => {
      setCountdownSeconds(Math.max(0, Math.ceil((expiresAtTime - Date.now()) / 1000)));
    };

    updateCountdown();

    const intervalId = window.setInterval(updateCountdown, 250);
    const refreshDelay = Math.max(0, expiresAtTime - Date.now()) + 800;
    const refreshTimeoutId = window.setTimeout(() => {
      refreshPendingAlertSession(pendingAlertSession.id).catch((refreshError) => {
        setError(refreshError.message || "Unable to refresh AI alert status.");
      });
    }, refreshDelay);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(refreshTimeoutId);
    };
  }, [
    pendingAlertSession?.id,
    pendingAlertSession?.status,
    pendingAlertSession?.expiresAt,
    refreshPendingAlertSession,
  ]);

  useEffect(() => {
    if (!pendingAlertSession?.id || pendingAlertSession.status !== "processing") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      refreshPendingAlertSession(pendingAlertSession.id).catch((refreshError) => {
        setError(refreshError.message || "Unable to refresh AI alert status.");
      });
    }, 1200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pendingAlertSession?.id, pendingAlertSession?.status, refreshPendingAlertSession]);

  const resultClass = result?.accidentDetected ? "danger" : "safe";
  const autoAlertState = pendingAlertSession?.status || (result?.autoAlertSent ? "sent" : "");
  const resultTitle = result
    ? result.accidentDetected
      ? pendingAlertSession?.status === "pending"
        ? "Accident detected - waiting for confirmation window"
        : pendingAlertSession?.status === "cancelled"
          ? "Auto alert cancelled"
          : pendingAlertSession?.status === "failed"
            ? "Accident detected - alert failed"
            : pendingAlertSession?.status === "sent" || result.autoAlertSent
              ? "Accident detected"
              : "Accident detected"
      : "No accident detected"
    : "Waiting for upload";

  return (
    <section className="section-stack">
      <div className="panel glass-card section-page">
        <div className="section-head-row">
          <div>
            <p className="eyebrow">Live camera</p>
            <h2>Dashcam</h2>
          </div>
          <button className="secondary-btn" onClick={() => setActiveSection("dashboard")} type="button">
            Back to Dashboard
          </button>
        </div>

        <div className="dashcam-preview big-preview">
          {dashcamStream ? (
            <video ref={dashcamVideoRef} autoPlay muted playsInline className="dashcam-video" />
          ) : (
            <div className="dashcam-overlay">
              <span className="live-badge">LIVE</span>
              <p>{dashcamError || "Live dashcam stream preview"}</p>
            </div>
          )}
        </div>

        <div className="hero-actions">
          <button className="primary-btn" type="button" onClick={onStartDashcam} disabled={isStartingDashcam}>
            {isStartingDashcam ? "Starting..." : "Start Dashcam"}
          </button>
          <button className="secondary-btn" type="button" onClick={onStopDashcam} disabled={!dashcamStream}>
            Stop
          </button>
        </div>
      </div>

      <div className="panel glass-card ai-detection-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Upload evidence</p>
            <h3>AI Accident Detection</h3>
          </div>
          {result && (
            <span className={`ai-status-pill ${resultClass}`}>
              {result.accidentDetected ? "Accident" : "Clear"}
            </span>
          )}
        </div>

        <div className="ai-detection-grid">
          <div className="ai-upload-column">
            <label className="upload-card ai-upload-card">
              <span className="upload-icon">IMG</span>
              <h4>Upload Image</h4>
              <p>Select a dashcam or accident image for AI-based detection</p>
              <input type="file" accept="image/*" onChange={(event) => handleMediaChange(event, "image")} hidden />
            </label>

            <label className="upload-card ai-upload-card">
              <span className="upload-icon">VID</span>
              <h4>Upload Video</h4>
              <p>Upload dashcam footage and scan sampled frames for an accident</p>
              <input type="file" accept="video/*" onChange={(event) => handleMediaChange(event, "video")} hidden />
            </label>

            {selectedFile && (
              <div className="ai-file-meta">
                <strong>{selectedFile.name}</strong>
                <span>
                  {selectedFileType === "video" ? "Video" : "Image"} | {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
            )}

            <button
              className="primary-btn full-btn"
              type="button"
              onClick={selectedFileType === "video" ? analyzeVideo : analyzeImage}
              disabled={!selectedFile || isAnalyzing}
            >
              {isAnalyzing
                ? "Analyzing..."
                : selectedFileType === "video"
                  ? "Analyze Video"
                  : "Analyze Image"}
            </button>

            <div className="ai-video-note">
              <strong>Video upload</strong>
              <p>Video detection uses sampled frames and follows the same auto-alert flow as image detection.</p>
            </div>
          </div>

          <div className="ai-preview-frame">
            {previewUrl && selectedFileType === "image" ? (
              <>
                <img ref={imageRef} src={previewUrl} alt="Selected accident evidence" onLoad={drawPredictions} />
                <canvas ref={canvasRef} />
              </>
            ) : previewUrl && selectedFileType === "video" ? (
              <video
                ref={previewVideoRef}
                className="ai-preview-video"
                controls
                preload="metadata"
              >
                <source src={previewUrl} type={selectedFile?.type || "video/mp4"} />
              </video>
            ) : (
              <div className="ai-empty-preview">Image or video preview</div>
            )}
          </div>

          <div className="ai-result-card">
            <span className={`ai-status-pill ${result ? resultClass : "idle"}`}>
              {result ? (result.accidentDetected ? "Accident" : "No Accident") : "Ready"}
            </span>
            <h3>{resultTitle}</h3>
            <p>
              {result
                ? result.accidentDetected
                  ? pendingAlertSession?.status === "pending"
                    ? `The AI model found an accident. The alert will be sent to the admin and emergency contacts in ${countdownSeconds} seconds unless you cancel it.`
                    : pendingAlertSession?.status === "processing"
                      ? "The confirmation window has ended and the alert is being sent now."
                    : pendingAlertSession?.status === "cancelled"
                      ? "The accident detection was cancelled during the confirmation window, so no alert was sent."
                      : pendingAlertSession?.status === "failed"
                        ? "The AI model found an accident, but automatic alerting did not complete."
                        : result.autoAlertSent
                          ? "The AI model found an accident and emergency alerts were sent automatically."
                      : "The AI model found an accident."
                  : `The AI model did not find the accident class in this ${result?.videoMeta ? "video" : "image"}.`
                : "Upload an image or video and run analysis to see model predictions."}
            </p>

            {result?.videoMeta && (
              <div className="ai-video-note">
                <strong>Video scan summary</strong>
                <p>
                  Analyzed {result.videoMeta.analyzedFrames} frames
                  {typeof result.videoMeta.matchedTimestampSeconds === "number"
                    ? `, best match at ${result.videoMeta.matchedTimestampSeconds}s.`
                    : "."}
                </p>
              </div>
            )}

            {pendingAlertSession?.status === "pending" && (
              <div className="ai-alert-countdown">
                <strong>{countdownSeconds}s remaining</strong>
                <p>Cancel this if the accident detection is false.</p>
              </div>
            )}

            {pendingAlertSession?.status === "pending" && (
              <div className="ai-alert-actions">
                <button
                  className="secondary-btn full-btn"
                  type="button"
                  onClick={() => cancelPendingAlertSession(pendingAlertSession.id).catch((cancelError) => {
                    setError(cancelError.message || "Unable to cancel automatic alert.");
                  })}
                  disabled={isCancellingAlert}
                >
                  {isCancellingAlert ? "Cancelling..." : "Cancel Auto Alert"}
                </button>
              </div>
            )}

            {error && <div className="ai-error">{error}</div>}

            <div className="ai-metrics">
              <div>
                <span>Provider</span>
                <strong>{result?.provider || "-"}</strong>
              </div>
              <div>
                <span>Confidence</span>
                <strong>{`${((result?.accidentConfidence || 0) * 100).toFixed(1)}%`}</strong>
              </div>
              <div>
                <span>Model</span>
                <strong>{result?.modelId || "-"}</strong>
              </div>
              <div>
                <span>Auto Alert</span>
                <strong>
                  {result
                    ? autoAlertState === "pending"
                      ? `Waiting ${countdownSeconds}s`
                      : autoAlertState === "processing"
                        ? "Sending..."
                      : autoAlertState === "cancelled"
                        ? "Cancelled"
                        : autoAlertState === "failed"
                          ? "Failed"
                          : result.autoAlertSent
                            ? "Sent"
                            : "Not sent"
                    : "-"}
                </strong>
              </div>
            </div>

            <div className="ai-prediction-list">
              <h4>Predictions</h4>
              {predictions.length ? (
                predictions.map((prediction, index) => (
                  <div className="ai-prediction-item" key={`${prediction.label}-${index}`}>
                    <strong>{prediction.label}</strong>
                    <span>{(prediction.confidence * 100).toFixed(1)}% confidence</span>
                  </div>
                ))
              ) : (
                <div className="ai-prediction-item">
                  <strong>No predictions yet</strong>
                  <span>Results will appear here after analysis.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

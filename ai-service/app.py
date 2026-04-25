import base64
import os
import shutil
import tempfile
from pathlib import Path

import cv2
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import requests


app = FastAPI(title="Prana Raksha AI Service")
ROOT_DIR = Path(__file__).resolve().parent
PRIMARY_MODEL_PATH = ROOT_DIR / "model" / "best.pt"
TRAINED_MODEL_PATH = ROOT_DIR / "outputs" / "training" / "accident-yolo-run" / "weights" / "best.pt"
OUTPUT_DIR = ROOT_DIR / "outputs" / "api"
STATIC_DIR = ROOT_DIR / "static"
ACCIDENT_LABEL = "vehicle-accident"
DEFAULT_ROBOFLOW_API_URL = "https://serverless.roboflow.com"
DEFAULT_ROBOFLOW_MODEL_ID = "car-accident-dashcam/1"
_model = None
VIDEO_SAMPLE_FRAME_COUNT = 8

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def load_env_file():
    env_path = ROOT_DIR / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env_file()


def get_model_provider():
    return os.getenv("MODEL_PROVIDER", "roboflow").strip().lower()


def resolve_model_path():
    for model_path in (PRIMARY_MODEL_PATH, TRAINED_MODEL_PATH):
        if model_path.exists():
            return model_path

    raise FileNotFoundError(
        "Model weights not found. Expected one of: "
        f"{PRIMARY_MODEL_PATH}, {TRAINED_MODEL_PATH}"
    )


def get_model():
    global _model

    if _model is None:
        from ultralytics import YOLO

        _model = YOLO(str(resolve_model_path()))

    return _model


def normalize_roboflow_prediction(prediction):
    x = float(prediction.get("x", 0))
    y = float(prediction.get("y", 0))
    width = float(prediction.get("width", 0))
    height = float(prediction.get("height", 0))

    return {
        "label": prediction.get("class"),
        "confidence": round(float(prediction.get("confidence", 0)), 4),
        "box": [
            round(x - width / 2, 2),
            round(y - height / 2, 2),
            round(x + width / 2, 2),
            round(y + height / 2, 2),
        ],
    }


def summarize_predictions(predictions, confidence_threshold):
    accident_predictions = [
        prediction
        for prediction in predictions
        if prediction["label"] == ACCIDENT_LABEL
        and prediction["confidence"] >= confidence_threshold
    ]

    return {
        "detected": bool(predictions),
        "accidentDetected": bool(accident_predictions),
        "accidentConfidence": max(
            (prediction["confidence"] for prediction in accident_predictions),
            default=0,
        ),
        "predictions": predictions,
    }


def predict_with_roboflow_bytes(image_bytes):
    api_key = os.getenv("ROBOFLOW_API_KEY")
    model_id = os.getenv("ROBOFLOW_MODEL_ID", DEFAULT_ROBOFLOW_MODEL_ID)
    api_url = os.getenv("ROBOFLOW_API_URL", DEFAULT_ROBOFLOW_API_URL).rstrip("/")
    confidence_threshold = float(os.getenv("ROBOFLOW_CONFIDENCE_THRESHOLD", "0.4"))

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Missing ROBOFLOW_API_KEY in ai-service/.env",
        )

    endpoint = f"{api_url}/{model_id}"
    encoded_image = base64.b64encode(image_bytes).decode("utf-8")

    try:
        response = requests.post(
            endpoint,
            params={"api_key": api_key, "format": "json"},
            data=encoded_image,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=60,
        )
        response.raise_for_status()
    except requests.RequestException as error:
        raise HTTPException(
            status_code=502,
            detail=f"Roboflow prediction failed: {error}",
        ) from error

    result = response.json()
    predictions = [
        normalize_roboflow_prediction(prediction)
        for prediction in result.get("predictions", [])
    ]

    return {
        **summarize_predictions(predictions, confidence_threshold),
        "provider": "roboflow",
        "modelId": model_id,
        "message": "Roboflow prediction complete",
    }


def predict_with_yolo(image_path):
    confidence_threshold = float(os.getenv("CONFIDENCE_THRESHOLD", "0.25"))
    try:
        model = get_model()
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    results = model.predict(
        source=str(image_path),
        conf=confidence_threshold,
        imgsz=640,
        project=str(OUTPUT_DIR),
        name="api-image",
        save=True,
    )

    predictions = []
    for result in results:
        if result.boxes is None or result.boxes.cls is None:
            continue

        for class_id, confidence, xyxy in zip(
            result.boxes.cls.tolist(),
            result.boxes.conf.tolist(),
            result.boxes.xyxy.tolist(),
        ):
            label = result.names[int(class_id)]
            predictions.append(
                {
                    "label": label,
                    "confidence": round(float(confidence), 4),
                    "box": [round(float(value), 2) for value in xyxy],
                }
            )

    return {
        **summarize_predictions(predictions, confidence_threshold),
        "provider": "yolo",
        "modelId": str(resolve_model_path().name),
        "message": "YOLO prediction complete",
    }


def predict_with_yolo_frame(frame):
    confidence_threshold = float(os.getenv("CONFIDENCE_THRESHOLD", "0.25"))
    try:
        model = get_model()
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    results = model.predict(
        source=frame,
        conf=confidence_threshold,
        imgsz=640,
        save=False,
        verbose=False,
    )

    predictions = []
    for result in results:
        if result.boxes is None or result.boxes.cls is None:
            continue

        for class_id, confidence, xyxy in zip(
            result.boxes.cls.tolist(),
            result.boxes.conf.tolist(),
            result.boxes.xyxy.tolist(),
        ):
            label = result.names[int(class_id)]
            predictions.append(
                {
                    "label": label,
                    "confidence": round(float(confidence), 4),
                    "box": [round(float(value), 2) for value in xyxy],
                }
            )

    return {
        **summarize_predictions(predictions, confidence_threshold),
        "provider": "yolo",
        "modelId": str(resolve_model_path().name),
        "message": "YOLO frame prediction complete",
    }


def predict_image_from_path(image_path):
    provider = get_model_provider()
    if provider == "roboflow":
        return predict_with_roboflow_bytes(image_path.read_bytes())
    if provider == "yolo":
        return predict_with_yolo(image_path)

    raise HTTPException(
        status_code=400,
        detail="Invalid MODEL_PROVIDER. Use 'roboflow' or 'yolo'.",
    )


def predict_image_from_frame(frame):
    provider = get_model_provider()
    if provider == "roboflow":
        success, encoded_image = cv2.imencode(".jpg", frame)
        if not success:
            raise HTTPException(status_code=500, detail="Unable to encode video frame for prediction.")

        return predict_with_roboflow_bytes(encoded_image.tobytes())
    if provider == "yolo":
        return predict_with_yolo_frame(frame)

    raise HTTPException(
        status_code=400,
        detail="Invalid MODEL_PROVIDER. Use 'roboflow' or 'yolo'.",
    )


def extract_video_frame_predictions(video_path):
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        capture.release()
        raise HTTPException(status_code=400, detail="Unable to read the uploaded video.")

    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
    frame_indexes = []

    if total_frames > 0:
        sample_count = min(VIDEO_SAMPLE_FRAME_COUNT, total_frames)
        if sample_count == 1:
            frame_indexes = [0]
        else:
            frame_indexes = [
                int(round(index * (total_frames - 1) / (sample_count - 1)))
                for index in range(sample_count)
            ]
    else:
        frame_indexes = list(range(VIDEO_SAMPLE_FRAME_COUNT))

    seen_indexes = set()
    frame_results = []

    try:
        for frame_index in frame_indexes:
            if frame_index in seen_indexes:
                continue

            seen_indexes.add(frame_index)
            capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
            success, frame = capture.read()
            if not success or frame is None:
                continue

            prediction = predict_image_from_frame(frame)
            frame_results.append(
                {
                    "frameIndex": frame_index,
                    "timestampSeconds": round(frame_index / fps, 2) if fps > 0 else None,
                    "prediction": prediction,
                }
            )
    finally:
        capture.release()

    if not frame_results:
        raise HTTPException(status_code=400, detail="No readable frames were found in the uploaded video.")

    accident_frames = [
        frame_result
        for frame_result in frame_results
        if frame_result["prediction"]["accidentDetected"]
    ]
    best_frame = max(
        accident_frames or frame_results,
        key=lambda frame_result: frame_result["prediction"]["accidentConfidence"],
    )
    best_prediction = best_frame["prediction"]

    return {
        **best_prediction,
        "message": "Video prediction complete",
        "videoMeta": {
            "analyzedFrames": len(frame_results),
            "frameCount": total_frames or None,
            "fps": round(fps, 2) if fps > 0 else None,
            "matchedFrameIndex": best_frame["frameIndex"],
            "matchedTimestampSeconds": best_frame["timestampSeconds"],
        },
    }


@app.get("/")
def upload_ui():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "provider": get_model_provider(),
        "message": "AI service is ready.",
    }


@app.get("/model-status")
def model_status():
    try:
        active_model_path = resolve_model_path()
    except FileNotFoundError:
        active_model_path = None

    return {
        "provider": get_model_provider(),
        "roboflowReady": bool(os.getenv("ROBOFLOW_API_KEY")),
        "roboflowModelId": os.getenv("ROBOFLOW_MODEL_ID", DEFAULT_ROBOFLOW_MODEL_ID),
        "roboflowApiUrl": os.getenv("ROBOFLOW_API_URL", DEFAULT_ROBOFLOW_API_URL),
        "yoloReady": active_model_path is not None,
        "activeModelPath": str(active_model_path) if active_model_path else None,
        "preferredModelPath": str(PRIMARY_MODEL_PATH),
        "trainedFallbackPath": str(TRAINED_MODEL_PATH),
    }


@app.post("/predict/image")
async def predict_image(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    suffix = Path(file.filename).suffix or ".jpg"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        shutil.copyfileobj(file.file, temp_file)
        temp_path = Path(temp_file.name)

    try:
        return predict_image_from_path(temp_path)
    finally:
        temp_path.unlink(missing_ok=True)


@app.post("/predict/video")
async def predict_video(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    suffix = Path(file.filename).suffix or ".mp4"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        shutil.copyfileobj(file.file, temp_file)
        temp_path = Path(temp_file.name)

    try:
        return extract_video_frame_predictions(temp_path)
    finally:
        temp_path.unlink(missing_ok=True)

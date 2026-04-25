import argparse
import base64
import json
import os
from pathlib import Path

import requests


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_ENV_PATH = ROOT_DIR / ".env"
DEFAULT_API_URL = "https://serverless.roboflow.com"
DEFAULT_MODEL_ID = "car-accident-dashcam/1"
ACCIDENT_LABEL = "vehicle-accident"


def parse_args():
    parser = argparse.ArgumentParser(
        description="Run accident detection with a hosted Roboflow object detection model."
    )
    parser.add_argument("--source", required=True, help="Path to a local dashcam image.")
    parser.add_argument(
        "--confidence",
        type=float,
        default=None,
        help="Minimum confidence for accidentDetected. Uses ROBOFLOW_CONFIDENCE_THRESHOLD when omitted.",
    )
    parser.add_argument(
        "--model-id",
        default=None,
        help=f"Roboflow model id. Defaults to {DEFAULT_MODEL_ID}.",
    )
    return parser.parse_args()


def get_confidence_threshold(args):
    if args.confidence is not None:
        return args.confidence

    return float(os.getenv("ROBOFLOW_CONFIDENCE_THRESHOLD", "0.4"))


def load_env_file(env_path):
    if not env_path.exists():
        return

    for line in env_path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def run_inference(source_path, model_id):
    api_key = os.getenv("ROBOFLOW_API_KEY")
    api_url = os.getenv("ROBOFLOW_API_URL", DEFAULT_API_URL).rstrip("/")

    if not api_key:
        raise RuntimeError("Missing ROBOFLOW_API_KEY. Add it to ai-service/.env.")

    endpoint = f"{api_url}/{model_id}"
    params = {"api_key": api_key, "format": "json"}

    encoded_image = base64.b64encode(source_path.read_bytes()).decode("utf-8")
    response = requests.post(
        endpoint,
        params=params,
        data=encoded_image,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=60,
    )
    response.raise_for_status()
    return response.json()


def normalize_prediction(prediction):
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


def main():
    args = parse_args()
    load_env_file(DEFAULT_ENV_PATH)

    source_path = Path(args.source).resolve()
    if not source_path.exists():
        raise FileNotFoundError(f"Source image not found: {source_path}")

    model_id = args.model_id or os.getenv("ROBOFLOW_MODEL_ID", DEFAULT_MODEL_ID)

    confidence_threshold = get_confidence_threshold(args)
    result = run_inference(source_path, model_id)

    predictions = [
        normalize_prediction(prediction)
        for prediction in result.get("predictions", [])
    ]
    accident_predictions = [
        prediction
        for prediction in predictions
        if prediction["label"] == ACCIDENT_LABEL
        and prediction["confidence"] >= confidence_threshold
    ]

    response = {
        "detected": bool(predictions),
        "accidentDetected": bool(accident_predictions),
        "accidentConfidence": max(
            (prediction["confidence"] for prediction in accident_predictions),
            default=0,
        ),
        "modelId": model_id,
        "predictions": predictions,
    }

    print(json.dumps(response, indent=2))


if __name__ == "__main__":
    main()

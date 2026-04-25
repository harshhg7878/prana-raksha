import argparse
from pathlib import Path

from ultralytics import YOLO


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_WEIGHTS = ROOT_DIR / "model" / "best.pt"
DEFAULT_OUTPUT_DIR = ROOT_DIR / "outputs" / "predictions"


def parse_args():
    parser = argparse.ArgumentParser(description="Run local YOLO inference on an image or video.")
    parser.add_argument(
        "--source",
        required=True,
        help="Path to input image or video.",
    )
    parser.add_argument(
        "--weights",
        default=str(DEFAULT_WEIGHTS),
        help="Path to trained YOLO weights.",
    )
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold.")
    parser.add_argument("--imgsz", type=int, default=640, help="Inference image size.")
    parser.add_argument(
        "--name",
        default="manual-test",
        help="Prediction run name inside ai-service/outputs/predictions.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    source_path = Path(args.source).resolve()
    weights_path = Path(args.weights).resolve()

    if not source_path.exists():
        raise FileNotFoundError(f"Source file not found: {source_path}")

    if not weights_path.exists():
        raise FileNotFoundError(
            f"Weights not found: {weights_path}\n"
            "Train a model first or place best.pt in ai-service/model/."
        )

    DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    model = YOLO(str(weights_path))
    results = model.predict(
        source=str(source_path),
        conf=args.conf,
        imgsz=args.imgsz,
        project=str(DEFAULT_OUTPUT_DIR),
        name=args.name,
        save=True,
    )

    print(f"Prediction complete. Saved output under: {DEFAULT_OUTPUT_DIR / args.name}")

    for index, result in enumerate(results):
        labels = []
        if result.boxes is not None and result.boxes.cls is not None:
            labels = [result.names[int(cls_id)] for cls_id in result.boxes.cls.tolist()]
        print(f"Result {index + 1}: labels={labels}")


if __name__ == "__main__":
    main()

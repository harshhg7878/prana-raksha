import argparse
from pathlib import Path

from ultralytics import YOLO


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATASET_CONFIG = ROOT_DIR / "datasets" / "accident-dataset.yaml"
DEFAULT_MODEL = "yolov8n.pt"
DEFAULT_OUTPUT_DIR = ROOT_DIR / "outputs" / "training"


def parse_args():
    parser = argparse.ArgumentParser(description="Train a YOLO model for accident detection.")
    parser.add_argument(
        "--data",
        default=str(DEFAULT_DATASET_CONFIG),
        help="Path to YOLO dataset YAML file.",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help="Base YOLO model checkpoint or local .pt path.",
    )
    parser.add_argument("--epochs", type=int, default=50, help="Number of training epochs.")
    parser.add_argument("--imgsz", type=int, default=640, help="Training image size.")
    parser.add_argument("--batch", type=int, default=8, help="Batch size.")
    parser.add_argument("--device", default="cpu", help="Training device, e.g. cpu, 0, 0,1.")
    parser.add_argument(
        "--name",
        default="accident-yolo-run",
        help="Ultralytics run name inside the project output directory.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    data_path = Path(args.data).resolve()

    if not data_path.exists():
        raise FileNotFoundError(
            f"Dataset config not found: {data_path}\n"
            "Create or update ai-service/datasets/accident-dataset.yaml first."
        )

    DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    model = YOLO(args.model)
    model.train(
        data=str(data_path),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project=str(DEFAULT_OUTPUT_DIR),
        name=args.name,
    )


if __name__ == "__main__":
    main()

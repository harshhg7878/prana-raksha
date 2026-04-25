import argparse
import shutil
import tempfile
import zipfile
from pathlib import Path

import yaml


ROOT_DIR = Path(__file__).resolve().parents[1]
DATASETS_DIR = ROOT_DIR / "datasets"
TARGET_DIR = DATASETS_DIR / "accident-data"
TARGET_CONFIG = DATASETS_DIR / "accident-dataset.yaml"
LOCAL_TEMP_DIR = ROOT_DIR / "temp"


def parse_args():
    parser = argparse.ArgumentParser(
        description="Import a YOLO-format dataset folder or ZIP into ai-service/datasets/accident-data."
    )
    parser.add_argument(
        "source",
        help="Path to YOLO dataset ZIP or extracted dataset folder.",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Delete the existing accident-data folder before importing.",
    )
    return parser.parse_args()


def find_dataset_root(source_dir):
    candidates = [source_dir, *source_dir.rglob("*")]

    for candidate in candidates:
        if not candidate.is_dir():
            continue

        has_images = (candidate / "images").exists()
        has_train = (candidate / "train").exists()
        has_data_yaml = (candidate / "data.yaml").exists()

        if has_images or has_train or has_data_yaml:
            return candidate

    raise FileNotFoundError("Could not find a YOLO dataset root inside the source.")


def copy_if_exists(source, target):
    if source.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source, target, dirs_exist_ok=True)
        return True

    return False


def import_split(dataset_root, split_name, target_split_name):
    copied_images = copy_if_exists(
        dataset_root / "images" / split_name,
        TARGET_DIR / "images" / target_split_name,
    )
    copied_labels = copy_if_exists(
        dataset_root / "labels" / split_name,
        TARGET_DIR / "labels" / target_split_name,
    )

    if copied_images or copied_labels:
        return

    copy_if_exists(dataset_root / split_name / "images", TARGET_DIR / "images" / target_split_name)
    copy_if_exists(dataset_root / split_name / "labels", TARGET_DIR / "labels" / target_split_name)


def load_names(dataset_root):
    data_yaml = dataset_root / "data.yaml"

    if not data_yaml.exists():
        return {
            0: "accident",
            1: "damaged-vehicle",
            2: "overturned-vehicle",
            3: "smoke",
            4: "fire",
        }

    with data_yaml.open("r", encoding="utf-8") as file:
        data = yaml.safe_load(file) or {}

    names = data.get("names")

    if isinstance(names, list):
        return {index: name for index, name in enumerate(names)}

    if isinstance(names, dict):
        return {int(index): str(name) for index, name in names.items()}

    return {0: "accident"}


def write_dataset_config(names):
    config = {
        "path": str(TARGET_DIR).replace("\\", "/"),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "names": names,
    }

    with TARGET_CONFIG.open("w", encoding="utf-8") as file:
        yaml.safe_dump(config, file, sort_keys=False)


def import_dataset(source_path, replace=False):
    if replace and TARGET_DIR.exists():
        shutil.rmtree(TARGET_DIR)

    TARGET_DIR.mkdir(parents=True, exist_ok=True)

    if source_path.is_file() and source_path.suffix.lower() == ".zip":
        LOCAL_TEMP_DIR.mkdir(parents=True, exist_ok=True)
        temp_path = LOCAL_TEMP_DIR / "import-extracted"
        if temp_path.exists():
            shutil.rmtree(temp_path, ignore_errors=True)
        temp_path.mkdir(parents=True, exist_ok=True)
        try:
            with zipfile.ZipFile(source_path, "r") as archive:
                archive.extractall(temp_path)
            dataset_root = find_dataset_root(temp_path)
        finally:
            pass
    elif source_path.is_dir():
        dataset_root = find_dataset_root(source_path)
    else:
        raise FileNotFoundError(f"Dataset source not found or unsupported: {source_path}")

    import_split(dataset_root, "train", "train")
    import_split(dataset_root, "valid", "val")
    import_split(dataset_root, "val", "val")
    import_split(dataset_root, "test", "test")
    write_dataset_config(load_names(dataset_root))

    print(f"Dataset imported into: {TARGET_DIR}")
    print(f"Dataset config updated: {TARGET_CONFIG}")


def main():
    args = parse_args()
    import_dataset(Path(args.source).resolve(), replace=args.replace)


if __name__ == "__main__":
    main()

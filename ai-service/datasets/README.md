# Dataset Guide

Expected YOLO dataset layout:

```text
accident-data/
  images/
    train/
    val/
    test/
  labels/
    train/
    val/
    test/
```

Each image should have a matching YOLO-format label file:

```text
class_id x_center y_center width height
```

All coordinate values must be normalized between `0` and `1`.

Update `accident-dataset.yaml` if your dataset folder name or class list changes.

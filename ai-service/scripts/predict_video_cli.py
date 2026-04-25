import json
import sys
from pathlib import Path

from fastapi import HTTPException


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app import extract_video_frame_predictions  # noqa: E402


def main():
    if len(sys.argv) < 2:
        print("Missing video file path.", file=sys.stderr)
        raise SystemExit(1)

    video_path = Path(sys.argv[1]).resolve()
    if not video_path.exists():
        print("Video file not found.", file=sys.stderr)
        raise SystemExit(1)

    try:
        result = extract_video_frame_predictions(video_path)
    except HTTPException as error:
        print(str(error.detail), file=sys.stderr)
        raise SystemExit(1)
    except Exception as error:  # pragma: no cover - defensive CLI fallback
        print(str(error), file=sys.stderr)
        raise SystemExit(1)

    print(json.dumps(result))


if __name__ == "__main__":
    main()

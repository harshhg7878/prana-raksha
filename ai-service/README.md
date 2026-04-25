# AI Service

This folder is reserved for the accident-detection AI service.

Current status:
- YOLO training/testing skeleton added
- Roboflow hosted inference script added for pretrained/hosted model testing
- FastAPI prediction endpoint uses your specific Roboflow model by default
- not connected to the React or Node app yet
- trained checkpoint exists at `outputs/training/accident-yolo-run/weights/best.pt`
- API can use either `model/best.pt` or the latest trained checkpoint fallback

Suggested flow:
1. prepare dataset
2. train/test model
3. validate outputs
4. connect to backend later

Structure:
- `app.py`: future inference API entrypoint
- `requirements.txt`: Python dependencies
- `model/`: trained weights such as `best.pt`
- `datasets/`: training and validation data
- `temp/`: temporary working files
- `outputs/`: prediction outputs and annotated results
- `notebooks/`: optional experiments
- `scripts/`: helper scripts for training/testing

Quick start:
1. Create a Python virtual environment inside `ai-service`
   - Recommended: Python 3.11 or 3.12 for PyTorch/YOLO compatibility
2. Install dependencies:
   - `pip install -r requirements.txt`
   - If Torch is missing after install, install the CPU build:
     - `pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu`
3. Prepare a YOLO dataset config at `datasets/accident-dataset.yaml`
4. Or import a downloaded YOLO ZIP/folder:
   - `python scripts/import_yolo_dataset.py "D:\path\to\dataset.zip" --replace`
5. Train:
   - `python scripts/train.py --data datasets/accident-dataset.yaml`
6. Optional: copy your chosen production weights to `model/best.pt`
7. Test locally:
   - `python scripts/test_inference.py --weights outputs/training/accident-yolo-run/weights/best.pt --source path/to/test-image.jpg`
8. Start API:
   - `uvicorn app:app --reload`

FastAPI custom Roboflow model:
1. Copy `.env.example` to `.env`
2. Set `MODEL_PROVIDER=roboflow`
3. Set your Roboflow values:
   - `ROBOFLOW_API_KEY`
   - `ROBOFLOW_MODEL_ID=car-accident-dashcam/1`
   - `ROBOFLOW_API_URL=https://serverless.roboflow.com`
4. Start the API:
   - `uvicorn app:app --reload`
5. Check model status:
   - `GET http://127.0.0.1:8000/model-status`
6. Send an image to:
   - `POST http://127.0.0.1:8000/predict/image`

Roboflow hosted model test:
1. Copy `.env.example` to `.env`
2. Set:
   - `ROBOFLOW_API_KEY`
   - `ROBOFLOW_MODEL_ID=car-accident-dashcam/1`
   - `ROBOFLOW_API_URL=https://serverless.roboflow.com`
3. Run inference on a local image:
   - `python scripts/roboflow_inference.py --source datasets/accident-data/images/test/v1-Made-with-Clipchamp_mp4-0010_jpg.rf.16f030b6d9211e0b06919b5cf117b600.jpg`
4. Optional confidence override:
   - `python scripts/roboflow_inference.py --source path/to/image.jpg --confidence 0.5`

Notes:
- `app.py` includes `/predict/image` for image inference.
- `/predict/image` returns `accidentDetected` based on the `vehicle-accident` class, not just any vehicle detection.
- `MODEL_PROVIDER=roboflow` uses your specific hosted Roboflow model. `MODEL_PROVIDER=yolo` switches back to local YOLO weights.
- `scripts/roboflow_inference.py` uses Roboflow's hosted REST API, so it needs internet access and a valid API key.
- The script intentionally uses `requests` instead of Roboflow's `inference-sdk` because the current local venv is Python 3.14, while the SDK does not support that Python version yet.
- The current training run only has a few epochs, so validate it carefully before treating it as a safety-critical accident detector.
- The AI service is still not connected to the main app.

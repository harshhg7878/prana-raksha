PRANA RAKSHA - HOW TO RUN THIS PROJECT ON ANOTHER LAPTOP

1. WHAT TO COPY

Copy the full project folder exactly as it is from the pendrive to the laptop.
Example:

D:\React prana raksha

Inside it there should be:
- client
- server
- ai-service


2. SOFTWARE TO INSTALL FIRST

Install these on the other laptop:

- Node.js LTS
- Python 3.11 or Python 3.12
- MongoDB

If MongoDB Atlas is used, then local MongoDB is not required.

Internet is also needed for:
- Roboflow AI model API
- map related features
- SMS features if Twilio is used


3. INSTALL PROJECT DEPENDENCIES

Open PowerShell terminal.

Frontend:

cd "D:\React prana raksha\client"
npm install

Backend:

cd "D:\React prana raksha\server"
npm install

AI service:

cd "D:\React prana raksha\ai-service"
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt

If PyTorch is missing or YOLO gives issue, run:

pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu


4. CREATE ENV FILES

4.1 SERVER ENV FILE

Inside:

D:\React prana raksha\server

create a file named:

.env

Put this inside:

PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
AI_SERVICE_URL=http://127.0.0.1:8000
ALLOWED_ORIGINS=https://localhost:5173

If SMS alert is used, also add:

SMS_ACCOUNT_SID=your_twilio_sid
SMS_AUTH_TOKEN=your_twilio_auth_token
SMS_FROM=your_twilio_phone_number
SMS_DEFAULT_COUNTRY_CODE=+91


4.2 AI SERVICE ENV FILE

Inside:

D:\React prana raksha\ai-service

copy .env.example to .env

or create .env manually and put:

MODEL_PROVIDER=roboflow
MODEL_PATH=./model/best.pt
CONFIDENCE_THRESHOLD=0.25
ROBOFLOW_API_KEY=your_roboflow_api_key
ROBOFLOW_MODEL_ID=car-accident-dashcam/1
ROBOFLOW_API_URL=https://serverless.roboflow.com
ROBOFLOW_CONFIDENCE_THRESHOLD=0.4


5. HOW TO RUN THE PROJECT

Open 3 separate PowerShell terminals.

TERMINAL 1 - BACKEND

cd "D:\React prana raksha\server"
npm run dev

TERMINAL 2 - AI SERVICE

cd "D:\React prana raksha\ai-service"
.\.venv\Scripts\activate
uvicorn app:app --reload

TERMINAL 3 - FRONTEND

cd "D:\React prana raksha\client"
npm run dev


6. OPEN THE PROJECT

Open this in browser:

https://localhost:5173

Use the HTTPS URL because camera access works better on secure origin.


7. IMPORTANT PORTS

- Frontend: https://localhost:5173
- Backend: http://127.0.0.1:5000
- AI service: http://127.0.0.1:8000


8. IF SOMETHING DOES NOT WORK

Check these:

- MongoDB is running or Atlas URL is correct
- server\.env exists and values are correct
- ai-service\.env exists and values are correct
- Roboflow API key is valid
- all 3 terminals are running
- npm install was done in both client and server
- pip install -r requirements.txt was done in ai-service


9. QUICK START SUMMARY

Step 1:
Install Node.js, Python, MongoDB

Step 2:
Run npm install in client and server

Step 3:
Create Python venv in ai-service and install requirements

Step 4:
Create server\.env and ai-service\.env

Step 5:
Start backend, AI service, and frontend in 3 terminals

Step 6:
Open https://localhost:5173

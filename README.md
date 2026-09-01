# PotholeVision

PotholeVision is a FastAPI backend and operations dashboard for detecting and managing road potholes.

## Features

- YOLO-powered pothole detection from uploaded road images
- User registration and sign-in
- Pothole reports and status tracking
- Contractor and work-order management
- Inspection records and analytics summary
- Browser dashboard at `/app/`

## Setup

Use Python 3.12 or later.

```powershell
cd C:\Users\Nitro\Desktop\backend
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Configure `.env` with a PostgreSQL connection and a strong secret:

```env
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@localhost:5432/potholevision
JWT_SECRET=replace-with-a-long-random-value
MODEL_PATH=models/best.pt
UPLOAD_DIR=uploads
```

Ensure the trained model is available at `models/best.pt`.

## Run

```powershell
python -m uvicorn app.main:app --reload --port 8002
```

Open the dashboard at `http://127.0.0.1:8002/app/` and the API documentation at `http://127.0.0.1:8002/docs`.

## Deploy With Render And Neon

1. Push this project to a GitHub repository. Do not commit `.env`.
2. Create a Neon project and copy its PostgreSQL connection string. It must include `sslmode=require`.
3. In Render, select **New > Blueprint** and connect the GitHub repository. Render reads `render.yaml` from the repository.
4. Set `DATABASE_URL` to the Neon connection string when Render asks for it. Render generates `JWT_SECRET` automatically.
5. Deploy. When it completes, open `https://YOUR-SERVICE.onrender.com/app/`.

Render installs dependencies with `pip install -r requirements.txt` and starts the application with `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, as required for public web services. See the [Render FastAPI guide](https://render.com/docs/deploy-fastapi) and [Neon Python connection guide](https://neon.com/docs/guides/python) for the account setup and connection string details.

## Main API Routes

| Route | Purpose |
| --- | --- |
| `POST /auth/register` | Create a user account |
| `POST /auth/login` | Receive an access token |
| `POST /ai/detect` | Run pothole detection on an image |
| `/potholes` | Manage pothole reports |
| `/contractors` | Manage repair contractors |
| `/work-orders` | Manage repair work |
| `/inspections` | Record inspections |
| `GET /analytics/summary` | View operational totals |

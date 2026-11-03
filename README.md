# PotholeVision

A React + Vite road safety dashboard connected to the FastAPI backend and the included YOLO pothole model. The interface uses the existing black and yellow visual theme.

## Included features

- Citizen account registration and sign in
- Public community map and road hazard reporting
- Official operations dashboard with restricted report records and workflow tools
- Create reports and update report workflow status
- AI pothole detection for images and videos, with automatic photo metadata/device GPS tagging
- YOLO detections saved into the database, with confidence and severity results
- Public live pothole map with repair progress and GPS report links to OpenStreetMap
- Interactive OpenStreetMap with clickable red markers for GPS-tagged potholes
- Backend severity, status, and confidence analytics
- Complaint submission and status tracking
- Inspection creation and status tracking
- Contractor work orders and repair status tracking
- FastAPI Swagger docs at `http://127.0.0.1:8000/docs`
- Separate public and official dashboards, based on the backend account role
- Settings with light, dark, and system appearance preferences, saved on this device
- About us page and admin-only inspection, analytics, and repair tools

The model weights are in `backend/models/best.pt` and the backend loads them on the first detection request. Video inference uses the included YOLO + ByteTrack implementation.

## Run locally on Windows

Install Python 3.10 or 3.11 and Node.js 18 or newer. Open two terminals in this project folder.

### 1. Start the backend

```powershell
cd backend
Copy-Item .env.example .env
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The backend creates a local SQLite database at `backend/potholevision.db` by default. New accounts are signed in immediately after registration. The YOLO model runs on CPU. Its first load may take a little while.

### Create or promote an admin account

Citizen accounts created through the sign-up form receive the `CITIZEN` role. To create a separate admin account or promote an existing account, open a terminal in the project root and run:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python create_admin.py
```

The script asks for an email and password without echoing the password. For an existing account, enter its current password to promote it. Sign out and back in after promotion. Admin-only report, complaint, inspection, and work-order status changes are also enforced by the API.

You can also enable the dashboard's three-dot **Official access** option by setting `OFFICIAL_ACCESS_CODE` to a six-digit numeric code and `OFFICIAL_ACCESS_EMAILS` to a comma-separated allowlist of officials' registered emails in `backend/.env`. An official signs into that same email account, opens the three-dot menu, and submits the code. The backend checks both values and promotes the account to `AUTHORITY`. Leave these settings unset to disable this option. Configure them on the deployed backend environment too; never put the code in the frontend `.env`.

If PowerShell blocks virtual environment activation, run the environment's Python directly:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### 2. Start the frontend

In the other terminal, from the project root:

```powershell
npm install
npm run dev
```

Open the Vite URL it prints, usually `http://localhost:3000`. The Vite development proxy sends API requests to `http://127.0.0.1:8000` by default. Set `VITE_BACKEND_PROXY_TARGET` in a root `.env` file if you use another backend address. Restart Vite after changing it.

The live map shows public-safe location, severity, and status data for GPS-tagged, unresolved potholes. When an official marks a repair as resolved, its pin disappears from the public map while the completed record remains available in the official report history. Detailed report records, summary analytics, and official workflow data require an `ADMIN` or `AUTHORITY` account. Photos use embedded GPS metadata when available; otherwise choose a location explicitly or enter coordinates. Reports without saved GPS coordinates cannot appear as map pins. Set `VITE_MAP_TILE_URL` in `.env` to another compatible `{z}/{x}/{y}` tile provider if needed; keep its required attribution visible.

## Supabase and deployment settings

- The FastAPI service remains the application API. Supabase provides its hosted PostgreSQL database; it does not host this Python API process.
- In Supabase, open **Project Settings → Database → Connection string** and copy the **Session pooler** URI. Set it as `DATABASE_URL` in `backend/.env` (or the backend host's environment). Keep the password private and URL-encode special characters in it. The backend accepts `postgres://` and `postgresql://` URLs and requires TLS for PostgreSQL connections.
- The API creates its SQLAlchemy tables on startup. Keep the normal `public` schema selected and use the database password/role from the connection string. Existing SQLite data is not copied automatically; export/import it if you need to preserve local accounts and reports.
- Set `CORS_ORIGINS` in the backend environment to a comma-separated list of the exact origins that serve your frontend, for example `https://your-app.vercel.app`. Include local Vite origins when developing locally.
- Supabase stores the relational data. Uploaded images and videos are currently stored in the FastAPI server's `backend/uploads` directory, so use persistent disk or move those uploads to Supabase Storage before deploying the API on an ephemeral host.
- `JWT_SECRET_KEY` is set to a local development value in the example. Replace it with a long random secret before making the backend public.
- The production frontend defaults to the hosted API URL `https://potholevision.onrender.com`. Set `VITE_API_URL` in the frontend environment to point a deployed frontend at your own API.

## API routes used by this frontend

`/auth/register`, `/auth/login`, `/potholes`, `/potholes/{id}/status`, `/detect/image`, `/detect/video`, `/videos/{filename}`, `/map/potholes`, `/map/summary`, `/progress/updates`, `/official/chat/users`, `/official/chat/messages`, `/official/chat/attachments`, `/dashboard/summary`, `/analytics`, `/complaints`, `/inspections`, and `/work-orders`.


import os
import math
import logging
import hmac
from pathlib import Path
from datetime import datetime
from uuid import uuid4

from fastapi import FastAPI, Depends, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models.pothole import Pothole
from models.user import User
from models.complaint import Complaint
from models.inspection import Inspection
from models.work_order import WorkOrder
from models.progress_update import ProgressUpdate
from models.official_message import OfficialMessage
from models.pothole_detector import PotholeDetector
from auth import hash_password, verify_password, create_access_token, get_current_user, require_roles


# =========================================================
# APP
# =========================================================

logger = logging.getLogger("potholevision")

app = FastAPI(
    title="PotholeVision API",
    description=(
        "AI-powered pothole detection and road infrastructure "
        "management API"
    ),
    version="1.1.0",
)


# =========================================================
# DATABASE
# =========================================================

Base.metadata.create_all(bind=engine)

# `create_all` does not add columns to an already existing message table.
with engine.begin() as connection:
    existing_columns = {column["name"] for column in __import__("sqlalchemy").inspect(connection).get_columns("official_messages")}
    for column_name, column_type in (
        ("attachment_path", "VARCHAR(500)"),
        ("attachment_name", "VARCHAR(255)"),
        ("attachment_type", "VARCHAR(120)"),
    ):
        if column_name not in existing_columns:
            connection.execute(text(f"ALTER TABLE official_messages ADD COLUMN {column_name} {column_type}"))


# =========================================================
# AI MODEL
# =========================================================

BACKEND_DIR = Path(__file__).resolve().parent
detector = PotholeDetector(str(BACKEND_DIR / "models" / "best.pt"))


# =========================================================
# DIRECTORIES
# =========================================================

IMAGE_UPLOAD_DIR = BACKEND_DIR / "uploads" / "images"
VIDEO_UPLOAD_DIR = BACKEND_DIR / "uploads" / "videos"
CHAT_UPLOAD_DIR = BACKEND_DIR / "uploads" / "chat"

MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024
MAX_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024

IMAGE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
VIDEO_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
CHAT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# =========================================================
# CORS
# =========================================================

allowed_origins = {
    origin.strip().rstrip("/")
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,https://potholevision-seven.vercel.app",
    ).split(",")
    if origin.strip()
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allowed_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# CONSTANTS
# =========================================================

GPS_DUPLICATE_RADIUS_METERS = 20.0

POTHOLE_STATUSES = {
    "reported",
    "under_review",
    "inspection_scheduled",
    "inspection_completed",
    "repair_required",
    "work_order_created",
    "in_progress",
    "resolved",
    "rejected",
    "duplicate",
}

COMPLAINT_STATUSES = {
    "submitted",
    "under_review",
    "inspection_scheduled",
    "work_order_created",
    "in_progress",
    "resolved",
    "rejected",
}

INSPECTION_STATUSES = {
    "scheduled",
    "in_progress",
    "completed",
    "cancelled",
}

WORK_ORDER_STATUSES = {
    "assigned",
    "accepted",
    "in_progress",
    "completed",
    "cancelled",
}

SEVERITIES = {
    "low",
    "medium",
    "high",
    "critical",
}


# =========================================================
# HELPER FUNCTIONS
# =========================================================

def calculate_severity(confidence: float) -> str:
    """
    Convert AI confidence into a simple severity level.
    """

    if confidence >= 0.90:
        return "critical"

    if confidence >= 0.80:
        return "high"

    if confidence >= 0.50:
        return "medium"

    return "low"


def calculate_distance_meters(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """
    Calculate geographic distance between two GPS coordinates
    using the Haversine formula.
    """

    earth_radius = 6371000.0

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)

    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad)
        * math.cos(lat2_rad)
        * math.sin(delta_lon / 2) ** 2
    )

    # Protect against tiny floating-point errors.
    a = min(1.0, max(0.0, a))

    c = 2 * math.atan2(
        math.sqrt(a),
        math.sqrt(1 - a),
    )

    return earth_radius * c


def find_nearby_pothole(
    db: Session,
    latitude: float,
    longitude: float,
    radius_meters: float = GPS_DUPLICATE_RADIUS_METERS,
):
    """
    Find the nearest existing pothole within the given
    GPS radius.
    """

    potholes = (
        db.query(Pothole)
        .filter(
            Pothole.latitude.isnot(None),
            Pothole.longitude.isnot(None),
            Pothole.status.notin_(["resolved", "rejected", "duplicate"]),
        )
        .all()
    )

    nearest_pothole = None
    nearest_distance = None

    for pothole in potholes:
        distance = calculate_distance_meters(
            latitude,
            longitude,
            pothole.latitude,
            pothole.longitude,
        )

        if distance <= radius_meters:
            if (
                nearest_distance is None
                or distance < nearest_distance
            ):
                nearest_pothole = pothole
                nearest_distance = distance

    return nearest_pothole, nearest_distance


async def save_upload_file(upload: UploadFile, destination: Path, max_bytes: int):
    """Stream an upload to disk while enforcing a size limit."""
    written = 0
    try:
        with destination.open("wb") as output:
            while chunk := await upload.read(1024 * 1024):
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File is too large. Maximum size is {max_bytes // (1024 * 1024)} MB.",
                    )
                output.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def get_pothole_dict(pothole: Pothole):
    return {
        "id": pothole.id,
        "latitude": pothole.latitude,
        "longitude": pothole.longitude,
        "severity": pothole.severity,
        "confidence": pothole.confidence,
        "image_path": Path(pothole.image_path).name if pothole.image_path else None,
        "status": pothole.status,
        "description": pothole.description,
        "created_at": pothole.created_at,
    }


def get_complaint_dict(complaint: Complaint):
    return {
        "id": complaint.id,
        "case_number": f"PV-C-{complaint.id:06d}",
        "pothole_id": complaint.pothole_id,
        "citizen_name": complaint.citizen_name,
        "citizen_email": complaint.citizen_email,
        "description": complaint.description,
        "status": complaint.status,
        "created_at": complaint.created_at,
    }


def get_inspection_dict(inspection: Inspection):
    return {
        "id": inspection.id,
        "pothole_id": inspection.pothole_id,
        "complaint_id": inspection.complaint_id,
        "inspector_name": inspection.inspector_name,
        "inspection_notes": inspection.inspection_notes,
        "confirmed_severity": inspection.confirmed_severity,
        "status": inspection.status,
        "inspected_at": inspection.inspected_at,
        "created_at": inspection.created_at,
    }


def get_work_order_dict(work_order: WorkOrder):
    return {
        "id": work_order.id,
        "pothole_id": work_order.pothole_id,
        "inspection_id": work_order.inspection_id,
        "contractor_name": work_order.contractor_name,
        "work_description": work_order.work_description,
        "priority": work_order.priority,
        "status": work_order.status,
        "estimated_cost": work_order.estimated_cost,
        "scheduled_date": work_order.scheduled_date,
        "completed_at": work_order.completed_at,
        "created_at": work_order.created_at,
    }


def get_progress_update_dict(update: ProgressUpdate):
    return {
        "id": update.id,
        "pothole_id": update.pothole_id,
        "stage": update.stage,
        "progress_percent": update.progress_percent,
        "message": update.message,
        "updated_by": update.updated_by,
        "created_at": update.created_at,
    }


def get_official_message_dict(message: OfficialMessage):
    return {
        "id": message.id,
        "sender_id": message.sender_id,
        "recipient_id": message.recipient_id,
        "message": message.message,
        "important": message.important,
        "pothole_id": message.pothole_id,
        "latitude": message.latitude,
        "longitude": message.longitude,
        "created_at": message.created_at,
        "attachment_name": message.attachment_name,
        "attachment_type": message.attachment_type,
        "has_attachment": bool(message.attachment_path),
    }


# =========================================================
# ROOT
# =========================================================

# =========================================================
# AUTHENTICATION
# =========================================================

class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=8, max_length=72)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=8, max_length=72)


class OfficialAccessRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^[0-9]{6}$")


@app.post("/auth/register")
def register_user(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
):
    email = payload.email.strip().lower()
    name = payload.name.strip()

    if not name:
        raise HTTPException(status_code=422, detail="Name is required.")

    if "@" not in email or email.startswith("@") or email.endswith("@"):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")

    if len(payload.password.encode("utf-8")) > 72:
        raise HTTPException(status_code=422, detail="Password must be at most 72 bytes when encoded as UTF-8")

    existing_user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="An account with this email already exists",
        )

    user = User(
        name=name,
        email=email,
        password_hash=hash_password(payload.password),
        role="CITIZEN",
    )

    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists",
        )
    db.refresh(user)

    access_token = create_access_token(user_id=user.id, role=user.role)

    return {
        "message": "Account created successfully",
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
        },
    }


@app.post("/auth/login")
def login_user(
    payload: LoginRequest,
    db: Session = Depends(get_db),
):
    email = payload.email.strip().lower()

    if len(payload.password.encode("utf-8")) > 72:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if not user or not verify_password(
        payload.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    access_token = create_access_token(
        user_id=user.id,
        role=user.role,
    )

    return {
        "message": "Login successful",
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
        },
    }


@app.post("/auth/official-access")
def enable_official_access(
    payload: OfficialAccessRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Promote an allowlisted, signed-in account after validating the server-side official code."""
    expected_code = os.getenv("OFFICIAL_ACCESS_CODE", "")
    allowed_emails = {
        address.strip().lower()
        for address in os.getenv("OFFICIAL_ACCESS_EMAILS", "").split(",")
        if address.strip()
    }
    submitted_email = current_user.email.strip().lower()

    if not expected_code or not allowed_emails:
        raise HTTPException(
            status_code=503,
            detail=(
                "Official access is not configured on this backend. Set "
                "OFFICIAL_ACCESS_CODE and OFFICIAL_ACCESS_EMAILS in the backend environment."
            ),
        )

    if (
        submitted_email not in allowed_emails
        or not hmac.compare_digest(payload.code, expected_code)
    ):
        raise HTTPException(status_code=403, detail="Official access could not be verified.")

    current_user.role = "AUTHORITY"
    db.commit()
    db.refresh(current_user)
    return {
        "access_token": create_access_token(current_user.id, current_user.role),
        "token_type": "bearer",
        "user": {
            "id": current_user.id,
            "name": current_user.name,
            "email": current_user.email,
            "role": current_user.role,
        },
    }


@app.get("/auth/me")
def get_my_profile(
    current_user: User = Depends(get_current_user),
):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "created_at": current_user.created_at,
    }

@app.get("/")
def root():
    return {
        "message": "Welcome to PotholeVision API",
        "status": "running",
        "version": "1.1.0",
        "ai": "YOLO pothole detection",
        "video_tracking": "ByteTrack",
        "gps_duplicate_detection": True,
        "gps_duplicate_radius_meters": GPS_DUPLICATE_RADIUS_METERS,
        "workflow": (
            "Detection -> Complaint -> Inspection -> "
            "Authority Decision -> Work Order -> Repair -> Resolution"
        ),
    }


# =========================================================
# HEALTH
# =========================================================

@app.get("/health")
def health_check():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        return {
            "status": "healthy",
            "database": "connected",
            "service": "PotholeVision API",
            "ai_model": "loaded" if detector.model is not None else "ready_on_first_use",
        }

    except Exception:
        logger.exception("Health check could not reach the database")
        return JSONResponse(status_code=503, content={
            "status": "unhealthy",
            "database": "disconnected",
            "service": "PotholeVision API",
            "message": "Database connection failed.",
        })


# =========================================================
# CREATE POTHOLE REPORT
# GPS DUPLICATE MATCHING ENABLED
# =========================================================

@app.post("/potholes")
def create_pothole(
    latitude: float,
    longitude: float,
    severity: str = "medium",
    confidence: float = 0.0,
    description: str = "",
    db: Session = Depends(get_db),
):
    # -----------------------------------------------------
    # Validate coordinates
    # -----------------------------------------------------

    if not -90 <= latitude <= 90:
        raise HTTPException(
            status_code=400,
            detail="Latitude must be between -90 and 90.",
        )

    if not -180 <= longitude <= 180:
        raise HTTPException(
            status_code=400,
            detail="Longitude must be between -180 and 180.",
        )

    severity = severity.lower().strip()

    if severity not in SEVERITIES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid severity. Allowed values: "
                f"{sorted(SEVERITIES)}"
            ),
        )

    if not 0 <= confidence <= 1:
        raise HTTPException(
            status_code=400,
            detail="Confidence must be between 0 and 1.",
        )

    # -----------------------------------------------------
    # GPS duplicate check
    # -----------------------------------------------------

    existing_pothole, distance = find_nearby_pothole(
        db,
        latitude,
        longitude,
        GPS_DUPLICATE_RADIUS_METERS,
    )

    if existing_pothole is not None:
        return {
            "success": True,
            "message": "Nearby pothole already exists",
            "duplicate": True,
            "pothole_id": existing_pothole.id,
            "latitude": existing_pothole.latitude,
            "longitude": existing_pothole.longitude,
            "severity": existing_pothole.severity,
            "confidence": existing_pothole.confidence,
            "status": existing_pothole.status,
            "distance_meters": round(distance, 2),
            "radius_meters": GPS_DUPLICATE_RADIUS_METERS,
        }

    # -----------------------------------------------------
    # Create new pothole
    # -----------------------------------------------------

    pothole = Pothole(
        latitude=latitude,
        longitude=longitude,
        severity=severity,
        confidence=confidence,
        description=description.strip(),
        status="reported",
    )

    db.add(pothole)
    db.commit()
    db.refresh(pothole)

    return {
        "success": True,
        "message": "Pothole reported successfully",
        "duplicate": False,
        "pothole_id": pothole.id,
        "latitude": pothole.latitude,
        "longitude": pothole.longitude,
        "severity": pothole.severity,
        "confidence": pothole.confidence,
        "status": pothole.status,
    }


# =========================================================
# GET POTHOLES
# =========================================================

@app.get("/potholes")
def get_potholes(
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    potholes = (
        db.query(Pothole)
        .order_by(Pothole.created_at.desc())
        .all()
    )

    return [
        get_pothole_dict(pothole)
        for pothole in potholes
    ]


# =========================================================
# GET SINGLE POTHOLE
# =========================================================

@app.get("/potholes/{pothole_id}")
def get_pothole(
    pothole_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    pothole = (
        db.query(Pothole)
        .filter(Pothole.id == pothole_id)
        .first()
    )

    if pothole is None:
        raise HTTPException(
            status_code=404,
            detail="Pothole not found.",
        )

    return get_pothole_dict(pothole)


# =========================================================
# UPDATE POTHOLE STATUS
# =========================================================

class PotholeStatusUpdate(BaseModel):
    status: str


@app.put("/potholes/{pothole_id}/status")
def update_pothole_status(
    pothole_id: int,
    status_data: PotholeStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    status = status_data.status.lower().strip()

    if status not in POTHOLE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid pothole status. Allowed values: "
                f"{sorted(POTHOLE_STATUSES)}"
            ),
        )

    pothole = (
        db.query(Pothole)
        .filter(Pothole.id == pothole_id)
        .first()
    )

    if pothole is None:
        raise HTTPException(
            status_code=404,
            detail="Pothole not found.",
        )

    pothole.status = status

    db.commit()
    db.refresh(pothole)

    return {
        "success": True,
        "message": "Pothole status updated",
        "pothole_id": pothole.id,
        "status": pothole.status,
    }


# =========================================================
# AI IMAGE DETECTION
# REAL YOLO MODEL
# =========================================================

@app.post("/detect/image")
async def detect_image(
    file: UploadFile = File(...),
    latitude: float | None = None,
    longitude: float | None = None,
    submit: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    allowed_types = {
        "image/jpeg",
        "image/png",
        "image/webp",
    }

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Only JPG, PNG, and WEBP images are supported.",
        )

    if latitude is not None and not -90 <= latitude <= 90:
        raise HTTPException(
            status_code=400,
            detail="Latitude must be between -90 and 90.",
        )

    if longitude is not None and not -180 <= longitude <= 180:
        raise HTTPException(
            status_code=400,
            detail="Longitude must be between -180 and 180.",
        )

    safe_filename = Path(file.filename or "").name

    if not safe_filename:
        raise HTTPException(
            status_code=400,
            detail="Invalid file name.",
        )

    # Keep each uploaded photo asset distinct, even when clients reuse a name.
    stored_filename = f"{uuid4().hex}{Path(safe_filename).suffix.lower()}"
    file_path = IMAGE_UPLOAD_DIR / stored_filename

    try:
        # -------------------------------------------------
        # Save uploaded image
        # -------------------------------------------------

        await save_upload_file(file, file_path, MAX_IMAGE_UPLOAD_BYTES)

        # -------------------------------------------------
        # REAL AI detection
        # -------------------------------------------------

        detections = detector.detect(str(file_path))

        # Preview analysis for the citizen's review without
        # creating an official report until they submit it.
        if not submit:
            file_path.unlink(missing_ok=True)
            return {
                "success": True,
                "analysis_only": True,
                "type": "image",
                "filename": safe_filename,
                "gps": {
                    "latitude": latitude,
                    "longitude": longitude,
                },
                "potholes_detected": len(detections),
                "database_records_created": 0,
                "saved_potholes": [],
                "detections": detections,
            }

        saved_potholes = []

        # One submitted photo is one case. Preserve every detected box on
        # that case so multiple potholes in the same image share its ID.
        if detections:
            confidence = max(
                float(detection.get("confidence", 0.0))
                for detection in detections
            )
            severity = calculate_severity(confidence)
            bounding_boxes = [
                detection.get("bounding_box", {})
                for detection in detections
            ]
            pothole = Pothole(
                latitude=latitude,
                longitude=longitude,
                severity=severity,
                confidence=confidence,
                image_path=str(file_path),
                status="reported",
                description=(
                    f"AI detected {len(detections)} pothole(s) in image "
                    f"'{safe_filename}'. Bounding boxes: {bounding_boxes}"
                ),
            )
            db.add(pothole)
            db.flush()

            complaint = Complaint(
                pothole_id=pothole.id,
                citizen_name=current_user.name,
                citizen_email=current_user.email.strip().lower(),
                description=(
                    f"AI scan report for image '{safe_filename}' "
                    f"({len(detections)} detected pothole(s)). "
                    f"Highest detection confidence: {confidence:.0%}. "
                    f"Severity: {severity}."
                ),
                status="submitted",
            )
            db.add(complaint)
            db.flush()
            saved_potholes.append(
                {
                    "pothole_id": pothole.id,
                    "complaint_id": complaint.id,
                    "case_number": f"PV-{pothole.id}",
                    "severity": severity,
                    "confidence": confidence,
                    "detections_count": len(detections),
                    "bounding_boxes": bounding_boxes,
                }
            )

        db.commit()

        return {
            "success": True,
            "type": "image",
            "filename": safe_filename,
            "image_path": stored_filename,
            "gps": {
                "latitude": latitude,
                "longitude": longitude,
            },
            "potholes_detected": len(detections),
            "database_records_created": len(
                saved_potholes
            ),
            "saved_potholes": saved_potholes,
            "detections": detections,
        }

    except HTTPException:
        db.rollback()
        file_path.unlink(missing_ok=True)
        raise
    except Exception:
        db.rollback()
        file_path.unlink(missing_ok=True)
        logger.exception("Image detection failed")

        raise HTTPException(
            status_code=500,
            detail="Image analysis failed. Please try again.",
        )

    finally:
        await file.close()


# =========================================================
# AI VIDEO DETECTION + BYTETRACK
# =========================================================

@app.post("/detect/video")
async def detect_video(
    file: UploadFile = File(...),
    latitude: float | None = None,
    longitude: float | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    allowed_types = {
        "video/mp4",
        "video/mpeg",
        "video/quicktime",
        "video/x-msvideo",
        "video/webm",
    }

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported video format. "
                "Use MP4, MPEG, MOV, AVI, or WEBM."
            ),
        )

    if latitude is not None and not -90 <= latitude <= 90:
        raise HTTPException(
            status_code=400,
            detail="Latitude must be between -90 and 90.",
        )

    if longitude is not None and not -180 <= longitude <= 180:
        raise HTTPException(
            status_code=400,
            detail="Longitude must be between -180 and 180.",
        )

    safe_filename = Path(file.filename or "").name

    if not safe_filename:
        raise HTTPException(
            status_code=400,
            detail="Invalid file name.",
        )

    input_filename = f"{uuid4().hex}{Path(safe_filename).suffix.lower()}"
    input_path = VIDEO_UPLOAD_DIR / input_filename

    output_filename = f"{Path(input_filename).stem}_annotated.mp4"

    output_path = VIDEO_UPLOAD_DIR / output_filename

    try:
        # -------------------------------------------------
        # Save uploaded video
        # -------------------------------------------------

        await save_upload_file(file, input_path, MAX_VIDEO_UPLOAD_BYTES)

        # -------------------------------------------------
        # REAL YOLO + ByteTrack
        # -------------------------------------------------

        result = detector.detect_video(
            str(input_path),
            str(output_path),
        )

        # -------------------------------------------------
        # Keep one database record per unique track
        # -------------------------------------------------

        unique_tracks = {}

        for detection in result.get(
            "detections",
            [],
        ):
            track_id = detection.get("track_id")

            if track_id is None:
                continue

            confidence = float(
                detection.get("confidence", 0.0)
            )

            if (
                track_id not in unique_tracks
                or confidence
                > unique_tracks[track_id]["confidence"]
            ):
                unique_tracks[track_id] = detection

        saved_potholes = []

        for track_id, detection in unique_tracks.items():
            confidence = float(
                detection.get("confidence", 0.0)
            )

            severity = calculate_severity(confidence)

            bbox = detection.get(
                "bounding_box",
                {},
            )

            description = (
                f"AI detected pothole from video "
                f"'{safe_filename}'. "
                f"Track ID: {track_id}. "
                f"Frame: {detection.get('frame')}. "
                f"Bounding box: {bbox}."
            )

            pothole = Pothole(
                latitude=latitude,
                longitude=longitude,
                severity=severity,
                confidence=confidence,
                image_path=str(output_path),
                status="reported",
                description=description,
            )

            db.add(pothole)
            db.flush()

            complaint = Complaint(
                pothole_id=pothole.id,
                citizen_name=current_user.name,
                citizen_email=current_user.email.strip().lower(),
                description=(
                    f"AI scan report for video '{safe_filename}', "
                    f"track {track_id}, frame {detection.get('frame')}. "
                    f"Detection confidence: {confidence:.0%}. "
                    f"Severity: {severity}."
                ),
                status="submitted",
            )
            db.add(complaint)
            db.flush()

            saved_potholes.append(
                {
                    "pothole_id": pothole.id,
                    "complaint_id": complaint.id,
                    "case_number": f"PV-C-{complaint.id:06d}",
                    "track_id": track_id,
                    "severity": severity,
                    "confidence": confidence,
                }
            )

        db.commit()

        return {
            "success": True,
            "type": "video",
            "filename": safe_filename,
            "video_path": f"/videos/{input_filename}",
            "annotated_video": f"/videos/{output_filename}",
            "gps": {
                "latitude": latitude,
                "longitude": longitude,
            },
            "total_frames": result.get(
                "total_frames",
                0,
            ),
            "processed_frames": result.get(
                "processed_frames",
                0,
            ),
            "unique_potholes": result.get(
                "unique_potholes",
                0,
            ),
            "database_records_created": len(
                saved_potholes
            ),
            "saved_potholes": saved_potholes,
            "detections": result.get(
                "detections",
                [],
            ),
        }

    except HTTPException:
        db.rollback()
        input_path.unlink(missing_ok=True)
        output_path.unlink(missing_ok=True)
        raise
    except Exception:
        db.rollback()
        input_path.unlink(missing_ok=True)
        output_path.unlink(missing_ok=True)
        logger.exception("Video detection failed")

        raise HTTPException(
            status_code=500,
            detail="Video analysis failed. Please try another video.",
        )

    finally:
        await file.close()


# =========================================================
# VIDEO FILE
# =========================================================

@app.get("/videos/{filename}")
def get_video(filename: str):
    safe_filename = Path(filename).name

    video_path = VIDEO_UPLOAD_DIR / safe_filename

    if not video_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Video not found.",
        )

    return FileResponse(
        path=str(video_path),
        media_type="video/mp4",
        filename=safe_filename,
    )


# =========================================================
# COMPLAINT SCHEMAS
# =========================================================

class ComplaintCreate(BaseModel):
    pothole_id: int | None = None
    citizen_name: str | None = None
    citizen_email: str | None = None
    description: str


class ComplaintStatusUpdate(BaseModel):
    status: str


# =========================================================
# CREATE COMPLAINT
# =========================================================

@app.post("/complaints")
def create_complaint(
    complaint_data: ComplaintCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # -----------------------------------------------------
    # Verify pothole
    # -----------------------------------------------------

    if complaint_data.pothole_id is not None:
        pothole = (
            db.query(Pothole)
            .filter(
                Pothole.id == complaint_data.pothole_id
            )
            .first()
        )

        if pothole is None:
            raise HTTPException(
                status_code=404,
                detail="Pothole not found.",
            )

    # -----------------------------------------------------
    # Validate description
    # -----------------------------------------------------

    description = complaint_data.description.strip()

    if not description:
        raise HTTPException(
            status_code=400,
            detail="Complaint description is required.",
        )

    # -----------------------------------------------------
    # Create complaint
    # -----------------------------------------------------

    complaint = Complaint(
        pothole_id=complaint_data.pothole_id,
        citizen_name=current_user.name,
        citizen_email=current_user.email.strip().lower(),
        description=description,
        status="submitted",
    )

    db.add(complaint)

    # Put linked pothole under authority review.
    if complaint.pothole_id is not None:
        pothole = (
            db.query(Pothole)
            .filter(Pothole.id == complaint.pothole_id)
            .first()
        )

        if (
            pothole is not None
            and pothole.status == "reported"
        ):
            pothole.status = "under_review"

    db.commit()
    db.refresh(complaint)

    return {
        "success": True,
        "message": "Complaint submitted successfully",
        "complaint_id": complaint.id,
        "case_number": f"PV-C-{complaint.id:06d}",
        "pothole_id": complaint.pothole_id,
        "citizen_name": complaint.citizen_name,
        "citizen_email": complaint.citizen_email,
        "description": complaint.description,
        "status": complaint.status,
        "created_at": complaint.created_at,
    }


# =========================================================
# GET ALL COMPLAINTS
# =========================================================

@app.get("/complaints")
def get_complaints(
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    complaints = (
        db.query(Complaint)
        .order_by(Complaint.created_at.desc())
        .all()
    )

    return [
        get_complaint_dict(complaint)
        for complaint in complaints
    ]


# =========================================================
# GET CURRENT CITIZEN'S COMPLAINTS
# =========================================================

@app.get("/complaints/mine")
def get_my_complaints(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    complaints = (
        db.query(Complaint)
        .filter(func.lower(Complaint.citizen_email) == current_user.email.strip().lower())
        .order_by(Complaint.created_at.desc())
        .all()
    )

    return [get_complaint_dict(complaint) for complaint in complaints]


# =========================================================
# GET SINGLE COMPLAINT
# =========================================================

@app.get("/complaints/{complaint_id}")
def get_complaint(
    complaint_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    complaint = (
        db.query(Complaint)
        .filter(Complaint.id == complaint_id)
        .first()
    )

    if complaint is None:
        raise HTTPException(
            status_code=404,
            detail="Complaint not found.",
        )

    return get_complaint_dict(complaint)


# =========================================================
# UPDATE COMPLAINT STATUS
# =========================================================

@app.put("/complaints/{complaint_id}/status")
def update_complaint_status(
    complaint_id: int,
    status_data: ComplaintStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    status = status_data.status.lower().strip()

    if status not in COMPLAINT_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid status. Allowed values: "
                f"{sorted(COMPLAINT_STATUSES)}"
            ),
        )

    complaint = (
        db.query(Complaint)
        .filter(Complaint.id == complaint_id)
        .first()
    )

    if complaint is None:
        raise HTTPException(
            status_code=404,
            detail="Complaint not found.",
        )

    complaint.status = status

    # Keep linked pothole status aligned with workflow.
    if complaint.pothole_id is not None:
        pothole = (
            db.query(Pothole)
            .filter(Pothole.id == complaint.pothole_id)
            .first()
        )

        if pothole is not None:
            status_mapping = {
                "under_review": "under_review",
                "inspection_scheduled": (
                    "inspection_scheduled"
                ),
                "work_order_created": (
                    "work_order_created"
                ),
                "in_progress": "in_progress",
                "resolved": "resolved",
                "rejected": "rejected",
            }

            if status in status_mapping:
                pothole.status = status_mapping[status]

    db.commit()
    db.refresh(complaint)

    return {
        "success": True,
        "message": "Complaint status updated",
        "complaint_id": complaint.id,
        "status": complaint.status,
    }


# =========================================================
# INSPECTION SCHEMAS
# =========================================================

class InspectionCreate(BaseModel):
    pothole_id: int
    complaint_id: int | None = None
    inspector_name: str
    inspection_notes: str | None = None
    confirmed_severity: str | None = None


class InspectionStatusUpdate(BaseModel):
    status: str


# =========================================================
# CREATE AUTHORITY INSPECTION
# =========================================================

@app.post("/inspections")
def create_inspection(
    inspection_data: InspectionCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    # -----------------------------------------------------
    # Verify pothole
    # -----------------------------------------------------

    pothole = (
        db.query(Pothole)
        .filter(
            Pothole.id == inspection_data.pothole_id
        )
        .first()
    )

    if pothole is None:
        raise HTTPException(
            status_code=404,
            detail="Pothole not found.",
        )

    # -----------------------------------------------------
    # Verify complaint
    # -----------------------------------------------------

    complaint = None

    if inspection_data.complaint_id is not None:
        complaint = (
            db.query(Complaint)
            .filter(
                Complaint.id == inspection_data.complaint_id
            )
            .first()
        )

        if complaint is None:
            raise HTTPException(
                status_code=404,
                detail="Complaint not found.",
            )

        # Prevent linking a complaint to a different pothole.
        if (
            complaint.pothole_id is not None
            and complaint.pothole_id
            != inspection_data.pothole_id
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Complaint does not belong to "
                    "the selected pothole."
                ),
            )

    # -----------------------------------------------------
    # Validate inspector
    # -----------------------------------------------------

    inspector_name = inspection_data.inspector_name.strip()

    if not inspector_name:
        raise HTTPException(
            status_code=400,
            detail="Inspector name is required.",
        )

    confirmed_severity = (
        inspection_data.confirmed_severity.lower().strip()
        if inspection_data.confirmed_severity
        else None
    )

    if (
        confirmed_severity is not None
        and confirmed_severity not in SEVERITIES
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid confirmed severity. "
                f"Allowed values: {sorted(SEVERITIES)}"
            ),
        )

    # -----------------------------------------------------
    # Create inspection
    # -----------------------------------------------------

    inspection = Inspection(
        pothole_id=inspection_data.pothole_id,
        complaint_id=inspection_data.complaint_id,
        inspector_name=inspector_name,
        inspection_notes=(
            inspection_data.inspection_notes.strip()
            if inspection_data.inspection_notes
            else None
        ),
        confirmed_severity=confirmed_severity,
        status="scheduled",
    )

    db.add(inspection)

    pothole.status = "inspection_scheduled"

    if complaint is not None:
        complaint.status = "inspection_scheduled"

    db.commit()
    db.refresh(inspection)

    return {
        "success": True,
        "message": "Inspection created successfully",
        "inspection_id": inspection.id,
        "pothole_id": inspection.pothole_id,
        "complaint_id": inspection.complaint_id,
        "inspector_name": inspection.inspector_name,
        "confirmed_severity": (
            inspection.confirmed_severity
        ),
        "status": inspection.status,
        "created_at": inspection.created_at,
    }


# =========================================================
# GET ALL INSPECTIONS
# =========================================================

@app.get("/inspections")
def get_inspections(
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    inspections = (
        db.query(Inspection)
        .order_by(Inspection.created_at.desc())
        .all()
    )

    return [
        get_inspection_dict(inspection)
        for inspection in inspections
    ]


# =========================================================
# GET SINGLE INSPECTION
# =========================================================

@app.get("/inspections/{inspection_id}")
def get_inspection(
    inspection_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    inspection = (
        db.query(Inspection)
        .filter(Inspection.id == inspection_id)
        .first()
    )

    if inspection is None:
        raise HTTPException(
            status_code=404,
            detail="Inspection not found.",
        )

    return get_inspection_dict(inspection)


# =========================================================
# UPDATE INSPECTION STATUS
# =========================================================

@app.put("/inspections/{inspection_id}/status")
def update_inspection_status(
    inspection_id: int,
    status_data: InspectionStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    status = status_data.status.lower().strip()

    if status not in INSPECTION_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid inspection status. "
                f"Allowed values: {sorted(INSPECTION_STATUSES)}"
            ),
        )

    inspection = (
        db.query(Inspection)
        .filter(Inspection.id == inspection_id)
        .first()
    )

    if inspection is None:
        raise HTTPException(
            status_code=404,
            detail="Inspection not found.",
        )

    inspection.status = status

    pothole = (
        db.query(Pothole)
        .filter(Pothole.id == inspection.pothole_id)
        .first()
    )

    complaint = None

    if inspection.complaint_id is not None:
        complaint = (
            db.query(Complaint)
            .filter(
                Complaint.id == inspection.complaint_id
            )
            .first()
        )

    if status == "in_progress":
        if pothole is not None:
            pothole.status = "inspection_scheduled"

        if complaint is not None:
            complaint.status = "inspection_scheduled"

    elif status == "completed":
        inspection.inspected_at = datetime.utcnow()

        if pothole is not None:
            pothole.status = "inspection_completed"

            if inspection.confirmed_severity:
                pothole.severity = (
                    inspection.confirmed_severity
                )

        if complaint is not None:
            complaint.status = "under_review"

    elif status == "cancelled":
        if pothole is not None:
            pothole.status = "under_review"

        if complaint is not None:
            complaint.status = "under_review"

    db.commit()
    db.refresh(inspection)

    return {
        "success": True,
        "message": "Inspection status updated",
        "inspection_id": inspection.id,
        "status": inspection.status,
        "inspected_at": inspection.inspected_at,
    }


# =========================================================
# AUTHORITY DECISION
# =========================================================

class AuthorityDecision(BaseModel):
    decision: str
    notes: str | None = None
    confirmed_severity: str | None = None


@app.put("/inspections/{inspection_id}/decision")
def authority_decision(
    inspection_id: int,
    decision_data: AuthorityDecision,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    """
    GMC/authority decision after physical inspection.

    Decisions:
    - repair_required
    - no_repair_required
    - rejected
    - duplicate
    """

    allowed_decisions = {
        "repair_required",
        "no_repair_required",
        "rejected",
        "duplicate",
    }

    decision = decision_data.decision.lower().strip()

    if decision not in allowed_decisions:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid decision. Allowed values: "
                f"{sorted(allowed_decisions)}"
            ),
        )

    inspection = (
        db.query(Inspection)
        .filter(Inspection.id == inspection_id)
        .first()
    )

    if inspection is None:
        raise HTTPException(
            status_code=404,
            detail="Inspection not found.",
        )

    if inspection.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=(
                "Authority decision can only be made "
                "after inspection is completed."
            ),
        )

    pothole = (
        db.query(Pothole)
        .filter(Pothole.id == inspection.pothole_id)
        .first()
    )

    if pothole is None:
        raise HTTPException(
            status_code=404,
            detail="Pothole not found.",
        )

    complaint = None

    if inspection.complaint_id is not None:
        complaint = (
            db.query(Complaint)
            .filter(
                Complaint.id == inspection.complaint_id
            )
            .first()
        )

    # -----------------------------------------------------
    # Update confirmed severity
    # -----------------------------------------------------

    if decision_data.confirmed_severity:
        severity = (
            decision_data.confirmed_severity
            .lower()
            .strip()
        )

        if severity not in SEVERITIES:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Invalid confirmed severity. "
                    f"Allowed values: {sorted(SEVERITIES)}"
                ),
            )

        pothole.severity = severity
        inspection.confirmed_severity = severity

    # -----------------------------------------------------
    # Append authority decision to inspection notes.
    #
    # No DB migration is required because the existing
    # inspection_notes field is used.
    # -----------------------------------------------------

    decision_note = (
        f"Authority decision: {decision}."
    )

    if decision_data.notes:
        decision_note += (
            f" Authority notes: "
            f"{decision_data.notes.strip()}"
        )

    if inspection.inspection_notes:
        inspection.inspection_notes += (
            f"\n{decision_note}"
        )
    else:
        inspection.inspection_notes = decision_note

    # -----------------------------------------------------
    # Workflow decision
    # -----------------------------------------------------

    if decision == "repair_required":
        pothole.status = "repair_required"

        if complaint is not None:
            complaint.status = "under_review"

    elif decision == "no_repair_required":
        pothole.status = "resolved"

        if complaint is not None:
            complaint.status = "resolved"

    elif decision == "rejected":
        pothole.status = "rejected"

        if complaint is not None:
            complaint.status = "rejected"

    elif decision == "duplicate":
        pothole.status = "duplicate"

        if complaint is not None:
            complaint.status = "rejected"

    db.commit()
    db.refresh(inspection)
    db.refresh(pothole)

    return {
        "success": True,
        "message": "Authority decision recorded",
        "inspection_id": inspection.id,
        "pothole_id": pothole.id,
        "decision": decision,
        "pothole_status": pothole.status,
        "complaint_status": (
            complaint.status
            if complaint is not None
            else None
        ),
        "confirmed_severity": pothole.severity,
        "notes": inspection.inspection_notes,
    }


# =========================================================
# WORK ORDER SCHEMAS
# =========================================================

class WorkOrderCreate(BaseModel):
    pothole_id: int
    inspection_id: int | None = None
    contractor_name: str
    work_description: str
    priority: str = "medium"
    estimated_cost: float | None = Field(
        default=None,
        ge=0,
    )
    scheduled_date: datetime | None = None


class WorkOrderStatusUpdate(BaseModel):
    status: str


# =========================================================
# CREATE WORK ORDER
# AUTHORITY ASSIGNS CONTRACTOR HERE
# =========================================================

@app.post("/work-orders")
def create_work_order(
    work_order_data: WorkOrderCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    # -----------------------------------------------------
    # Verify pothole
    # -----------------------------------------------------

    pothole = (
        db.query(Pothole)
        .filter(
            Pothole.id == work_order_data.pothole_id
        )
        .first()
    )

    if pothole is None:
        raise HTTPException(
            status_code=404,
            detail="Pothole not found.",
        )

    # -----------------------------------------------------
    # Verify inspection
    # -----------------------------------------------------

    inspection = None

    if work_order_data.inspection_id is not None:
        inspection = (
            db.query(Inspection)
            .filter(
                Inspection.id
                == work_order_data.inspection_id
            )
            .first()
        )

        if inspection is None:
            raise HTTPException(
                status_code=404,
                detail="Inspection not found.",
            )

        if (
            inspection.pothole_id
            != work_order_data.pothole_id
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Inspection does not belong to "
                    "the selected pothole."
                ),
            )

    # -----------------------------------------------------
    # Validate priority
    # -----------------------------------------------------

    priority = work_order_data.priority.lower().strip()

    allowed_priorities = {
        "low",
        "medium",
        "high",
        "critical",
    }

    if priority not in allowed_priorities:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid priority. Allowed values: "
                f"{sorted(allowed_priorities)}"
            ),
        )

    # -----------------------------------------------------
    # Validate contractor
    # -----------------------------------------------------

    contractor_name = (
        work_order_data.contractor_name.strip()
    )

    if not contractor_name:
        raise HTTPException(
            status_code=400,
            detail="Contractor name is required.",
        )

    work_description = (
        work_order_data.work_description.strip()
    )

    if not work_description:
        raise HTTPException(
            status_code=400,
            detail="Work description is required.",
        )

    # -----------------------------------------------------
    # Authority should create work order only when repair
    # is required / appropriate.
    #
    # Existing old records are not blocked.
    # -----------------------------------------------------

    if pothole.status not in {
        "repair_required",
        "work_order_created",
        "in_progress",
    }:
        # Allow existing workflow if inspection is completed.
        if (
            inspection is None
            or inspection.status != "completed"
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Work order requires a completed "
                    "inspection and authority repair decision."
                ),
            )

    # -----------------------------------------------------
    # Create work order
    # -----------------------------------------------------

    work_order = WorkOrder(
        pothole_id=work_order_data.pothole_id,
        inspection_id=work_order_data.inspection_id,
        contractor_name=contractor_name,
        work_description=work_description,
        priority=priority,
        status="assigned",
        estimated_cost=work_order_data.estimated_cost,
        scheduled_date=work_order_data.scheduled_date,
    )

    db.add(work_order)

    pothole.status = "work_order_created"

    # Linked complaint, if any.
    if inspection is not None:
        if inspection.complaint_id is not None:
            complaint = (
                db.query(Complaint)
                .filter(
                    Complaint.id
                    == inspection.complaint_id
                )
                .first()
            )

            if complaint is not None:
                complaint.status = (
                    "work_order_created"
                )

    db.commit()
    db.refresh(work_order)

    return {
        "success": True,
        "message": "Work order created successfully",
        "work_order_id": work_order.id,
        "pothole_id": work_order.pothole_id,
        "inspection_id": work_order.inspection_id,
        "contractor_name": work_order.contractor_name,
        "work_description": work_order.work_description,
        "priority": work_order.priority,
        "status": work_order.status,
        "estimated_cost": work_order.estimated_cost,
        "scheduled_date": work_order.scheduled_date,
        "created_at": work_order.created_at,
    }


# =========================================================
# GET ALL WORK ORDERS
# =========================================================

@app.get("/work-orders")
def get_work_orders(
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    work_orders = (
        db.query(WorkOrder)
        .order_by(WorkOrder.created_at.desc())
        .all()
    )

    return [
        get_work_order_dict(work_order)
        for work_order in work_orders
    ]


# =========================================================
# GET SINGLE WORK ORDER
# =========================================================

@app.get("/work-orders/{work_order_id}")
def get_work_order(
    work_order_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    work_order = (
        db.query(WorkOrder)
        .filter(WorkOrder.id == work_order_id)
        .first()
    )

    if work_order is None:
        raise HTTPException(
            status_code=404,
            detail="Work order not found.",
        )

    return get_work_order_dict(work_order)


# =========================================================
# UPDATE WORK ORDER STATUS
# =========================================================

@app.put("/work-orders/{work_order_id}/status")
def update_work_order_status(
    work_order_id: int,
    status_data: WorkOrderStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    status = status_data.status.lower().strip()

    if status not in WORK_ORDER_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid work order status. "
                f"Allowed values: {sorted(WORK_ORDER_STATUSES)}"
            ),
        )

    work_order = (
        db.query(WorkOrder)
        .filter(WorkOrder.id == work_order_id)
        .first()
    )

    if work_order is None:
        raise HTTPException(
            status_code=404,
            detail="Work order not found.",
        )

    work_order.status = status

    pothole = (
        db.query(Pothole)
        .filter(
            Pothole.id == work_order.pothole_id
        )
        .first()
    )

    complaint = None
    inspection = None

    if work_order.inspection_id is not None:
        inspection = (
            db.query(Inspection)
            .filter(
                Inspection.id
                == work_order.inspection_id
            )
            .first()
        )

        if inspection is not None:
            if inspection.complaint_id is not None:
                complaint = (
                    db.query(Complaint)
                    .filter(
                        Complaint.id
                        == inspection.complaint_id
                    )
                    .first()
                )

    # -----------------------------------------------------
    # Contractor accepted work
    # -----------------------------------------------------

    if status == "accepted":
        if pothole is not None:
            pothole.status = "work_order_created"

    # -----------------------------------------------------
    # Contractor started repair
    # -----------------------------------------------------

    elif status == "in_progress":
        if pothole is not None:
            pothole.status = "in_progress"

        if complaint is not None:
            complaint.status = "in_progress"

    # -----------------------------------------------------
    # Contractor completed repair
    #
    # At this point repair is completed, but final
    # authority verification is still needed.
    # -----------------------------------------------------

    elif status == "completed":
        work_order.completed_at = datetime.utcnow()

        if pothole is not None:
            pothole.status = "resolved"

        if complaint is not None:
            complaint.status = "resolved"

    # -----------------------------------------------------
    # Cancelled
    # -----------------------------------------------------

    elif status == "cancelled":
        if pothole is not None:
            pothole.status = "repair_required"

        if complaint is not None:
            complaint.status = "under_review"

    db.commit()
    db.refresh(work_order)

    return {
        "success": True,
        "message": "Work order status updated",
        "work_order_id": work_order.id,
        "status": work_order.status,
        "pothole_status": (
            pothole.status
            if pothole is not None
            else None
        ),
        "complaint_status": (
            complaint.status
            if complaint is not None
            else None
        ),
        "completed_at": work_order.completed_at,
    }


# =========================================================
# DASHBOARD SUMMARY
# =========================================================

@app.get("/dashboard/summary")
def dashboard_summary(
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    """
    Real database statistics for the dashboard.
    """

    potholes = db.query(Pothole).all()
    complaints = db.query(Complaint).all()
    inspections = db.query(Inspection).all()
    work_orders = db.query(WorkOrder).all()

    total_potholes = len(potholes)

    critical = sum(
        1
        for p in potholes
        if p.severity == "critical"
        or p.severity == "high"
    )

    in_progress = sum(
        1
        for p in potholes
        if p.status == "in_progress"
    )

    resolved = sum(
        1
        for p in potholes
        if p.status == "resolved"
    )

    reported = sum(
        1
        for p in potholes
        if p.status in {
            "reported",
            "under_review",
        }
    )

    repair_required = sum(
        1
        for p in potholes
        if p.status in {
            "repair_required",
            "work_order_created",
        }
    )

    return {
        "success": True,
        "potholes": {
            "total": total_potholes,
            "critical": critical,
            "in_progress": in_progress,
            "resolved": resolved,
            "reported": reported,
            "repair_required": repair_required,
        },
        "complaints": {
            "total": len(complaints),
            "submitted": sum(
                1
                for c in complaints
                if c.status == "submitted"
            ),
            "under_review": sum(
                1
                for c in complaints
                if c.status == "under_review"
            ),
            "resolved": sum(
                1
                for c in complaints
                if c.status == "resolved"
            ),
        },
        "inspections": {
            "total": len(inspections),
            "scheduled": sum(
                1
                for i in inspections
                if i.status == "scheduled"
            ),
            "completed": sum(
                1
                for i in inspections
                if i.status == "completed"
            ),
        },
        "work_orders": {
            "total": len(work_orders),
            "assigned": sum(
                1
                for w in work_orders
                if w.status == "assigned"
            ),
            "in_progress": sum(
                1
                for w in work_orders
                if w.status == "in_progress"
            ),
            "completed": sum(
                1
                for w in work_orders
                if w.status == "completed"
            ),
        },
    }


# =========================================================
# MAP DATA
# =========================================================

@app.get("/progress/reports")
def get_public_progress_reports(db: Session = Depends(get_db)):
    """Return the public repair tracker records, including reports without GPS."""
    reports = db.query(Pothole).order_by(Pothole.created_at.desc(), Pothole.id.desc()).all()
    return [
        {
            "id": report.id,
            "case_number": f"PV-{report.id}",
            "latitude": report.latitude,
            "longitude": report.longitude,
            "severity": report.severity,
            "confidence": report.confidence,
            "status": report.status,
            "description": report.description,
            "created_at": report.created_at,
        }
        for report in reports
    ]


@app.get("/progress/summary")
def get_public_progress_summary(db: Session = Depends(get_db)):
    """Summarize every active and completed public report, with or without GPS."""
    reports = db.query(Pothole).all()
    awaiting_statuses = {
        "reported", "under_review", "inspection_scheduled",
        "inspection_completed", "repair_required",
    }
    underway_statuses = {"work_order_created", "in_progress"}
    valid_reports = [
        report for report in reports
        if report.status not in {"rejected", "duplicate"}
    ]
    awaiting = sum(report.status in awaiting_statuses for report in valid_reports)
    underway = sum(report.status in underway_statuses for report in valid_reports)
    resolved = sum(report.status == "resolved" for report in valid_reports)
    total = len(valid_reports)
    return {
        "total": total,
        "open": awaiting,
        "repairing": underway,
        "resolved": resolved,
        "completion_percent": round(resolved * 100 / total) if total else 0,
    }

@app.get("/map/summary")
def get_public_map_summary(
    db: Session = Depends(get_db),
):
    """Return aggregate repair progress for GPS-tagged community reports."""
    reports = (
        db.query(Pothole)
        .filter(
            Pothole.latitude.isnot(None),
            Pothole.longitude.isnot(None),
        )
        .all()
    )
    valid_reports = [
        report for report in reports
        if report.status not in {"rejected", "duplicate"}
    ]
    awaiting_statuses = {
        "reported", "under_review", "inspection_scheduled",
        "inspection_completed", "repair_required",
    }
    total = len(valid_reports)
    resolved = sum(1 for report in valid_reports if report.status == "resolved")
    repairing = sum(
        1 for report in valid_reports
        if report.status in {"work_order_created", "in_progress"}
    )
    awaiting = sum(1 for report in valid_reports if report.status in awaiting_statuses)
    return {
        "total": total,
        "open": awaiting,
        "repairing": repairing,
        "resolved": resolved,
        "completion_percent": round(resolved * 100 / total) if total else 0,
    }


@app.get("/map/potholes")
def get_map_potholes(
    db: Session = Depends(get_db),
):
    """
    Returns only GPS-enabled potholes for the live map.
    """

    potholes = (
        db.query(Pothole)
        .filter(
            Pothole.latitude.isnot(None),
            Pothole.longitude.isnot(None),
            Pothole.status.notin_(["rejected", "duplicate"]),
        )
        .order_by(Pothole.created_at.desc())
        .all()
    )

    return [
        {
            "id": pothole.id,
            "latitude": pothole.latitude,
            "longitude": pothole.longitude,
            "severity": pothole.severity,
            "status": pothole.status,
            "description": pothole.description,
            "created_at": pothole.created_at,
        }
        for pothole in potholes
    ]


class ProgressUpdateCreate(BaseModel):
    pothole_id: int
    stage: str = Field(..., min_length=2, max_length=40)
    progress_percent: int = Field(..., ge=0, le=100)
    message: str = Field(..., min_length=3, max_length=1000)


class ProgressUpdateEdit(BaseModel):
    stage: str = Field(..., min_length=2, max_length=40)
    progress_percent: int = Field(..., ge=0, le=100)
    message: str = Field(..., min_length=3, max_length=1000)


def sync_pothole_repair_status(pothole: Pothole, stage: str, progress_percent: int):
    stage_statuses = {
        "awaiting repair": "repair_required",
        "inspection scheduled": "inspection_scheduled",
        "repair scheduled": "work_order_created",
        "work underway": "in_progress",
        "quality check": "in_progress",
        "repair completed": "resolved",
        "work done": "resolved",
    }
    normalized_stage = stage.casefold().strip()
    if normalized_stage in stage_statuses:
        pothole.status = stage_statuses[normalized_stage]
    elif progress_percent >= 100:
        pothole.status = "resolved"
    elif progress_percent > 0:
        pothole.status = "in_progress"
    elif pothole.status == "resolved":
        pothole.status = "work_order_created"


@app.get("/progress/updates")
def get_progress_updates(db: Session = Depends(get_db)):
    """Public feed of official repair updates for citizens."""
    updates = (
        db.query(ProgressUpdate)
        .order_by(ProgressUpdate.created_at.desc(), ProgressUpdate.id.desc())
        .limit(100)
        .all()
    )
    return [get_progress_update_dict(update) for update in updates]


@app.post("/progress/updates")
def create_progress_update(
    update_data: ProgressUpdateCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    pothole = db.query(Pothole).filter(Pothole.id == update_data.pothole_id).first()
    if pothole is None:
        raise HTTPException(status_code=404, detail="Road report not found.")

    stage = update_data.stage.strip()
    message = update_data.message.strip()
    if not stage or not message:
        raise HTTPException(status_code=400, detail="Stage and update details are required.")

    update = ProgressUpdate(
        pothole_id=pothole.id,
        stage=stage,
        progress_percent=update_data.progress_percent,
        message=message,
        updated_by=admin.name or admin.email,
    )
    # Keep the public report status in sync with the official stage update.
    sync_pothole_repair_status(pothole, stage, update_data.progress_percent)
    db.add(update)
    db.commit()
    db.refresh(update)
    return get_progress_update_dict(update)


@app.put("/progress/updates/{update_id}")
def edit_progress_update(
    update_id: int,
    update_data: ProgressUpdateEdit,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    update = db.query(ProgressUpdate).filter(ProgressUpdate.id == update_id).first()
    if update is None:
        raise HTTPException(status_code=404, detail="Repair update not found.")
    stage = update_data.stage.strip()
    message = update_data.message.strip()
    if not stage or not message:
        raise HTTPException(status_code=400, detail="Stage and update details are required.")
    pothole = db.query(Pothole).filter(Pothole.id == update.pothole_id).first()
    if pothole is None:
        raise HTTPException(status_code=404, detail="Road report not found.")
    update.stage = stage
    update.progress_percent = update_data.progress_percent
    update.message = message
    update.updated_by = admin.name or admin.email
    update.created_at = datetime.utcnow()
    sync_pothole_repair_status(pothole, stage, update_data.progress_percent)
    db.commit()
    db.refresh(update)
    return get_progress_update_dict(update)


class OfficialMessageCreate(BaseModel):
    recipient_id: int
    message: str = Field(..., min_length=1, max_length=2000)
    important: bool = False
    pothole_id: int | None = None


@app.get("/official/chat/users")
def get_official_chat_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    users = (
        db.query(User)
        .filter(User.role.in_(["ADMIN", "AUTHORITY"]))
        .order_by(User.name.asc())
        .all()
    )
    return [
        {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "is_self_test": user.id == current_user.id,
        }
        for user in users
    ]


@app.get("/official/chat/messages")
def get_official_chat_messages(
    with_user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    other = db.query(User).filter(User.id == with_user_id).first()
    if other is None or other.role not in {"ADMIN", "AUTHORITY"}:
        raise HTTPException(status_code=404, detail="Official account not found.")
    messages = (
        db.query(OfficialMessage)
        .filter(
            or_(
                (OfficialMessage.sender_id == current_user.id) & (OfficialMessage.recipient_id == other.id),
                (OfficialMessage.sender_id == other.id) & (OfficialMessage.recipient_id == current_user.id),
            )
        )
        .order_by(OfficialMessage.created_at.asc(), OfficialMessage.id.asc())
        .limit(500)
        .all()
    )
    return [get_official_message_dict(message) for message in messages]


@app.post("/official/chat/messages")
def send_official_chat_message(
    data: OfficialMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    recipient = db.query(User).filter(User.id == data.recipient_id).first()
    if recipient is None or recipient.role not in {"ADMIN", "AUTHORITY"}:
        raise HTTPException(status_code=404, detail="Choose another official account.")
    message_text = data.message.strip()
    if not message_text:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    latitude = longitude = None
    if data.pothole_id is not None:
        pothole = db.query(Pothole).filter(Pothole.id == data.pothole_id).first()
        if pothole is None:
            raise HTTPException(status_code=404, detail="Road report not found.")
        latitude, longitude = pothole.latitude, pothole.longitude

    saved = OfficialMessage(
        sender_id=current_user.id,
        recipient_id=recipient.id,
        message=message_text,
        important=bool(data.important and current_user.role in {"ADMIN", "AUTHORITY"}),
        pothole_id=data.pothole_id,
        latitude=str(latitude) if latitude is not None else None,
        longitude=str(longitude) if longitude is not None else None,
    )
    db.add(saved)
    db.commit()
    db.refresh(saved)
    return get_official_message_dict(saved)


@app.post("/official/chat/attachments")
async def send_official_chat_attachment(
    recipient_id: int = Form(...),
    message: str = Form(""),
    important: bool = Form(False),
    pothole_id: int | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    recipient = db.query(User).filter(User.id == recipient_id).first()
    if recipient is None or recipient.role not in {"ADMIN", "AUTHORITY"}:
        raise HTTPException(status_code=404, detail="Choose another account.")
    if not (file.content_type or "").startswith(("image/", "video/")):
        raise HTTPException(status_code=400, detail="Chat attachments must be an image or video.")
    contents = await file.read(25 * 1024 * 1024 + 1)
    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Chat videos and images are limited to 25 MB.")
    if not contents:
        raise HTTPException(status_code=400, detail="The selected attachment is empty.")

    latitude = longitude = None
    if pothole_id is not None:
        pothole = db.query(Pothole).filter(Pothole.id == pothole_id).first()
        if pothole is None:
            raise HTTPException(status_code=404, detail="Road report not found.")
        latitude, longitude = pothole.latitude, pothole.longitude

    original_name = Path(file.filename or "attachment").name[:255]
    suffix = Path(original_name).suffix.lower()
    stored_path = CHAT_UPLOAD_DIR / f"{uuid4().hex}{suffix}"
    stored_path.write_bytes(contents)
    saved = OfficialMessage(
        sender_id=current_user.id,
        recipient_id=recipient.id,
        message=message.strip(),
        important=important,
        pothole_id=pothole_id,
        latitude=str(latitude) if latitude is not None else None,
        longitude=str(longitude) if longitude is not None else None,
        attachment_path=str(stored_path),
        attachment_name=original_name,
        attachment_type=file.content_type,
    )
    db.add(saved)
    db.commit()
    db.refresh(saved)
    return get_official_message_dict(saved)


@app.get("/official/chat/attachments/{message_id}")
def get_official_chat_attachment(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    message = db.query(OfficialMessage).filter(OfficialMessage.id == message_id).first()
    if message is None or current_user.id not in {message.sender_id, message.recipient_id}:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    path = Path(message.attachment_path or "")
    if not message.attachment_path or not path.is_file():
        raise HTTPException(status_code=404, detail="Attachment file is unavailable.")
    return FileResponse(
        path,
        media_type=message.attachment_type or "application/octet-stream",
        filename=message.attachment_name or path.name,
    )


# =========================================================
# ANALYTICS
# =========================================================

@app.get("/analytics")
def get_analytics(
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN", "AUTHORITY")),
):
    potholes = (
        db.query(Pothole)
        .order_by(Pothole.created_at.asc())
        .all()
    )

    severity_distribution = {
        "low": 0,
        "medium": 0,
        "high": 0,
        "critical": 0,
    }

    status_distribution = {}

    confidence_values = []

    for pothole in potholes:
        if pothole.severity in severity_distribution:
            severity_distribution[
                pothole.severity
            ] += 1

        if pothole.status:
            status_distribution[
                pothole.status
            ] = (
                status_distribution.get(
                    pothole.status,
                    0,
                )
                + 1
            )

        if pothole.confidence is not None:
            confidence_values.append(
                float(pothole.confidence)
            )

    average_confidence = (
        sum(confidence_values)
        / len(confidence_values)
        if confidence_values
        else 0
    )

    return {
        "success": True,
        "total_potholes": len(potholes),
        "average_ai_confidence": round(
            average_confidence,
            4,
        ),
        "severity_distribution": (
            severity_distribution
        ),
        "status_distribution": status_distribution,
    }


# =========================================================
# STARTUP MESSAGE
# =========================================================

@app.on_event("startup")
def startup_event():
    print("=" * 60)
    print("PotholeVision API started")
    print("YOLO model: loads on the first detection request")
    print("ByteTrack video tracking: ENABLED")
    print(
        "GPS duplicate matching: "
        f"{GPS_DUPLICATE_RADIUS_METERS} meters"
    )
    print(f"Database: {engine.dialect.name}")
    print("=" * 60)

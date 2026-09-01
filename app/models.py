from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(40), default="citizen", nullable=False)


class Contractor(Base):
    __tablename__ = "contractors"

    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False)
    company = Column(String(200), nullable=False)
    phone = Column(String(40))
    email = Column(String(255))
    active = Column(Boolean, default=True)


class Road(Base):
    __tablename__ = "roads"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    road_code = Column(String(100), index=True)
    authority = Column(String(200))


class Pothole(Base):
    __tablename__ = "potholes"

    id = Column(Integer, primary_key=True)

    road_id = Column(
        Integer,
        ForeignKey("roads.id"),
        nullable=True
    )

    latitude = Column(Float, nullable=False, index=True)
    longitude = Column(Float, nullable=False, index=True)

    gps_accuracy = Column(Float)

    severity = Column(
        String(30),
        default="medium",
        nullable=False
    )

    priority = Column(
        String(30),
        default="medium",
        nullable=False
    )

    status = Column(
        String(40),
        default="detected",
        nullable=False
    )

    detection_count = Column(
        Integer,
        default=1
    )

    first_detected_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    last_detected_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True
    )


class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True)

    pothole_id = Column(
        Integer,
        ForeignKey("potholes.id"),
        nullable=False
    )

    confidence = Column(
        Float,
        nullable=False
    )

    bbox = Column(String(500))

    model_version = Column(
        String(100),
        default="YOLO26"
    )

    source = Column(
        String(50),
        default="camera"
    )

    detected_at = Column(
        DateTime,
        default=datetime.utcnow
    )


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True)

    pothole_id = Column(
        Integer,
        ForeignKey("potholes.id"),
        nullable=True
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True
    )

    description = Column(Text)

    image_url = Column(String(500))

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )


class WorkOrder(Base):
    __tablename__ = "work_orders"

    id = Column(Integer, primary_key=True)

    pothole_id = Column(
        Integer,
        ForeignKey("potholes.id"),
        nullable=False
    )

    contractor_id = Column(
        Integer,
        ForeignKey("contractors.id"),
        nullable=True
    )

    priority = Column(
        String(30),
        default="medium"
    )

    status = Column(
        String(40),
        default="new"
    )

    due_date = Column(DateTime)

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )


class Inspection(Base):
    __tablename__ = "inspections"

    id = Column(Integer, primary_key=True)

    pothole_id = Column(
        Integer,
        ForeignKey("potholes.id"),
        nullable=False
    )

    inspector_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True
    )

    result = Column(
        String(40),
        nullable=False
    )

    notes = Column(Text)

    before_image = Column(String(500))

    after_image = Column(String(500))

    inspected_at = Column(
        DateTime,
        default=datetime.utcnow
    )


class Verification(Base):
    __tablename__ = "verifications"

    id = Column(Integer, primary_key=True)

    pothole_id = Column(
        Integer,
        ForeignKey("potholes.id"),
        nullable=False
    )

    verified_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True
    )

    result = Column(
        String(40),
        nullable=False
    )

    evidence_url = Column(String(500))

    verified_at = Column(
        DateTime,
        default=datetime.utcnow
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True)

    contractor_id = Column(
        Integer,
        ForeignKey("contractors.id"),
        nullable=False
    )

    work_order_id = Column(
        Integer,
        ForeignKey("work_orders.id"),
        nullable=False
    )

    channel = Column(
        String(30),
        default="in_app"
    )

    recipient = Column(String(255))

    message = Column(
        Text,
        nullable=False
    )

    status = Column(
        String(30),
        default="queued"
    )

    sent_at = Column(DateTime)

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True
    )

    action = Column(
        String(120),
        nullable=False
    )

    entity_type = Column(String(80))

    entity_id = Column(Integer)

    details = Column(Text)

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )
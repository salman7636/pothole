from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from database import Base


class Inspection(Base):
    __tablename__ = "inspections"

    id = Column(Integer, primary_key=True, index=True)

    pothole_id = Column(
        Integer,
        ForeignKey("potholes.id"),
        nullable=False,
    )

    complaint_id = Column(
        Integer,
        ForeignKey("complaints.id"),
        nullable=True,
    )

    inspector_name = Column(
        String(100),
        nullable=False,
    )

    inspection_notes = Column(
        Text,
        nullable=True,
    )

    confirmed_severity = Column(
        String(20),
        nullable=True,
    )

    status = Column(
        String(30),
        default="scheduled",
        nullable=False,
    )

    inspected_at = Column(
        DateTime,
        nullable=True,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
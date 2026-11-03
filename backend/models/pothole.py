from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text

from database import Base


class Pothole(Base):
    __tablename__ = "potholes"

    id = Column(Integer, primary_key=True, index=True)

    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    severity = Column(String(20), nullable=True)
    confidence = Column(Float, nullable=True)

    image_path = Column(String(500), nullable=True)

    status = Column(
        String(30),
        default="reported",
        nullable=False,
    )

    description = Column(Text, nullable=True)

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
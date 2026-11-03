from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from database import Base


class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True, index=True)

    pothole_id = Column(
        Integer,
        ForeignKey("potholes.id"),
        nullable=True,
    )

    citizen_name = Column(String(100), nullable=True)

    citizen_email = Column(String(150), nullable=True)

    description = Column(Text, nullable=False)

    status = Column(
        String(30),
        default="submitted",
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
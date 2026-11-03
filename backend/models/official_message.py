from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from database import Base


class OfficialMessage(Base):
    __tablename__ = "official_messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    message = Column(Text, nullable=False)
    important = Column(Boolean, nullable=False, default=False)
    pothole_id = Column(Integer, ForeignKey("potholes.id"), nullable=True)
    latitude = Column(String(40), nullable=True)
    longitude = Column(String(40), nullable=True)
    attachment_path = Column(String(500), nullable=True)
    attachment_name = Column(String(255), nullable=True)
    attachment_type = Column(String(120), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from database import Base


class ProgressUpdate(Base):
    __tablename__ = "progress_updates"

    id = Column(Integer, primary_key=True, index=True)
    pothole_id = Column(Integer, ForeignKey("potholes.id"), nullable=False, index=True)
    stage = Column(String(40), nullable=False)
    progress_percent = Column(Integer, nullable=False, default=0)
    message = Column(Text, nullable=False)
    updated_by = Column(String(150), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

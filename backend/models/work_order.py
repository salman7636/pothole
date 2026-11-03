from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text

from database import Base


class WorkOrder(Base):
    __tablename__ = "work_orders"

    id = Column(Integer, primary_key=True, index=True)

    pothole_id = Column(
        Integer,
        ForeignKey("potholes.id"),
        nullable=False,
    )

    inspection_id = Column(
        Integer,
        ForeignKey("inspections.id"),
        nullable=True,
    )

    contractor_name = Column(
        String(150),
        nullable=False,
    )

    work_description = Column(
        Text,
        nullable=False,
    )

    priority = Column(
        String(20),
        default="medium",
        nullable=False,
    )

    status = Column(
        String(30),
        default="assigned",
        nullable=False,
    )

    estimated_cost = Column(
        Float,
        nullable=True,
    )

    scheduled_date = Column(
        DateTime,
        nullable=True,
    )

    completed_at = Column(
        DateTime,
        nullable=True,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
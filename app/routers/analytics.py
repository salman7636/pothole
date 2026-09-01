from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Pothole, WorkOrder

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    potholes_by_status = dict(db.query(Pothole.status, func.count(Pothole.id)).group_by(Pothole.status).all())
    potholes_by_severity = dict(db.query(Pothole.severity, func.count(Pothole.id)).group_by(Pothole.severity).all())
    work_orders_by_status = dict(db.query(WorkOrder.status, func.count(WorkOrder.id)).group_by(WorkOrder.status).all())
    return {
        "potholes_total": sum(potholes_by_status.values()),
        "potholes_by_status": potholes_by_status,
        "potholes_by_severity": potholes_by_severity,
        "work_orders_total": sum(work_orders_by_status.values()),
        "work_orders_by_status": work_orders_by_status,
    }

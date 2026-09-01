from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Contractor, Pothole, User, WorkOrder
from app.schemas import WorkOrderCreate, WorkOrderRead

router = APIRouter(prefix="/work-orders", tags=["Work Orders"])


@router.post("", response_model=WorkOrderRead, status_code=status.HTTP_201_CREATED)
def create_work_order(payload: WorkOrderCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if db.get(Pothole, payload.pothole_id) is None:
        raise HTTPException(status_code=404, detail="Pothole not found")
    if payload.contractor_id and db.get(Contractor, payload.contractor_id) is None:
        raise HTTPException(status_code=404, detail="Contractor not found")
    order = WorkOrder(**payload.model_dump(), status="assigned" if payload.contractor_id else "new")
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@router.get("", response_model=list[WorkOrderRead])
def list_work_orders(db: Session = Depends(get_db)):
    return db.query(WorkOrder).all()

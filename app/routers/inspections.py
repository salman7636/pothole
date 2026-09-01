from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Inspection, Pothole, User
from app.schemas import InspectionCreate, InspectionRead

router = APIRouter(prefix="/inspections", tags=["Inspections"])


@router.post("", response_model=InspectionRead, status_code=status.HTTP_201_CREATED)
def create_inspection(payload: InspectionCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pothole = db.get(Pothole, payload.pothole_id)
    if pothole is None:
        raise HTTPException(status_code=404, detail="Pothole not found")
    inspection = Inspection(**payload.model_dump(), inspector_id=user.id)
    if payload.result == "pass":
        pothole.status = "verified"
    db.add(inspection)
    db.commit()
    db.refresh(inspection)
    return inspection


@router.get("", response_model=list[InspectionRead])
def list_inspections(db: Session = Depends(get_db)):
    return db.query(Inspection).all()

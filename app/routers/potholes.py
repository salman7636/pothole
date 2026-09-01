from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Pothole, User
from app.schemas import PotholeCreate, PotholeRead, PotholeUpdate

router = APIRouter(prefix="/potholes", tags=["Potholes"])


@router.post("", response_model=PotholeRead, status_code=status.HTTP_201_CREATED)
def create_pothole(payload: PotholeCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pothole = Pothole(**payload.model_dump(), created_by=user.id)
    db.add(pothole)
    db.commit()
    db.refresh(pothole)
    return pothole


@router.get("", response_model=list[PotholeRead])
def list_potholes(status_filter: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Pothole)
    return query.filter(Pothole.status == status_filter).all() if status_filter else query.all()


@router.get("/{pothole_id}", response_model=PotholeRead)
def get_pothole(pothole_id: int, db: Session = Depends(get_db)):
    pothole = db.get(Pothole, pothole_id)
    if pothole is None:
        raise HTTPException(status_code=404, detail="Pothole not found")
    return pothole


@router.patch("/{pothole_id}", response_model=PotholeRead)
def update_pothole(pothole_id: int, payload: PotholeUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    pothole = db.get(Pothole, pothole_id)
    if pothole is None:
        raise HTTPException(status_code=404, detail="Pothole not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(pothole, field, value)
    db.commit()
    db.refresh(pothole)
    return pothole

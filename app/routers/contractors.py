from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Contractor, User
from app.schemas import ContractorCreate, ContractorRead

router = APIRouter(prefix="/contractors", tags=["Contractors"])


@router.post("", response_model=ContractorRead, status_code=status.HTTP_201_CREATED)
def create_contractor(payload: ContractorCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    contractor = Contractor(**payload.model_dump())
    db.add(contractor)
    db.commit()
    db.refresh(contractor)
    return contractor


@router.get("", response_model=list[ContractorRead])
def list_contractors(active_only: bool = False, db: Session = Depends(get_db)):
    query = db.query(Contractor)
    return query.filter(Contractor.active.is_(True)).all() if active_only else query.all()


@router.get("/{contractor_id}", response_model=ContractorRead)
def get_contractor(contractor_id: int, db: Session = Depends(get_db)):
    contractor = db.get(Contractor, contractor_id)
    if contractor is None:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return contractor

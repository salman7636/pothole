from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str


class UserRead(ORMModel):
    id: int
    name: str
    email: str
    role: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class ContractorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    company: str = Field(min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=255)
    active: bool = True


class ContractorRead(ORMModel):
    id: int
    name: str
    company: str
    phone: str | None
    email: str | None
    active: bool


class PotholeCreate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    road_id: int | None = None
    gps_accuracy: float | None = Field(default=None, ge=0)
    severity: str = Field(default="medium", pattern="^(low|medium|high|critical)$")
    priority: str = Field(default="medium", pattern="^(low|medium|high|critical)$")


class PotholeUpdate(BaseModel):
    severity: str | None = Field(default=None, pattern="^(low|medium|high|critical)$")
    priority: str | None = Field(default=None, pattern="^(low|medium|high|critical)$")
    status: str | None = Field(default=None, pattern="^(detected|assigned|in_progress|repaired|verified|closed)$")


class PotholeRead(ORMModel):
    id: int
    road_id: int | None
    latitude: float
    longitude: float
    gps_accuracy: float | None
    severity: str
    priority: str
    status: str
    detection_count: int
    first_detected_at: datetime
    last_detected_at: datetime
    created_by: int | None


class WorkOrderCreate(BaseModel):
    pothole_id: int
    contractor_id: int | None = None
    priority: str = Field(default="medium", pattern="^(low|medium|high|critical)$")
    due_date: datetime | None = None


class WorkOrderRead(ORMModel):
    id: int
    pothole_id: int
    contractor_id: int | None
    priority: str
    status: str
    due_date: datetime | None
    created_at: datetime


class InspectionCreate(BaseModel):
    pothole_id: int
    result: str = Field(pattern="^(pass|fail|needs_review)$")
    notes: str | None = None


class InspectionRead(ORMModel):
    id: int
    pothole_id: int
    inspector_id: int | None
    result: str
    notes: str | None
    before_image: str | None
    after_image: str | None
    inspected_at: datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import Base, engine
from app import models
from app.routers.ai import router as ai_router
from app.routers.analytics import router as analytics_router
from app.routers.auth import router as auth_router
from app.routers.contractors import router as contractors_router
from app.routers.inspections import router as inspections_router
from app.routers.potholes import router as potholes_router
from app.routers.workorders import router as workorders_router


Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="PotholeVision API",
    description="AI-powered pothole detection and road management system",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ai_router)
app.include_router(auth_router)
app.include_router(potholes_router)
app.include_router(contractors_router)
app.include_router(workorders_router)
app.include_router(inspections_router)
app.include_router(analytics_router)
app.mount("/app", StaticFiles(directory="frontend", html=True), name="frontend")


@app.get("/")
def root():
    return {
        "project": "PotholeVision",
        "status": "running",
        "message": "PotholeVision backend is working"
    }

@app.get("/health")
def health():
    return {
        "status": "healthy"
    }

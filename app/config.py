import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


PROJECT_ROOT = Path(__file__).resolve().parent.parent

DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL and DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

JWT_SECRET = os.getenv(
    "JWT_SECRET",
    "potholevision-secret-key"
)

MODEL_PATH = os.getenv(
    "MODEL_PATH",
    str(PROJECT_ROOT / "models" / "best.pt")
)

UPLOAD_DIR = os.getenv(
    "UPLOAD_DIR",
    "uploads"
)

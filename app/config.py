import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


PROJECT_ROOT = Path(__file__).resolve().parent.parent

DATABASE_URL = os.getenv(
    "DATABASE_URL"
)

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

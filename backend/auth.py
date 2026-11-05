
import os
import json
import secrets
import urllib.request
import urllib.error
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import jwt, JWTError

from database import get_db
from models.user import User

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(BACKEND_DIR.parent / ".env")

security = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = os.getenv("JWT_SECRET_KEY") or os.getenv("JWT_SECRET", "change-this-secret")
ALGORITHM = "HS256"

SUPABASE_URL = (
    os.getenv("SUPABASE_URL")
    or os.getenv("VITE_SUPABASE_URL")
    or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
)

SUPABASE_ANON_KEY = (
    os.getenv("SUPABASE_ANON_KEY")
    or os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
    or os.getenv("VITE_SUPABASE_ANON_KEY")
)


def hash_password(password: str):
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str):
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict | None = None, user_id: int | None = None, role: str | None = None):
    # Support both a payload and the keyword/positional form used by main.py.
    if data is not None and not isinstance(data, dict):
        # Existing official-access call passes (user_id, role) positionally.
        role = role or (user_id if isinstance(user_id, str) else None)
        user_id = int(data)
        payload = {}
    else:
        payload = dict(data or {})
    if user_id is not None:
        payload["sub"] = str(user_id)
    if role is not None:
        payload["role"] = role
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_supabase_token(token: str):
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(
            status_code=500,
            detail="Supabase environment variables are missing"
        )

    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/user"

    request = urllib.request.Request(
        url,
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {token}",
        },
        method="GET",
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))

    except urllib.error.HTTPError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired Supabase token"
        )
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Unable to verify Supabase authentication"
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    token = credentials.credentials
    # First accept tokens issued by this API's email/password login. Supabase
    # tokens are then verified remotely as before.
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub", ""))
    except (JWTError, TypeError, ValueError):
        payload = None

    if payload is not None:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return user

    supabase_user = verify_supabase_token(token)

    email = supabase_user.get("email")

    if not email:
        raise HTTPException(
            status_code=401,
            detail="Supabase account has no email"
        )

    user = db.query(User).filter(User.email == email).first()

    if not user:
        metadata = supabase_user.get("user_metadata") or {}
        name = (
            metadata.get("full_name")
            or metadata.get("name")
            or email.split("@")[0]
        )

        user = User(
            name=name,
            email=email,
            password_hash=secrets.token_urlsafe(48),
            role="CITIZEN",
        )

        db.add(user)
        db.commit()
        db.refresh(user)

    return user


def require_roles(*allowed_roles):
    def role_checker(
        current_user: User = Depends(get_current_user)
    ):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to access this resource"
            )

        return current_user

    return role_checker

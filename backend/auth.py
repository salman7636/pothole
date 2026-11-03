
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

from database import get_db
from models.user import User

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(BACKEND_DIR.parent / ".env")

security = HTTPBearer()

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
    supabase_user = verify_supabase_token(token)

    email = supabase_user.get("email")

    if not email:
        raise HTTPException(
            status_code=401,
            detail="Supabase account has no email"
        )

    user = db.query(User).filter(
        User.email == email
    ).first()

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

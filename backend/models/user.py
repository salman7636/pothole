from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)

    role = Column(
        String(30),
        nullable=False,
        default="CITIZEN",
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
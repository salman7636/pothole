"""Create an admin account or promote an existing account interactively."""

from getpass import getpass

from auth import hash_password, verify_password
from database import Base, SessionLocal, engine
from models.user import User


def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        email = input("Admin email: ").strip().lower()
        if len(email) < 5 or "@" not in email:
            raise SystemExit("Enter a valid email address.")

        user = db.query(User).filter(User.email == email).first()
        if user:
            password = getpass("Current account password: ")
            if not verify_password(password, user.password_hash):
                raise SystemExit("That password does not match this account.")
            user.role = "ADMIN"
        else:
            name = input("Admin name: ").strip()
            password = getpass("New admin password (8–72 characters): ")
            if len(name) < 2 or len(name) > 150:
                raise SystemExit("Name must be between 2 and 150 characters.")
            if len(password) < 8 or len(password) > 72:
                raise SystemExit("Password must be between 8 and 72 characters.")
            user = User(
                name=name,
                email=email,
                password_hash=hash_password(password),
                role="ADMIN",
            )
            db.add(user)

        db.commit()
        print(f"Admin access enabled for {email}. Sign out of the app and sign in again.")
    finally:
        db.close()


if __name__ == "__main__":
    main()

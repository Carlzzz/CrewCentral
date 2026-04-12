"""One-shot: insert dev@local / dev user (bcrypt). Run: uv run python scripts/seed_dev_user.py"""

import asyncio

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.user import User


async def main() -> None:
    async with AsyncSessionLocal() as session:
        existing = await session.scalar(select(User).where(User.email == "dev@local"))
        if existing:
            print("dev@local already exists")
            return
        session.add(
            User(
                email="dev@local",
                password_hash=hash_password("dev"),
                display_name="Dev User",
                is_admin=True,
            )
        )
        await session.commit()
        print("Seeded dev@local / dev")


if __name__ == "__main__":
    asyncio.run(main())

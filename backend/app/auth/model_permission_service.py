from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def ensure_user_model_permission_table(db: AsyncSession) -> None:
    await db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS user_model_permissions (
              user_id VARCHAR(36) PRIMARY KEY,
              allowed_models TEXT NOT NULL,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    )


async def get_user_model_permissions(db: AsyncSession, user_id: str) -> list[str] | None:
    """获取用户的可用模型列表。如果返回 None 则表示拥有全部权限。"""
    await ensure_user_model_permission_table(db)
    row = await db.execute(
        text("SELECT allowed_models FROM user_model_permissions WHERE user_id = :uid"),
        {"uid": user_id},
    )
    res = row.scalar_one_or_none()
    if res is None:
        return None
    res_str = str(res).strip()
    if not res_str:
        return []
    return [m.strip() for m in res_str.split(",") if m.strip()]


async def set_user_model_permissions(db: AsyncSession, user_id: str, allowed_models: list[str] | None) -> None:
    """设置用户的可用模型列表。如果为 None 则删除记录，恢复为拥有全部权限。"""
    await ensure_user_model_permission_table(db)
    if allowed_models is None:
        await db.execute(
            text("DELETE FROM user_model_permissions WHERE user_id = :uid"),
            {"uid": user_id},
        )
    else:
        clean_models = [m.strip() for m in allowed_models if m.strip()]
        models_str = ",".join(clean_models)
        await db.execute(
            text(
                """
                INSERT INTO user_model_permissions(user_id, allowed_models, updated_at)
                VALUES (:uid, :models, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id) DO UPDATE SET allowed_models = excluded.allowed_models, updated_at = CURRENT_TIMESTAMP
                """
            ),
            {"uid": user_id, "models": models_str},
        )

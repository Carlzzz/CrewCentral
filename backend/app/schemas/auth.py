from pydantic import BaseModel, Field


class LoginBody(BaseModel):
    # 使用 str 而非 EmailStr：本地开发账号为 dev@local，email-validator 会拒绝无 TLD 的域
    email: str = Field(..., min_length=3, max_length=255)
    password: str
    state: str = Field(..., min_length=8)


class ConsentBody(BaseModel):
    state: str = Field(..., min_length=8)


class RefreshBody(BaseModel):
    refresh_token: str

import datetime
import jwt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.config import settings

router = APIRouter()

DEMO_USERS = {
    "admin@arkhitx.com": {"password": "admin123", "name": "Admin User", "role": "admin"},
    "consultant@arkhitx.com": {"password": "consultant123", "name": "Consultant", "role": "consultant"},
}


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    user = DEMO_USERS.get(request.email)
    if not user or user["password"] != request.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    payload = {
        "sub": request.email,
        "name": user["name"],
        "role": user["role"],
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=settings.jwt_expiry_hours),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    return TokenResponse(
        access_token=token,
        user={"email": request.email, "name": user["name"], "role": user["role"]},
    )

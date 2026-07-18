"""Neon Auth (Managed Better Auth) JWT verification."""

from __future__ import annotations

import base64
import os
import time
from typing import Any, Optional
from urllib.parse import urlparse

import jwt
import requests
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi import HTTPException, Request
from jwt import PyJWTError

_jwks_cache: dict[str, Any] = {"fetched_at": 0.0, "keys": None}
_JWKS_TTL_SECONDS = 3600


def auth_base_url() -> str:
    return (os.environ.get("NEON_AUTH_BASE_URL") or "").rstrip("/")


def auth_enabled() -> bool:
    base = auth_base_url()
    return bool(base) and not base.startswith("provisioning") and base.startswith("http")


def auth_origin() -> str:
    parsed = urlparse(auth_base_url())
    return f"{parsed.scheme}://{parsed.netloc}"


def jwks_url() -> str:
    explicit = os.environ.get("NEON_AUTH_JWKS_URL")
    if explicit:
        return explicit
    return f"{auth_base_url()}/.well-known/jwks.json"


def _get_jwks() -> dict[str, Any]:
    now = time.time()
    if _jwks_cache["keys"] and now - _jwks_cache["fetched_at"] < _JWKS_TTL_SECONDS:
        return _jwks_cache["keys"]
    response = requests.get(jwks_url(), timeout=10)
    response.raise_for_status()
    data = response.json()
    _jwks_cache["keys"] = data
    _jwks_cache["fetched_at"] = now
    return data


def _signing_key(token: str, jwks: dict[str, Any]):
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    for jwk in jwks.get("keys", []):
        if jwk.get("kid") == kid:
            raw = base64.urlsafe_b64decode(jwk["x"] + "==")
            return Ed25519PublicKey.from_public_bytes(raw)
    raise ValueError("Matching JWK not found")


def validate_neon_token(token: str) -> Optional[dict[str, Any]]:
    if not token:
        return None
    try:
        jwks = _get_jwks()
        key = _signing_key(token, jwks)
        origin = auth_origin()
        return jwt.decode(
            token,
            key=key,
            algorithms=["EdDSA"],
            issuer=origin,
            audience=origin,
        )
    except (PyJWTError, ValueError, requests.RequestException):
        return None


def extract_bearer(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth:
        return None
    parts = auth.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def require_user(request: Request) -> dict[str, Any]:
    if not auth_enabled():
        return {"id": "local-dev", "email": "local@dev", "name": "Local Dev"}
    token = extract_bearer(request)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    claims = validate_neon_token(token)
    if not claims:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return claims


PUBLIC_API_PREFIXES = (
    "/api/health",
    "/api/auth/config",
)

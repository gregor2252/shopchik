import hashlib
import hmac
import json
import os
import time
from urllib.parse import parse_qsl

from fastapi import HTTPException


BOT_TOKEN = os.getenv("BOT_TOKEN", "")
INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60


def verify_telegram_init_data(init_data: str) -> dict:
    """Validate Telegram WebApp initData and return parsed user."""
    if not BOT_TOKEN:
        raise HTTPException(status_code=500, detail="BOT_TOKEN is not configured")
    if not init_data:
        raise HTTPException(status_code=401, detail="Open this page in Telegram")

    parsed = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = parsed.pop("hash", None)
    if not received_hash:
        raise HTTPException(status_code=401, detail="Telegram init data hash is missing")

    data_check_string = "\n".join(f"{key}={value}" for key, value in sorted(parsed.items()))
    secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        raise HTTPException(status_code=401, detail="Telegram init data is invalid")

    auth_date = int(parsed.get("auth_date", "0") or "0")
    if auth_date and time.time() - auth_date > INIT_DATA_MAX_AGE_SECONDS:
        raise HTTPException(status_code=401, detail="Telegram init data is expired")

    try:
        return json.loads(parsed.get("user", "{}"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=401, detail="Telegram user data is invalid")

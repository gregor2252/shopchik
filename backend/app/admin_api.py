import os
import json
import hmac
import hashlib
import time
import uuid
from io import BytesIO
from pathlib import Path
from urllib.parse import parse_qsl
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Header, Request
from typing import List, Optional
import aiofiles
from PIL import Image

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

from .database import (
    get_products, get_product, create_product, update_product, delete_product,
    create_broadcast, get_broadcasts
)
from .scheduler import schedule_broadcast

router = APIRouter()
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
ADMIN_IDS = [int(x.strip()) for x in os.getenv("ADMIN_IDS", "").split(",") if x.strip()]
UPLOAD_DIR = "/app/uploads"
INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}

# Ensure upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

def verify_telegram_init_data(init_data: str) -> dict:
    """Validate Telegram WebApp initData and return parsed user."""
    if not BOT_TOKEN:
        raise HTTPException(status_code=500, detail="BOT_TOKEN is not configured")
    if not init_data:
        raise HTTPException(status_code=401, detail="Telegram init data is required")

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


def check_admin(init_data: str):
    """Check signed Telegram WebApp user against admin list."""
    user = verify_telegram_init_data(init_data)
    user_id = int(user.get("id") or 0)
    if user_id not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Access denied")
    return user


async def save_uploaded_images(photos: Optional[List[UploadFile]], prefix: str = "") -> List[str]:
    """Save uploaded image files and return public upload paths."""
    saved_photos = []
    if not photos:
        return saved_photos

    for photo in photos:
        if not photo or not photo.filename:
            continue

        extension = Path(photo.filename).suffix.lower()
        is_image_content = bool(photo.content_type and photo.content_type.startswith("image/"))
        is_allowed_extension = extension in ALLOWED_IMAGE_EXTENSIONS

        if not is_image_content and not is_allowed_extension:
            raise HTTPException(
                status_code=400,
                detail=f"Файл {photo.filename} не похож на изображение"
            )

        filename = f"{prefix}{uuid.uuid4().hex}.jpg"
        file_path = f"{UPLOAD_DIR}/{filename}"
        content = await photo.read()

        try:
            image = Image.open(BytesIO(content))
            if image.mode not in ("RGB", "L"):
                image = image.convert("RGB")
            elif image.mode == "L":
                image = image.convert("RGB")

            output = BytesIO()
            image.save(output, format="JPEG", quality=88, optimize=True)
            output.seek(0)
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Не удалось обработать фото {photo.filename}. Попробуйте JPG, PNG, WEBP или HEIC."
            ) from exc

        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(output.read())

        saved_photos.append(f"/uploads/{filename}")

    return saved_photos


def delete_upload_files(file_urls: Optional[List[str]]):
    """Delete files referenced by /uploads/... URLs from the local upload dir."""
    if not file_urls:
        return

    upload_root = Path(UPLOAD_DIR).resolve()

    for file_url in file_urls:
        if not file_url or not file_url.startswith("/uploads/"):
            continue

        relative_path = file_url.removeprefix("/uploads/").lstrip("/")
        file_path = (upload_root / relative_path).resolve()

        if upload_root not in file_path.parents:
            continue

        try:
            file_path.unlink(missing_ok=True)
        except OSError:
            pass


def get_uploaded_files(form, field_name: str) -> List[UploadFile]:
    """Return multipart file-like objects for a repeated form field."""
    return [
        item for item in form.getlist(field_name)
        if getattr(item, "filename", None) and hasattr(item, "read")
    ]


def get_existing_photo_urls(form) -> List[str]:
    """Return kept existing product photo URLs from multipart form."""
    urls = []
    for item in form.getlist("existing_photos"):
        if isinstance(item, str) and item.startswith("/uploads/"):
            urls.append(item)
    return urls


def normalize_optional_price(value: Optional[float]) -> Optional[float]:
    if value is None or value <= 0:
        return None
    return value


def normalize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    return value or None


def normalize_sizes(values: List[str]) -> List[str]:
    sizes = []
    seen = set()
    for value in values:
        if not value:
            continue
        for item in value.replace("\n", ",").split(","):
            size = item.strip()
            if not size:
                continue
            size_key = size.lower()
            if size_key in seen:
                continue
            seen.add(size_key)
            sizes.append(size)
    return sizes


@router.post("/products")
async def admin_create_product(
    request: Request,
    name: str = Form(...),
    description: str = Form(...),
    price: float = Form(...),
    old_price: Optional[float] = Form(None),
    brand: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    x_telegram_init_data: str = Header("")
):
    """Create new product (admin only)"""
    check_admin(x_telegram_init_data)
    form = await request.form()
    photos = get_uploaded_files(form, "photos")
    sizes = normalize_sizes(form.getlist("sizes") or form.getlist("size"))
    saved_photos = await save_uploaded_images(photos)
    
    product_id = await create_product(
        name,
        description,
        price,
        normalize_optional_price(old_price),
        normalize_optional_text(brand),
        normalize_optional_text(category),
        sizes,
        saved_photos,
    )
    return {"id": product_id, "message": "Product created successfully"}

@router.get("/products")
async def admin_get_products(x_telegram_init_data: str = Header("")):
    """Get all products (admin only)"""
    check_admin(x_telegram_init_data)
    products = await get_products(limit=1000)
    return products

@router.get("/products/{product_id}")
async def admin_get_product(product_id: int, x_telegram_init_data: str = Header("")):
    """Get single product (admin only)"""
    check_admin(x_telegram_init_data)
    product = await get_product(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@router.put("/products/{product_id}")
async def admin_update_product(
    request: Request,
    product_id: int,
    name: str = Form(...),
    description: str = Form(...),
    price: float = Form(...),
    old_price: Optional[float] = Form(None),
    brand: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    x_telegram_init_data: str = Header("")
):
    """Update product (admin only)"""
    check_admin(x_telegram_init_data)
    
    product = await get_product(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    saved_photos = product['photos']

    form = await request.form()
    existing_photos = get_existing_photo_urls(form)
    photos = get_uploaded_files(form, "photos")
    sizes = normalize_sizes(form.getlist("sizes") or form.getlist("size"))

    removed_photos = [photo for photo in saved_photos if photo not in existing_photos]
    delete_upload_files(removed_photos)
    saved_photos = existing_photos

    if photos:
        saved_photos = [*saved_photos, *await save_uploaded_images(photos)]
    
    await update_product(
        product_id,
        name,
        description,
        price,
        normalize_optional_price(old_price),
        normalize_optional_text(brand),
        normalize_optional_text(category),
        sizes,
        saved_photos,
    )
    return {"message": "Product updated successfully"}

@router.delete("/products/{product_id}")
async def admin_delete_product(product_id: int, x_telegram_init_data: str = Header("")):
    """Delete product (admin only)"""
    check_admin(x_telegram_init_data)
    product = await get_product(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    await delete_product(product_id)
    delete_upload_files(product.get('photos'))
    return {"message": "Product deleted successfully"}


@router.get("/broadcasts")
async def admin_get_broadcasts(x_telegram_init_data: str = Header("")):
    """Get recent broadcasts for admin history."""
    check_admin(x_telegram_init_data)
    return await get_broadcasts()

@router.post("/broadcast")
async def admin_create_broadcast(
    message: str = Form(...),
    photo: Optional[UploadFile] = File(None),
    scheduled_time: Optional[str] = Form(None),
    x_telegram_init_data: str = Header("")
):
    """Create broadcast (admin only)"""
    check_admin(x_telegram_init_data)
    
    photo_url = None
    saved_photos = await save_uploaded_images([photo] if photo else None, prefix="broadcast_")
    if saved_photos:
        photo_url = saved_photos[0]
    
    broadcast_id = await create_broadcast(message, photo_url, scheduled_time)
    
    if scheduled_time:
        await schedule_broadcast(broadcast_id, scheduled_time)
        return {"message": f"Рассылка запланирована на {scheduled_time}"}
    else:
        # Send immediately
        result = await schedule_broadcast(broadcast_id)
        sent = result["sent"] if result else 0
        failed = result["failed"] if result else 0
        if sent == 0 and failed == 0:
            return {"message": "Нет пользователей для рассылки", "sent": sent, "failed": failed}
        if sent == 0 and failed > 0:
            return {"message": f"Рассылка не отправлена. Ошибок: {failed}", "sent": sent, "failed": failed}

        return {"message": f"Рассылка завершена. Отправлено: {sent}, ошибок: {failed}", "sent": sent, "failed": failed}

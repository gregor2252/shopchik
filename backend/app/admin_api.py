import os
import json
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import List, Optional
import aiofiles
from PIL import Image

from .database import (
    get_products, get_product, create_product, update_product, delete_product,
    get_all_users, create_broadcast
)
from .scheduler import schedule_broadcast

router = APIRouter()
ADMIN_IDS = [int(x.strip()) for x in os.getenv("ADMIN_IDS", "").split(",") if x.strip()]
UPLOAD_DIR = "/app/uploads"

# Ensure upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

def check_admin(user_id: int):
    """Check if user is admin"""
    if user_id not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Access denied")

@router.post("/products")
async def admin_create_product(
    user_id: int = Form(...),
    name: str = Form(...),
    description: str = Form(...),
    price: float = Form(...),
    photos: List[UploadFile] = File(...)
):
    """Create new product (admin only)"""
    check_admin(user_id)
    
    saved_photos = []
    for photo in photos:
        if photo.content_type not in ['image/jpeg', 'image/png', 'image/webp']:
            continue
        
        # Generate unique filename
        file_path = f"{UPLOAD_DIR}/{photo.filename}"
        
        # Save file
        async with aiofiles.open(file_path, 'wb') as f:
            content = await photo.read()
            await f.write(content)
        
        saved_photos.append(f"/uploads/{photo.filename}")
    
    product_id = await create_product(name, description, price, saved_photos)
    return {"id": product_id, "message": "Product created successfully"}

@router.get("/products")
async def admin_get_products(user_id: int):
    """Get all products (admin only)"""
    check_admin(user_id)
    products = await get_products(limit=1000)
    return products

@router.get("/products/{product_id}")
async def admin_get_product(product_id: int, user_id: int):
    """Get single product (admin only)"""
    check_admin(user_id)
    product = await get_product(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@router.put("/products/{product_id}")
async def admin_update_product(
    product_id: int,
    user_id: int = Form(...),
    name: str = Form(...),
    description: str = Form(...),
    price: float = Form(...),
    photos: List[UploadFile] = File(None)
):
    """Update product (admin only)"""
    check_admin(user_id)
    
    product = await get_product(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    saved_photos = product['photos']
    
    if photos:
        saved_photos = []
        for photo in photos:
            if photo.content_type not in ['image/jpeg', 'image/png', 'image/webp']:
                continue
            
            file_path = f"{UPLOAD_DIR}/{photo.filename}"
            async with aiofiles.open(file_path, 'wb') as f:
                content = await photo.read()
                await f.write(content)
            
            saved_photos.append(f"/uploads/{photo.filename}")
    
    await update_product(product_id, name, description, price, saved_photos)
    return {"message": "Product updated successfully"}

@router.delete("/products/{product_id}")
async def admin_delete_product(product_id: int, user_id: int):
    """Delete product (admin only)"""
    check_admin(user_id)
    await delete_product(product_id)
    return {"message": "Product deleted successfully"}

@router.post("/broadcast")
async def admin_create_broadcast(
    user_id: int,
    message: str = Form(...),
    photo: Optional[UploadFile] = File(None),
    scheduled_time: Optional[str] = Form(None)
):
    """Create broadcast (admin only)"""
    check_admin(user_id)
    
    photo_url = None
    if photo and photo.content_type in ['image/jpeg', 'image/png', 'image/webp']:
        file_path = f"{UPLOAD_DIR}/broadcast_{photo.filename}"
        async with aiofiles.open(file_path, 'wb') as f:
            content = await photo.read()
            await f.write(content)
        photo_url = f"/uploads/broadcast_{photo.filename}"
    
    broadcast_id = await create_broadcast(message, photo_url, scheduled_time)
    
    if scheduled_time:
        schedule_broadcast(broadcast_id, scheduled_time)
        return {"message": f"Broadcast scheduled for {scheduled_time}"}
    else:
        # Send immediately
        await schedule_broadcast(broadcast_id)
        return {"message": "Broadcast started"}
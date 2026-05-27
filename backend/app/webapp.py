from fastapi import APIRouter, HTTPException
from typing import Optional
from .database import get_products, get_product

router = APIRouter()

@router.get("/products")
async def webapp_get_products(search: Optional[str] = None, limit: int = 100, offset: int = 0):
    """Get products for WebApp"""
    products = await get_products(search, limit, offset)
    return {
        "products": products,
        "total": len(products)
    }

@router.get("/products/{product_id}")
async def webapp_get_product(product_id: int):
    """Get single product for WebApp"""
    product = await get_product(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product
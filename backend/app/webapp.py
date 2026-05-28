from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from .database import get_products, get_product

router = APIRouter()

@router.get("/products")
async def webapp_get_products(
    search: Optional[str] = None,
    min_price: Optional[float] = Query(None, ge=0, description="Минимальная цена"),
    max_price: Optional[float] = Query(None, ge=0, description="Максимальная цена"),
    limit: int = 100,
    offset: int = 0
):
    """Get products for WebApp with price filter"""
    products = await get_products(search, min_price, max_price, limit, offset)
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
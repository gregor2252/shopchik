import os
import asyncpg
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "shopchik_user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")
DB_NAME = os.getenv("DB_NAME", "shopchik_db")

pool = None


async def init_db():
    """Initialize database connection pool and create tables"""
    global pool
    try:
        pool = await asyncpg.create_pool(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            min_size=1,
            max_size=10,
        )

        # Create tables
        async with pool.acquire() as conn:
            # Users table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    user_id BIGINT PRIMARY KEY,
                    username VARCHAR(255),
                    first_name VARCHAR(255),
                    last_name VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Products table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS products (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    description TEXT,
                    price DECIMAL(10, 2) NOT NULL,
                    photos TEXT[] DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_active BOOLEAN DEFAULT TRUE
                )
            """)

            # Broadcasts table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS broadcasts (
                    id SERIAL PRIMARY KEY,
                    message TEXT NOT NULL,
                    photo_url TEXT,
                    scheduled_time TIMESTAMP,
                    sent_at TIMESTAMP,
                    status VARCHAR(50) DEFAULT 'pending',
                    total_sent INTEGER DEFAULT 0,
                    total_failed INTEGER DEFAULT 0
                )
            """)

        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise


# User functions
async def add_user(
    user_id: int, username: str = None, first_name: str = None, last_name: str = None
):
    """Add or update user in database"""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO users (user_id, username, first_name, last_name, last_active)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id) DO UPDATE
            SET username = EXCLUDED.username,
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                last_active = CURRENT_TIMESTAMP
        """,
            user_id,
            username,
            first_name,
            last_name,
        )


async def get_all_users() -> List[int]:
    """Get all user IDs"""
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT user_id FROM users")
        return [row["user_id"] for row in rows]


# Product functions
async def get_products(
    search: str = None,
    min_price: float = None,
    max_price: float = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict]:
    """Get products with optional search and price filters"""
    async with pool.acquire() as conn:
        query = """
            SELECT * FROM products
            WHERE is_active = TRUE
        """
        params = []
        param_index = 1

        if search:
            query += (
                f" AND (name ILIKE ${param_index} OR description ILIKE ${param_index})"
            )
            params.append(f"%{search}%")
            param_index += 1

        if min_price is not None:
            query += f" AND price >= ${param_index}"
            params.append(min_price)
            param_index += 1

        if max_price is not None:
            query += f" AND price <= ${param_index}"
            params.append(max_price)
            param_index += 1

        query += f" ORDER BY id DESC LIMIT ${param_index} OFFSET ${param_index + 1}"
        params.extend([limit, offset])

        rows = await conn.fetch(query, *params)
        return [dict(row) for row in rows]


async def get_product(product_id: int) -> Optional[Dict]:
    """Get single product by ID"""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT * FROM products
            WHERE id = $1 AND is_active = TRUE
        """,
            product_id,
        )
        return dict(row) if row else None


async def create_product(
    name: str, description: str, price: float, photos: List[str]
) -> int:
    """Create new product"""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO products (name, description, price, photos)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        """,
            name,
            description,
            price,
            photos,
        )
        return row["id"]


async def update_product(
    product_id: int, name: str, description: str, price: float, photos: List[str]
):
    """Update existing product"""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE products
            SET name = $1, description = $2, price = $3, photos = $4, updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
        """,
            name,
            description,
            price,
            photos,
            product_id,
        )


async def delete_product(product_id: int):
    """Soft delete product"""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE products
            SET is_active = FALSE
            WHERE id = $1
        """,
            product_id,
        )


# Broadcast functions
async def create_broadcast(
    message: str, photo_url: str = None, scheduled_time: str = None
):
    """Create a new broadcast"""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO broadcasts (message, photo_url, scheduled_time)
            VALUES ($1, $2, $3::TIMESTAMP)
            RETURNING id
        """,
            message,
            photo_url,
            scheduled_time,
        )
        return row["id"]


async def get_pending_broadcasts():
    """Get pending broadcasts that are ready to send"""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT * FROM broadcasts
            WHERE status = 'pending'
            AND (scheduled_time IS NULL OR scheduled_time <= CURRENT_TIMESTAMP)
            ORDER BY scheduled_time NULLS FIRST
        """)
        return [dict(row) for row in rows]


async def update_broadcast_status(
    broadcast_id: int, status: str, total_sent: int = 0, total_failed: int = 0
):
    """Update broadcast status"""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE broadcasts
            SET status = $1, sent_at = CURRENT_TIMESTAMP, total_sent = $2, total_failed = $3
            WHERE id = $4
        """,
            status,
            total_sent,
            total_failed,
            broadcast_id,
        )

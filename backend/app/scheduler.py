import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.date import DateTrigger
from datetime import datetime
from .database import get_pending_broadcasts, update_broadcast_status, get_all_users
from .bot import send_message_to_user

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

async def process_broadcast(broadcast_id: int):
    """Process a single broadcast"""
    from .database import pool
    
    logger.info(f"Processing broadcast {broadcast_id}")
    
    # Get broadcast details
    async with pool.acquire() as conn:
        broadcast = await conn.fetchrow("SELECT * FROM broadcasts WHERE id = $1", broadcast_id)
        if not broadcast or broadcast['status'] != 'pending':
            return
        
        message = broadcast['message']
        photo_url = broadcast['photo_url']
        
        # Get all users
        users = await get_all_users()
        
        sent = 0
        failed = 0
        
        for user_id in users:
            success = await send_message_to_user(user_id, message, photo_url)
            if success:
                sent += 1
            else:
                failed += 1
        
        await update_broadcast_status(broadcast_id, 'completed', sent, failed)
        logger.info(f"Broadcast {broadcast_id} completed: sent={sent}, failed={failed}")

async def schedule_broadcast(broadcast_id: int, scheduled_time: str = None):
    """Schedule a broadcast"""
    if scheduled_time:
        # Parse ISO format time
        run_date = datetime.fromisoformat(scheduled_time)
        trigger = DateTrigger(run_date=run_date)
        scheduler.add_job(
            process_broadcast,
            trigger=trigger,
            args=[broadcast_id],
            id=f"broadcast_{broadcast_id}"
        )
        logger.info(f"Scheduled broadcast {broadcast_id} at {run_date}")
    else:
        # Run immediately
        await process_broadcast(broadcast_id)

def start_scheduler():
    """Start the scheduler"""
    scheduler.start()
    logger.info("Scheduler started")
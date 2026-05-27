import os
import logging
from aiogram import Bot, Dispatcher, types
from aiogram.types import WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.filters import Command

logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

@dp.message(Command("start"))
async def start_command(message: types.Message):
    """Handle /start command"""
    from .database import add_user
    
    # Save user to database
    await add_user(
        user_id=message.from_user.id,
        username=message.from_user.username,
        first_name=message.from_user.first_name,
        last_name=message.from_user.last_name
    )
    
    # Create WebApp button
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(
                text="🛍 Открыть магазин",
                web_app=WebAppInfo(url=WEBAPP_URL)
            )]
        ]
    )
    
    await message.answer(
        "Добро пожаловать в магазин! 🎉\n\n"
        "Нажмите на кнопку ниже, чтобы открыть каталог товаров:",
        reply_markup=keyboard
    )

async def set_webhook():
    """Set webhook for the bot (if needed)"""
    # For polling mode, we don't need webhook
    # This function is here for future webhook implementation
    pass

async def send_message_to_user(user_id: int, text: str, photo_url: str = None):
    """Send message to a specific user"""
    try:
        if photo_url:
            await bot.send_photo(
                chat_id=user_id,
                photo=photo_url,
                caption=text
            )
        else:
            await bot.send_message(chat_id=user_id, text=text)
        return True
    except Exception as e:
        logger.error(f"Failed to send message to {user_id}: {e}")
        return False
"""
BITRAM Telegram Notification Service
"""
import httpx
import logging
from config import get_settings

logger = logging.getLogger(__name__)

TELEGRAM_API = "https://api.telegram.org/bot{token}"


async def send_telegram(chat_id: str, message: str):
    """Send a message to a Telegram chat."""
    settings = get_settings()
    if not settings.TELEGRAM_BOT_TOKEN or not chat_id:
        return

    url = f"{TELEGRAM_API.format(token=settings.TELEGRAM_BOT_TOKEN)}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(url, json={
                "chat_id": chat_id,
                "text": message,
                "parse_mode": "HTML",
            })
    except Exception as e:
        logger.error(f"Telegram send error: {e}")


async def notify_trade(chat_id: str, bot_name: str, side: str, pair: str,
                       price: float, quantity: float, profit: float = None):
    """Send trade notification."""
    emoji = "🟢" if side == "buy" else "🔴"
    action = "매수" if side == "buy" else "매도"
    coin = pair.replace("KRW-", "")

    msg = (
        f"{emoji} <b>{bot_name}</b> {action} 체결\n"
        f"코인: {coin}\n"
        f"가격: {price:,.0f}원\n"
        f"수량: {quantity:.4f}\n"
    )
    if profit is not None:
        profit_emoji = "📈" if profit > 0 else "📉"
        msg += f"수익: {profit_emoji} {profit:+,.0f}원\n"

    await send_telegram(chat_id, msg)


async def notify_bot_status(chat_id: str, bot_name: str, status: str):
    """Send bot status change notification."""
    status_map = {
        "running": "▶️ 실행 시작",
        "stopped": "⏹ 정지",
        "paused": "⏸ 일시정지",
        "error": "⚠️ 오류 발생",
    }
    msg = f"🤖 <b>{bot_name}</b>\n상태: {status_map.get(status, status)}"
    await send_telegram(chat_id, msg)


async def notify_daily_report(chat_id: str, data: dict):
    """Send daily P&L report."""
    msg = (
        f"📊 <b>일일 리포트</b>\n"
        f"━━━━━━━━━━━━━━\n"
        f"총 수익: {data.get('total_profit', 0):+,.0f}원\n"
        f"거래 횟수: {data.get('total_trades', 0)}회\n"
        f"승률: {data.get('win_rate', 0):.1f}%\n"
        f"활성 봇: {data.get('active_bots', 0)}개\n"
    )
    await send_telegram(chat_id, msg)

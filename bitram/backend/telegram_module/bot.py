"""
BITRAM Telegram Bot
Commands for bot control, status monitoring, and notifications.
"""
import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler,
    ConversationHandler, MessageHandler, filters, ContextTypes,
)
from sqlalchemy import select, update
from db.database import AsyncSessionLocal
from db.models import User, Bot, Trade, ExchangeKey
from core.encryption import encrypt_key
from core.upbit_client import UpbitClient
import redis.asyncio as aioredis
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Conversation states
WAITING_ACCESS_KEY, WAITING_SECRET_KEY = range(2)


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def get_user_by_chat_id(chat_id: str) -> User | None:
    async with AsyncSessionLocal() as db:
        stmt = select(User).where(User.telegram_chat_id == str(chat_id))
        result = await db.execute(stmt)
        return result.scalar_one_or_none()


async def require_user(update: Update) -> User | None:
    user = await get_user_by_chat_id(str(update.effective_chat.id))
    if not user:
        await update.message.reply_text(
            "🔒 BITRAM 계정과 연결되지 않았습니다.\n"
            "웹사이트 설정 페이지에서 텔레그램 연동을 완료해주세요.\n\n"
            "또는 /connect <이메일> 으로 연결할 수 있습니다."
        )
    return user


# ─── Commands ────────────────────────────────────────────────────────────────

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Check if already connected
    existing = await get_user_by_chat_id(str(update.effective_chat.id))
    if existing:
        await update.message.reply_text(
            f"🐦 <b>BITRAM</b>\n"
            f"━━━━━━━━━━━━━━\n"
            f"안녕하세요, <b>{existing.nickname}</b>님!\n\n"
            f"📋 <b>명령어 목록</b>\n"
            f"/status - 봇 현황 조회\n"
            f"/bots - 봇 목록 + 제어\n"
            f"/profit - 수익 통계\n"
            f"/trades - 최근 거래\n"
            f"/balance - 잔고 조회\n"
            f"/help - 도움말",
            parse_mode="HTML",
        )
    else:
        await update.message.reply_text(
            "🐦 <b>BITRAM</b>\n"
            "━━━━━━━━━━━━━━\n"
            "업비트 노코드 자동매매 봇 빌더\n\n"
            "🔗 <b>계정 연결이 필요합니다</b>\n\n"
            "1. bitram.co.kr 에서 회원가입\n"
            "2. 설정 → 텔레그램 연동 → 인증코드 발급\n"
            "3. /connect <인증코드> 입력\n\n"
            "예: /connect 123456",
            parse_mode="HTML",
        )


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = await require_user(update)
    if not user:
        return

    async with AsyncSessionLocal() as db:
        stmt = select(Bot).where(Bot.user_id == user.id)
        result = await db.execute(stmt)
        bots = result.scalars().all()

    if not bots:
        await update.message.reply_text("📭 등록된 봇이 없습니다.\n웹에서 전략을 만들고 봇을 생성해보세요!")
        return

    running = [b for b in bots if b.status == "running"]
    total_profit = sum(float(b.total_profit or 0) for b in bots)
    total_trades = sum(b.total_trades or 0 for b in bots)

    msg = (
        f"📊 <b>봇 현황</b>\n"
        f"━━━━━━━━━━━━━━\n"
        f"전체: {len(bots)}개 | 실행중: {len(running)}개\n"
        f"총 수익: {total_profit:+,.0f}원\n"
        f"총 거래: {total_trades}회\n\n"
    )

    for b in bots:
        status_emoji = {"running": "🟢", "paused": "🟡", "error": "🔴", "idle": "⚪", "stopped": "⏹"}
        emoji = status_emoji.get(b.status, "⚪")
        profit = float(b.total_profit or 0)
        msg += f"{emoji} <b>{b.name}</b> — {profit:+,.0f}원 ({b.total_trades or 0}거래)\n"

    await update.message.reply_text(msg, parse_mode="HTML")


async def cmd_bots(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = await require_user(update)
    if not user:
        return

    async with AsyncSessionLocal() as db:
        stmt = select(Bot).where(Bot.user_id == user.id)
        result = await db.execute(stmt)
        bots = result.scalars().all()

    if not bots:
        await update.message.reply_text("📭 등록된 봇이 없습니다.")
        return

    keyboard = []
    for b in bots:
        status_emoji = {"running": "🟢", "paused": "🟡", "error": "🔴"}.get(b.status, "⚪")
        action = "정지" if b.status == "running" else "시작"
        action_data = f"stop_{b.id}" if b.status == "running" else f"start_{b.id}"
        keyboard.append([
            InlineKeyboardButton(f"{status_emoji} {b.name}", callback_data=f"info_{b.id}"),
            InlineKeyboardButton(action, callback_data=action_data),
        ])

    await update.message.reply_text(
        "🤖 <b>봇 목록</b>\n버튼을 눌러 제어하세요.",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="HTML",
    )


async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    data = query.data
    if not data:
        return

    user = await get_user_by_chat_id(str(query.message.chat_id))
    if not user:
        await query.edit_message_text("🔒 계정 연결이 필요합니다.")
        return

    from core.bot_manager import start_bot, stop_bot

    if data.startswith("start_"):
        bot_id = data.replace("start_", "")
        async with AsyncSessionLocal() as db:
            result = await start_bot(bot_id, db)
            if "error" in result:
                await query.edit_message_text(f"❌ {result['error']}")
            else:
                await query.edit_message_text(f"▶️ 봇이 시작되었습니다.")

    elif data.startswith("stop_"):
        bot_id = data.replace("stop_", "")
        async with AsyncSessionLocal() as db:
            result = await stop_bot(bot_id, db)
            await query.edit_message_text("⏹ 봇이 정지되었습니다.")

    elif data.startswith("info_"):
        bot_id = data.replace("info_", "")
        async with AsyncSessionLocal() as db:
            bot = await db.get(Bot, bot_id)
            if bot:
                profit = float(bot.total_profit or 0)
                trades = bot.total_trades or 0
                wins = bot.win_trades or 0
                wr = round(wins / trades * 100, 1) if trades > 0 else 0
                msg = (
                    f"🤖 <b>{bot.name}</b>\n"
                    f"상태: {bot.status}\n"
                    f"수익: {profit:+,.0f}원\n"
                    f"거래: {trades}회 (승률 {wr}%)\n"
                    f"최대 투자금: {float(bot.max_investment or 0):,.0f}원"
                )
                if bot.error_message:
                    msg += f"\n⚠️ 오류: {bot.error_message}"
                await query.edit_message_text(msg, parse_mode="HTML")


async def cmd_profit(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = await require_user(update)
    if not user:
        return

    async with AsyncSessionLocal() as db:
        stmt = select(Bot).where(Bot.user_id == user.id)
        result = await db.execute(stmt)
        bots = result.scalars().all()

    total_profit = sum(float(b.total_profit or 0) for b in bots)
    total_trades = sum(b.total_trades or 0 for b in bots)
    total_wins = sum(b.win_trades or 0 for b in bots)
    win_rate = round(total_wins / total_trades * 100, 1) if total_trades > 0 else 0

    msg = (
        f"💰 <b>수익 통계</b>\n"
        f"━━━━━━━━━━━━━━\n"
        f"총 수익: {total_profit:+,.0f}원\n"
        f"총 거래: {total_trades}회\n"
        f"승/패: {total_wins}/{total_trades - total_wins}\n"
        f"승률: {win_rate}%\n\n"
    )

    for b in bots:
        if b.total_trades and b.total_trades > 0:
            bp = float(b.total_profit or 0)
            bw = round((b.win_trades or 0) / b.total_trades * 100, 1)
            msg += f"  {b.name}: {bp:+,.0f}원 ({b.total_trades}거래, 승률 {bw}%)\n"

    await update.message.reply_text(msg, parse_mode="HTML")


async def cmd_trades(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = await require_user(update)
    if not user:
        return

    async with AsyncSessionLocal() as db:
        stmt = (
            select(Trade)
            .where(Trade.user_id == user.id)
            .order_by(Trade.executed_at.desc())
            .limit(10)
        )
        result = await db.execute(stmt)
        trades = result.scalars().all()

    if not trades:
        await update.message.reply_text("📭 거래 내역이 없습니다.")
        return

    msg = "📋 <b>최근 거래</b>\n━━━━━━━━━━━━━━\n"
    for t in trades:
        emoji = "🟢" if t.side == "buy" else "🔴"
        action = "매수" if t.side == "buy" else "매도"
        coin = t.pair.replace("KRW-", "")
        profit_str = f" ({float(t.profit):+,.0f}원)" if t.profit else ""
        msg += f"{emoji} {action} {coin} {float(t.price):,.0f}원{profit_str}\n"

    await update.message.reply_text(msg, parse_mode="HTML")


async def cmd_balance(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = await require_user(update)
    if not user:
        return

    async with AsyncSessionLocal() as db:
        stmt = select(ExchangeKey).where(ExchangeKey.user_id == user.id, ExchangeKey.is_valid == True)
        result = await db.execute(stmt)
        key = result.scalars().first()

    if not key:
        await update.message.reply_text("🔑 등록된 API 키가 없습니다.")
        return

    from core.encryption import decrypt_key
    client = UpbitClient(decrypt_key(key.access_key_enc), decrypt_key(key.secret_key_enc))
    try:
        balance = await client.get_balance()
        msg = (
            f"💳 <b>잔고 현황</b>\n"
            f"━━━━━━━━━━━━━━\n"
            f"KRW: {balance['krw']:,.0f}원\n"
        )
        for coin in balance["coins"][:10]:
            msg += f"{coin['currency']}: {coin['balance']:.4f} (평단 {coin['avg_buy_price']:,.0f}원)\n"
        await update.message.reply_text(msg, parse_mode="HTML")
    except Exception as e:
        await update.message.reply_text(f"❌ 잔고 조회 실패: {e}")
    finally:
        await client.close()


async def cmd_connect(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text(
            "🔗 <b>계정 연결 방법</b>\n\n"
            "1. BITRAM 웹사이트 → 설정 → 텔레그램 연동\n"
            "2. '인증코드 발급' 버튼 클릭\n"
            "3. 발급된 6자리 코드를 여기에 입력\n\n"
            "사용법: /connect <인증코드>\n"
            "예: /connect 123456",
            parse_mode="HTML",
        )
        return

    code = context.args[0].strip()
    chat_id = str(update.effective_chat.id)

    # Check verification code in Redis
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        user_id = await r.get(f"tg_verify:{code}")
        if not user_id:
            await update.message.reply_text(
                "❌ 유효하지 않거나 만료된 인증코드입니다.\n"
                "웹사이트에서 새 코드를 발급받아주세요."
            )
            return

        # Delete the used code
        await r.delete(f"tg_verify:{code}")
        await r.delete(f"tg_user_code:{user_id}")
    finally:
        await r.aclose()

    # Link telegram chat_id to user
    async with AsyncSessionLocal() as db:
        stmt = select(User).where(User.id == user_id)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            await update.message.reply_text("❌ 사용자를 찾을 수 없습니다.")
            return

        user.telegram_chat_id = chat_id
        await db.commit()

    await update.message.reply_text(
        f"✅ 계정이 연결되었습니다!\n"
        f"닉네임: {user.nickname}\n\n"
        f"이제 봇 알림을 텔레그램으로 받을 수 있습니다.\n"
        f"/status 로 봇 현황을 확인해보세요.",
        parse_mode="HTML",
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🐦 <b>BITRAM 도움말</b>\n"
        "━━━━━━━━━━━━━━\n\n"
        "📊 <b>조회</b>\n"
        "/status - 전체 봇 현황\n"
        "/profit - 수익 통계\n"
        "/trades - 최근 거래 10건\n"
        "/balance - 업비트 잔고\n\n"
        "🤖 <b>봇 제어</b>\n"
        "/bots - 봇 목록 + 시작/정지 버튼\n"
        "/start_bot - 봇 시작 (번호 선택)\n"
        "/stop_bot - 봇 정지 (번호 선택)\n\n"
        "🔧 <b>설정</b>\n"
        "/connect <인증코드> - 계정 연결\n\n"
        "💡 전략 생성, 백테스팅은\n"
        "웹 대시보드에서 이용해주세요.",
        parse_mode="HTML",
    )


# ─── Bot Setup ───────────────────────────────────────────────────────────────

def create_telegram_app() -> Application:
    if not settings.TELEGRAM_BOT_TOKEN:
        raise ValueError("TELEGRAM_BOT_TOKEN이 설정되지 않았습니다.")

    app = Application.builder().token(settings.TELEGRAM_BOT_TOKEN).build()

    # Command handlers
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("bots", cmd_bots))
    app.add_handler(CommandHandler("profit", cmd_profit))
    app.add_handler(CommandHandler("trades", cmd_trades))
    app.add_handler(CommandHandler("balance", cmd_balance))
    app.add_handler(CommandHandler("connect", cmd_connect))
    app.add_handler(CommandHandler("help", cmd_help))

    # Callback query handler for inline buttons
    app.add_handler(CallbackQueryHandler(callback_handler))

    return app


async def run_telegram_bot():
    """Run telegram bot (call from main or separate process)."""
    app = create_telegram_app()
    await app.initialize()
    await app.start()
    await app.updater.start_polling()
    logger.info("Telegram bot started")

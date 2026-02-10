import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, Integer, Float, Text, DateTime, Enum, ForeignKey,
    UniqueConstraint, Index, Numeric, JSON,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from db.database import Base


def utcnow():
    return datetime.now(timezone.utc)


def gen_uuid():
    return uuid.uuid4()


# ─── Users ───────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    nickname = Column(String(50), nullable=False)
    plan = Column(String(20), default="free")  # free, basic, pro, premium
    plan_expires_at = Column(DateTime(timezone=True), nullable=True)
    telegram_chat_id = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    exchange_keys = relationship("ExchangeKey", back_populates="user", cascade="all, delete-orphan")
    strategies = relationship("Strategy", back_populates="user", cascade="all, delete-orphan")
    bots = relationship("Bot", back_populates="user", cascade="all, delete-orphan")
    posts = relationship("Post", back_populates="user", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="user", cascade="all, delete-orphan")


# ─── Exchange Keys ───────────────────────────────────────────────────────────

class ExchangeKey(Base):
    __tablename__ = "exchange_keys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    exchange = Column(String(20), default="upbit")
    label = Column(String(50), default="기본")
    access_key_enc = Column(Text, nullable=False)
    secret_key_enc = Column(Text, nullable=False)
    is_valid = Column(Boolean, default=False)
    last_verified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="exchange_keys")


# ─── Strategies ──────────────────────────────────────────────────────────────

class Strategy(Base):
    __tablename__ = "strategies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, default="")
    pair = Column(String(20), nullable=False)  # KRW-BTC
    timeframe = Column(String(10), nullable=False)  # 1m, 5m, 15m, 1h, 4h, 1d
    config_json = Column(JSONB, nullable=False)  # Full strategy config
    is_public = Column(Boolean, default=False)
    backtest_result = Column(JSONB, nullable=True)
    copy_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="strategies")
    bots = relationship("Bot", back_populates="strategy")

    __table_args__ = (
        Index("ix_strategies_user_id", "user_id"),
        Index("ix_strategies_public", "is_public"),
    )


# ─── Bots ────────────────────────────────────────────────────────────────────

class Bot(Base):
    __tablename__ = "bots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    strategy_id = Column(UUID(as_uuid=True), ForeignKey("strategies.id", ondelete="SET NULL"), nullable=True)
    exchange_key_id = Column(UUID(as_uuid=True), ForeignKey("exchange_keys.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(100), nullable=False)
    status = Column(String(20), default="idle")  # idle, running, paused, error, stopped
    max_investment = Column(Numeric(18, 0), default=0)
    current_position = Column(JSONB, default=dict)
    total_profit = Column(Numeric(18, 2), default=0)
    total_trades = Column(Integer, default=0)
    win_trades = Column(Integer, default=0)
    config_snapshot = Column(JSONB, nullable=True)  # Strategy config at start time
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    stopped_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="bots")
    strategy = relationship("Strategy", back_populates="bots")
    trades = relationship("Trade", back_populates="bot", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_bots_user_id", "user_id"),
        Index("ix_bots_status", "status"),
    )


# ─── Trades ──────────────────────────────────────────────────────────────────

class Trade(Base):
    __tablename__ = "trades"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    bot_id = Column(UUID(as_uuid=True), ForeignKey("bots.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    side = Column(String(10), nullable=False)  # buy, sell
    pair = Column(String(20), nullable=False)
    price = Column(Numeric(18, 8), nullable=False)
    quantity = Column(Numeric(18, 8), nullable=False)
    total_krw = Column(Numeric(18, 2), nullable=False)
    fee = Column(Numeric(18, 8), default=0)
    profit = Column(Numeric(18, 2), nullable=True)  # Only for sell
    profit_pct = Column(Float, nullable=True)
    trigger_reason = Column(Text, nullable=True)
    executed_at = Column(DateTime(timezone=True), default=utcnow)

    bot = relationship("Bot", back_populates="trades")

    __table_args__ = (
        Index("ix_trades_bot_id", "bot_id"),
        Index("ix_trades_user_id", "user_id"),
        Index("ix_trades_executed_at", "executed_at"),
    )


# ─── OHLCV (TimescaleDB hypertable) ─────────────────────────────────────────

class OHLCV(Base):
    __tablename__ = "ohlcv"

    time = Column(DateTime(timezone=True), primary_key=True, nullable=False)
    pair = Column(String(20), primary_key=True, nullable=False)
    timeframe = Column(String(10), primary_key=True, nullable=False)
    open = Column(Numeric(18, 8), nullable=False)
    high = Column(Numeric(18, 8), nullable=False)
    low = Column(Numeric(18, 8), nullable=False)
    close = Column(Numeric(18, 8), nullable=False)
    volume = Column(Numeric(18, 8), nullable=False)

    __table_args__ = (
        Index("ix_ohlcv_pair_time", "pair", "timeframe", "time"),
    )


# ─── Community Posts ─────────────────────────────────────────────────────────

class Post(Base):
    __tablename__ = "posts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category = Column(String(20), nullable=False)  # strategy, profit, question, free
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    strategy_id = Column(UUID(as_uuid=True), ForeignKey("strategies.id", ondelete="SET NULL"), nullable=True)
    verified_profit = Column(JSONB, nullable=True)
    like_count = Column(Integer, default=0)
    comment_count = Column(Integer, default=0)
    view_count = Column(Integer, default=0)
    is_pinned = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="posts")
    strategy = relationship("Strategy")
    comments = relationship("Comment", back_populates="post", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_posts_category", "category"),
        Index("ix_posts_created_at", "created_at"),
        Index("ix_posts_user_id", "user_id"),
    )


class Comment(Base):
    __tablename__ = "comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    post_id = Column(UUID(as_uuid=True), ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("comments.id", ondelete="CASCADE"), nullable=True)
    content = Column(Text, nullable=False)
    like_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    post = relationship("Post", back_populates="comments")
    user = relationship("User", back_populates="comments")
    parent = relationship("Comment", remote_side=[id], backref="replies")

    __table_args__ = (
        Index("ix_comments_post_id", "post_id"),
    )


class Like(Base):
    __tablename__ = "likes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    target_type = Column(String(10), nullable=False)  # post, comment
    target_id = Column(UUID(as_uuid=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "target_type", "target_id", name="uq_likes"),
    )


class Bookmark(Base):
    __tablename__ = "bookmarks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    post_id = Column(UUID(as_uuid=True), ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "post_id", name="uq_bookmarks"),
    )


# ─── Subscriptions / Payments ────────────────────────────────────────────────

class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    plan = Column(String(20), nullable=False)  # free, basic, pro, premium
    status = Column(String(20), default="active")  # active, cancelled, expired
    billing_key = Column(String(255), nullable=True)
    customer_key = Column(String(255), nullable=True)
    amount = Column(Integer, default=0)
    current_period_start = Column(DateTime(timezone=True), nullable=True)
    current_period_end = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Payment(Base):
    __tablename__ = "payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    payment_key = Column(String(255), nullable=True)
    order_id = Column(String(255), nullable=True)
    amount = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False)  # paid, failed, refunded
    plan = Column(String(20), nullable=False)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

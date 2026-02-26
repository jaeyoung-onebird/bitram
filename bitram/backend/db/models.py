import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, Integer, Float, Text, DateTime, Date, Enum, ForeignKey,
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
    referral_code = Column(String(12), unique=True, nullable=True, index=True)
    telegram_chat_id = Column(String(50), nullable=True)
    oauth_provider = Column(String(20), nullable=True)   # google, kakao
    oauth_id = Column(String(100), nullable=True, index=True)
    email_verified = Column(Boolean, default=False)
    email_verify_token = Column(String(128), nullable=True, index=True)
    email_verify_expires = Column(DateTime(timezone=True), nullable=True)
    password_reset_token = Column(String(128), nullable=True, index=True)
    password_reset_expires = Column(DateTime(timezone=True), nullable=True)
    role = Column(String(20), default="user")  # user, moderator, admin
    avatar_url = Column(String(500), nullable=True)
    bio = Column(Text, nullable=True)
    social_links = Column(JSONB, nullable=True)  # {"twitter": "...", "website": "..."}
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    exchange_keys = relationship("ExchangeKey", back_populates="user", cascade="all, delete-orphan")
    strategies = relationship("Strategy", back_populates="user", cascade="all, delete-orphan")
    bots = relationship("Bot", back_populates="user", cascade="all, delete-orphan")
    posts = relationship("Post", back_populates="user", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="user", cascade="all, delete-orphan")
    followers = relationship(
        "Follow",
        foreign_keys="Follow.following_id",
        back_populates="following",
        cascade="all, delete-orphan",
    )
    following = relationship(
        "Follow",
        foreign_keys="Follow.follower_id",
        back_populates="follower",
        cascade="all, delete-orphan",
    )


# ─── Follows ────────────────────────────────────────────────────────────────

class Follow(Base):
    __tablename__ = "follows"

    follower_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    following_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    follower = relationship("User", foreign_keys=[follower_id], back_populates="following")
    following = relationship("User", foreign_keys=[following_id], back_populates="followers")

    __table_args__ = (
        UniqueConstraint("follower_id", "following_id", name="uq_follows"),
        Index("ix_follows_follower_id", "follower_id"),
        Index("ix_follows_following_id", "following_id"),
    )


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
    creator_reward_total = Column(Numeric(18, 2), default=0)  # Total points rewarded to creator
    original_strategy_id = Column(UUID(as_uuid=True), nullable=True)  # ID of the strategy this was copied from
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
    is_demo = Column(Boolean, default=False)
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


# ─── Post Series (연재) ─────────────────────────────────────────────────────

class PostSeries(Base):
    __tablename__ = "post_series"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    cover_image_url = Column(String(500), nullable=True)
    is_complete = Column(Boolean, default=False)
    post_count = Column(Integer, default=0)
    subscriber_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User", backref="series")
    posts = relationship("Post", back_populates="series", order_by="Post.series_order")

    __table_args__ = (
        Index("ix_post_series_user_id", "user_id"),
        Index("ix_post_series_created_at", "created_at"),
    )


# ─── Community Posts ─────────────────────────────────────────────────────────

class Post(Base):
    __tablename__ = "posts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category = Column(String(20), nullable=False)  # strategy, profit, question, free
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    content_format = Column(String(10), default="plain")  # plain, markdown
    strategy_id = Column(UUID(as_uuid=True), ForeignKey("strategies.id", ondelete="SET NULL"), nullable=True)
    sub_community_id = Column(UUID(as_uuid=True), ForeignKey("sub_communities.id", ondelete="SET NULL"), nullable=True)
    series_id = Column(UUID(as_uuid=True), ForeignKey("post_series.id", ondelete="SET NULL"), nullable=True)
    series_order = Column(Integer, nullable=True)
    verified_profit = Column(JSONB, nullable=True)
    image_urls = Column(JSONB, nullable=True)  # list of image URLs
    like_count = Column(Integer, default=0)
    comment_count = Column(Integer, default=0)
    view_count = Column(Integer, default=0)
    is_pinned = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="posts")
    strategy = relationship("Strategy")
    series = relationship("PostSeries", back_populates="posts")
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
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

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


# ─── Notifications ──────────────────────────────────────────────────────────

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    actor_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    type = Column(String(30), nullable=False)  # like, comment, reply, follow, mention, copy_strategy
    target_type = Column(String(20), nullable=True)  # post, comment
    target_id = Column(UUID(as_uuid=True), nullable=True)
    message = Column(String(500), nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_notifications_user_id", "user_id"),
        Index("ix_notifications_created_at", "created_at"),
    )


# ─── Reports ────────────────────────────────────────────────────────────────

class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    reporter_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    target_type = Column(String(20), nullable=False)  # post, comment, user
    target_id = Column(UUID(as_uuid=True), nullable=False)
    reason = Column(String(50), nullable=False)  # spam, scam, harassment, inappropriate, other
    description = Column(Text, nullable=True)
    status = Column(String(20), default="pending")  # pending, reviewed, dismissed
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_reports_status", "status"),
    )


# ─── Blocks ─────────────────────────────────────────────────────────────────

class Block(Base):
    __tablename__ = "blocks"

    blocker_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    blocked_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("blocker_id", "blocked_id", name="uq_blocks"),
    )


# ─── Badges ─────────────────────────────────────────────────────────────────

class Badge(Base):
    __tablename__ = "badges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(30), nullable=False)
    # Types: verified_trader, consistent_profit, top_contributor, strategy_master, early_adopter, helpful
    label = Column(String(50), nullable=False)
    awarded_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_badges_user_id", "user_id"),
        UniqueConstraint("user_id", "type", name="uq_badges_user_type"),
    )


# ─── Post Images ────────────────────────────────────────────────────────────

class PostImage(Base):
    __tablename__ = "post_images"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    post_id = Column(UUID(as_uuid=True), ForeignKey("posts.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    url = Column(String(500), nullable=False)
    size_bytes = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_post_images_post_id", "post_id"),
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


# ─── Points & Levels ────────────────────────────────────────────────────────

class UserPoints(Base):
    __tablename__ = "user_points"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    total_points = Column(Integer, default=0)
    level = Column(Integer, default=1)
    last_login_bonus = Column(DateTime(timezone=True), nullable=True)
    login_streak = Column(Integer, default=0)
    last_login_date = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class PointLog(Base):
    __tablename__ = "point_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    action = Column(String(30), nullable=False)
    points = Column(Integer, nullable=False)
    description = Column(String(200), default="")
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_point_logs_user_id", "user_id"),
        Index("ix_point_logs_created_at", "created_at"),
    )


# ─── Referrals ─────────────────────────────────────────────────────────────

class Referral(Base):
    __tablename__ = "referrals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    referrer_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    referred_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    code = Column(String(12), nullable=False)
    rewarded = Column(Boolean, default=False)
    milestones_json = Column(JSONB, default=dict)  # Track which milestones have been rewarded
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_referrals_referrer_id", "referrer_id"),
    )


# ─── Competitions ──────────────────────────────────────────────────────────

class Competition(Base):
    __tablename__ = "competitions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    start_date = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True), nullable=False)
    prize_description = Column(Text, default="")
    max_participants = Column(Integer, default=100)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class CompetitionEntry(Base):
    __tablename__ = "competition_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    competition_id = Column(UUID(as_uuid=True), ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    profit_krw = Column(Numeric(18, 2), default=0)
    profit_pct = Column(Float, default=0)
    trade_count = Column(Integer, default=0)
    rank = Column(Integer, nullable=True)
    joined_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    __table_args__ = (
        UniqueConstraint("competition_id", "user_id", name="uq_competition_entry"),
        Index("ix_competition_entries_competition_id", "competition_id"),
    )


# ─── Reactions (Emoji) ─────────────────────────────────────────────────────

class Reaction(Base):
    __tablename__ = "reactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    target_type = Column(String(10), nullable=False)  # post, comment
    target_id = Column(UUID(as_uuid=True), nullable=False)
    emoji = Column(String(20), nullable=False)  # thumbsup, heart, fire, rocket, eyes, thinking
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "target_type", "target_id", "emoji", name="uq_reactions"),
        Index("ix_reactions_target", "target_type", "target_id"),
    )


# ─── Direct Messages ──────────────────────────────────────────────────────

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    participant_a = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    participant_b = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    last_message_at = Column(DateTime(timezone=True), default=utcnow)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("participant_a", "participant_b", name="uq_conversation_pair"),
        Index("ix_conversations_a", "participant_a"),
        Index("ix_conversations_b", "participant_b"),
    )


class DirectMessage(Base):
    __tablename__ = "direct_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    sender_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_dm_conversation_id", "conversation_id"),
        Index("ix_dm_created_at", "created_at"),
    )


# ─── Sub-Communities ───────────────────────────────────────────────────────

class SubCommunity(Base):
    __tablename__ = "sub_communities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    slug = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    icon_url = Column(String(500), nullable=True)
    coin_pair = Column(String(20), nullable=True)  # KRW-BTC for coin boards, null for topic boards
    member_count = Column(Integer, default=0)
    post_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class SubCommunityMember(Base):
    __tablename__ = "sub_community_members"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    sub_community_id = Column(UUID(as_uuid=True), ForeignKey("sub_communities.id", ondelete="CASCADE"), primary_key=True)
    joined_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_scm_sub_community_id", "sub_community_id"),
    )


# ─── Moderation Actions ───────────────────────────────────────────────────

class ModerationAction(Base):
    __tablename__ = "moderation_actions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    moderator_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    report_id = Column(UUID(as_uuid=True), ForeignKey("reports.id", ondelete="SET NULL"), nullable=True)
    action_type = Column(String(30), nullable=False)  # warn, mute, ban, delete_post, delete_comment, dismiss
    target_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    target_type = Column(String(20), nullable=True)
    target_id = Column(UUID(as_uuid=True), nullable=True)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_mod_actions_moderator_id", "moderator_id"),
    )


# ─── Notification Preferences ─────────────────────────────────────────────

class UserNotificationPreference(Base):
    __tablename__ = "user_notification_preferences"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    email_on_like = Column(Boolean, default=False)
    email_on_comment = Column(Boolean, default=True)
    email_on_follow = Column(Boolean, default=True)
    email_on_dm = Column(Boolean, default=True)
    email_weekly_digest = Column(Boolean, default=True)
    push_on_like = Column(Boolean, default=True)
    push_on_comment = Column(Boolean, default=True)
    push_on_follow = Column(Boolean, default=True)
    push_on_dm = Column(Boolean, default=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# ─── Attendance ──────────────────────────────────────────────────────────────

class Attendance(Base):
    __tablename__ = "attendances"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    checked_at = Column(Date, nullable=False)  # KST date
    streak = Column(Integer, default=1)
    points_earned = Column(Integer, default=10)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "checked_at", name="uq_attendance_user_date"),
        Index("ix_attendances_user_id", "user_id"),
        Index("ix_attendances_checked_at", "checked_at"),
    )


# ─── Quest Claims ────────────────────────────────────────────────────────────

class QuestClaim(Base):
    __tablename__ = "quest_claims"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    quest_id = Column(String(50), nullable=False)  # e.g. "write_post"
    claimed_date = Column(Date, nullable=False)  # KST date
    points_earned = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "quest_id", "claimed_date", name="uq_quest_claim"),
        Index("ix_quest_claims_user_id", "user_id"),
    )


# ─── Tweet Log (Twitter Bot) ──────────────────────────────────────────────

class TweetLog(Base):
    __tablename__ = "tweet_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    content_type = Column(String(30), nullable=False)
    content = Column(Text, nullable=False)
    tweet_id = Column(String(30), nullable=True)
    status = Column(String(20), nullable=False, default="pending")
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_tweet_logs_status", "status"),
        Index("ix_tweet_logs_content_type", "content_type"),
        Index("ix_tweet_logs_created_at", "created_at"),
    )


# ─── Strategy Reviews ────────────────────────────────────────────────────────

class StrategyReview(Base):
    __tablename__ = "strategy_reviews"

    id = Column(UUID(as_uuid=True), primary_key=True, default=lambda: uuid.uuid4())
    strategy_id = Column(UUID(as_uuid=True), ForeignKey("strategies.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    rating = Column(Integer, nullable=False)  # 1~5
    comment = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("strategy_id", "user_id", name="uq_strategy_reviews_user"),
        Index("ix_strategy_reviews_strategy_id", "strategy_id"),
    )

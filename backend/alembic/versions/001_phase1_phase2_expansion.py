"""Phase 1-2: Community expansion - new tables and user columns

Revision ID: 001_phase1_phase2
Revises:
Create Date: 2026-02-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "001_phase1_phase2"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ─── User table: add new columns (nullable/default for existing rows) ───
    op.add_column("users", sa.Column("email_verified", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("users", sa.Column("email_verify_token", sa.String(128), nullable=True))
    op.add_column("users", sa.Column("email_verify_expires", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("password_reset_token", sa.String(128), nullable=True))
    op.add_column("users", sa.Column("password_reset_expires", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("role", sa.String(20), server_default="user", nullable=False))
    op.add_column("users", sa.Column("avatar_url", sa.String(500), nullable=True))
    op.add_column("users", sa.Column("bio", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("social_links", JSONB(), nullable=True))

    op.create_index("ix_users_email_verify_token", "users", ["email_verify_token"])
    op.create_index("ix_users_password_reset_token", "users", ["password_reset_token"])

    # Set admin role for existing admin-plan users
    op.execute("UPDATE users SET role = 'admin' WHERE plan = 'admin'")

    # ─── Reactions table ───
    op.create_table(
        "reactions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_type", sa.String(10), nullable=False),
        sa.Column("target_id", UUID(as_uuid=True), nullable=False),
        sa.Column("emoji", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("user_id", "target_type", "target_id", "emoji", name="uq_reactions"),
        sa.Index("ix_reactions_target", "target_type", "target_id"),
    )

    # ─── Conversations table ───
    op.create_table(
        "conversations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("participant_a", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("participant_b", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("last_message_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("participant_a", "participant_b", name="uq_conversation_pair"),
        sa.Index("ix_conversations_a", "participant_a"),
        sa.Index("ix_conversations_b", "participant_b"),
    )

    # ─── Direct Messages table ───
    op.create_table(
        "direct_messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("conversation_id", UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_read", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Index("ix_dm_conversation_id", "conversation_id"),
        sa.Index("ix_dm_created_at", "created_at"),
    )

    # ─── Sub-Communities table ───
    op.create_table(
        "sub_communities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("slug", sa.String(50), unique=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon_url", sa.String(500), nullable=True),
        sa.Column("coin_pair", sa.String(20), nullable=True),
        sa.Column("member_count", sa.Integer(), server_default="0"),
        sa.Column("post_count", sa.Integer(), server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_sub_communities_slug", "sub_communities", ["slug"])

    # ─── Sub-Community Members table ───
    op.create_table(
        "sub_community_members",
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("sub_community_id", UUID(as_uuid=True), sa.ForeignKey("sub_communities.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Index("ix_scm_sub_community_id", "sub_community_id"),
    )

    # ─── Posts: add sub_community_id FK ───
    op.add_column("posts", sa.Column("sub_community_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_posts_sub_community_id",
        "posts", "sub_communities",
        ["sub_community_id"], ["id"],
        ondelete="SET NULL",
    )

    # ─── Moderation Actions table ───
    op.create_table(
        "moderation_actions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("moderator_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("report_id", UUID(as_uuid=True), sa.ForeignKey("reports.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action_type", sa.String(30), nullable=False),
        sa.Column("target_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("target_type", sa.String(20), nullable=True),
        sa.Column("target_id", UUID(as_uuid=True), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Index("ix_mod_actions_moderator_id", "moderator_id"),
    )

    # ─── User Notification Preferences table ───
    op.create_table(
        "user_notification_preferences",
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("email_on_like", sa.Boolean(), server_default="false"),
        sa.Column("email_on_comment", sa.Boolean(), server_default="true"),
        sa.Column("email_on_follow", sa.Boolean(), server_default="true"),
        sa.Column("email_on_dm", sa.Boolean(), server_default="true"),
        sa.Column("email_weekly_digest", sa.Boolean(), server_default="true"),
        sa.Column("push_on_like", sa.Boolean(), server_default="true"),
        sa.Column("push_on_comment", sa.Boolean(), server_default="true"),
        sa.Column("push_on_follow", sa.Boolean(), server_default="true"),
        sa.Column("push_on_dm", sa.Boolean(), server_default="true"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # ─── Full-text search: add search_vector to posts + GIN index + trigger ───
    op.execute("""
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS search_vector tsvector;
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_posts_search_vector ON posts USING GIN (search_vector);
    """)
    op.execute("""
        CREATE OR REPLACE FUNCTION posts_search_vector_update() RETURNS trigger AS $$
        BEGIN
            NEW.search_vector := to_tsvector('simple', coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, ''));
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        DROP TRIGGER IF EXISTS posts_search_vector_trigger ON posts;
        CREATE TRIGGER posts_search_vector_trigger
            BEFORE INSERT OR UPDATE OF title, content ON posts
            FOR EACH ROW EXECUTE FUNCTION posts_search_vector_update();
    """)
    # Backfill existing posts
    op.execute("""
        UPDATE posts SET search_vector = to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
        WHERE search_vector IS NULL;
    """)


def downgrade() -> None:
    # Drop trigger and function
    op.execute("DROP TRIGGER IF EXISTS posts_search_vector_trigger ON posts;")
    op.execute("DROP FUNCTION IF EXISTS posts_search_vector_update();")
    op.execute("DROP INDEX IF EXISTS ix_posts_search_vector;")
    op.execute("ALTER TABLE posts DROP COLUMN IF EXISTS search_vector;")

    op.drop_table("user_notification_preferences")
    op.drop_table("moderation_actions")

    op.drop_constraint("fk_posts_sub_community_id", "posts", type_="foreignkey")
    op.drop_column("posts", "sub_community_id")

    op.drop_table("sub_community_members")
    op.drop_table("sub_communities")
    op.drop_table("direct_messages")
    op.drop_table("conversations")
    op.drop_table("reactions")

    op.drop_index("ix_users_password_reset_token", "users")
    op.drop_index("ix_users_email_verify_token", "users")
    op.drop_column("users", "social_links")
    op.drop_column("users", "bio")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "role")
    op.drop_column("users", "password_reset_expires")
    op.drop_column("users", "password_reset_token")
    op.drop_column("users", "email_verify_expires")
    op.drop_column("users", "email_verify_token")
    op.drop_column("users", "email_verified")

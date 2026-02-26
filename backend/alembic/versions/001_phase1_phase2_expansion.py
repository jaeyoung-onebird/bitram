"""Baseline schema bootstrap + community/search extras

Revision ID: 001_phase1_phase2
Revises:
Create Date: 2026-02-15
"""

from alembic import op

from db.database import Base
import db.models  # noqa: F401

revision = "001_phase1_phase2"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # Bootstrap all ORM tables in a single baseline migration.
    Base.metadata.create_all(bind=bind, checkfirst=True)

    # TimescaleDB extension + hypertable (idempotent)
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")
    op.execute("SELECT create_hypertable('ohlcv', 'time', if_not_exists => TRUE)")

    # Full-text search vector on posts (idempotent)
    op.execute(
        """
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS search_vector tsvector;
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_posts_search_vector ON posts USING GIN (search_vector);
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION posts_search_vector_update() RETURNS trigger AS $$
        BEGIN
            NEW.search_vector := to_tsvector('simple', coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, ''));
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        DROP TRIGGER IF EXISTS posts_search_vector_trigger ON posts;
        CREATE TRIGGER posts_search_vector_trigger
            BEFORE INSERT OR UPDATE OF title, content ON posts
            FOR EACH ROW EXECUTE FUNCTION posts_search_vector_update();
        """
    )
    op.execute(
        """
        UPDATE posts
        SET search_vector = to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
        WHERE search_vector IS NULL;
        """
    )

    # Backfill admin role for legacy rows.
    op.execute("UPDATE users SET role = 'admin' WHERE plan = 'admin' AND role <> 'admin'")


def downgrade() -> None:
    bind = op.get_bind()

    op.execute("DROP TRIGGER IF EXISTS posts_search_vector_trigger ON posts;")
    op.execute("DROP FUNCTION IF EXISTS posts_search_vector_update();")
    op.execute("DROP INDEX IF EXISTS ix_posts_search_vector;")
    op.execute("ALTER TABLE posts DROP COLUMN IF EXISTS search_vector;")

    Base.metadata.drop_all(bind=bind, checkfirst=True)

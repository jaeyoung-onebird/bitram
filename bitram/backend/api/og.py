"""
OG (Open Graph) metadata API for SNS sharing support.
Returns structured metadata for posts to be used by the frontend for SSR meta tags.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
import re

from db.database import get_db
from db.models import Post, User
from config import get_settings

router = APIRouter(prefix="/api/og", tags=["og"])
settings = get_settings()


class OGMetaResponse(BaseModel):
    title: str
    description: str
    image: str | None = None
    url: str
    type: str = "article"
    site_name: str = "BITRAM"
    author: str | None = None


def _extract_description(content: str, max_length: int = 160) -> str:
    """Extract a clean text description from HTML/markdown content."""
    if not content:
        return "BITRAM - 업비트 전용 노코드 자동매매 봇 빌더"
    # Strip HTML tags
    clean = re.sub(r"<[^>]+>", "", content)
    # Collapse whitespace
    clean = re.sub(r"\s+", " ", clean).strip()
    if len(clean) > max_length:
        clean = clean[:max_length - 3] + "..."
    return clean


def _extract_first_image(content: str) -> str | None:
    """Extract the first image URL from content."""
    if not content:
        return None
    match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', content)
    if match:
        return match.group(1)
    # Also try markdown image syntax
    match = re.search(r'!\[[^\]]*\]\(([^)]+)\)', content)
    if match:
        return match.group(1)
    return None


@router.get("/post/{post_id}", response_model=OGMetaResponse)
async def get_post_og_meta(
    post_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Returns OG metadata for a post (title, description, image, url).
    Used by the frontend for SSR meta tags and SNS share previews.
    No authentication required.
    """
    try:
        pid = UUID(post_id)
    except ValueError:
        raise HTTPException(400, "유효하지 않은 게시글 ID입니다.")

    stmt = (
        select(Post, User.nickname)
        .join(User, Post.user_id == User.id)
        .where(Post.id == pid)
    )
    result = await db.execute(stmt)
    row = result.one_or_none()

    if not row:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")

    post, author_name = row

    # Build description from content
    description = _extract_description(post.content)

    # Try to find an image
    image = _extract_first_image(post.content)
    # Fallback: check image_urls
    if not image and post.image_urls and len(post.image_urls) > 0:
        image = post.image_urls[0]

    # Build canonical URL
    frontend_url = settings.FRONTEND_URL.rstrip("/")
    url = f"{frontend_url}/community/{post_id}"

    return OGMetaResponse(
        title=f"{post.title} - BITRAM",
        description=description,
        image=image,
        url=url,
        type="article",
        site_name="BITRAM",
        author=author_name,
    )

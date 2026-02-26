"""
Image Upload API: upload images for posts.
Stores files locally under /var/www/bitram-uploads/ (served by nginx).
"""
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from db.models import User, PostImage
from api.deps import get_current_user

router = APIRouter(prefix="/api/upload", tags=["upload"])

UPLOAD_DIR = "/var/www/bitram-uploads"
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate extension
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"허용되지 않은 파일 형식입니다. ({', '.join(ALLOWED_EXTENSIONS)})")

    # Read and validate size
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(400, "파일 크기는 5MB를 초과할 수 없습니다.")

    # Ensure upload directory exists
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    # Save file
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(data)

    url = f"/uploads/{filename}"

    # Save to DB
    image = PostImage(
        user_id=user.id,
        filename=filename,
        url=url,
        size_bytes=len(data),
    )
    db.add(image)
    await db.commit()

    return {"url": url, "filename": filename}

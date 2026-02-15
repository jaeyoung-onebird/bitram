"""
Attendance API: daily check-in with streak bonuses, status, calendar.
"""
import calendar
from datetime import datetime, timezone, timedelta, date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from db.database import get_db
from db.models import User, Attendance, UserPoints, PointLog
from api.deps import get_current_user

router = APIRouter(prefix="/api/attendance", tags=["attendance"])

KST = timezone(timedelta(hours=9))

# Streak bonus thresholds: (streak_days, bonus_points)
STREAK_BONUSES = [
    (30, 100),
    (14, 50),
    (7, 20),
    (3, 5),
]

BASE_POINTS = 10


def _calculate_streak_bonus(streak: int) -> int:
    """Return the bonus points for the given streak count."""
    for threshold, bonus in STREAK_BONUSES:
        if streak >= threshold:
            return bonus
    return 0


def _today_kst() -> date:
    return datetime.now(KST).date()


class CheckInResponse(BaseModel):
    success: bool
    points_earned: int
    base_points: int
    streak_bonus: int
    current_streak: int
    calendar_dates: list[str]  # list of dates in YYYY-MM-DD for current month
    message: str


class AttendanceStatusResponse(BaseModel):
    current_streak: int
    total_check_ins: int
    calendar_dates: list[str]  # current month's check-in dates
    last_check_in: str | None
    checked_today: bool


class CalendarResponse(BaseModel):
    year: int
    month: int
    dates: list[str]  # list of YYYY-MM-DD


@router.post("/check-in", response_model=CheckInResponse)
async def daily_check_in(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Daily attendance check-in (once per day, KST).
    Awards base points + streak bonuses.
    """
    today = _today_kst()
    yesterday = today - timedelta(days=1)

    # Check if already checked in today
    stmt = select(Attendance).where(
        Attendance.user_id == user.id,
        Attendance.checked_at == today,
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        # Already checked in - return current data
        month_dates = await _get_month_dates(db, user.id, today.year, today.month)
        raise HTTPException(400, "오늘은 이미 출석체크를 완료했습니다.")

    # Calculate streak
    stmt = select(Attendance).where(
        Attendance.user_id == user.id,
        Attendance.checked_at == yesterday,
    )
    yesterday_record = (await db.execute(stmt)).scalar_one_or_none()

    if yesterday_record:
        current_streak = yesterday_record.streak + 1
    else:
        current_streak = 1

    # Calculate points
    streak_bonus = _calculate_streak_bonus(current_streak)
    total_points = BASE_POINTS + streak_bonus

    # Create attendance record
    attendance = Attendance(
        user_id=user.id,
        checked_at=today,
        streak=current_streak,
        points_earned=total_points,
    )
    db.add(attendance)

    # Award points via UserPoints and PointLog
    stmt = select(UserPoints).where(UserPoints.user_id == user.id)
    user_points = (await db.execute(stmt)).scalar_one_or_none()

    if not user_points:
        user_points = UserPoints(user_id=user.id, total_points=0, level=1, login_streak=0)
        db.add(user_points)
        await db.flush()

    user_points.total_points = (user_points.total_points or 0) + total_points

    # Update level
    from core.points import compute_level
    level_num, _ = compute_level(user_points.total_points)
    user_points.level = level_num

    # Log the points
    description = f"출석체크 (연속 {current_streak}일)"
    if streak_bonus > 0:
        description += f" +{streak_bonus} 보너스"

    log = PointLog(
        user_id=user.id,
        action="attendance",
        points=total_points,
        description=description,
    )
    db.add(log)

    await db.commit()

    # Get calendar dates for current month
    month_dates = await _get_month_dates(db, user.id, today.year, today.month)

    message = f"출석체크 완료! {total_points}포인트 획득"
    if streak_bonus > 0:
        message += f" (연속 {current_streak}일 보너스 +{streak_bonus})"

    return CheckInResponse(
        success=True,
        points_earned=total_points,
        base_points=BASE_POINTS,
        streak_bonus=streak_bonus,
        current_streak=current_streak,
        calendar_dates=month_dates,
        message=message,
    )


@router.get("/status", response_model=AttendanceStatusResponse)
async def get_attendance_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current month's attendance data, streak, total check-ins."""
    today = _today_kst()

    # Total check-ins
    total_stmt = select(func.count()).select_from(Attendance).where(
        Attendance.user_id == user.id
    )
    total_check_ins = (await db.execute(total_stmt)).scalar() or 0

    # Current streak - get most recent attendance
    latest_stmt = select(Attendance).where(
        Attendance.user_id == user.id
    ).order_by(Attendance.checked_at.desc()).limit(1)
    latest = (await db.execute(latest_stmt)).scalar_one_or_none()

    current_streak = 0
    last_check_in = None
    checked_today = False

    if latest:
        last_check_in = str(latest.checked_at)
        if latest.checked_at == today:
            checked_today = True
            current_streak = latest.streak
        elif latest.checked_at == today - timedelta(days=1):
            # Yesterday was last check-in, streak is still alive
            current_streak = latest.streak
        else:
            # Streak is broken
            current_streak = 0

    # Calendar dates for current month
    month_dates = await _get_month_dates(db, user.id, today.year, today.month)

    return AttendanceStatusResponse(
        current_streak=current_streak,
        total_check_ins=total_check_ins,
        calendar_dates=month_dates,
        last_check_in=last_check_in,
        checked_today=checked_today,
    )


@router.get("/calendar/{year}/{month}", response_model=CalendarResponse)
async def get_attendance_calendar(
    year: int,
    month: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get check-in dates for a specific month."""
    if month < 1 or month > 12:
        raise HTTPException(400, "유효하지 않은 월입니다.")
    if year < 2020 or year > 2100:
        raise HTTPException(400, "유효하지 않은 연도입니다.")

    dates = await _get_month_dates(db, user.id, year, month)

    return CalendarResponse(
        year=year,
        month=month,
        dates=dates,
    )


async def _get_month_dates(
    db: AsyncSession, user_id, year: int, month: int
) -> list[str]:
    """Get list of check-in date strings for a given month."""
    first_day = date(year, month, 1)
    last_day_num = calendar.monthrange(year, month)[1]
    last_day = date(year, month, last_day_num)

    stmt = (
        select(Attendance.checked_at)
        .where(
            Attendance.user_id == user_id,
            Attendance.checked_at >= first_day,
            Attendance.checked_at <= last_day,
        )
        .order_by(Attendance.checked_at.asc())
    )
    rows = (await db.execute(stmt)).all()
    return [str(row[0]) for row in rows]

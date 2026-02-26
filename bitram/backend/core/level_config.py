"""
Level System Configuration: Lineage-style infinite numeric levels.
Level n requires 50*(n-1)*n total points. No max level.
"""
from core.points import compute_level, level_threshold, get_level_perks


def _level_color(level: int) -> str:
    """Color gradient based on level range."""
    if level < 5:
        return "#78716c"   # gray
    if level < 10:
        return "#22c55e"   # green
    if level < 20:
        return "#3b82f6"   # blue
    if level < 30:
        return "#a855f7"   # purple
    if level < 50:
        return "#f59e0b"   # amber
    if level < 100:
        return "#ef4444"   # red
    return "#8b5cf6"       # violet (100+)


def _perk_descriptions(level: int) -> list[str]:
    """Human-readable perk descriptions."""
    perks = []
    extra_bots = level // 5
    if extra_bots > 0:
        perks.append(f"추가 봇 +{extra_bots}개")
    bonus = level * 2
    if bonus > 0:
        perks.append(f"일일 퀘스트 보너스 +{bonus}P")
    if level >= 5:
        perks.append("닉네임 색상")
    if level >= 10:
        perks.append("댓글 하이라이트")
    if level >= 20:
        perks.append("프로필 프레임")
    if level >= 30:
        perks.append("VIP 채팅")
    return perks


def get_level_for_points(total_points: int) -> int:
    return compute_level(total_points)


def get_level_progress(total_points: int, current_level: int) -> dict:
    """Returns current level info + progress to next level. Always has a next level."""
    current_threshold = level_threshold(current_level)
    next_lv = current_level + 1
    next_threshold = level_threshold(next_lv)
    points_range = next_threshold - current_threshold

    if points_range > 0:
        progress = (total_points - current_threshold) / points_range
    else:
        progress = 0.0

    return {
        "level": current_level,
        "color": _level_color(current_level),
        "perks": _perk_descriptions(current_level),
        "min_points": current_threshold,
        "points_current": total_points,
        "points_next": next_threshold,
        "progress": min(max(progress, 0.0), 1.0),
        "next_level": next_lv,
        "next_color": _level_color(next_lv),
    }


def get_all_levels() -> list[dict]:
    """Return first 20 levels as reference milestones."""
    levels = []
    for lv in [1, 2, 3, 5, 10, 15, 20, 30, 50, 100]:
        levels.append({
            "level": lv,
            "color": _level_color(lv),
            "min_points": level_threshold(lv),
            "perks": _perk_descriptions(lv),
        })
    return levels

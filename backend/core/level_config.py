"""
Level System Configuration: detailed level info with colors, perks, and progress calculation.
"""

LEVEL_CONFIG = {
    1: {"name": "석탄", "color": "#78716c", "min_points": 0, "perks": []},
    2: {"name": "아이언", "color": "#a1a1aa", "min_points": 50, "perks": ["닉네임 색상"]},
    3: {"name": "브론즈", "color": "#d97706", "min_points": 200, "perks": ["이미지 업로드"]},
    4: {"name": "실버", "color": "#9ca3af", "min_points": 500, "perks": ["커스텀 뱃지 선택"]},
    5: {"name": "골드", "color": "#eab308", "min_points": 1000, "perks": ["게시글 고정 1개"]},
    6: {"name": "플래티넘", "color": "#06b6d4", "min_points": 2000, "perks": ["DM 무제한"]},
    7: {"name": "사파이어", "color": "#2563eb", "min_points": 5000, "perks": ["전략 마켓 등록"]},
    8: {"name": "루비", "color": "#dc2626", "min_points": 10000, "perks": ["프리미엄 뱃지"]},
    9: {"name": "에메랄드", "color": "#059669", "min_points": 20000, "perks": ["VIP 채팅방"]},
    10: {"name": "다이아몬드", "color": "#8b5cf6", "min_points": 50000, "perks": ["올 액세스"]},
}


def get_level_info(level: int) -> dict:
    """Get level configuration for a given level number."""
    return LEVEL_CONFIG.get(level, LEVEL_CONFIG[1])


def get_level_for_points(total_points: int) -> int:
    """Determine the level number for a given point total."""
    current_level = 1
    for lvl, config in sorted(LEVEL_CONFIG.items()):
        if total_points >= config["min_points"]:
            current_level = lvl
    return current_level


def get_level_progress(total_points: int, current_level: int) -> dict:
    """Returns current level info + progress to next level."""
    current = LEVEL_CONFIG.get(current_level, LEVEL_CONFIG[1])
    next_level = current_level + 1

    if next_level in LEVEL_CONFIG:
        next_info = LEVEL_CONFIG[next_level]
        points_range = next_info["min_points"] - current["min_points"]
        if points_range > 0:
            progress = (total_points - current["min_points"]) / points_range
        else:
            progress = 1.0
        return {
            "level": current_level,
            "name": current["name"],
            "color": current["color"],
            "perks": current["perks"],
            "min_points": current["min_points"],
            "points_current": total_points,
            "points_next": next_info["min_points"],
            "progress": min(max(progress, 0.0), 1.0),
            "next_name": next_info["name"],
            "next_color": next_info["color"],
        }

    # Max level reached
    return {
        "level": current_level,
        "name": current["name"],
        "color": current["color"],
        "perks": current["perks"],
        "min_points": current["min_points"],
        "points_current": total_points,
        "points_next": None,
        "progress": 1.0,
        "next_name": None,
        "next_color": None,
    }


def get_all_levels() -> list[dict]:
    """Return all level configs as a list, sorted by level number."""
    return [
        {
            "level": lvl,
            "name": config["name"],
            "color": config["color"],
            "min_points": config["min_points"],
            "perks": config["perks"],
        }
        for lvl, config in sorted(LEVEL_CONFIG.items())
    ]

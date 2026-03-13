"""Multi-market position tracker with JSON persistence."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class Position:
    id: str
    condition_id: str
    question: str
    category: str
    side: str               # YES / NO
    entry_price: float
    shares: float
    cost_basis: float       # total USD invested
    current_price: float = 0.0
    unrealized_pnl: float = 0.0
    entry_time: str = ""
    analysis: dict = field(default_factory=dict)
    order_id: str = ""
    slug: str = ""
    end_date: str = ""

    @property
    def current_value(self) -> float:
        return self.current_price * self.shares

    def update_price(self, price: float) -> None:
        self.current_price = price
        self.unrealized_pnl = (price - self.entry_price) * self.shares


class PositionTracker:
    """Track positions across multiple markets with persistence."""

    def __init__(self) -> None:
        self.positions: list[Position] = []
        self.closed_pnl: float = 0.0
        self.total_closed: int = 0

    def add(self, position: Position) -> None:
        self.positions.append(position)
        logger.info(
            f"Position added: {position.side} {position.question[:50]}... "
            f"${position.cost_basis:.2f}"
        )

    def remove(self, condition_id: str) -> Position | None:
        for i, p in enumerate(self.positions):
            if p.condition_id == condition_id:
                return self.positions.pop(i)
        return None

    def has_position(self, condition_id: str) -> bool:
        return any(p.condition_id == condition_id for p in self.positions)

    def get_total_exposure(self) -> float:
        return sum(p.cost_basis for p in self.positions)

    def get_category_exposure(self, category: str) -> float:
        return sum(p.cost_basis for p in self.positions if p.category == category)

    def record_close(self, pnl: float) -> None:
        self.closed_pnl += pnl
        self.total_closed += 1

    def get_portfolio_summary(self) -> dict:
        total_exposure = self.get_total_exposure()
        total_unrealized = sum(p.unrealized_pnl for p in self.positions)

        categories = {}
        for p in self.positions:
            if p.category not in categories:
                categories[p.category] = {"count": 0, "exposure": 0.0}
            categories[p.category]["count"] += 1
            categories[p.category]["exposure"] += p.cost_basis

        return {
            "open_positions": len(self.positions),
            "total_exposure": round(total_exposure, 2),
            "unrealized_pnl": round(total_unrealized, 2),
            "closed_pnl": round(self.closed_pnl, 2),
            "total_pnl": round(self.closed_pnl + total_unrealized, 2),
            "total_closed_trades": self.total_closed,
            "categories": categories,
        }

    def save_to_file(self, path: str) -> None:
        """Save positions to JSON file."""
        filepath = Path(path)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "positions": [asdict(p) for p in self.positions],
            "closed_pnl": self.closed_pnl,
            "total_closed": self.total_closed,
            "saved_at": datetime.now(timezone.utc).isoformat(),
        }
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
        logger.debug(f"Saved {len(self.positions)} positions to {path}")

    def load_from_file(self, path: str) -> None:
        """Load positions from JSON file."""
        filepath = Path(path)
        if not filepath.exists():
            logger.info(f"No positions file at {path}, starting fresh")
            return
        try:
            with open(filepath) as f:
                data = json.load(f)
            self.closed_pnl = data.get("closed_pnl", 0.0)
            self.total_closed = data.get("total_closed", 0)
            for p_data in data.get("positions", []):
                self.positions.append(Position(**p_data))
            logger.info(f"Loaded {len(self.positions)} positions from {path}")
        except Exception as e:
            logger.error(f"Failed to load positions from {path}: {e}")

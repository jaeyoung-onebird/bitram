"""News monitor — watches held positions for significant news changes.

Periodically re-evaluates open positions using Claude web search.
Triggers alerts or auto-close when news materially changes a market's outlook.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone

from src.analyst.claude_analyst import ClaudeAnalyst, AnalysisResult
from src.executor.position_tracker import Position, PositionTracker

logger = logging.getLogger(__name__)


@dataclass
class NewsAlert:
    """Alert generated when news may affect an open position."""
    position_id: str
    condition_id: str
    question: str
    original_probability: float
    new_probability: float
    probability_shift: float       # |new - original|
    direction: str                 # "FAVORABLE" or "ADVERSE"
    reasoning: str
    timestamp: str
    recommended_action: str        # "HOLD", "CLOSE", "REDUCE"


class NewsMonitor:
    """Monitors news for open positions and triggers re-evaluation."""

    def __init__(
        self,
        analyst: ClaudeAnalyst,
        position_tracker: PositionTracker,
        *,
        reeval_interval_minutes: int = 60,
        alert_threshold_pct: float = 15.0,
        close_threshold_pct: float = 25.0,
        max_reeval_per_hour: int = 10,
    ) -> None:
        self.analyst = analyst
        self.position_tracker = position_tracker
        self.reeval_interval = reeval_interval_minutes * 60
        self.alert_threshold = alert_threshold_pct / 100
        self.close_threshold = close_threshold_pct / 100
        self.max_reeval_per_hour = max_reeval_per_hour

        self.alerts: list[NewsAlert] = []
        self._last_reeval: dict[str, float] = {}  # condition_id -> timestamp
        self._reeval_count_hour: int = 0
        self._reeval_hour_start: float = 0.0

    async def check_positions(self) -> list[NewsAlert]:
        """Re-evaluate all open positions that are due for a check.

        Returns list of new alerts generated this cycle.
        """
        new_alerts: list[NewsAlert] = []
        now = time.time()

        # Reset hourly counter
        if now - self._reeval_hour_start > 3600:
            self._reeval_count_hour = 0
            self._reeval_hour_start = now

        positions = list(self.position_tracker.positions)
        if not positions:
            return new_alerts

        logger.info(f"News monitor: checking {len(positions)} open positions")

        for position in positions:
            # Skip if recently checked
            last = self._last_reeval.get(position.condition_id, 0)
            if now - last < self.reeval_interval:
                continue

            # Hourly limit
            if self._reeval_count_hour >= self.max_reeval_per_hour:
                logger.info("News monitor: hourly reeval limit reached")
                break

            alert = await self._reeval_position(position)
            if alert:
                new_alerts.append(alert)
                self.alerts.append(alert)

            self._last_reeval[position.condition_id] = now
            self._reeval_count_hour += 1

            # Rate limit between API calls
            await asyncio.sleep(90)

        if new_alerts:
            logger.warning(f"News monitor: {len(new_alerts)} alerts generated")
        else:
            logger.info("News monitor: no alerts this cycle")

        return new_alerts

    async def _reeval_position(self, position: Position) -> NewsAlert | None:
        """Re-evaluate a single position with fresh Claude analysis."""
        original_prob = position.analysis.get("probability", 0.5)
        original_side = position.side

        logger.info(
            f"Re-evaluating: {position.question[:60]}... "
            f"(original P={original_prob:.0%}, side={original_side})"
        )

        # Run fresh analysis
        result: AnalysisResult = await self.analyst.estimate_probability(
            question=position.question,
            description=f"Re-evaluation of existing {original_side} position. "
                        f"Original analysis: {position.analysis.get('reasoning', 'N/A')[:200]}",
            yes_price=position.current_price if position.side == "YES" else (1 - position.current_price),
            no_price=(1 - position.current_price) if position.side == "YES" else position.current_price,
            category=position.category,
            end_date=position.end_date,
        )

        if result.recommended_side == "SKIP" and result.confidence == 0.0:
            # API error or rate limit — skip without alerting
            return None

        new_prob = result.probability
        shift = abs(new_prob - original_prob)

        # Determine if news is favorable or adverse for our position
        if original_side == "YES":
            direction = "FAVORABLE" if new_prob > original_prob else "ADVERSE"
        else:
            direction = "FAVORABLE" if new_prob < original_prob else "ADVERSE"

        # Determine recommended action
        if shift >= self.close_threshold and direction == "ADVERSE":
            action = "CLOSE"
        elif shift >= self.alert_threshold and direction == "ADVERSE":
            action = "REDUCE"
        elif shift >= self.alert_threshold:
            action = "HOLD"  # favorable shift — just note it
        else:
            # No significant change
            logger.info(
                f"  No significant change: P shifted {shift:.1%} ({direction})"
            )
            return None

        alert = NewsAlert(
            position_id=position.id,
            condition_id=position.condition_id,
            question=position.question,
            original_probability=original_prob,
            new_probability=new_prob,
            probability_shift=round(shift, 4),
            direction=direction,
            reasoning=result.reasoning,
            timestamp=datetime.now(timezone.utc).isoformat(),
            recommended_action=action,
        )

        logger.warning(
            f"  ALERT [{action}]: {position.question[:50]}... "
            f"P shifted {original_prob:.0%} → {new_prob:.0%} ({direction})"
        )

        return alert

    def get_pending_closes(self) -> list[NewsAlert]:
        """Get alerts that recommend closing positions."""
        return [a for a in self.alerts if a.recommended_action == "CLOSE"]

    def get_recent_alerts(self, limit: int = 20) -> list[NewsAlert]:
        """Get most recent alerts."""
        return self.alerts[-limit:]

    def clear_alerts_for(self, condition_id: str) -> None:
        """Clear alerts for a closed position."""
        self.alerts = [a for a in self.alerts if a.condition_id != condition_id]
        self._last_reeval.pop(condition_id, None)

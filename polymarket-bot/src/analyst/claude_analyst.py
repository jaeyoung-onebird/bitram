"""Claude API probability analyst — core AI engine for full-market trading."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass

from src.analyst.edge_calculator import half_kelly_bet
from src.analyst.prompt_templates import SYSTEM_PROMPT, build_analysis_prompt

logger = logging.getLogger(__name__)


@dataclass
class AnalysisResult:
    """Result of Claude's market analysis."""
    probability: float          # 0.01-0.99
    confidence: float           # 0.1-1.0
    reasoning: str
    key_factors: list[str]
    risks: list[str]
    edge: float                 # |my prob - market prob|
    recommended_side: str       # "YES" | "NO" | "SKIP"
    kelly_fraction: float       # Half-Kelly bet fraction
    raw_response: str = ""


class ClaudeAnalyst:
    """Uses Claude API with web search to estimate market probabilities."""

    def __init__(
        self,
        api_key: str,
        *,
        model: str = "claude-sonnet-4-20250514",
        max_tokens: int = 1000,
        max_calls_per_hour: int = 40,
        min_edge_pct: float = 10.0,
        min_confidence: float = 0.6,
        use_web_search: bool = True,
        dry_run: bool = True,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.max_tokens = max_tokens
        self.max_calls_per_hour = max_calls_per_hour
        self.min_edge_pct = min_edge_pct
        self.min_confidence = min_confidence
        self.use_web_search = use_web_search
        self.dry_run = dry_run

        self._call_timestamps: list[float] = []
        self._total_calls: int = 0

    async def estimate_probability(
        self,
        question: str,
        description: str,
        yes_price: float,
        no_price: float,
        category: str,
        end_date: str,
    ) -> AnalysisResult:
        """Use Claude to analyze a market and estimate probability.

        Returns AnalysisResult with probability, edge, and recommendation.
        """
        # Dry run: return dummy result
        if self.dry_run:
            return self._dry_run_result(yes_price)

        # Rate limit check
        if not self._can_call():
            logger.warning("Claude API rate limit reached, skipping")
            return self._skip_result("rate_limit")

        # Build prompt
        prompt = build_analysis_prompt(
            question=question,
            description=description,
            yes_price=yes_price,
            no_price=no_price,
            category=category,
            end_date=end_date,
        )

        # Call Claude API
        try:
            import httpx

            tools = []
            if self.use_web_search:
                tools.append({
                    "type": "web_search_20250305",
                    "name": "web_search",
                    "max_uses": 3,
                })

            async with httpx.AsyncClient(timeout=60.0) as http:
                body: dict = {
                    "model": self.model,
                    "max_tokens": self.max_tokens,
                    "system": SYSTEM_PROMPT,
                    "messages": [{"role": "user", "content": prompt}],
                }
                if tools:
                    body["tools"] = tools

                resp = await http.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": self.api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json=body,
                )
                resp.raise_for_status()
                data = resp.json()

            self._record_call()

        except Exception as e:
            logger.error(f"Claude API error: {e}")
            return self._skip_result(f"api_error: {e}")

        # Parse response — extract JSON from text blocks
        raw_text = ""
        for block in data.get("content", []):
            if block.get("type") == "text":
                raw_text += block["text"]

        try:
            # Strip markdown code blocks if present
            text = raw_text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0]
            result = json.loads(text)
        except (json.JSONDecodeError, IndexError) as e:
            logger.error(f"Failed to parse Claude response: {e}")
            logger.debug(f"Raw: {raw_text[:500]}")
            return self._skip_result("parse_error")

        # Extract fields
        probability = float(result.get("probability", 0.5))
        probability = max(0.01, min(0.99, probability))
        confidence = float(result.get("confidence", 0.5))
        confidence = max(0.1, min(1.0, confidence))

        # Calculate edge
        market_prob = yes_price
        if probability > market_prob:
            edge = probability - market_prob
            side = "YES"
        elif probability < market_prob:
            edge = market_prob - probability
            side = "NO"
        else:
            edge = 0.0
            side = "SKIP"

        # Decision: trade or skip?
        edge_pct = edge * 100
        if edge_pct < self.min_edge_pct or confidence < self.min_confidence:
            side = "SKIP"

        # Kelly sizing
        kelly = 0.0
        if side != "SKIP":
            market_price = yes_price if side == "YES" else no_price
            kelly = half_kelly_bet(
                my_probability=probability if side == "YES" else (1 - probability),
                market_price=market_price,
                bankroll=1.0,  # caller multiplies by actual bankroll
                side=side,
            )
            if kelly <= 0:
                side = "SKIP"

        logger.info(
            f"Claude analysis: {question[:60]}... "
            f"P={probability:.0%} (market={market_prob:.0%}) "
            f"edge={edge_pct:+.1f}% conf={confidence:.0%} → {side}"
        )

        return AnalysisResult(
            probability=probability,
            confidence=confidence,
            reasoning=result.get("reasoning", ""),
            key_factors=result.get("key_factors", []),
            risks=result.get("risks", []),
            edge=round(edge, 4),
            recommended_side=side,
            kelly_fraction=round(kelly, 4),
            raw_response=raw_text[:1000],
        )

    def _can_call(self) -> bool:
        """Check if we're within the hourly rate limit."""
        now = time.time()
        cutoff = now - 3600
        self._call_timestamps = [t for t in self._call_timestamps if t > cutoff]
        return len(self._call_timestamps) < self.max_calls_per_hour

    def _record_call(self) -> None:
        self._call_timestamps.append(time.time())
        self._total_calls += 1

    def _dry_run_result(self, yes_price: float) -> AnalysisResult:
        """Return a dummy result for dry-run mode."""
        return AnalysisResult(
            probability=yes_price,
            confidence=0.0,
            reasoning="[DRY RUN] No actual analysis performed",
            key_factors=[],
            risks=[],
            edge=0.0,
            recommended_side="SKIP",
            kelly_fraction=0.0,
        )

    def _skip_result(self, reason: str) -> AnalysisResult:
        return AnalysisResult(
            probability=0.5,
            confidence=0.0,
            reasoning=f"Skipped: {reason}",
            key_factors=[],
            risks=[],
            edge=0.0,
            recommended_side="SKIP",
            kelly_fraction=0.0,
        )

"""Evaluate Claude prediction accuracy from analysis logs.

Reads logs/analysis.jsonl and computes:
  - Overall accuracy and Brier Score
  - Category-level breakdown
  - Calibration (predicted vs actual)
  - Edge capture (did trades profit?)

Usage:
  python -m scripts.evaluate_accuracy
  python -m scripts.evaluate_accuracy --log-file logs/analysis.jsonl
  python -m scripts.evaluate_accuracy --resolved-only
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_LOG = "logs/analysis.jsonl"


def load_entries(path: str) -> list[dict]:
    """Load JSONL entries from the analysis log."""
    entries = []
    filepath = Path(path)
    if not filepath.exists():
        print(f"ERROR: Log file not found: {path}")
        sys.exit(1)

    with open(filepath, encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError as e:
                print(f"WARNING: Skipping malformed line {i}: {e}")

    return entries


def compute_metrics(entries: list[dict]) -> dict:
    """Compute accuracy metrics from analysis entries.

    Each entry should have:
      - claude_probability: float (0-1)
      - market_yes_price: float (0-1)
      - recommended_side: YES/NO/SKIP
      - category: str
      - edge: float
      - resolved_outcome: float (0 or 1) — added post-hoc when market resolves

    Entries without resolved_outcome are counted as "pending".
    """
    total = len(entries)
    resolved = [e for e in entries if "resolved_outcome" in e]
    pending = total - len(resolved)
    skipped = sum(1 for e in entries if e.get("recommended_side") == "SKIP")
    traded = sum(1 for e in entries if e.get("recommended_side") in ("YES", "NO"))

    # ── Overall accuracy ──
    correct = 0
    brier_sum = 0.0
    log_loss_sum = 0.0

    for e in resolved:
        outcome = float(e["resolved_outcome"])  # 1.0 = YES won, 0.0 = NO won
        prob = float(e["claude_probability"])
        prob = max(0.01, min(0.99, prob))

        # Brier Score (lower is better, 0 = perfect)
        brier_sum += (prob - outcome) ** 2

        # Log loss (lower is better)
        log_loss_sum += -(outcome * math.log(prob) + (1 - outcome) * math.log(1 - prob))

        # Directional accuracy
        predicted_yes = prob > 0.5
        actual_yes = outcome > 0.5
        if predicted_yes == actual_yes:
            correct += 1

    n_resolved = len(resolved) or 1
    accuracy = correct / n_resolved
    brier_score = brier_sum / n_resolved
    log_loss = log_loss_sum / n_resolved

    # ── Category breakdown ──
    cat_stats = defaultdict(lambda: {"total": 0, "resolved": 0, "correct": 0, "brier": 0.0, "traded": 0})
    for e in entries:
        cat = e.get("category", "unknown")
        cat_stats[cat]["total"] += 1
        if e.get("recommended_side") in ("YES", "NO"):
            cat_stats[cat]["traded"] += 1

    for e in resolved:
        cat = e.get("category", "unknown")
        outcome = float(e["resolved_outcome"])
        prob = float(e["claude_probability"])
        prob = max(0.01, min(0.99, prob))

        cat_stats[cat]["resolved"] += 1
        cat_stats[cat]["brier"] += (prob - outcome) ** 2
        if (prob > 0.5) == (outcome > 0.5):
            cat_stats[cat]["correct"] += 1

    # ── Calibration buckets ──
    buckets = defaultdict(lambda: {"count": 0, "actual_sum": 0.0})
    for e in resolved:
        prob = float(e["claude_probability"])
        outcome = float(e["resolved_outcome"])
        bucket = round(prob * 10) / 10  # 0.0, 0.1, ..., 1.0
        bucket = max(0.0, min(1.0, bucket))
        buckets[bucket]["count"] += 1
        buckets[bucket]["actual_sum"] += outcome

    calibration = {}
    for bucket in sorted(buckets):
        b = buckets[bucket]
        calibration[f"{bucket:.1f}"] = {
            "count": b["count"],
            "predicted": bucket,
            "actual": round(b["actual_sum"] / max(b["count"], 1), 3),
        }

    # ── Edge capture (for traded entries) ──
    traded_resolved = [e for e in resolved if e.get("recommended_side") in ("YES", "NO")]
    trade_wins = 0
    total_pnl_pct = 0.0

    for e in traded_resolved:
        outcome = float(e["resolved_outcome"])
        side = e["recommended_side"]
        entry_price = e.get("market_yes_price", 0.5) if side == "YES" else (1 - e.get("market_yes_price", 0.5))

        if side == "YES":
            pnl = (outcome - entry_price) / max(entry_price, 0.01)
        else:
            pnl = ((1 - outcome) - entry_price) / max(entry_price, 0.01)

        total_pnl_pct += pnl
        if pnl > 0:
            trade_wins += 1

    n_traded_resolved = len(traded_resolved) or 1
    trade_win_rate = trade_wins / n_traded_resolved
    avg_pnl_pct = total_pnl_pct / n_traded_resolved

    return {
        "summary": {
            "total_analyses": total,
            "resolved": len(resolved),
            "pending": pending,
            "skipped": skipped,
            "traded": traded,
        },
        "accuracy": {
            "directional_accuracy": round(accuracy, 4),
            "brier_score": round(brier_score, 4),
            "log_loss": round(log_loss, 4),
        },
        "trading": {
            "trade_win_rate": round(trade_win_rate, 4),
            "avg_return_pct": round(avg_pnl_pct * 100, 2),
            "total_trades_resolved": len(traded_resolved),
        },
        "categories": {
            cat: {
                "total": s["total"],
                "resolved": s["resolved"],
                "traded": s["traded"],
                "accuracy": round(s["correct"] / max(s["resolved"], 1), 4),
                "brier": round(s["brier"] / max(s["resolved"], 1), 4),
            }
            for cat, s in sorted(cat_stats.items())
        },
        "calibration": calibration,
    }


def print_report(metrics: dict) -> None:
    """Pretty-print the evaluation report."""
    s = metrics["summary"]
    a = metrics["accuracy"]
    t = metrics["trading"]

    print("=" * 60)
    print("  CLAUDE PREDICTION ACCURACY REPORT")
    print("=" * 60)
    print()
    print(f"  Total analyses:  {s['total_analyses']}")
    print(f"  Resolved:        {s['resolved']}")
    print(f"  Pending:         {s['pending']}")
    print(f"  Traded:          {s['traded']}")
    print(f"  Skipped:         {s['skipped']}")
    print()

    if s["resolved"] == 0:
        print("  No resolved markets yet. Run --scan-only for 3-5 days")
        print("  then add resolved_outcome to entries as markets settle.")
        print("=" * 60)
        return

    print("── Accuracy ──")
    print(f"  Directional:     {a['directional_accuracy']:.1%}")
    print(f"  Brier Score:     {a['brier_score']:.4f}  (lower=better, 0.25=coin flip)")
    print(f"  Log Loss:        {a['log_loss']:.4f}")
    print()

    print("── Trading Performance ──")
    print(f"  Win Rate:        {t['trade_win_rate']:.1%}")
    print(f"  Avg Return:      {t['avg_return_pct']:+.2f}%")
    print(f"  Resolved Trades: {t['total_trades_resolved']}")
    print()

    print("── Category Breakdown ──")
    print(f"  {'Category':<12} {'Total':>6} {'Resolved':>9} {'Traded':>7} {'Accuracy':>9} {'Brier':>7}")
    print(f"  {'-'*12} {'-'*6} {'-'*9} {'-'*7} {'-'*9} {'-'*7}")
    for cat, cs in metrics["categories"].items():
        print(
            f"  {cat:<12} {cs['total']:>6} {cs['resolved']:>9} "
            f"{cs['traded']:>7} {cs['accuracy']:>8.1%} {cs['brier']:>7.4f}"
        )
    print()

    print("── Calibration ──")
    print(f"  {'Predicted':>10} {'Actual':>8} {'Count':>6}")
    print(f"  {'-'*10} {'-'*8} {'-'*6}")
    for bucket, cd in metrics["calibration"].items():
        bar = "#" * min(cd["count"], 30)
        print(f"  {cd['predicted']:>9.1%} {cd['actual']:>7.1%} {cd['count']:>6}  {bar}")

    print()
    print("=" * 60)
    print("  Brier benchmarks: 0.00=perfect, 0.25=coin flip, 0.50=always wrong")
    if a["brier_score"] < 0.20:
        print("  → GOOD: Better than chance, edge likely exists")
    elif a["brier_score"] < 0.25:
        print("  → MARGINAL: Slight edge, consider tighter filters")
    else:
        print("  → POOR: Worse than coin flip, review strategy")
    print("=" * 60)


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate Claude prediction accuracy")
    parser.add_argument("--log-file", default=DEFAULT_LOG, help="Path to analysis.jsonl")
    parser.add_argument("--resolved-only", action="store_true", help="Only show resolved entries")
    parser.add_argument("--json", action="store_true", help="Output raw JSON instead of report")
    args = parser.parse_args()

    entries = load_entries(args.log_file)
    if not entries:
        print("No entries found in log file.")
        sys.exit(1)

    print(f"Loaded {len(entries)} entries from {args.log_file}")

    metrics = compute_metrics(entries)

    if args.json:
        print(json.dumps(metrics, indent=2))
    else:
        print_report(metrics)


if __name__ == "__main__":
    main()

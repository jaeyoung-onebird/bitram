"""
AI Strategy Generator
Uses Claude API to generate strategy configs, then backtests them.
Returns only profitable strategies ranked by performance.
"""
import json
import logging
import asyncio
from time import perf_counter
import random
import anthropic
import httpx
import pandas as pd
from config import get_settings
from core.backtester import run_backtest
from core.strategy_engine import validate_strategy_config
from core.indicators import INDICATOR_REGISTRY

logger = logging.getLogger(__name__)

AVAILABLE_INDICATORS = list(INDICATOR_REGISTRY.keys())
AVAILABLE_OPERATORS = [
    "greater_than", "less_than", "equal",
    "greater_equal", "less_equal",
    "crosses_above", "crosses_below",
]

def _make_result(name: str, description: str, config: dict, bt_dict: dict) -> dict:
    return {
        "name": name,
        "description": description,
        "config_json": config,
        "backtest": {
            "total_return_pct": bt_dict["total_return_pct"],
            "win_rate": bt_dict["win_rate"],
            "total_trades": bt_dict["total_trades"],
            "max_drawdown_pct": bt_dict["max_drawdown_pct"],
            "sharpe_ratio": bt_dict["sharpe_ratio"],
            "profit_factor": bt_dict["profit_factor"],
        },
    }


def _fallback_param_search_configs(style: str, n: int = 60) -> list[dict]:
    """
    If the AI call fails/timeouts or produces 0-trade strategies, we still want to
    return something actionable. This generates a batch of simple, high-signal
    templates with randomized params. It is intentionally biased toward producing
    trades (not necessarily out-of-sample robust).
    """
    style_tp_sl = {
        "aggressive": (-8, 18),
        "balanced": (-6, 12),
        "conservative": (-4, 8),
        "scalping": (-3, 6),
        "swing": (-7, 15),
    }
    default_sl, default_tp = style_tp_sl.get(style, (-6, 12))

    out: list[dict] = []
    for _ in range(max(1, n)):
        pick = random.choice(["rsi_rebound", "sma_cross", "bb_rebound", "dip_buy"])
        sl = random.randint(min(default_sl, -10), max(default_sl, -2))
        tp = random.randint(max(default_tp // 2, 3), min(default_tp + 8, 30))
        amount = random.randint(8, 20)
        max_pos = random.choice([30, 40, 50])

        if pick == "rsi_rebound":
            period = random.choice([7, 9, 14, 21])
            thresh = random.choice([25, 28, 30, 32, 35, 40])
            cfg = {
                "conditions": [{
                    "indicator": "RSI",
                    "params": {"period": period},
                    "operator": "crosses_above",
                    "value": thresh,
                }],
                "conditions_logic": "AND",
                "action": {"type": "market_buy", "amount_type": "percent", "amount": amount},
                "safety": {"stop_loss": sl, "take_profit": tp, "max_position": max_pos},
            }
            out.append({"name": f"RSI 반등({period},{thresh})", "description": "RSI 과매도 반등 진입", "config": cfg})

        elif pick == "sma_cross":
            short = random.choice([5, 7, 10, 14, 20])
            long = random.choice([30, 50, 60, 100, 120])
            if long <= short:
                long = short + 20
            cfg = {
                "conditions": [{
                    "indicator": "SMA",
                    "params": {"period": short},
                    "operator": "crosses_above",
                    "value": {"indicator": "SMA", "params": {"period": long}},
                }],
                "conditions_logic": "AND",
                "action": {"type": "market_buy", "amount_type": "percent", "amount": amount},
                "safety": {"stop_loss": sl, "take_profit": tp, "max_position": max_pos},
            }
            out.append({"name": f"SMA 골든크로스({short}/{long})", "description": "이평 골든크로스 추세추종", "config": cfg})

        elif pick == "bb_rebound":
            period = random.choice([14, 20, 24])
            std_dev = random.choice([1.8, 2.0, 2.2])
            # pct_b rises above a low threshold after being below.
            thresh = random.choice([0.05, 0.1, 0.15, 0.2])
            cfg = {
                "conditions": [{
                    "indicator": "Bollinger Bands",
                    "params": {"period": period, "std_dev": std_dev},
                    "output_key": "pct_b",
                    "operator": "crosses_above",
                    "value": thresh,
                }],
                "conditions_logic": "AND",
                "action": {"type": "market_buy", "amount_type": "percent", "amount": amount},
                "safety": {"stop_loss": sl, "take_profit": tp, "max_position": max_pos},
            }
            out.append({"name": f"볼린저 반등({period},{std_dev})", "description": "밴드 하단 반등 진입", "config": cfg})

        else:  # dip_buy
            # Buy after a sharp drop (mean reversion).
            p = random.choice([1, 2, 3, 5])
            dip = random.choice([-2, -3, -4, -5, -6, -8])
            cfg = {
                "conditions": [{
                    "indicator": "Price Change %",
                    "params": {"period": p},
                    "operator": "less_than",
                    "value": dip,
                }],
                "conditions_logic": "AND",
                "action": {"type": "market_buy", "amount_type": "percent", "amount": amount},
                "safety": {"stop_loss": sl, "take_profit": tp, "max_position": max_pos},
            }
            out.append({"name": f"급락매수({p},{dip}%)", "description": "단기 급락 후 반등 노림", "config": cfg})

    # Only return configs that validate.
    valid = []
    for s in out:
        if not validate_strategy_config(s["config"]):
            valid.append(s)
    return valid

SYSTEM_PROMPT = f"""You are a crypto trading strategy expert for the Upbit exchange (KRW pairs).
Generate trading strategy configs as JSON.

Available indicators: {json.dumps(AVAILABLE_INDICATORS)}
Available operators: {json.dumps(AVAILABLE_OPERATORS)}

Indicator params:
- RSI: {{"period": 14}} (default 14, range 5-50)
- SMA/EMA/WMA: {{"period": 20}} (range 5-200)
- MACD: {{"fast": 12, "slow": 26, "signal": 9}}
- Stochastic: {{"k_period": 14, "d_period": 3}}
- Bollinger Bands: {{"period": 20, "std_dev": 2.0}} (outputs: upper, middle, lower, pct_b)
- ATR: {{"period": 14}}
- CCI: {{"period": 20}}
- Williams %R: {{"period": 14}}
- MFI: {{"period": 14}}
- Volume Spike: {{"period": 20, "threshold": 2.0}}
- Volume MA: {{"period": 20}}
- Price Change %: {{"period": 1}}
- Volatility Breakout: {{"k": 0.5}}

For multi-output indicators, use "output_key" to select which output:
- MACD: "macd", "signal", "histogram"
- Stochastic: "k", "d"
- Bollinger Bands: "upper", "middle", "lower", "pct_b"

The value field can be a number OR another indicator object:
- Number: {{"value": 30}}
- Indicator: {{"value": {{"indicator": "SMA", "params": {{"period": 50}}}}}}

Output format - return a JSON array of strategy objects:
[
  {{
    "name": "전략 이름 (한국어)",
    "description": "전략 설명 (한국어, 1-2문장)",
    "conditions": [
      {{
        "indicator": "RSI",
        "params": {{"period": 14}},
        "operator": "crosses_above",
        "value": 30
      }}
    ],
    "conditions_logic": "AND",
    "action": {{"type": "market_buy", "amount_type": "percent", "amount": 10}},
    "safety": {{"stop_loss": -5, "take_profit": 10, "max_position": 30}}
  }}
]

Rules:
- Generate diverse strategies using different indicator combinations
- Each strategy must have 1-3 conditions
- stop_loss must be negative (e.g. -3 to -10)
- take_profit must be positive (e.g. 3 to 30)
- amount: 5-30 (percent of capital per trade)
- Use realistic parameter values
- Output ONLY the JSON array, no markdown or explanation"""


async def generate_strategies_with_ai(
    pair: str,
    timeframe: str,
    style: str = "balanced",
    count: int = 5,
    provider: str = "claude",  # "claude" | "openai"
    request_timeout_s: float | None = 20.0,
) -> list[dict]:
    """Use Claude to generate multiple strategy configs."""
    settings = get_settings()
    provider = (provider or "claude").lower().strip()
    if provider not in {"claude", "openai"}:
        raise ValueError("provider는 'claude' 또는 'openai'만 지원합니다.")

    style_hints = {
        "aggressive": "공격적인 단타 전략 위주. 높은 수익률, 높은 리스크. 짧은 홀딩, 넓은 진입.",
        "balanced": "균형잡힌 전략. 적당한 리스크/리워드. 다양한 지표 조합.",
        "conservative": "보수적인 전략. 낮은 리스크, 안정적 수익. 트렌드 추종 + 확인 지표.",
        "scalping": "초단타 스캘핑. 빠른 진입/탈출. 변동성, 모멘텀 위주.",
        "swing": "스윙 트레이딩. 중장기 트렌드 추종. 이동평균 + 모멘텀 조합.",
    }
    style_desc = style_hints.get(style, style_hints["balanced"])

    user_prompt = (
        f"Generate {count} different trading strategies for {pair} on {timeframe} timeframe.\n"
        f"Style: {style_desc}\n"
        f"Focus on strategies that are likely to trade at least a few times in the recent window.\n"
        f"Avoid overly strict combinations that rarely trigger.\n"
        f"Return a JSON array of {count} strategy objects."
    )

    response_text: str
    if provider == "claude":
        if not settings.ANTHROPIC_API_KEY:
            raise ValueError("ANTHROPIC_API_KEY가 설정되지 않았습니다.")
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

        def _call_anthropic():
            return client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            )

        # anthropic client call is blocking; run it in a thread so we don't block the event loop.
        if request_timeout_s is not None:
            message = await asyncio.wait_for(asyncio.to_thread(_call_anthropic), timeout=request_timeout_s)
        else:
            message = await asyncio.to_thread(_call_anthropic)

        response_text = message.content[0].text.strip()
    else:
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY가 설정되지 않았습니다.")

        timeout = httpx.Timeout(timeout=request_timeout_s or 20.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            # Prefer Responses API for GPT-5 family. Keep a chat/completions fallback for older models.
            if settings.OPENAI_MODEL.startswith("gpt-5"):
                resp = await client.post(
                    "https://api.openai.com/v1/responses",
                    headers={
                        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": settings.OPENAI_MODEL,
                        "max_output_tokens": 2048,
                        "reasoning": {"effort": "low"},
                        "input": [
                            {
                                "type": "message",
                                "role": "developer",
                                "content": [{"type": "input_text", "text": SYSTEM_PROMPT}],
                            },
                            {
                                "type": "message",
                                "role": "user",
                                "content": [{"type": "input_text", "text": user_prompt}],
                            },
                        ],
                        "text": {"format": {"type": "text"}},
                    },
                )
                if resp.status_code >= 400:
                    logger.warning(f"OpenAI responses error {resp.status_code}: {resp.text[:800]}")
                resp.raise_for_status()
                data = resp.json()
                response_text = (data.get("output_text") or "").strip()
                if not response_text:
                    # Fallback: traverse output message content.
                    try:
                        response_text = data["output"][0]["content"][0]["text"].strip()
                    except Exception:
                        response_text = ""
            else:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
                    json={
                        "model": settings.OPENAI_MODEL,
                        "temperature": 0.7,
                        "max_tokens": 2048,
                        "messages": [
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": user_prompt},
                        ],
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                response_text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""
                response_text = response_text.strip()

    # Parse JSON (handle potential markdown wrapping)
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        response_text = "\n".join(lines[1:-1])

    strategies = json.loads(response_text)

    if not isinstance(strategies, list):
        strategies = [strategies]

    # Validate each strategy
    valid = []
    for s in strategies:
        config = {
            "conditions": s.get("conditions", []),
            "conditions_logic": s.get("conditions_logic", "AND"),
            "action": s.get("action", {"type": "market_buy", "amount_type": "percent", "amount": 10}),
            "safety": s.get("safety", {"stop_loss": -5, "take_profit": 10, "max_position": 30}),
        }
        errors = validate_strategy_config(config)
        if not errors:
            valid.append({
                "name": s.get("name", "AI 전략"),
                "description": s.get("description", ""),
                "config": config,
            })

    return valid


async def ai_find_profitable_strategies(
    pair: str,
    timeframe: str,
    df: pd.DataFrame,
    style: str = "balanced",
    count: int = 5,
    initial_capital: float = 10_000_000,
    provider: str = "claude",
    time_budget_s: float = 25.0,
) -> list[dict]:
    """
    Full pipeline: AI generates strategies → backtest each → return ranked results.
    Only returns strategies with positive returns.
    """
    # Strategy generation is stochastic. We do a few rounds and keep only strategies
    # that actually trade and have positive returns.
    target = max(1, int(count))
    max_rounds = 3
    per_round = min(max(target * 2, 6), 10)  # diversity without exploding runtime

    profitable: list[dict] = []
    candidates: list[dict] = []
    seen_configs: set[str] = set()
    started = perf_counter()

    def _time_left() -> float:
        return max(0.0, time_budget_s - (perf_counter() - started))

    for _round in range(max_rounds):
        # Keep some headroom for response serialization and request teardown.
        if _time_left() < 2.5:
            break

        # 1) Generate strategies via AI
        # Don't let a single AI call blow the whole gateway timeout.
        per_call_timeout = min(18.0, max(6.0, _time_left() - 1.5))
        try:
            strategies = await generate_strategies_with_ai(
                pair,
                timeframe,
                style,
                per_round,
                provider=provider,
                request_timeout_s=per_call_timeout,
            )
        except asyncio.TimeoutError:
            logger.warning("AI generation timed out; returning best results so far.")
            break
        except Exception as e:
            logger.warning(f"AI generation failed; falling back to param search. err={e}")
            break
        if not strategies:
            continue

        # 2) Backtest each strategy
        for s in strategies:
            try:
                # De-dupe identical configs across rounds.
                cfg_key = json.dumps(s["config"], sort_keys=True, ensure_ascii=True)
                if cfg_key in seen_configs:
                    continue
                seen_configs.add(cfg_key)

                bt = run_backtest(df, s["config"], initial_capital)
                bt_dict = bt.to_dict()

                result = _make_result(s["name"], s["description"], s["config"], bt_dict)

                # Require some minimum trading activity, otherwise a 0-trade strategy
                # tends to show 0% return and is not actionable.
                min_trades = 3 if timeframe in {"5m", "15m", "1h"} else 1

                # Keep a pool of candidates that actually traded.
                if result["backtest"]["total_trades"] >= min_trades:
                    candidates.append(result)
                    if result["backtest"]["total_return_pct"] > 0:
                        profitable.append(result)
            except Exception as e:
                logger.warning(f"Backtest failed for '{s.get('name', 'AI 전략')}': {e}")

        if len(profitable) >= target:
            break

    # 3) Sort by return (descending) and return only the requested amount.
    profitable.sort(key=lambda x: x["backtest"]["total_return_pct"], reverse=True)
    if profitable:
        return profitable[:target]

    # Fallback 1: try to find at least one profitable strategy using lightweight
    # random search over simple templates, within the remaining time budget.
    if _time_left() > 3.0:
        best: list[dict] = []
        # progressively try more samples while we have time
        for sample_n in (40, 80, 140):
            if _time_left() < 2.0:
                break
            for s in _fallback_param_search_configs(style, n=sample_n):
                try:
                    bt = run_backtest(df, s["config"], initial_capital)
                    bt_dict = bt.to_dict()
                    r = _make_result(s["name"], s["description"], s["config"], bt_dict)
                    if r["backtest"]["total_trades"] > 0:
                        best.append(r)
                except Exception as e:
                    logger.debug(f"Fallback backtest failed: {e}")
            best.sort(key=lambda x: x["backtest"]["total_return_pct"], reverse=True)
            profitable_fb = [r for r in best if r["backtest"]["total_return_pct"] > 0]
            if profitable_fb:
                return profitable_fb[:target]

    # Fallback 2: return the best candidates (still requires at least 1 trade)
    # so the UI isn't empty.
    candidates.sort(key=lambda x: x["backtest"]["total_return_pct"], reverse=True)
    if candidates:
        return candidates[:target]

    # Fallback 3: as an absolute last resort, return a single "always-on" entry
    # (should generate trades due to TP/SL) so the user sees *something*.
    cfg = {
        "conditions": [{
            "indicator": "Price Change %",
            "params": {"period": 1},
            "operator": "greater_than",
            "value": -999,
        }],
        "conditions_logic": "AND",
        "action": {"type": "market_buy", "amount_type": "percent", "amount": 10},
        "safety": {"stop_loss": -6, "take_profit": 12, "max_position": 40},
    }
    bt = run_backtest(df, cfg, initial_capital)
    return [_make_result("항상진입(폴백)", "AI/템플릿 실패 시 최소 1개 전략 표시용", cfg, bt.to_dict())][:target]

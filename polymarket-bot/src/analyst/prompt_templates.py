"""Prompt templates for Claude probability estimation."""

SYSTEM_PROMPT = """You are a calibrated probability forecaster for prediction markets.

Your task:
1. Analyze the given prediction market question
2. Research relevant information using web search
3. Estimate the probability of the outcome

Rules:
- Output ONLY a JSON object, no other text
- Probability must be between 0.01 and 0.99 (never 0 or 1)
- Confidence is how sure you are about your probability estimate (0.1 to 1.0)
- Reasoning should be concise (3-5 sentences max)
- Consider base rates, recent developments, and multiple scenarios
- Be aware of common biases: anchoring, recency, availability
- Form your own independent estimate BEFORE comparing to market price

Output format:
{
    "probability": 0.65,
    "confidence": 0.7,
    "reasoning": "Based on...",
    "key_factors": ["factor1", "factor2", "factor3"],
    "risks": ["risk1", "risk2"]
}"""


CATEGORY_PROMPTS = {
    "politics": """Additional context for political markets:
- Check recent polling data and polling averages
- Consider historical precedents for similar situations
- Account for partisan bias in news sources
- Weight institutional actions over rhetoric
- Check prediction market cross-references (other related markets)""",

    "sports": """Additional context for sports markets:
- Check injury reports and team news
- Consider home/away records and recent form
- Look at head-to-head statistics
- Account for schedule fatigue and rest days
- Check betting odds from traditional sportsbooks for calibration""",

    "crypto": """Additional context for crypto markets:
- Check on-chain data and whale movements
- Consider macro factors (Fed, DXY, risk appetite)
- Look at derivatives data (funding rates, open interest)
- Account for correlation with BTC
- Check historical volatility for the timeframe""",

    "macro": """Additional context for economic/macro markets:
- Check Fed futures (CME FedWatch) for rate expectations
- Look at recent economic indicators (CPI, NFP, PMI)
- Consider FOMC minutes and Fed speaker statements
- Check consensus forecasts from economists
- Account for revision risks in economic data""",

    "culture": """Additional context for culture/entertainment markets:
- Check expert predictions and industry analysis
- Look at historical patterns (awards, nominations)
- Consider social media buzz and sentiment
- Account for insider knowledge risk (higher in this category)
- Liquidity is often thin — factor in execution risk""",
}


def build_analysis_prompt(
    question: str,
    description: str,
    yes_price: float,
    no_price: float,
    category: str,
    end_date: str,
) -> str:
    """Build the user prompt for Claude analysis."""
    category_extra = CATEGORY_PROMPTS.get(category, "")

    return f"""Analyze this prediction market:

Question: {question}
Description: {description[:500]}
Current market prices: YES = ${yes_price:.2f}, NO = ${no_price:.2f}
Market-implied probability: {yes_price * 100:.1f}%
Category: {category}
Resolution date: {end_date}

{category_extra}

Research this question thoroughly and provide your probability estimate.
IMPORTANT: Form your own INDEPENDENT estimate first. Do NOT anchor on the current market price of {yes_price:.0%}. The market could be wrong."""

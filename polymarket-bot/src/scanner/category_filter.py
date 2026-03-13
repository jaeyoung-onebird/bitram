"""Market categorization based on question/description text."""
from __future__ import annotations

_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "politics": [
        "election", "president", "congress", "senate", "vote", "legislation",
        "party", "democrat", "republican", "biden", "trump", "governor",
        "primary", "nominee", "impeach", "cabinet", "executive order",
        "supreme court", "justice", "political",
    ],
    "sports": [
        "win", "championship", "game", "match", "score", "team", "nba",
        "nfl", "mlb", "nhl", "soccer", "football", "basketball", "tennis",
        "ufc", "fight", "boxing", "playoffs", "super bowl", "world series",
        "world cup", "premier league", "champions league",
    ],
    "crypto": [
        "bitcoin", "btc", "ethereum", "eth", "solana", "sol", "xrp",
        "crypto", "token", "blockchain", "defi", "nft", "altcoin",
        "binance", "coinbase", "price of bitcoin", "price of ethereum",
    ],
    "macro": [
        "fed", "interest rate", "inflation", "gdp", "employment", "cpi",
        "fomc", "recession", "treasury", "bond", "yield", "s&p",
        "nasdaq", "stock market", "tariff", "trade war", "sanctions",
    ],
    "culture": [
        "movie", "oscar", "grammy", "emmy", "album", "box office",
        "streaming", "netflix", "spotify", "celebrity", "viral",
        "tiktok", "youtube", "twitter",
    ],
}


def categorize_market(question: str, description: str = "") -> str:
    """Categorize a market based on its question and description text.

    Returns one of: politics, sports, crypto, macro, culture, other.
    """
    text = (question + " " + description).lower()

    scores: dict[str, int] = {}
    for category, keywords in _CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in text)
        if score > 0:
            scores[category] = score

    if not scores:
        return "other"

    return max(scores, key=scores.get)

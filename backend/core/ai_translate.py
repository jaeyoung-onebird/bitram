from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Optional

import httpx

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


_cache: dict[tuple[str, str, str], tuple[float, str]] = {}  # (provider, target, text) -> (exp, translated)


def _looks_korean(text: str) -> bool:
    return bool(re.search(r"[가-힣]", text or ""))


async def translate_text(
    text: str,
    target_lang: str = "ko",
    provider: Optional[str] = None,
    request_timeout_s: float = 6.0,
) -> str:
    text = (text or "").strip()
    if not text:
        return ""

    # Skip if already Korean and target is Korean.
    if target_lang.lower().startswith("ko") and _looks_korean(text):
        return text

    provider = (provider or settings.FEED_TRANSLATION_PROVIDER or "openai").lower().strip()
    if provider not in {"claude", "openai"}:
        provider = "openai"

    key = (provider, target_lang, text)
    now = time.time()
    cached = _cache.get(key)
    if cached and cached[0] > now:
        return cached[1]

    # Keep prompt very short to avoid spending output tokens on reasoning.
    prompt = (
        "Translate into natural Korean. Keep proper nouns/tickers. Output only the translation.\n\n"
        f"{text}"
    )

    def _extract_output_text(data: dict) -> str:
        out = (data.get("output_text") or "").strip()
        if out:
            return out
        for item in data.get("output") or []:
            if not isinstance(item, dict):
                continue
            if item.get("type") not in {"message", "output_message"}:
                continue
            for part in item.get("content") or []:
                if not isinstance(part, dict):
                    continue
                # API reference uses `output_text` parts with `text`.
                if part.get("type") in {"output_text", "text"}:
                    t = (part.get("text") or "").strip()
                    if t:
                        return t
        return ""

    async def _translate_with(p: str) -> str:
        if p == "claude":
            if not settings.ANTHROPIC_API_KEY:
                return text
            model = getattr(settings, "FEED_ANTHROPIC_MODEL", "") or settings.ANTHROPIC_MODEL
            timeout = httpx.Timeout(timeout=request_timeout_s, connect=5.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": settings.ANTHROPIC_API_KEY,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": model,
                        "max_tokens": 220,
                        "temperature": 0.2,
                        "messages": [{"role": "user", "content": prompt}],
                    },
                )
                if resp.status_code >= 400:
                    logger.warning(f"Anthropic error {resp.status_code}: {resp.text[:800]}")
                resp.raise_for_status()
                data = resp.json()
                content = data.get("content") or []
                if content and isinstance(content, list) and isinstance(content[0], dict):
                    return str(content[0].get("text") or "").strip()
                return ""

        if not settings.OPENAI_API_KEY:
            return text

        model = getattr(settings, "FEED_OPENAI_MODEL", "") or settings.OPENAI_MODEL
        timeout = httpx.Timeout(timeout=request_timeout_s, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            # Prefer Responses API for newer models (e.g. gpt-5-*) which may not support chat/completions.
            if model.startswith("gpt-5"):
                # Keep payload minimal to avoid 400s due to schema mismatches across API versions.
                payload = {"model": model, "input": prompt, "temperature": 0.2, "max_output_tokens": 160}
                resp = await client.post(
                    "https://api.openai.com/v1/responses",
                    headers={
                        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                if resp.status_code >= 400:
                    logger.warning(
                        f"OpenAI responses error {resp.status_code}: {resp.text[:800]} "
                        f"payload_keys={list(payload.keys())}"
                    )
                resp.raise_for_status()
                data = resp.json()
                out = _extract_output_text(data)
                if not out:
                    logger.warning(f"OpenAI responses parse miss. output_types={[i.get('type') for i in (data.get('output') or []) if isinstance(i, dict)]} body={str(data)[:800]}")
                return out

            # Fallback to chat/completions for older models.
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": "You are a precise translator."},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 220,
                },
            )
            if resp.status_code >= 400:
                logger.warning(f"OpenAI chat error {resp.status_code}: {resp.text[:800]}")
            resp.raise_for_status()
            data = resp.json()
            return (data["choices"][0]["message"]["content"] or "").strip()

    try:
        out = await _translate_with(provider)
        if not out:
            out = text
        _cache[key] = (time.time() + 3600, out)  # 1h
        return out
    except Exception as e:
        logger.warning(f"translate_text failed ({provider}): {e}")

        # One-shot fallback to the other provider if available.
        fallback = "openai" if provider == "claude" else "claude"
        try:
            out = await _translate_with(fallback)
            if not out:
                out = text
            _cache[(fallback, target_lang, text)] = (time.time() + 3600, out)
            return out
        except Exception as e2:
            logger.warning(f"translate_text failed ({fallback}): {e2}")
            return text

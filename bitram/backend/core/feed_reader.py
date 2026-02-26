from __future__ import annotations

import asyncio
import logging
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Optional
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FeedEntry:
    source: str
    title: str
    url: str
    published_at: str  # ISO8601 if parsed, else original string
    published_ts: int | None  # epoch seconds (UTC) if parsed
    summary: str


def _text(el: Optional[ET.Element]) -> str:
    if el is None:
        return ""
    return (el.text or "").strip()


def _first(el: ET.Element, tags: list[str]) -> Optional[ET.Element]:
    for t in tags:
        found = el.find(t)
        if found is not None:
            return found
    return None


def _parse_datetime(value: str) -> tuple[str, int | None]:
    v = (value or "").strip()
    if not v:
        return "", None
    # Try RFC822/RFC1123 etc
    try:
        dt = parsedate_to_datetime(v)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        dt = dt.astimezone(timezone.utc)
        return dt.isoformat(), int(dt.timestamp())
    except Exception:
        pass
    # Try ISO8601-ish
    try:
        vv = v.replace("Z", "+00:00")
        dt2 = datetime.fromisoformat(vv)
        if dt2.tzinfo is None:
            dt2 = dt2.replace(tzinfo=timezone.utc)
        dt2 = dt2.astimezone(timezone.utc)
        return dt2.isoformat(), int(dt2.timestamp())
    except Exception:
        return v, None


def _parse_rss(xml: str, source: str) -> list[FeedEntry]:
    root = ET.fromstring(xml)
    channel = root.find("channel") if root.tag.lower().endswith("rss") else root
    if channel is None:
        return []

    items = channel.findall("item")
    out: list[FeedEntry] = []
    for it in items:
        title = _text(it.find("title"))
        link = _text(it.find("link"))
        pub_raw = _text(_first(it, ["pubDate", "published", "dc:date"]))
        pub_iso, pub_ts = _parse_datetime(pub_raw)
        desc = _text(_first(it, ["description", "content:encoded"]))
        if not title and not link:
            continue
        out.append(
            FeedEntry(
                source=source,
                title=title,
                url=link,
                published_at=pub_iso,
                published_ts=pub_ts,
                summary=desc,
            )
        )
    return out


def _parse_atom(xml: str, source: str) -> list[FeedEntry]:
    root = ET.fromstring(xml)
    ns = ""
    if root.tag.startswith("{"):
        ns = root.tag.split("}")[0] + "}"

    out: list[FeedEntry] = []
    for e in root.findall(f"{ns}entry"):
        title = _text(e.find(f"{ns}title"))
        updated_raw = _text(_first(e, [f"{ns}updated", f"{ns}published"]))
        updated_iso, updated_ts = _parse_datetime(updated_raw)
        summary = _text(_first(e, [f"{ns}summary", f"{ns}content"]))
        link_el = e.find(f"{ns}link")
        link = ""
        if link_el is not None:
            link = (link_el.attrib.get("href") or "").strip()
        if not title and not link:
            continue
        out.append(
            FeedEntry(
                source=source,
                title=title,
                url=link,
                published_at=updated_iso,
                published_ts=updated_ts,
                summary=summary,
            )
        )
    return out


def parse_feed(xml: str, source: str) -> list[FeedEntry]:
    xml = xml.strip()
    if not xml:
        return []
    try:
        # Heuristic: Atom is <feed>, RSS is <rss> or <rdf:RDF>.
        if xml.lstrip().startswith("<feed") or "<feed" in xml[:200]:
            return _parse_atom(xml, source)
        return _parse_rss(xml, source)
    except Exception as e:
        logger.warning(f"Failed to parse feed '{source}': {e}")
        return []


class FeedCache:
    def __init__(self, ttl_s: int = 60):
        self.ttl_s = ttl_s
        self._cache: dict[str, tuple[float, list[FeedEntry]]] = {}
        self._lock = asyncio.Lock()

    async def get(self, url: str) -> Optional[list[FeedEntry]]:
        now = time.time()
        async with self._lock:
            v = self._cache.get(url)
            if not v:
                return None
            exp, data = v
            if exp < now:
                self._cache.pop(url, None)
                return None
            return data

    async def set(self, url: str, data: list[FeedEntry]):
        async with self._lock:
            self._cache[url] = (time.time() + self.ttl_s, data)


_feed_cache = FeedCache(ttl_s=60)
# Some feeds (e.g. CoinDesk) return 308/301; follow redirects.
_http = httpx.AsyncClient(timeout=8.0, follow_redirects=True, headers={"User-Agent": "BITRAM/1.0"})


async def fetch_feed(url: str, source: str) -> list[FeedEntry]:
    cached = await _feed_cache.get(url)
    if cached is not None:
        return cached

    try:
        resp = await _http.get(url)
        resp.raise_for_status()
        xml = resp.text
        parsed = parse_feed(xml, source=source)
        await _feed_cache.set(url, parsed)
        return parsed
    except Exception as e:
        logger.warning(f"Failed to fetch feed {url}: {e}")
        return []

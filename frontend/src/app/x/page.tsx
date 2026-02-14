"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ExternalFeedItem } from "@/types";
import BitramLogo from "@/components/brand/BitramLogo";

function timeAgo(input: string | number | null | undefined): string {
  if (input == null) return "";
  const now = Date.now();
  const then =
    typeof input === "number"
      ? input * (input > 10_000_000_000 ? 1 : 1000)
      : new Date(input).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export default function XFeedPage() {
  const [items, setItems] = useState<ExternalFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [source, setSource] = useState<string>("all");
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getXFeed(50, true)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items || []);
        setConfigured(Boolean(res.configured));
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) if (it.source) set.add(it.source);
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items.filter((it) => {
      if (source !== "all" && it.source !== source) return false;
      if (!qq) return true;
      const t = `${it.title_ko || ""} ${it.title || ""} ${it.summary_ko || ""} ${it.summary || ""}`.toLowerCase();
      return t.includes(qq);
    });
  }, [items, q, source]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" className="inline-flex items-center">
            <BitramLogo />
          </Link>
          <div className="text-sm font-black text-slate-700">X 피드</div>
          <div className="flex-1" />
          <Link href="/" className="text-xs text-slate-400 hover:text-slate-800">
            대시보드
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 text-sm">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div>
              <div className="text-sm font-black text-slate-700">X(트위터) 인기 피드 번역</div>
              <div className="mt-0.5 text-xs text-slate-500">
                {configured ? "실시간 수집 중" : "설정 필요: 백엔드 .env의 X_FEED_URLS"}
              </div>
            </div>
            <div className="flex-1" />
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="키워드 검색"
                className="w-full sm:w-64 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full sm:w-56 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {s === "all" ? "전체 계정" : s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="text-sm font-black text-slate-700">피드</div>
            <div className="text-xs text-slate-500">
              {loading ? "불러오는 중..." : `${filtered.length}개`}
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {!configured ? (
              <div className="p-4 text-sm text-slate-500">X 피드 설정이 필요합니다.</div>
            ) : loading ? (
              <div className="p-4 text-sm text-slate-500">불러오는 중...</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">표시할 피드가 없습니다.</div>
            ) : (
              filtered.map((x, i) => (
                <a
                  key={`${x.url}-${i}`}
                  href={x.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block px-4 py-3 hover:bg-slate-100 transition"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-500 truncate">{x.source}</div>
                    <div className="text-xs text-slate-500">{timeAgo(x.published_ts ?? x.published_at)}</div>
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-700 line-clamp-2">
                    {x.title_ko || x.title}
                  </div>
                  {(x.summary_ko || x.summary) ? (
                    <div className="mt-1 text-xs text-slate-400 line-clamp-2">{x.summary_ko || x.summary}</div>
                  ) : null}
                </a>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

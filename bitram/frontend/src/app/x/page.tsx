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
  const [accounts, setAccounts] = useState<Array<{ username: string; url: string }>>([]);
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
        setAccounts((res as any).accounts || []);
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
      <header className="sticky top-0 z-50 border-b border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" className="inline-flex items-center">
            <BitramLogo />
          </Link>
          <div className="text-sm font-black text-slate-700 dark:text-slate-200">X 피드</div>
          <div className="flex-1" />
          <Link href="/" className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            대시보드
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 text-sm">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div>
              <div className="text-sm font-black text-slate-700 dark:text-slate-200">X(트위터) 실시간 피드</div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {items.length > 0
                  ? "실시간 수집 중 (AI 한국어 번역)"
                  : configured
                    ? "피드 로딩 중..."
                    : "설정 필요"}
              </div>
            </div>
            <div className="flex-1" />
            {items.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="키워드 검색"
                  className="w-full sm:w-64 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full sm:w-56 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  {sources.map((s) => (
                    <option key={s} value={s}>
                      {s === "all" ? "전체 계정" : s}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* 추천 계정 (피드 없을 때 또는 항상 상단에) */}
        {accounts.length > 0 && items.length === 0 && !loading && (
          <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <div className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">📌 추천 크립토 X 계정</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {accounts.map((acc) => (
                <a
                  key={acc.username}
                  href={acc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-500/30 hover:shadow-sm transition"
                >
                  <span className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-black text-slate-500 dark:text-slate-400 shrink-0">𝕏</span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">@{acc.username}</div>
                    <div className="text-[10px] text-blue-500">팔로우</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <div className="text-sm font-black text-slate-700 dark:text-slate-200">피드</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {loading ? "불러오는 중..." : `${filtered.length}개`}
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {!configured ? (
              <div className="p-4 text-sm text-slate-500 dark:text-slate-400">X 피드 설정이 필요합니다.</div>
            ) : loading ? (
              <div className="p-4 text-sm text-slate-500 dark:text-slate-400">불러오는 중...</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-sm text-slate-500 dark:text-slate-400">
                {accounts.length > 0 ? "위 계정을 팔로우하고 크립토 소식을 확인하세요." : "표시할 피드가 없습니다."}
              </div>
            ) : (
              filtered.map((x, i) => (
                <a
                  key={`${x.url}-${i}`}
                  href={x.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-medium text-blue-500 truncate">{x.source}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{timeAgo(x.published_ts ?? x.published_at)}</div>
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-200 line-clamp-2">
                    {x.title_ko || x.title}
                  </div>
                  {(x.summary_ko || x.summary) ? (
                    <div className="mt-1 text-xs text-slate-400 dark:text-slate-500 line-clamp-2">{x.summary_ko || x.summary}</div>
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

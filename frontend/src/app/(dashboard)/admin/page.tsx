"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import type { AdminOverview } from "@/types";

function timeAgo(input: string): string {
  const then = new Date(input).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (user?.plan !== "admin") {
      router.replace("/dashboard");
      return;
    }
    setLoading(true);
    api
      .getAdminOverview()
      .then((res) => {
        setData(res);
        setError("");
      })
      .catch((e) => setError(e?.message || "관리자 데이터를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [router, user?.plan]);

  if (user?.plan !== "admin") return null;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="text-lg font-bold text-slate-800 dark:text-slate-100">관리자 대시보드</div>
          <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">서비스 현황 모니터링</div>
        </div>
        {loading ? (
          <div className="p-4 text-sm text-slate-500 dark:text-slate-400">불러오는 중...</div>
        ) : error ? (
          <div className="p-4 text-sm text-red-600">{error}</div>
        ) : !data ? (
          <div className="p-4 text-sm text-slate-500 dark:text-slate-400">데이터가 없습니다.</div>
        ) : (
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
              <div className="text-sm text-slate-400 dark:text-slate-500">회원(전체/7일)</div>
              <div className="mt-1 text-lg font-black">{data.counts.users_total} / {data.counts.users_7d}</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
              <div className="text-sm text-slate-400 dark:text-slate-500">게시글/댓글</div>
              <div className="mt-1 text-lg font-black">{data.counts.posts_total} / {data.counts.comments_total}</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
              <div className="text-sm text-slate-400 dark:text-slate-500">전략</div>
              <div className="mt-1 text-lg font-black">{data.counts.strategies_total}</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
              <div className="text-sm text-slate-400 dark:text-slate-500">봇(전체/실행)</div>
              <div className="mt-1 text-lg font-black">{data.counts.bots_total} / {data.counts.active_bots}</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
              <div className="text-sm text-slate-400 dark:text-slate-500">거래(전체/7일)</div>
              <div className="mt-1 text-lg font-black">{data.counts.trades_total} / {data.counts.trades_7d}</div>
            </div>
          </div>
        )}
      </section>

      <section className="grid lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 text-base font-bold text-slate-800 dark:text-slate-100">최근 가입 회원</div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data?.recent_users || []).map((u) => (
              <div key={u.id} className="px-4 py-3">
                <div className="text-sm font-semibold">{u.nickname} <span className="text-xs text-slate-500 dark:text-slate-400">({u.plan})</span></div>
                <div className="text-sm text-slate-400 dark:text-slate-500">{u.email}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{timeAgo(u.created_at)}</div>
              </div>
            ))}
            {!loading && (data?.recent_users || []).length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">데이터 없음</div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 text-base font-bold text-slate-800 dark:text-slate-100">최근 게시글</div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data?.recent_posts || []).map((p) => (
              <div key={p.id} className="px-4 py-3">
                <div className="text-sm font-semibold line-clamp-1">{p.title}</div>
                <div className="text-sm text-slate-400 dark:text-slate-500">{p.author} · {p.category}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{timeAgo(p.created_at)}</div>
              </div>
            ))}
            {!loading && (data?.recent_posts || []).length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">데이터 없음</div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

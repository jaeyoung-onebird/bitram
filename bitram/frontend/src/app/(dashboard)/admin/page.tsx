"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import type { AdminOverview, ModerationQueueItem } from "@/types";

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

const ADMIN_TABS = [
  { key: "dashboard", label: "대시보드" },
  { key: "moderation", label: "모더레이션" },
  { key: "roles", label: "역할 관리" },
] as const;

type AdminTab = (typeof ADMIN_TABS)[number]["key"];

const ROLE_OPTIONS = [
  { value: "user", label: "일반 유저" },
  { value: "moderator", label: "모더레이터" },
  { value: "admin", label: "관리자" },
];

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string>("");

  // Moderation state
  const [modQueue, setModQueue] = useState<ModerationQueueItem[]>([]);
  const [modTotal, setModTotal] = useState(0);
  const [modPage, setModPage] = useState(1);
  const [modLoading, setModLoading] = useState(false);
  const [modActionLoading, setModActionLoading] = useState<string | null>(null);

  // Role management state
  const [roleSearchQuery, setRoleSearchQuery] = useState("");
  const [roleSearchResults, setRoleSearchResults] = useState<Array<{ id: string; nickname: string; email: string; role: string }>>([]);
  const [roleSearching, setRoleSearching] = useState(false);
  const [roleChanging, setRoleChanging] = useState<string | null>(null);

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

  // Fetch moderation queue
  const fetchModerationQueue = useCallback(async () => {
    setModLoading(true);
    try {
      const result = await api.getModerationQueue(modPage);
      setModQueue(result.items);
      setModTotal(result.total);
    } catch (err) {
      console.error("Failed to fetch moderation queue:", err);
    } finally {
      setModLoading(false);
    }
  }, [modPage]);

  useEffect(() => {
    if (activeTab === "moderation") {
      fetchModerationQueue();
    }
  }, [activeTab, fetchModerationQueue]);

  const handleModerationAction = async (reportId: string, actionType: string) => {
    setModActionLoading(reportId);
    try {
      await api.takeModerationAction(reportId, actionType);
      setModQueue((prev) => prev.filter((item) => item.id !== reportId));
      setModTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to take moderation action:", err);
    } finally {
      setModActionLoading(null);
    }
  };

  // Role search
  const handleRoleSearch = async () => {
    if (!roleSearchQuery.trim()) return;
    setRoleSearching(true);
    try {
      const results = await api.searchUsers(roleSearchQuery.trim());
      setRoleSearchResults(
        results.map((u) => ({
          id: u.id,
          nickname: u.nickname,
          email: "",
          role: u.plan || "user",
        }))
      );
    } catch (err) {
      console.error("Failed to search users:", err);
    } finally {
      setRoleSearching(false);
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    setRoleChanging(userId);
    try {
      await api.changeUserRole(userId, newRole);
      setRoleSearchResults((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    } catch (err) {
      console.error("Failed to change user role:", err);
    } finally {
      setRoleChanging(null);
    }
  };

  if (user?.plan !== "admin") return null;

  return (
    <div className="space-y-5">
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {ADMIN_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition ${
              activeTab === tab.key
                ? "bg-blue-50 dark:bg-blue-500/15 text-blue-500 border border-blue-500/30"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 border border-transparent"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {activeTab === "dashboard" && (
        <>
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
        </>
      )}

      {/* Moderation Tab */}
      {activeTab === "moderation" && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100">모더레이션 대기열</div>
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">신고된 콘텐츠를 검토하고 조치합니다 ({modTotal}건)</div>
          </div>

          {modLoading ? (
            <div className="p-4 text-sm text-slate-500 dark:text-slate-400">불러오는 중...</div>
          ) : modQueue.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-slate-400 dark:text-slate-500 text-sm">처리 대기 중인 신고가 없습니다.</div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {modQueue.map((item) => (
                <div key={item.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-500 font-medium">
                          {item.target_type === "post" ? "게시글" : item.target_type === "comment" ? "댓글" : item.target_type}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 font-medium">
                          {item.reason === "spam" ? "스팸/광고" : item.reason === "abuse" ? "욕설/비방" : item.reason === "fraud" ? "사기/허위정보" : item.reason === "inappropriate" ? "부적절한 콘텐츠" : item.reason}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          item.status === "pending" ? "bg-yellow-500/10 text-yellow-600" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                        }`}>
                          {item.status === "pending" ? "대기 중" : item.status}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                        <span className="text-slate-400 dark:text-slate-500">신고자:</span> {item.reporter}
                      </div>
                      {item.description && (
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{item.description}</p>
                      )}
                      <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{timeAgo(item.created_at)}</div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => handleModerationAction(item.id, "warn")}
                      disabled={modActionLoading === item.id}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      경고
                    </button>
                    <button
                      onClick={() => handleModerationAction(item.id, "mute")}
                      disabled={modActionLoading === item.id}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      뮤트
                    </button>
                    <button
                      onClick={() => handleModerationAction(item.id, "delete")}
                      disabled={modActionLoading === item.id}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      삭제
                    </button>
                    <button
                      onClick={() => handleModerationAction(item.id, "dismiss")}
                      disabled={modActionLoading === item.id}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      무시
                    </button>
                    {modActionLoading === item.id && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">처리 중...</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Moderation Pagination */}
          {!modLoading && modQueue.length > 0 && (
            <div className="flex items-center justify-center gap-2 p-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setModPage((p) => Math.max(1, p - 1))}
                disabled={modPage <= 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:border-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                이전
              </button>
              <span className="text-sm text-slate-500 dark:text-slate-400 px-3">{modPage} 페이지</span>
              <button
                onClick={() => setModPage((p) => p + 1)}
                disabled={modQueue.length < 20}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:border-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                다음
              </button>
            </div>
          )}
        </section>
      )}

      {/* Role Management Tab */}
      {activeTab === "roles" && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100">역할 관리</div>
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">유저를 검색하고 역할을 변경합니다</div>
          </div>

          <div className="p-4 space-y-4">
            {/* Search Bar */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={roleSearchQuery}
                  onChange={(e) => setRoleSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRoleSearch();
                  }}
                  placeholder="닉네임 또는 이메일로 검색..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
                />
              </div>
              <button
                onClick={handleRoleSearch}
                disabled={roleSearching || !roleSearchQuery.trim()}
                className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {roleSearching ? "검색 중..." : "검색"}
              </button>
            </div>

            {/* Search Results */}
            {roleSearchResults.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                {roleSearchResults.map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{u.nickname}</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">{u.email}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={u.role}
                        onChange={(e) => handleChangeRole(u.id, e.target.value)}
                        disabled={roleChanging === u.id}
                        className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {roleChanging === u.id && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">변경 중...</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : roleSearchQuery && !roleSearching ? (
              <div className="text-center py-8">
                <div className="text-sm text-slate-400 dark:text-slate-500">검색 결과가 없습니다.</div>
              </div>
            ) : !roleSearchQuery ? (
              <div className="text-center py-8">
                <div className="text-sm text-slate-400 dark:text-slate-500">유저를 검색하여 역할을 관리하세요.</div>
              </div>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}

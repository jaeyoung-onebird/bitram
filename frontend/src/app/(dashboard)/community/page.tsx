"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { PostListItem, TrendingPost, CommunityBoard } from "@/types";
import MessageBadge from "@/components/MessageBadge";
import DailyQuests from "@/components/DailyQuests";
import LevelProgress from "@/components/LevelProgress";

const SORT_OPTIONS = [
  { key: "latest", label: "최신" },
  { key: "popular", label: "인기" },
  { key: "most_commented", label: "댓글순" },
  { key: "trending", label: "베스트" },
  { key: "recommended", label: "추천" },
];

const CATEGORY_BADGE: Record<string, { label: string; className: string }> = {
  strategy: { label: "전략공유", className: "bg-blue-500/10 text-blue-500" },
  profit: { label: "수익인증", className: "bg-emerald-500/10 text-emerald-600" },
  chart: { label: "차트분석", className: "bg-violet-500/10 text-violet-600" },
  news: { label: "뉴스/정보", className: "bg-cyan-500/10 text-cyan-600" },
  question: { label: "질문/답변", className: "bg-amber-500/10 text-amber-600" },
  humor: { label: "유머", className: "bg-pink-500/10 text-pink-600" },
  free: { label: "자유", className: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400" },
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function CommunityPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<PostListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("latest");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Boards
  const [boards, setBoards] = useState<CommunityBoard[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(true);
  const [activeBoard, setActiveBoard] = useState<string>("all"); // "all" or slug

  useEffect(() => {
    api
      .getCommunities()
      .then(setBoards)
      .catch(() => {})
      .finally(() => setBoardsLoading(false));
  }, []);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      let result: PostListItem[];
      if (searchQuery.trim()) {
        result = await api.searchPosts(searchQuery.trim(), undefined, page);
      } else if (activeBoard !== "all") {
        result = await api.getCommunityPosts(activeBoard, page);
      } else if (sort === "recommended") {
        result = await api.getPersonalizedFeed(page);
      } else if (sort === "trending") {
        const trending: TrendingPost[] = await api.getTrending();
        result = trending.map((t) => ({
          id: t.id,
          author: t.author,
          category: t.category,
          title: t.title,
          like_count: t.like_count,
          comment_count: t.comment_count,
          view_count: t.view_count,
          has_strategy: t.has_strategy,
          verified_profit_pct: t.verified_profit_pct,
          is_pinned: false,
          created_at: t.created_at,
        }));
      } else {
        result = await api.getPosts({ sort, page });
      }
      setPosts(result);
      setHasMore(sort !== "trending" && sort !== "recommended" && result.length >= 20);
    } catch (err) {
      console.error("Failed to fetch posts:", err);
    } finally {
      setLoading(false);
    }
  }, [activeBoard, sort, page, searchQuery]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleBoardChange = (slug: string) => {
    setActiveBoard(slug);
    setPage(1);
    setSearchQuery("");
  };

  const handleSortChange = (key: string) => {
    setSort(key);
    setPage(1);
  };

  const coinBoards = boards.filter((b) => b.coin_pair);
  const topicBoards = boards.filter((b) => !b.coin_pair);
  const activeBoardInfo = boards.find((b) => b.slug === activeBoard);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl sm:text-2xl font-bold">커뮤니티</h1>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/community/attendance"
            className="px-2.5 sm:px-4 py-1.5 sm:py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs sm:text-sm font-medium rounded-lg transition"
          >
            출석체크
          </Link>
          <Link
            href="/community/series"
            className="hidden sm:inline-flex px-2.5 sm:px-4 py-1.5 sm:py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs sm:text-sm font-medium rounded-lg transition"
          >
            시리즈
          </Link>
          <Link
            href="/messages"
            className="px-2.5 sm:px-4 py-1.5 sm:py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs sm:text-sm font-medium rounded-lg transition flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            메시지
            <MessageBadge />
          </Link>
        </div>
      </div>

      {/* Mobile: Board horizontal scroll */}
      <div className="lg:hidden mb-4">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
          <button
            onClick={() => handleBoardChange("all")}
            className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition ${
              activeBoard === "all"
                ? "bg-blue-500 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            전체
          </button>
          {[...topicBoards, ...coinBoards].map((b) => (
            <button
              key={b.id}
              onClick={() => handleBoardChange(b.slug)}
              className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition ${
                activeBoard === b.slug
                  ? "bg-blue-500 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {b.coin_pair ? b.slug.toUpperCase() : b.name}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile: Daily Quests collapsible */}
      <div className="lg:hidden mb-4">
        <DailyQuests />
      </div>

      <div className="flex gap-5">
        {/* Desktop Sidebar: Board List */}
        <aside className="hidden lg:block w-52 shrink-0">
          <div className="sticky top-20 space-y-1">
            {/* All posts */}
            <button
              onClick={() => handleBoardChange("all")}
              className={`w-full text-left px-3 py-2 text-sm rounded-lg transition ${
                activeBoard === "all"
                  ? "bg-blue-50 dark:bg-blue-500/15 text-blue-500 font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              전체 글
            </button>

            {/* Topic boards */}
            <div className="pt-3 pb-1 px-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-600">주제</span>
            </div>
            {topicBoards.map((b) => (
              <button
                key={b.id}
                onClick={() => handleBoardChange(b.slug)}
                className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition flex items-center justify-between gap-2 ${
                  activeBoard === b.slug
                    ? "bg-blue-50 dark:bg-blue-500/15 text-blue-500 font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <span className="truncate">{b.name}</span>
                {b.post_count > 0 && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-600 shrink-0">{b.post_count}</span>
                )}
              </button>
            ))}

            {/* Coin boards */}
            <div className="pt-3 pb-1 px-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-600">코인</span>
            </div>
            {coinBoards.map((b) => (
              <button
                key={b.id}
                onClick={() => handleBoardChange(b.slug)}
                className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition flex items-center justify-between gap-2 ${
                  activeBoard === b.slug
                    ? "bg-blue-50 dark:bg-blue-500/15 text-blue-500 font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <span className="truncate">{b.name}</span>
                {b.post_count > 0 && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-600 shrink-0">{b.post_count}</span>
                )}
              </button>
            ))}
          </div>
        </aside>

        {/* Main Feed */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Active board info banner */}
          {activeBoardInfo && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-3 sm:p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <span className="text-base font-bold">{activeBoardInfo.coin_pair ? activeBoardInfo.slug.toUpperCase() : activeBoardInfo.name.charAt(0)}</span>
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{activeBoardInfo.name}</h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{activeBoardInfo.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 shrink-0">
                <span>{activeBoardInfo.member_count.toLocaleString()}명</span>
                <span>{activeBoardInfo.post_count.toLocaleString()}글</span>
                <button
                  onClick={() => router.push(`/community/new?board=${activeBoard}`)}
                  className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition"
                >
                  글쓰기
                </button>
              </div>
            </div>
          )}

          {/* Search Bar */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="게시글 검색..."
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(""); setPage(1); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Sort Options */}
          {activeBoard === "all" && (
            <div className="flex items-center gap-3">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => handleSortChange(opt.key)}
                  className={`text-sm transition ${
                    sort === opt.key ? "text-slate-800 dark:text-slate-100 font-semibold" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Post List */}
          <div className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="text-slate-500 dark:text-slate-400">로딩 중...</div>
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500 dark:text-slate-400">
                <p className="text-lg mb-2">게시글이 없습니다</p>
                <p className="text-sm">첫 번째 글을 작성해보세요!</p>
              </div>
            ) : (
              posts.map((post) => {
                const catBadge = CATEGORY_BADGE[post.category];
                return (
                  <Link
                    key={post.id}
                    href={`/community/${post.id}`}
                    className="block p-3.5 sm:p-4 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition group"
                  >
                    <div className="flex items-start justify-between gap-2 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                          {post.is_pinned && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 font-medium shrink-0">고정</span>
                          )}
                          {catBadge && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${catBadge.className} shrink-0`}>{catBadge.label}</span>
                          )}
                          {post.has_strategy && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 shrink-0">전략 첨부</span>
                          )}
                        </div>
                        <h3 className="text-sm sm:text-base font-medium text-slate-800 dark:text-slate-100 group-hover:text-blue-500 transition line-clamp-1">
                          {post.title}
                        </h3>
                        <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                          <div className="flex items-center gap-1.5">
                            {post.author.avatar_url ? (
                              <img src={post.author.avatar_url} alt={post.author.nickname} className="w-4 h-4 rounded-full object-cover shrink-0" />
                            ) : (
                              <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                                <span className="text-[8px] font-bold text-slate-500 dark:text-slate-400">{post.author.nickname.charAt(0)}</span>
                              </div>
                            )}
                            <span className="text-slate-600 dark:text-slate-300">{post.author.nickname}</span>
                          </div>
                          {post.verified_profit_pct !== null && (
                            <span className="flex items-center gap-0.5 text-green-400">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              {post.verified_profit_pct > 0 ? "+" : ""}{post.verified_profit_pct.toFixed(1)}%
                            </span>
                          )}
                          <span>{formatDate(post.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 shrink-0">
                        <span className="flex items-center gap-0.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                          {post.like_count}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                          {post.comment_count}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          {post.view_count}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {!loading && posts.length > 0 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:border-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                이전
              </button>
              <span className="text-sm text-slate-500 dark:text-slate-400 px-3">{page} 페이지</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:border-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                다음
              </button>
            </div>
          )}
        </div>

        {/* Desktop Right Sidebar: Quests & Level */}
        <aside className="hidden xl:block w-64 shrink-0">
          <div className="sticky top-20 space-y-4">
            <LevelProgress />
            <DailyQuests />
            <Link
              href="/community/series"
              className="block w-full text-center px-4 py-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium rounded-xl border border-slate-200/60 dark:border-slate-700/60 transition"
            >
              시리즈 보기
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

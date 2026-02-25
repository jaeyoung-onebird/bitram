"use client";
import { useEffect, useState, useCallback, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import type { PostListItem, TrendingPost, CommunityBoard } from "@/types";
import MessageBadge from "@/components/MessageBadge";
import DailyQuests from "@/components/DailyQuests";
import LevelProgress from "@/components/LevelProgress";

const SORT_OPTIONS = [
  { key: "latest", label: "최신" },
  { key: "popular", label: "인기" },
  { key: "most_commented", label: "댓글순" },
  { key: "trending", label: "🔥 베스트" },
  { key: "recommended", label: "✨ 추천" },
];

const CATEGORY_FILTER = [
  { key: "", label: "전체" },
  { key: "profit", label: "💰 수익인증" },
  { key: "strategy", label: "📈 전략공유" },
  { key: "chart", label: "📊 차트분석" },
  { key: "news", label: "📰 뉴스/정보" },
  { key: "question", label: "❓ 질문/답변" },
  { key: "humor", label: "😂 유머" },
  { key: "free", label: "💬 자유" },
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

// ── Skeleton shimmer ──────────────────────────────────────────────────────────
function PostRowSkeleton() {
  return (
    <div className="px-5 py-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className="animate-pulse h-4 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="animate-pulse h-4 w-8 rounded-full bg-slate-200 dark:bg-slate-700" />
      </div>
      <div className="animate-pulse h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="animate-pulse h-3 w-full rounded bg-slate-200 dark:bg-slate-700" />
      <div className="animate-pulse h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}

function CommunityContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();

  const [posts, setPosts] = useState<PostListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("latest");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("");

  const [boards, setBoards] = useState<CommunityBoard[]>([]);
  const [activeBoard, setActiveBoard] = useState<string>(searchParams.get("board") || "all");

  useEffect(() => {
    api.getCommunities().then(setBoards).catch(() => {});
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
          id: t.id, author: t.author, category: t.category, title: t.title,
          like_count: t.like_count, comment_count: t.comment_count, view_count: t.view_count,
          has_strategy: t.has_strategy, verified_profit_pct: t.verified_profit_pct,
          is_pinned: false, created_at: t.created_at,
        }));
      } else {
        result = await api.getPosts({ sort, page, category: activeCategory || undefined });
      }
      setPosts(result);
      setHasMore(sort !== "trending" && sort !== "recommended" && result.length >= 20);
    } catch (err) {
      console.error("Failed to fetch posts:", err);
    } finally {
      setLoading(false);
    }
  }, [activeBoard, sort, page, searchQuery, activeCategory]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleBoardChange = (slug: string) => { setActiveBoard(slug); setPage(1); setSearchQuery(""); setActiveCategory(""); };
  const handleSortChange = (key: string) => { setSort(key); setPage(1); };
  const handleCategoryChange = (cat: string) => { setActiveCategory(cat); setPage(1); };

  const coinBoards = boards.filter((b) => b.coin_pair);
  const topicBoards = boards.filter((b) => !b.coin_pair);
  const activeBoardInfo = boards.find((b) => b.slug === activeBoard);

  // hot post: 인기글 threshold
  const hotThreshold = useMemo(() => {
    if (posts.length === 0) return Infinity;
    const avg = posts.reduce((s, p) => s + p.like_count + p.comment_count * 2, 0) / posts.length;
    return avg * 1.5;
  }, [posts]);

  const newPostHref = activeBoard !== "all"
    ? `/community/new?board=${activeBoard}`
    : "/community/new";

  return (
    <div className="animate-fade-in">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">커뮤니티</h1>
          {activeBoardInfo && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{activeBoardInfo.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/messages"
            className="relative p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <MessageBadge />
          </Link>
        </div>
      </div>

      {/* ── Mobile board tabs ─────────────────────────────── */}
      <div className="lg:hidden mb-4">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          <button
            onClick={() => handleBoardChange("all")}
            className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition ${activeBoard === "all" ? "bg-blue-500 text-white shadow-sm" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`}
          >전체</button>
          {[...topicBoards, ...coinBoards].map((b) => (
            <button key={b.id} onClick={() => handleBoardChange(b.slug)}
              className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition ${activeBoard === b.slug ? "bg-blue-500 text-white shadow-sm" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`}
            >{b.coin_pair ? b.slug.toUpperCase() : b.name}</button>
          ))}
        </div>
      </div>

      {/* ── Mobile DailyQuests ────────────────────────────── */}
      <div className="lg:hidden mb-4"><DailyQuests /></div>

      <div className="flex gap-6">
        {/* ── Desktop Sidebar ───────────────────────────────── */}
        <aside className="hidden lg:block w-48 shrink-0">
          <div className="sticky top-20 space-y-0.5">
            <button onClick={() => handleBoardChange("all")}
              className={`w-full text-left px-3 py-2 text-sm rounded-lg transition flex items-center justify-between ${activeBoard === "all" ? "text-blue-500 font-semibold bg-blue-50 dark:bg-blue-500/10" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"}`}
            ><span>전체 글</span></button>

            {topicBoards.length > 0 && (
              <>
                <div className="pt-4 pb-1.5 px-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-600">주제</span>
                </div>
                {topicBoards.map((b) => (
                  <button key={b.id} onClick={() => handleBoardChange(b.slug)}
                    className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition flex items-center justify-between gap-2 ${activeBoard === b.slug ? "text-blue-500 font-semibold bg-blue-50 dark:bg-blue-500/10" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"}`}
                  >
                    <span className="truncate">{b.name}</span>
                    {b.post_count > 0 && <span className="text-[10px] text-slate-300 dark:text-slate-700 shrink-0 tabular-nums">{b.post_count.toLocaleString()}</span>}
                  </button>
                ))}
              </>
            )}

            {coinBoards.length > 0 && (
              <>
                <div className="pt-4 pb-1.5 px-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-600">코인</span>
                </div>
                {coinBoards.map((b) => (
                  <button key={b.id} onClick={() => handleBoardChange(b.slug)}
                    className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition flex items-center justify-between gap-2 ${activeBoard === b.slug ? "text-blue-500 font-semibold bg-blue-50 dark:bg-blue-500/10" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"}`}
                  >
                    <span className="truncate">{b.name}</span>
                    {b.post_count > 0 && <span className="text-[10px] text-slate-300 dark:text-slate-700 shrink-0 tabular-nums">{b.post_count.toLocaleString()}</span>}
                  </button>
                ))}
              </>
            )}

            <div className="pt-4 space-y-1">
              <Link href="/community/attendance" className="block px-3 py-1.5 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-lg transition">출석체크</Link>
              <Link href="/community/series" className="block px-3 py-1.5 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-lg transition">시리즈</Link>
            </div>
          </div>
        </aside>

        {/* ── Main Feed ─────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-3">

          {/* ── Quick Compose Bar (Twitter style) ─────────── */}
          <button
            onClick={() => router.push(newPostHref)}
            className="w-full flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl shadow-sm hover:border-blue-400/60 dark:hover:border-blue-500/50 hover:shadow-md transition-all group text-left"
          >
            <div className="w-8 h-8 rounded-full bg-blue-500/15 text-blue-500 text-sm font-black flex items-center justify-center shrink-0 group-hover:bg-blue-500/25 transition">
              {user?.nickname?.charAt(0)?.toUpperCase() ?? "U"}
            </div>
            <span className="flex-1 text-sm text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition">
              {activeBoardInfo ? `${activeBoardInfo.name}에 글 써보세요...` : "무슨 생각이에요? 글 써보세요..."}
            </span>
            <span className="shrink-0 px-3 py-1.5 bg-blue-500 text-white text-xs font-bold rounded-lg group-hover:bg-blue-600 transition">
              글쓰기
            </span>
          </button>

          {/* ── Sort + Search ─────────────────────────────── */}
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Segmented sort control */}
            {activeBoard === "all" && !searchQuery && (
              <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl gap-0.5">
                {SORT_OPTIONS.map((opt) => (
                  <button key={opt.key} onClick={() => handleSortChange(opt.key)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${sort === opt.key ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}
                  >{opt.label}</button>
                ))}
              </div>
            )}
            {/* Search */}
            <div className="relative flex-1">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                placeholder="게시글 검색..."
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 transition shadow-sm"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); setPage(1); }} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          </div>

          {/* ── Category Filter Chips ─────────────────────── */}
          {activeBoard === "all" && !searchQuery && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
              {CATEGORY_FILTER.map((cat) => (
                <button key={cat.key} onClick={() => handleCategoryChange(cat.key)}
                  className={`shrink-0 px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap transition ${activeCategory === cat.key ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 shadow-sm" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"}`}
                >{cat.label}</button>
              ))}
            </div>
          )}

          {/* ── Post list ─────────────────────────────────── */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {Array.from({ length: 8 }).map((_, i) => <PostRowSkeleton key={i} />)}
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <span className="text-4xl">✍️</span>
                <p className="text-base font-semibold text-slate-600 dark:text-slate-300">아직 글이 없어요</p>
                <p className="text-sm text-slate-400 dark:text-slate-500">첫 번째 글의 주인공이 되어보세요!</p>
                <button onClick={() => router.push(newPostHref)}
                  className="mt-1 px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-xl transition shadow-sm"
                >글 쓰러 가기</button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {posts.map((post) => {
                  const catBadge = CATEGORY_BADGE[post.category];
                  const isHot = post.like_count + post.comment_count * 2 >= hotThreshold;
                  return (
                    <Link key={post.id} href={`/community/${post.id}`}
                      className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition group"
                    >
                      {post.thumbnail_url && (
                        <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 mt-0.5">
                          <img src={post.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                          {post.is_pinned && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-600 font-semibold">📌 고정</span>}
                          {isHot && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-500 font-semibold">🔥 인기</span>}
                          {catBadge && <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${catBadge.className}`}>{catBadge.label}</span>}
                          {post.has_strategy && post.category !== "strategy" && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-500 font-semibold">전략첨부</span>}
                        </div>

                        {/* Title */}
                        <h3 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 group-hover:text-blue-500 transition line-clamp-1 leading-snug">
                          {post.title}
                        </h3>

                        {/* Excerpt */}
                        {post.excerpt && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                            {post.excerpt}
                          </p>
                        )}

                        {/* Meta */}
                        <div className="flex items-center gap-2 mt-2 text-xs text-slate-400 dark:text-slate-500">
                          <div className="flex items-center gap-1.5">
                            {post.author.avatar_url ? (
                              <img src={post.author.avatar_url} alt={post.author.nickname} className="w-3.5 h-3.5 rounded-full object-cover" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                                <span className="text-[8px] font-bold text-slate-500">{post.author.nickname.charAt(0)}</span>
                              </div>
                            )}
                            <span className="font-medium text-slate-600 dark:text-slate-300">{post.author.nickname}</span>
                          </div>
                          <span>·</span>
                          <span>{formatDate(post.created_at)}</span>
                          {post.verified_profit_pct !== null && (
                            <>
                              <span>·</span>
                              <span className="text-emerald-500 font-semibold">
                                {post.verified_profit_pct > 0 ? "+" : ""}{post.verified_profit_pct.toFixed(1)}% 인증
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex flex-col items-end gap-1.5 text-xs text-slate-400 dark:text-slate-500 shrink-0 pt-0.5">
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                          {post.like_count}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                          {post.comment_count}
                        </span>
                        <span className="hidden sm:flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          {post.view_count}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Pagination ─────────────────────────────────── */}
          {!loading && posts.length > 0 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                이전
              </button>
              <span className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl tabular-nums">{page}</span>
              <button onClick={() => setPage((p) => p + 1)} disabled={!hasMore}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                다음
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          )}
        </div>

        {/* ── Right Sidebar ─────────────────────────────────── */}
        <aside className="hidden xl:block w-60 shrink-0">
          <div className="sticky top-20 space-y-4">
            <LevelProgress />
            <DailyQuests />
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function CommunityPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-48">
        <div className="text-slate-500 dark:text-slate-400">로딩 중...</div>
      </div>
    }>
      <CommunityContent />
    </Suspense>
  );
}

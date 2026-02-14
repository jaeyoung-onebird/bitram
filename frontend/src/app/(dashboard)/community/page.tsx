"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { PostListItem, TrendingPost } from "@/types";

const CATEGORIES = [
  { key: "", label: "전체" },
  { key: "strategy", label: "전략공유" },
  { key: "profit", label: "수익인증" },
  { key: "chart", label: "차트분석" },
  { key: "news", label: "뉴스/정보" },
  { key: "question", label: "질문/답변" },
  { key: "humor", label: "유머" },
  { key: "free", label: "자유" },
];

const SORT_OPTIONS = [
  { key: "latest", label: "최신" },
  { key: "popular", label: "인기" },
  { key: "most_commented", label: "댓글순" },
  { key: "trending", label: "베스트" },
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
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("latest");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      let result: PostListItem[];
      if (searchQuery.trim()) {
        setIsSearching(true);
        result = await api.searchPosts(searchQuery.trim(), category || undefined, page);
      } else if (sort === "trending") {
        setIsSearching(false);
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
        setIsSearching(false);
        result = await api.getPosts({
          category: category || undefined,
          sort,
          page,
        });
      }
      setPosts(result);
      setHasMore(sort !== "trending" && result.length >= 20);
    } catch (err) {
      console.error("Failed to fetch posts:", err);
    } finally {
      setLoading(false);
    }
  }, [category, sort, page, searchQuery]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleCategoryChange = (key: string) => {
    setCategory(key);
    setPage(1);
  };

  const handleSortChange = (key: string) => {
    setSort(key);
    setPage(1);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold">커뮤니티</h1>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/community/attendance"
            className="px-2.5 sm:px-4 py-1.5 sm:py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs sm:text-sm font-medium rounded-lg transition"
          >
            출석체크
          </Link>
          <button
            onClick={() => router.push("/community/new")}
            className="px-2.5 sm:px-4 py-1.5 sm:py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs sm:text-sm font-medium rounded-lg transition"
          >
            글쓰기
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
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

      {/* Category Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => handleCategoryChange(cat.key)}
            className={`px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg whitespace-nowrap transition ${
              category === cat.key
                ? "bg-blue-50 dark:bg-blue-500/15 text-blue-500 border border-blue-500/30"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 border border-transparent"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Sort Options */}
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
                className="block p-3.5 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition group"
              >
                <div className="flex items-start justify-between gap-2 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Title row */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      {post.is_pinned && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 font-medium shrink-0">
                          고정
                        </span>
                      )}
                      {catBadge && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${catBadge.className} shrink-0`}>
                          {catBadge.label}
                        </span>
                      )}
                      {post.has_strategy && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 shrink-0">
                          전략 첨부
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-medium text-slate-800 dark:text-slate-100 group-hover:text-blue-500 transition line-clamp-2">
                      {post.title}
                    </h3>

                    {/* Author + meta */}
                    <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                      <div className="flex items-center gap-1.5">
                        {post.author.level != null && (
                          <span className="text-xs font-black text-blue-500">Lv.{post.author.level}</span>
                        )}
                        <span className="text-slate-600 dark:text-slate-300">{post.author.nickname}</span>
                      </div>
                      {post.verified_profit_pct !== null && (
                        <span className="flex items-center gap-1 text-green-400">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                          수익 인증 {post.verified_profit_pct > 0 ? "+" : ""}
                          {post.verified_profit_pct.toFixed(1)}%
                        </span>
                      )}
                      <span>{formatDate(post.created_at)}</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-slate-500 dark:text-slate-400 shrink-0">
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                        />
                      </svg>
                      {post.like_count}
                    </div>
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                      {post.comment_count}
                    </div>
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                      {post.view_count}
                    </div>
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
  );
}

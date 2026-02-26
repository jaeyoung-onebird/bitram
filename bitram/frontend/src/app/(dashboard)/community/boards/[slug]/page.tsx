"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { CommunityBoard, PostListItem } from "@/types";

const CATEGORY_BADGE: Record<string, { label: string; className: string }> = {
  strategy: { label: "전략공유", className: "bg-blue-500/10 text-blue-500" },
  profit: { label: "수익인증", className: "bg-emerald-500/10 text-emerald-600" },
  chart: { label: "차트분석", className: "bg-violet-500/10 text-violet-600" },
  news: { label: "뉴스/정보", className: "bg-cyan-500/10 text-cyan-600" },
  question: { label: "질문/답변", className: "bg-amber-500/10 text-amber-600" },
  humor: { label: "유머", className: "bg-pink-500/10 text-pink-600" },
  free: {
    label: "자유",
    className:
      "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
  },
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

export default function BoardFeedPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [community, setCommunity] = useState<CommunityBoard | null>(null);
  const [posts, setPosts] = useState<PostListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [joining, setJoining] = useState(false);

  // Fetch community info
  useEffect(() => {
    setLoading(true);
    api
      .getCommunity(slug)
      .then(setCommunity)
      .catch((err) => console.error("Failed to fetch community:", err))
      .finally(() => setLoading(false));
  }, [slug]);

  // Fetch posts
  const fetchPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const result = await api.getCommunityPosts(slug, page);
      setPosts(result);
      setHasMore(result.length >= 20);
    } catch (err) {
      console.error("Failed to fetch posts:", err);
    } finally {
      setPostsLoading(false);
    }
  }, [slug, page]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleJoinToggle = async () => {
    if (!community || joining) return;
    setJoining(true);
    try {
      if (community.is_joined) {
        await api.leaveCommunity(slug);
      } else {
        await api.joinCommunity(slug);
      }
      setCommunity((prev) =>
        prev
          ? {
              ...prev,
              is_joined: !prev.is_joined,
              member_count: prev.is_joined
                ? prev.member_count - 1
                : prev.member_count + 1,
            }
          : prev
      );
    } catch (err) {
      console.error("Failed to toggle join:", err);
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-slate-500 dark:text-slate-400">로딩 중...</div>
      </div>
    );
  }

  if (!community) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-slate-500 dark:text-slate-400">
        <p className="text-lg mb-2">게시판을 찾을 수 없습니다</p>
        <Link
          href="/community/boards"
          className="text-sm text-blue-500 hover:underline"
        >
          게시판 목록으로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0">
            <Link
              href="/community/boards"
              className="text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition mt-1"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                  <span className="text-lg sm:text-xl">
                    {community.icon ||
                      community.coin_pair ||
                      community.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100">
                    {community.name}
                  </h1>
                  {community.coin_pair && (
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {community.coin_pair}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                {community.description}
              </p>
              <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
                <div className="flex items-center gap-1">
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span>멤버 {community.member_count.toLocaleString()}명</span>
                </div>
                <div className="flex items-center gap-1">
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                    />
                  </svg>
                  <span>게시글 {community.post_count.toLocaleString()}개</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleJoinToggle}
              disabled={joining}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${
                community.is_joined
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {joining ? "처리 중..." : community.is_joined ? "탈퇴하기" : "가입하기"}
            </button>
            <button
              onClick={() => router.push(`/community/new?board=${slug}`)}
              className="px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs sm:text-sm font-medium rounded-lg transition"
            >
              글쓰기
            </button>
          </div>
        </div>
      </div>

      {/* Post List */}
      <div className="space-y-2">
        {postsLoading ? (
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
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${catBadge.className} shrink-0`}
                        >
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
                          <span className="text-xs font-black text-blue-500">
                            Lv.{post.author.level}
                          </span>
                        )}
                        <span className="text-slate-600 dark:text-slate-300">
                          {post.author.nickname}
                        </span>
                      </div>
                      {post.verified_profit_pct !== null && (
                        <span className="flex items-center gap-1 text-green-400">
                          <svg
                            className="w-3 h-3"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                          수익 인증{" "}
                          {post.verified_profit_pct > 0 ? "+" : ""}
                          {post.verified_profit_pct.toFixed(1)}%
                        </span>
                      )}
                      <span>{formatDate(post.created_at)}</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-slate-500 dark:text-slate-400 shrink-0">
                    <div className="flex items-center gap-1">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.037.15.544 2.913-.997 5.768-3.524 6.736a.44.44 0 00-.278.447c.044 1.39.156 2.53.354 3.417H5.25a2.25 2.25 0 01-2.25-2.25v-.894c0-.796.42-1.534 1.105-1.937A5.23 5.23 0 006.3 7.66c-.046-.38-.07-.765-.07-1.155A5.505 5.505 0 0111.735 1c2.243 0 4.203 1.348 5.063 3.276.138.31.245.632.318.966zM16.5 15h1.875a.625.625 0 01.625.625v5.25a.625.625 0 01-.625.625H16.5v-6.5z"
                        />
                      </svg>
                      {post.like_count}
                    </div>
                    <div className="flex items-center gap-1">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
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
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
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
      {!postsLoading && posts.length > 0 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:border-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            이전
          </button>
          <span className="text-sm text-slate-500 dark:text-slate-400 px-3">
            {page} 페이지
          </span>
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

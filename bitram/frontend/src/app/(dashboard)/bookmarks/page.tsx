"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import { Bookmark, MessageSquare, Eye, ThumbsUp } from "lucide-react";

interface BookmarkedPost {
  id: string;
  title: string;
  category: string;
  author_nickname: string;
  author_id: string;
  like_count: number;
  comment_count: number;
  view_count: number;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  strategy: "전략",
  profit: "수익인증",
  question: "질문",
  free: "자유",
  chart: "차트분석",
  news: "뉴스",
  humor: "유머",
};

export default function BookmarksPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [posts, setPosts] = useState<BookmarkedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!isAuthenticated) { router.replace("/login"); return; }
  }, [isAuthenticated, router]);

  const fetchBookmarks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getMyBookmarks(page);
      setPosts(data.items);
      setTotal(data.total);
    } catch { /* */ }
    setLoading(false);
  }, [page]);

  useEffect(() => { fetchBookmarks(); }, [fetchBookmarks]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <Bookmark className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">북마크</h1>
          <p className="text-xs text-slate-400 dark:text-slate-500">저장한 게시글 {total}개</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bookmark className="w-16 h-16 text-slate-300 dark:text-slate-700 mb-4" />
          <p className="text-lg font-semibold text-slate-500 dark:text-slate-400">저장한 글이 없습니다</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">마음에 드는 글에서 북마크 버튼을 눌러보세요</p>
          <Link href="/community" className="mt-4 text-sm font-medium text-blue-500 hover:text-blue-600 transition">
            커뮤니티 둘러보기
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/community/${post.id}`}
              className="block bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 hover:border-blue-300 dark:hover:border-blue-500/40 transition group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                      {CATEGORY_LABELS[post.category] || post.category}
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">{post.author_nickname}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-blue-500 transition">
                    {post.title}
                  </h3>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                    <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{post.like_count}</span>
                    <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{post.comment_count}</span>
                    <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{post.view_count}</span>
                    <span>{new Date(post.created_at).toLocaleDateString("ko-KR")}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-4">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition ${
                    p === page
                      ? "bg-blue-500 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

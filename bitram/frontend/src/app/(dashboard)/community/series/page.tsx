"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { PostSeriesItem } from "@/types";

export default function SeriesListPage() {
  const { toast } = useToast();
  const [series, setSeries] = useState<PostSeriesItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchSeries = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getSeries(page);
      setSeries(result);
      setHasMore(result.length >= 20);
    } catch (err) {
      console.error("Failed to fetch series:", err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchSeries();
  }, [fetchSeries]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await api.createSeries(newTitle.trim(), newDesc.trim());
      toast("시리즈가 생성되었습니다!", "success");
      setShowCreateModal(false);
      setNewTitle("");
      setNewDesc("");
      await fetchSeries();
    } catch (err: any) {
      console.error("Failed to create series:", err);
      toast(err?.message || "시리즈 생성에 실패했습니다.", "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Back + Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/community" className="text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">시리즈</h1>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition"
        >
          새 시리즈
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-slate-500 dark:text-slate-400">로딩 중...</div>
        </div>
      ) : series.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-500 dark:text-slate-400">
          <p className="text-lg mb-2">시리즈가 없습니다</p>
          <p className="text-sm">첫 번째 시리즈를 만들어보세요!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {series.map((s) => (
            <Link
              key={s.id}
              href={`/community/series/${s.id}`}
              className="group bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition"
            >
              {/* Cover image */}
              <div className="aspect-video bg-slate-100 dark:bg-slate-800 relative overflow-hidden">
                {s.cover_image_url ? (
                  <img src={s.cover_image_url} alt={s.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-12 h-12 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                )}
                {s.is_complete && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 bg-emerald-500 text-white text-xs font-bold rounded">
                    완결
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-4 space-y-2">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-500 transition line-clamp-2">
                  {s.title}
                </h3>
                {s.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{s.description}</p>
                )}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                      <span className="text-[8px] font-bold text-slate-500 dark:text-slate-400">{s.author.nickname.charAt(0)}</span>
                    </div>
                    <span className="text-xs text-slate-600 dark:text-slate-300">{s.author.nickname}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                    <span>{s.post_count}편</span>
                    <span>{s.subscriber_count}구독</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && series.length > 0 && (
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

      {/* Create Series Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-6 w-full max-w-md mx-4 space-y-4">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">새 시리즈 만들기</h3>
            <div className="space-y-2">
              <label className="text-sm text-slate-600 dark:text-slate-300">시리즈 제목 *</label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="시리즈 제목을 입력하세요"
                maxLength={100}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-600 dark:text-slate-300">설명</label>
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="시리즈에 대한 설명을 입력하세요"
                rows={3}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowCreateModal(false); setNewTitle(""); setNewDesc(""); }}
                className="px-4 py-2 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition"
              >
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={!newTitle.trim() || creating}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50 transition"
              >
                {creating ? "생성 중..." : "만들기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

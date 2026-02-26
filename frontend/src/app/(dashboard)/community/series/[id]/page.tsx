"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { SeriesDetail } from "@/types";

function formatRelative(dateStr: string): string {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function SeriesDetailPage() {
  const { toast } = useToast();
  const params = useParams();
  const seriesId = params.id as string;

  const [detail, setDetail] = useState<SeriesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      const result = await api.getSeriesDetail(seriesId);
      setDetail(result);
    } catch (err) {
      console.error("Failed to fetch series detail:", err);
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleSubscribe = async () => {
    if (!detail) return;
    setSubscribing(true);
    try {
      const result = await api.subscribeSeries(seriesId);
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              is_subscribed: result.subscribed,
              subscriber_count: result.subscribed
                ? prev.subscriber_count + 1
                : Math.max(0, prev.subscriber_count - 1),
            }
          : prev
      );
      toast(result.subscribed ? "시리즈를 구독했습니다!" : "구독을 취소했습니다.", "success");
    } catch (err: any) {
      console.error("Failed to subscribe:", err);
      toast(err?.message || "구독 처리에 실패했습니다.", "error");
    } finally {
      setSubscribing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 dark:text-slate-400">로딩 중...</div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-red-400 mb-4">시리즈를 찾을 수 없습니다.</p>
        <Link href="/community/series" className="text-blue-500 hover:underline text-sm">
          시리즈 목록으로
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Back */}
      <Link href="/community/series" className="inline-flex items-center gap-1 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        시리즈 목록
      </Link>

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-6 space-y-4">
        {/* Cover image */}
        {detail.cover_image_url && (
          <div className="aspect-video rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800">
            <img src={detail.cover_image_url} alt={detail.title} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {detail.is_complete && (
                <span className="px-2 py-0.5 bg-emerald-500 text-white text-xs font-bold rounded">완결</span>
              )}
              <span className="text-xs text-slate-400 dark:text-slate-500">{detail.post_count}편</span>
            </div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{detail.title}</h1>
            {detail.description && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{detail.description}</p>
            )}
            <div className="flex items-center gap-3 mt-3">
              <Link href={`/community/user/${detail.user.id}`} className="flex items-center gap-2 hover:opacity-80 transition">
                {detail.user.avatar_url ? (
                  <img src={detail.user.avatar_url} alt={detail.user.nickname} className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{detail.user.nickname.charAt(0)}</span>
                  </div>
                )}
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{detail.user.nickname}</span>
              </Link>
              <span className="text-xs text-slate-400 dark:text-slate-500">{detail.subscriber_count}명 구독 중</span>
            </div>
          </div>

          <button
            onClick={handleSubscribe}
            disabled={subscribing}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 shrink-0 ${
              detail.is_subscribed
                ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
                : "bg-blue-500 text-white hover:bg-blue-600"
            }`}
          >
            {detail.is_subscribed ? "구독 중" : "구독하기"}
          </button>
        </div>
      </div>

      {/* Post list */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">목차</h2>
        </div>
        {detail.posts.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 dark:text-slate-400 text-center">아직 글이 없습니다.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {detail.posts.map((post, index) => (
              <Link
                key={post.id}
                href={`/community/${post.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition group"
              >
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{index + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-blue-500 transition truncate">
                    {post.title}
                  </h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 dark:text-slate-500">
                    <span>{formatRelative(post.created_at)}</span>
                    <span className="flex items-center gap-0.5">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                      {post.like_count}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      {post.comment_count}
                    </span>
                  </div>
                </div>
                <svg className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

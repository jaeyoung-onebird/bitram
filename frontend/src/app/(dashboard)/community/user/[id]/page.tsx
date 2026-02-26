"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import type { UserProfile, PostListItem } from "@/types";

const BADGE_STYLE: Record<string, { label: string; cls: string }> = {
  verified_trader: { label: "인증 트레이더", cls: "bg-emerald-500/20 text-emerald-600 border-emerald-500/30" },
  consistent_profit: { label: "꾸준한 수익", cls: "bg-blue-500/20 text-blue-600 border-blue-500/30" },
  top_contributor: { label: "탑 기여자", cls: "bg-purple-500/20 text-purple-600 border-purple-500/30" },
  strategy_master: { label: "전략 마스터", cls: "bg-orange-500/20 text-orange-600 border-orange-500/30" },
  early_adopter: { label: "얼리 어답터", cls: "bg-pink-500/20 text-pink-600 border-pink-500/30" },
  helpful: { label: "도움왕", cls: "bg-cyan-500/20 text-cyan-600 border-cyan-500/30" },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

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

export default function UserProfilePage() {
  const params = useParams();
  const userId = params.id as string;
  const { user: currentUser } = useAuthStore();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getUserProfile(userId)
      .then(setProfile)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId]);

  const handleFollow = async () => {
    if (!profile) return;
    setFollowBusy(true);
    try {
      if (profile.is_following) {
        await api.unfollowUser(userId);
      } else {
        await api.followUser(userId);
      }
      const updated = await api.getUserProfile(userId);
      setProfile(updated);
    } catch (err) {
      console.error("Follow error:", err);
    } finally {
      setFollowBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 dark:text-slate-400">로딩 중...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-red-400 mb-4">사용자를 찾을 수 없습니다.</p>
        <Link href="/community" className="text-blue-500 hover:underline text-sm">커뮤니티로 돌아가기</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Back */}
      <Link href="/community" className="inline-flex items-center gap-1 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        커뮤니티
      </Link>

      {/* Profile Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-6 space-y-5">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-black text-blue-500">Lv.{profile.level}</span>
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{profile.nickname}</h1>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500">{profile.level_name}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">가입일: {formatDate(profile.joined_at)}</p>

            {/* Badges */}
            {profile.badges.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {profile.badges.map((b) => {
                  const style = BADGE_STYLE[b.type] || { label: b.label, cls: "bg-slate-500/20 text-slate-600 dark:text-slate-300 border-gray-500/30" };
                  return (
                    <span key={b.type} className={`text-xs px-2 py-0.5 rounded-full border ${style.cls}`}>
                      {style.label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Follow button */}
          {currentUser?.id !== userId && (
            <button
              onClick={handleFollow}
              disabled={followBusy}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 shrink-0 ${
                profile.is_following
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
                  : "bg-blue-500 text-white hover:bg-blue-500"
              }`}
            >
              {profile.is_following ? "팔로잉" : "팔로우"}
            </button>
          )}
        </div>

        {/* Level & Points */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-blue-500">Lv.{profile.level}</span>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{profile.level_name}</span>
            </div>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{profile.total_points.toLocaleString()}P</span>
          </div>
          {profile.next_threshold != null && (
            <>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (profile.total_points / profile.next_threshold) * 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
                <span>다음: Lv.{profile.level + 1} {profile.next_level_name}</span>
                <span>{profile.next_threshold.toLocaleString()}P 까지 {(profile.next_threshold - profile.total_points).toLocaleString()}P 남음</span>
              </div>
            </>
          )}
          {profile.next_threshold == null && (
            <div className="text-xs text-amber-500 font-medium">최고 레벨 달성!</div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-slate-800 dark:text-slate-100">{profile.post_count}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">게시글</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-slate-800 dark:text-slate-100">{profile.total_likes_received}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">받은 좋아요</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-slate-800 dark:text-slate-100">{profile.follower_count}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">팔로워</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-slate-800 dark:text-slate-100">{profile.following_count}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">팔로잉</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-slate-800 dark:text-slate-100">{profile.shared_strategies_count}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">공유 전략</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-slate-800 dark:text-slate-100">{profile.total_copy_count}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">전략 복사됨</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-slate-800 dark:text-slate-100">{profile.total_comments}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">댓글</div>
          </div>
        </div>
      </div>

      {/* Recent Posts */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">최근 게시글</h2>
        </div>
        {profile.recent_posts.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 dark:text-slate-400 text-center">게시글이 없습니다.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {profile.recent_posts.map((post) => (
              <Link
                key={post.id}
                href={`/community/${post.id}`}
                className="block px-6 py-4 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{post.title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>{formatRelative(post.created_at)}</span>
                      <span>♥ {post.like_count}</span>
                      <span>💬 {post.comment_count}</span>
                      <span>👀 {post.view_count}</span>
                    </div>
                  </div>
                  {post.verified_profit_pct !== null && (
                    <span className={`text-xs font-bold shrink-0 ${post.verified_profit_pct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {post.verified_profit_pct >= 0 ? "+" : ""}{post.verified_profit_pct.toFixed(1)}%
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

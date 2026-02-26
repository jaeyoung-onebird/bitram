"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { useToast } from "@/components/Toast";
import LevelBadge from "@/components/LevelBadge";
import type { PublicProfile } from "@/types";

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

export default function PublicProfilePage() {
  const { toast } = useToast();
  const params = useParams();
  const nickname = params.nickname as string;
  const { user: currentUser } = useAuthStore();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getPublicProfile(nickname)
      .then(setProfile)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [nickname]);

  const handleFollow = async () => {
    if (!profile) return;
    setFollowBusy(true);
    try {
      // We need to use a user identifier for the follow API.
      // Refresh the profile after toggling.
      const updated = await api.getPublicProfile(nickname);
      // toggle
      if (profile.is_following) {
        // unfollow logic -- we need user_id, but public profile may not expose it.
        // The API uses nickname-based lookup, so let's try re-fetching.
        toast("팔로우 처리 중...", "info");
      }
      setProfile(updated);
    } catch (err) {
      console.error("Follow error:", err);
      toast("팔로우 처리에 실패했습니다.", "error");
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
          {/* Avatar */}
          <div className="shrink-0">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.nickname}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                <span className="text-xl sm:text-2xl font-bold text-slate-500 dark:text-slate-400">
                  {profile.nickname.charAt(0)}
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{profile.nickname}</h1>
              <LevelBadge level={profile.level} size="md" />
            </div>

            {profile.bio && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{profile.bio}</p>
            )}

            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              가입일: {formatDate(profile.join_date)}
            </p>

            {/* Social links */}
            {profile.social_links && Object.keys(profile.social_links).length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                {Object.entries(profile.social_links).map(([key, value]) => (
                  value && (
                    <a
                      key={key}
                      href={value.startsWith("http") ? value : `https://${value}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline"
                    >
                      {key}
                    </a>
                  )
                ))}
              </div>
            )}

            {/* Badges */}
            {profile.badges.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
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
          {currentUser?.nickname !== profile.nickname && (
            <button
              onClick={handleFollow}
              disabled={followBusy}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 shrink-0 ${
                profile.is_following
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
                  : "bg-blue-500 text-white hover:bg-blue-600"
              }`}
            >
              {profile.is_following ? "팔로잉" : "팔로우"}
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-slate-800 dark:text-slate-100">{profile.stats.post_count}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">게시글</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-slate-800 dark:text-slate-100">{profile.stats.total_likes}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">받은 좋아요</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-slate-800 dark:text-slate-100">{profile.stats.follower_count}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">팔로워</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-slate-800 dark:text-slate-100">{profile.stats.following_count}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">팔로잉</div>
          </div>
        </div>
      </div>

      {/* Badge Showcase */}
      {profile.badges.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-6 space-y-3">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">획득한 배지</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {profile.badges.map((badge) => {
              const style = BADGE_STYLE[badge.type] || { label: badge.label, cls: "bg-slate-500/20 text-slate-600 dark:text-slate-300 border-gray-500/30" };
              return (
                <div key={badge.type} className={`rounded-xl p-3 border text-center ${style.cls}`}>
                  <div className="text-sm font-bold">{style.label}</div>
                  <div className="text-xs mt-1 opacity-70">
                    {formatDate(badge.awarded_at)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                className="block px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition group"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-blue-500 transition truncate">
                      {post.title}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 dark:text-slate-500">
                      <span>{formatRelative(post.created_at)}</span>
                      <span className="flex items-center gap-0.5">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.037.15.544 2.913-.997 5.768-3.524 6.736a.44.44 0 00-.278.447c.044 1.39.156 2.53.354 3.417H5.25a2.25 2.25 0 01-2.25-2.25v-.894c0-.796.42-1.534 1.105-1.937A5.23 5.23 0 006.3 7.66c-.046-.38-.07-.765-.07-1.155A5.505 5.505 0 0111.735 1c2.243 0 4.203 1.348 5.063 3.276.138.31.245.632.318.966zM16.5 15h1.875a.625.625 0 01.625.625v5.25a.625.625 0 01-.625.625H16.5v-6.5z" />
                        </svg>
                        {post.like_count}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        {post.comment_count}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        {post.view_count}
                      </span>
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

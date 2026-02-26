"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { UserPlus, Users, FileText, Layers } from "lucide-react";

interface Suggestion {
  user_id: string;
  nickname: string;
  bio: string;
  post_count: number;
  strategy_count: number;
  follower_count: number;
}

export default function FollowSuggestions() {
  const { isAuthenticated } = useAuthStore();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    api.getFollowSuggestions()
      .then(setSuggestions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  const handleFollow = async (userId: string) => {
    try {
      await api.followUser(userId);
      setFollowing((prev) => new Set([...prev, userId]));
    } catch { /* */ }
  };

  if (!isAuthenticated || loading || suggestions.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-blue-500" />
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">추천 유저</h3>
      </div>
      <div className="space-y-2">
        {suggestions.slice(0, 5).map((user) => {
          const isFollowing = following.has(user.user_id);
          return (
            <div key={user.user_id} className="flex items-center gap-2.5">
              <Link
                href={`/user/${user.nickname}`}
                className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 text-xs font-bold flex items-center justify-center shrink-0"
              >
                {user.nickname.charAt(0).toUpperCase()}
              </Link>
              <div className="flex-1 min-w-0">
                <Link href={`/user/${user.nickname}`} className="text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-blue-500 transition truncate block">
                  {user.nickname}
                </Link>
                <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
                  <span className="flex items-center gap-0.5"><FileText className="w-2.5 h-2.5" />{user.post_count}</span>
                  <span className="flex items-center gap-0.5"><Layers className="w-2.5 h-2.5" />{user.strategy_count}</span>
                  <span className="flex items-center gap-0.5"><Users className="w-2.5 h-2.5" />{user.follower_count}</span>
                </div>
              </div>
              <button
                onClick={() => handleFollow(user.user_id)}
                disabled={isFollowing}
                className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg transition ${
                  isFollowing
                    ? "bg-slate-100 dark:bg-slate-800 text-slate-400"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
              >
                {isFollowing ? "팔로잉" : "팔로우"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

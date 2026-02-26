"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { Bell, Heart, MessageSquare, UserPlus, Copy, AtSign, Check } from "lucide-react";
import type { Notification } from "@/types";

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  like: { icon: Heart, color: "text-rose-500", bg: "bg-rose-500/10" },
  comment: { icon: MessageSquare, color: "text-blue-500", bg: "bg-blue-500/10" },
  reply: { icon: MessageSquare, color: "text-indigo-500", bg: "bg-indigo-500/10" },
  follow: { icon: UserPlus, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  mention: { icon: AtSign, color: "text-amber-500", bg: "bg-amber-500/10" },
  copy_strategy: { icon: Copy, color: "text-violet-500", bg: "bg-violet-500/10" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금 전";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR");
}

export default function NotificationsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) { router.replace("/login"); return; }
  }, [isAuthenticated, router]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getNotifications(page);
      if (page === 1) {
        setNotifications(data);
      } else {
        setNotifications((prev) => [...prev, ...data]);
      }
      setHasMore(data.length >= 20);
    } catch { /* */ }
    setLoading(false);
  }, [page]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const handleMarkAllRead = async () => {
    try {
      await api.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch { /* */ }
  };

  const handleClick = async (notif: Notification) => {
    if (!notif.is_read) {
      try {
        await api.markRead(notif.id);
        setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, is_read: true } : n));
      } catch { /* */ }
    }
    if (notif.target_type === "post" && notif.target_id) {
      router.push(`/community/${notif.target_id}`);
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Bell className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">알림</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {unreadCount > 0 ? `읽지 않은 알림 ${unreadCount}개` : "모든 알림을 확인했습니다"}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-1.5 text-xs font-medium text-blue-500 hover:text-blue-600 transition"
          >
            <Check className="w-3.5 h-3.5" />
            모두 읽음
          </button>
        )}
      </div>

      {loading && page === 1 ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bell className="w-16 h-16 text-slate-300 dark:text-slate-700 mb-4" />
          <p className="text-lg font-semibold text-slate-500 dark:text-slate-400">알림이 없습니다</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">활동이 생기면 여기에 표시됩니다</p>
        </div>
      ) : (
        <div className="space-y-1">
          {notifications.map((notif) => {
            const config = TYPE_CONFIG[notif.type] || { icon: Bell, color: "text-slate-500", bg: "bg-slate-500/10" };
            const Icon = config.icon;
            return (
              <button
                key={notif.id}
                onClick={() => handleClick(notif)}
                className={`w-full text-left flex items-start gap-3 p-3.5 rounded-xl transition ${
                  notif.is_read
                    ? "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    : "bg-blue-50/50 dark:bg-blue-500/5 hover:bg-blue-50 dark:hover:bg-blue-500/10"
                }`}
              >
                <div className={`w-9 h-9 rounded-lg ${config.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon className={`w-4 h-4 ${config.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-relaxed ${notif.is_read ? "text-slate-600 dark:text-slate-400" : "text-slate-800 dark:text-slate-200 font-medium"}`}>
                    {notif.message}
                  </p>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 block">
                    {timeAgo(notif.created_at)}
                  </span>
                </div>
                {!notif.is_read && (
                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" />
                )}
              </button>
            );
          })}

          {hasMore && (
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={loading}
              className="w-full py-3 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-blue-500 transition"
            >
              {loading ? "로딩 중..." : "더 보기"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

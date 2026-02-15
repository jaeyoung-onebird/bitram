"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import RealtimeNotifications from "@/components/RealtimeNotifications";
import type { Notification } from "@/types";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

const NOTIF_ICON: Record<string, string> = {
  like: "text-red-400",
  comment: "text-blue-500",
  reply: "text-cyan-400",
  follow: "text-purple-400",
  mention: "text-amber-400",
  copy_strategy: "text-emerald-400",
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refreshUnreadCount = useCallback(() => {
    api.getUnreadCount().then((r) => setUnread(r.count)).catch(() => {});
  }, []);

  const handleNewNotification = useCallback(() => {
    refreshUnreadCount();
    // If panel is open, refresh the list too
    if (open) {
      api.getNotifications(1).then(setNotifications).catch(() => {});
    }
  }, [refreshUnreadCount, open]);

  useEffect(() => {
    let mounted = true;
    api.getUnreadCount().then((r) => { if (mounted) setUnread(r.count); }).catch(() => {});
    const id = setInterval(() => {
      api.getUnreadCount().then((r) => { if (mounted) setUnread(r.count); }).catch(() => {});
    }, 30000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setLoading(true);
    api.getNotifications(1)
      .then((r) => { if (mounted) setNotifications(r); })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleMarkAllRead = async () => {
    await api.markAllRead().catch(() => {});
    setUnread(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const getLink = (n: Notification) => {
    if (n.target_type === "post" && n.target_id) return `/community/${n.target_id}`;
    if (n.type === "follow" && n.target_id) return `/community/user/${n.target_id}`;
    return null;
  };

  return (
    <div className="relative" ref={ref}>
      <RealtimeNotifications onNewNotification={handleNewNotification} />
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center px-1">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.08)] overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">알림</span>
            {unread > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-blue-500 hover:underline">
                모두 읽음
              </button>
            )}
          </div>
          <div className="overflow-y-auto max-h-72">
            {loading ? (
              <div className="p-4 text-sm text-slate-500 dark:text-slate-400 text-center">로딩 중...</div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-sm text-slate-500 dark:text-slate-400 text-center">알림이 없습니다</div>
            ) : (
              notifications.map((n) => {
                const link = getLink(n);
                const inner = (
                  <div className={`px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer ${!n.is_read ? "bg-blue-500/5" : ""}`}>
                    <div className="flex items-start gap-2.5">
                      <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${!n.is_read ? "bg-blue-400" : "bg-transparent"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{n.message}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                    </div>
                  </div>
                );
                return link ? (
                  <Link key={n.id} href={link} onClick={() => setOpen(false)}>
                    {inner}
                  </Link>
                ) : (
                  <div key={n.id}>{inner}</div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

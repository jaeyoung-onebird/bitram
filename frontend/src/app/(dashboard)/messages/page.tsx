"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Search, X, Loader2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("bitram-auth");
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.accessToken || null;
    }
  } catch {}
  return null;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === "string" ? err.detail : JSON.stringify(err));
  }
  return res.json();
}

interface Conversation {
  id: string;
  other_user: {
    id: string;
    nickname: string;
    avatar_url?: string | null;
  };
  last_message?: {
    content: string;
    created_at: string;
  } | null;
  unread_count: number;
  updated_at: string;
}

interface UserSearchItem {
  id: string;
  nickname: string;
  plan: string;
}

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
  if (days < 7) return `${days}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function getInitials(nickname: string): string {
  return nickname.slice(0, 2).toUpperCase();
}

export default function MessagesPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      const data = await apiFetch<Conversation[]>("/api/dm/conversations");
      setConversations(data);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const data = await apiFetch<UserSearchItem[]>(
        `/api/search/users?q=${encodeURIComponent(searchQuery.trim())}&page=1`
      );
      setSearchResults(data);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleStartConversation = async (userId: string) => {
    setCreating(true);
    try {
      const data = await apiFetch<{ id: string }>("/api/dm/conversations", {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      });
      setShowNewModal(false);
      setSearchQuery("");
      setSearchResults([]);
      router.push(`/messages/${data.id}`);
    } catch {
      // silently handle
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
          메시지
        </h1>
        <button
          onClick={() => setShowNewModal(true)}
          className="px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs sm:text-sm font-medium rounded-lg transition"
        >
          새 메시지
        </button>
      </div>

      {/* Conversation List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 dark:text-slate-400">
            <MessageCircle className="w-12 h-12 mb-3 text-slate-300 dark:text-slate-600" />
            <p className="text-lg font-medium mb-1">메시지가 없습니다</p>
            <p className="text-sm">새 메시지를 보내보세요!</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <button
                  onClick={() => router.push(`/messages/${conv.id}`)}
                  className="w-full flex items-center gap-3 px-4 sm:px-5 py-3.5 sm:py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-left"
                >
                  {/* Avatar */}
                  {conv.other_user.avatar_url ? (
                    <img
                      src={conv.other_user.avatar_url}
                      alt={conv.other_user.nickname}
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {getInitials(conv.other_user.nickname)}
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {conv.other_user.nickname}
                      </span>
                      {conv.last_message?.created_at && (
                        <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                          {timeAgo(conv.last_message.created_at)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                        {conv.last_message?.content
                          ? conv.last_message.content.length > 50
                            ? conv.last_message.content.slice(0, 50) + "..."
                            : conv.last_message.content
                          : "메시지가 없습니다"}
                      </p>
                      {conv.unread_count > 0 && (
                        <span className="min-w-[20px] h-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center px-1.5 shrink-0">
                          {conv.unread_count > 99 ? "99+" : conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* New Message Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-[0_10px_40px_rgba(0,0,0,0.15)] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                새 메시지
              </h2>
              <button
                onClick={() => {
                  setShowNewModal(false);
                  setSearchQuery("");
                  setSearchResults([]);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search */}
            <div className="p-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSearch();
                    }}
                    placeholder="닉네임으로 검색..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 focus:outline-none transition"
                  />
                </div>
                <button
                  onClick={handleSearch}
                  disabled={searching || !searchQuery.trim()}
                  className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition"
                >
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "검색"}
                </button>
              </div>
            </div>

            {/* Results */}
            <div className="max-h-64 overflow-y-auto border-t border-slate-100 dark:border-slate-800">
              {searchResults.length === 0 && !searching && searchQuery.trim() && (
                <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  검색 결과가 없습니다
                </div>
              )}
              {searching && (
                <div className="py-8 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                </div>
              )}
              {!searching &&
                searchResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleStartConversation(user.id)}
                    disabled={creating}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-left disabled:opacity-50"
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {getInitials(user.nickname)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate block">
                        {user.nickname}
                      </span>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

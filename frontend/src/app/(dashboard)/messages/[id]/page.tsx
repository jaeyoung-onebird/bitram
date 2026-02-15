"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { useAuthStore } from "@/lib/store";

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

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_read: boolean;
}

interface ConversationDetail {
  id: string;
  other_user: {
    id: string;
    nickname: string;
    avatar_url?: string | null;
  };
}

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateSeparator(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function isSameDay(d1: string, d2: string): boolean {
  const a = new Date(d1);
  const b = new Date(d2);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function DMChatPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params.id as string;
  const user = useAuthStore((s) => s.user);

  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Fetch conversation & messages
  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        const [convData, msgData] = await Promise.all([
          apiFetch<ConversationDetail>(`/api/dm/conversations/${conversationId}`),
          apiFetch<Message[]>(`/api/dm/conversations/${conversationId}/messages`),
        ]);
        if (mounted) {
          setConversation(convData);
          setMessages(msgData);
        }
      } catch {
        // silently handle
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData();

    // Mark as read
    apiFetch(`/api/dm/conversations/${conversationId}/read`, { method: "POST" }).catch(() => {});

    return () => {
      mounted = false;
    };
  }, [conversationId]);

  // Scroll to bottom when messages load or change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // WebSocket connection
  useEffect(() => {
    if (!user?.id) return;
    const token = getToken();
    if (!token) return;

    // Determine WS URL
    let wsBase = API_URL.replace(/^http/, "ws");
    if (!wsBase) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsBase = `${protocol}//${window.location.host}`;
    }

    const ws = new WebSocket(`${wsBase}/ws/dm/${user.id}?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "dm_message" && data.conversation_id === conversationId) {
          const newMsg: Message = {
            id: data.id || crypto.randomUUID(),
            sender_id: data.sender_id,
            content: data.content,
            created_at: data.created_at || new Date().toISOString(),
            is_read: true,
          };
          setMessages((prev) => [...prev, newMsg]);
          // Mark as read
          apiFetch(`/api/dm/conversations/${conversationId}/read`, { method: "POST" }).catch(() => {});
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      // silently handle
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [user?.id, conversationId]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;

    setSending(true);
    setInput("");

    // Optimistic update
    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      sender_id: user?.id || "",
      content,
      created_at: new Date().toISOString(),
      is_read: false,
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const sent = await apiFetch<Message>(
        `/api/dm/conversations/${conversationId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ content }),
        }
      );
      // Replace temp message with real one
      setMessages((prev) =>
        prev.map((m) => (m.id === tempMsg.id ? sent : m))
      );
    } catch {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-5rem)] animate-fade-in">
      {/* Chat Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-t-2xl shadow-sm">
        <button
          onClick={() => router.push("/messages")}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        {conversation?.other_user.avatar_url ? (
          <img
            src={conversation.other_user.avatar_url}
            alt={conversation.other_user.nickname}
            className="w-9 h-9 rounded-full object-cover"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
            {conversation?.other_user.nickname.slice(0, 2).toUpperCase() || "?"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
            {conversation?.other_user.nickname || ""}
          </h2>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-slate-50 dark:bg-slate-950 border-x border-slate-200/60 dark:border-slate-700/60"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-slate-400 dark:text-slate-500">
            대화를 시작해보세요!
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMine = msg.sender_id === user?.id;
            const showDate =
              idx === 0 || !isSameDay(messages[idx - 1].created_at, msg.created_at);

            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="flex items-center justify-center my-4">
                    <span className="px-3 py-1 bg-slate-200/60 dark:bg-slate-800 rounded-full text-xs text-slate-500 dark:text-slate-400">
                      {formatDateSeparator(msg.created_at)}
                    </span>
                  </div>
                )}
                <div
                  className={`flex ${isMine ? "justify-end" : "justify-start"} mb-1.5`}
                >
                  <div className={`flex items-end gap-1.5 max-w-[75%] ${isMine ? "flex-row-reverse" : ""}`}>
                    <div
                      className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap ${
                        isMine
                          ? "bg-blue-500 text-white rounded-br-md"
                          : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/60 dark:border-slate-700/60 rounded-bl-md"
                      }`}
                    >
                      {msg.content}
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0 pb-0.5">
                      {formatMessageTime(msg.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-b-2xl shadow-sm">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요..."
            rows={1}
            className="flex-1 px-4 py-2.5 bg-slate-50/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 focus:outline-none transition resize-none"
            style={{ maxHeight: "120px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 120) + "px";
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="p-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:hover:bg-blue-500 text-white rounded-xl transition shrink-0"
          >
            {sending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

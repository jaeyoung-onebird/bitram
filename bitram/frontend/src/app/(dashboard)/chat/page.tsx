"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useAuthStore } from "@/lib/store";
import { api } from "@/lib/api";
import { MessageCircle, Send, Users } from "lucide-react";

interface ChatMessage {
  type: string;
  anon_id?: string;
  nickname?: string;
  emoji?: string;
  content?: string;
  timestamp?: number;
  count?: number;
  messages?: ChatMessage[];
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ChatPage() {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [myAnonId, setMyAnonId] = useState<string | null>(null);
  const [myNickname, setMyNickname] = useState<string>("");
  const [myEmoji, setMyEmoji] = useState<string>("");

  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // WebSocket connection (works with or without login)
  useEffect(() => {
    let cancelled = false;

    const connect = async () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      setConnecting(true);

      try {
        let tokenParam = "";
        if (user) {
          try {
            const { access_token } = await api.getWSToken();
            if (cancelled) return;
            tokenParam = `?token=${access_token}`;
          } catch { /* guest mode */ }
        }

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat${tokenParam}`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (cancelled) { ws.close(); return; }
          setConnected(true);
          setConnecting(false);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "welcome") {
              setMyAnonId(data.anon_id);
              setMyNickname(data.nickname);
              setMyEmoji(data.emoji || "");
            } else if (data.type === "history" && data.messages) {
              setMessages(data.messages);
            } else if (data.type === "message") {
              setMessages((prev) => [...prev, data]);
            } else if (data.type === "online_count") {
              setOnlineCount(data.count || 0);
            }
          } catch { /* ignore */ }
        };

        ws.onclose = () => {
          if (cancelled) return;
          setConnected(false);
          setConnecting(false);
          reconnectRef.current = setTimeout(() => { if (!cancelled) connect(); }, 3000);
        };

        ws.onerror = () => {};
      } catch {
        if (!cancelled) { setConnecting(false); setConnected(false); }
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      setConnected(false);
      setConnecting(false);
    };
  }, [user]);

  const handleSend = useCallback(() => {
    const content = inputValue.trim();
    if (!content || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "message", content }));
    // Add locally (server won't echo back to sender)
    setMessages((prev) => [...prev, {
      type: "message",
      anon_id: myAnonId || "",
      nickname: myNickname,
      emoji: myEmoji,
      content,
      timestamp: Date.now() / 1000,
    }]);
    setInputValue("");
    inputRef.current?.focus();
  }, [inputValue, myAnonId, myNickname, myEmoji]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return; // 한글 IME 조합 중 무시
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">익명 채팅</h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">접속할 때마다 새로운 익명 ID가 부여됩니다</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Users className="w-4 h-4" />
          <span className="font-medium tabular-nums">{onlineCount}</span>
          <span className="text-xs">접속 중</span>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex flex-col bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl shadow-sm overflow-hidden h-[calc(100vh-220px)] md:h-[calc(100vh-180px)]">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">BITRAM 익명채팅</h2>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
              {connected ? (
                <span className="flex items-center gap-1 text-emerald-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  연결됨
                </span>
              ) : connecting ? (
                <span className="text-amber-500">연결 중...</span>
              ) : (
                <span className="text-red-400">연결 끊김</span>
              )}
              <span className="w-px h-3 bg-slate-200 dark:bg-slate-700" />
              <span>{onlineCount}명 접속 중</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
              <MessageCircle className="w-12 h-12 text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">아직 메시지가 없어요</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">첫 번째 메시지를 보내보세요!</p>
            </div>
          )}

          {messages.map((msg, idx) => {
            const isMe = msg.anon_id === myAnonId;
            const isBot = msg.anon_id === "BITRAM_AI";
            const displayEmoji = isMe ? myEmoji : msg.emoji;
            return (
              <div key={idx} className="flex gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  isBot
                    ? "bg-gradient-to-br from-violet-500 to-indigo-600 shadow-sm"
                    : isMe ? "bg-blue-100 dark:bg-blue-500/20" : "bg-slate-100 dark:bg-slate-800"
                }`}>
                  <span className={`leading-none ${isBot ? "text-sm" : "text-base"}`}>{displayEmoji || "👤"}</span>
                </div>
                <div className="max-w-[75%] min-w-0">
                  <span className={`text-[11px] font-medium ml-1 mb-0.5 flex items-center gap-1 ${
                    isBot
                      ? "text-violet-500 dark:text-violet-400"
                      : isMe ? "text-blue-500 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"
                  }`}>
                    {msg.nickname || "익명"}
                    {isBot && <span className="text-[9px] px-1 py-px rounded bg-violet-100 dark:bg-violet-500/20 text-violet-500 dark:text-violet-400 font-bold">AI</span>}
                  </span>
                  <div className={`inline-block px-3 py-2 rounded-2xl rounded-tl-md text-sm leading-relaxed break-words ${
                    isBot
                      ? "bg-violet-50 dark:bg-violet-500/10 text-violet-900 dark:text-violet-100 border border-violet-200/50 dark:border-violet-500/20"
                      : isMe
                        ? "bg-blue-500 text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  }`}>
                    {msg.content}
                  </div>
                  {msg.timestamp && (
                    <span className="text-[10px] text-slate-300 dark:text-slate-600 mt-0.5 block ml-1">
                      {formatTime(msg.timestamp)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 px-3 py-3">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={connected ? "메시지 입력... (@비트램 으로 AI에게 질문)" : "연결 중..."}
              disabled={!connected}
              maxLength={500}
              className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 rounded-xl text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 transition disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!connected || !inputValue.trim()}
              className="shrink-0 w-10 h-10 flex items-center justify-center bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-xl transition disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          {inputValue.length > 400 && (
            <div className="text-right mt-1">
              <span className={`text-[10px] ${inputValue.length > 480 ? "text-red-500" : "text-slate-400"}`}>
                {inputValue.length}/500
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

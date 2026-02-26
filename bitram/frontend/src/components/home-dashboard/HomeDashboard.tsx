"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import BitramLogo, { BitramMark } from "@/components/brand/BitramLogo";
import NotificationBell from "@/components/NotificationBell";
import {
  Bot as BotIcon,
  ChartColumn,
  Eye,
  Flame,
  ThumbsUp,
  MessageCircle,
  Puzzle,
  ReceiptText,
  ShieldCheck,
  Store,
  type LucideIcon,
} from "lucide-react";
import type {
  Bot,
  CommunityBoard,
  DashboardOverview,
  FeedItem,
  HotStrategy,
  MarketQuote,
  PostListItem,
  StrategyRankingItem,
  TopTrader,
  TrendingPost,
  ExternalFeedItem,
  OnboardingStatus,
  UserPointsInfo,
  FollowFeedItem,
} from "@/types";

const HOME_NAV_ITEMS = [
  { href: "/dashboard", label: "대시보드", icon: ChartColumn },
  { href: "/strategies", label: "전략", icon: Puzzle },
  { href: "/bots", label: "봇", icon: BotIcon },
  { href: "/marketplace", label: "마켓", icon: Store },
  { href: "/trades", label: "거래내역", icon: ReceiptText },
  { href: "/community", label: "커뮤니티", icon: MessageCircle },
];

function kstTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function timeAgo(input: string | number | null | undefined): string {
  if (input == null) return "";
  const now = Date.now();
  const then =
    typeof input === "number"
      ? input * (input > 10_000_000_000 ? 1 : 1000) // allow ms or s
      : new Date(input).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function CategoryPill({
  category,
}: {
  category: PostListItem["category"] | TrendingPost["category"] | FeedItem["type"];
}) {
  const map: Record<string, { label: string; cls: string }> = {
    profit: {
      label: "수익",
      cls: "bg-emerald-500/15 text-emerald-600 border-emerald-400/20",
    },
    strategy: {
      label: "전략",
      cls: "bg-blue-500/10 text-blue-600 border-blue-400/20",
    },
    question: {
      label: "질문",
      cls: "bg-amber-500/15 text-amber-600 border-amber-400/20",
    },
    chart: {
      label: "차트",
      cls: "bg-violet-500/10 text-violet-600 border-violet-400/20",
    },
    news: {
      label: "뉴스",
      cls: "bg-cyan-500/10 text-cyan-600 border-cyan-400/20",
    },
    humor: {
      label: "유머",
      cls: "bg-pink-500/10 text-pink-600 border-pink-400/20",
    },
    free: {
      label: "자유",
      cls: "bg-slate-500/15 text-slate-600 border-gray-400/20",
    },
    post: {
      label: "글",
      cls: "bg-slate-500/15 text-slate-600 border-gray-400/20",
    },
  };
  const meta = map[category] || map.free;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full border ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

// ── Skeleton shimmer components ───────────────────────────────────────────
const Sk = ({ className }: { className?: string }) => (
  <div className={`animate-pulse rounded bg-slate-200 dark:bg-slate-700/80 ${className ?? ""}`} />
);

function CoinCardSkeleton() {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 px-3 py-2.5">
      <div className="flex items-center justify-between mb-2">
        <Sk className="h-3.5 w-8" />
        <Sk className="h-3.5 w-10" />
      </div>
      <Sk className="h-4 w-16" />
    </div>
  );
}

function TrendingRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <Sk className="w-6 h-6 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Sk className="h-2.5 w-1/5" />
        <Sk className="h-3.5 w-3/4" />
        <Sk className="h-2.5 w-1/4" />
      </div>
      <div className="flex gap-2 shrink-0">
        <Sk className="h-2.5 w-8" />
        <Sk className="h-2.5 w-8" />
      </div>
    </div>
  );
}

function NewsRowSkeleton() {
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <Sk className="h-3 w-12 shrink-0 mt-0.5" />
      <Sk className="h-3 flex-1" />
    </div>
  );
}

function RankBadge({ n }: { n: number }) {
  const cls =
    n === 1
      ? "bg-yellow-500/20 text-yellow-600"
      : n === 2
        ? "bg-gray-400/20 text-slate-700 dark:text-slate-200"
        : n === 3
          ? "bg-orange-500/20 text-orange-600"
          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400";
  return (
    <span className={`w-7 h-7 rounded-full ${cls} text-xs font-black flex items-center justify-center`}>
      {n}
    </span>
  );
}

function pctClass(pct: number) {
  return pct >= 0 ? "text-emerald-600" : "text-red-600";
}

function pctText(pct: number) {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function formatKrw(n: number) {
  try {
    return `${Math.round(n).toLocaleString()}원`;
  } catch {
    return `${n}원`;
  }
}

function getReturnPct(item: StrategyRankingItem): number | null {
  if (!item.verified_profit || typeof item.verified_profit !== "object") return null;
  const raw = (item.verified_profit as { total_return_pct?: unknown }).total_return_pct;
  const num = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(num) ? num : null;
}

function LiveChatPreview() {
  const [chatMessages, setChatMessages] = useState<{ nickname?: string; emoji?: string; content?: string; timestamp?: number }[]>([]);
  const [chatLoading, setChatLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.getChatHistory()
      .then((r) => { if (mounted) setChatMessages(r.messages.slice(-8)); })
      .catch(() => {})
      .finally(() => { if (mounted) setChatLoading(false); });

    // Poll every 10s for live feel
    const interval = setInterval(() => {
      api.getChatHistory()
        .then((r) => { if (mounted) setChatMessages(r.messages.slice(-8)); })
        .catch(() => {});
    }, 10000);

    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return (
    <section className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-hidden shadow-sm flex flex-col lg:h-[380px]">
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-1 h-5 bg-blue-500 rounded-full" />
          <MessageCircle className="h-4 w-4 text-blue-500" />
          <span className="text-[15px] font-bold text-slate-800 dark:text-slate-100">실시간 채팅</span>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        </div>
        <Link href="/chat" className="text-xs text-slate-400 dark:text-slate-500 hover:text-blue-500 transition">참여하기 →</Link>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {chatLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-2 animate-pulse">
                <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
                <div className="space-y-1 flex-1">
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-16" />
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <MessageCircle className="w-10 h-10 text-slate-300 dark:text-slate-700" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">아직 채팅이 없어요</p>
            <Link href="/chat" className="text-xs text-blue-500 hover:underline">첫 메시지 보내기 →</Link>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <span className="text-sm leading-none">{msg.emoji || "👤"}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{msg.nickname || "익명"}</span>
                  <p className="text-sm text-slate-700 dark:text-slate-200 break-words leading-snug">{msg.content}</p>
                </div>
                {msg.timestamp && (
                  <span className="text-[10px] text-slate-300 dark:text-slate-600 shrink-0 mt-0.5">
                    {new Date(msg.timestamp * 1000).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Link
        href="/chat"
        className="block px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-center text-sm font-medium text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition"
      >
        채팅방 입장하기
      </Link>
    </section>
  );
}

export default function HomeDashboard({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuthStore();
  const navItems = user?.plan === "admin"
    ? [...HOME_NAV_ITEMS, { href: "/admin", label: "관리자", icon: ShieldCheck }]
    : HOME_NAV_ITEMS;

  const [loading, setLoading] = useState(true);
  const [busyCopy, setBusyCopy] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const [botBusy, setBotBusy] = useState<string | null>(null);

  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const prevPricesRef = useRef<Map<string, number>>(new Map());
  const [flashMap, setFlashMap] = useState<Map<string, "up" | "down">>(new Map());
  const flashTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const wsCodesRef = useRef<string[]>([]);
  const [communityBoards, setCommunityBoards] = useState<CommunityBoard[]>([]);
  const [ranking, setRanking] = useState<StrategyRankingItem[]>([]);
  const [rankPeriod, setRankPeriod] = useState<"week" | "month" | "all">("week");

  const [feedPosts, setFeedPosts] = useState<PostListItem[]>([]);
  const [latest, setLatest] = useState<PostListItem[]>([]);
  const [trending, setTrending] = useState<TrendingPost[]>([]);

  const [hotStrategies, setHotStrategies] = useState<HotStrategy[]>([]);
  const [topTraders, setTopTraders] = useState<TopTrader[]>([]);
  const [followStats, setFollowStats] = useState<{ follower_count: number; following_count: number } | null>(null);

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [bots, setBots] = useState<Bot[]>([]);

  const [news, setNews] = useState<ExternalFeedItem[]>([]);
  const [xFeed, setXFeed] = useState<ExternalFeedItem[]>([]);
  const [xConfigured, setXConfigured] = useState<boolean>(true);
  const [xAccounts, setXAccounts] = useState<Array<{ username: string; url: string }>>([]);

  const [followSuggestions, setFollowSuggestions] = useState<Array<{ user_id: string; nickname: string; bio: string; post_count: number; strategy_count: number; follower_count: number }>>([]);

  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [myPoints, setMyPoints] = useState<UserPointsInfo | null>(null);
  const [followFeed, setFollowFeed] = useState<FollowFeedItem[]>([]);
  const [feedTab, setFeedTab] = useState<"profit" | "following">("profit");

  const containerClass = embedded ? "" : "max-w-7xl mx-auto px-4 py-4 sm:py-6";

  // sessionStorage 캐시 헬퍼 (즉시 표시용)
  const ssGet = (key: string) => { try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } };
  const ssSet = (key: string, val: unknown) => { try { sessionStorage.setItem(key, JSON.stringify(val)); } catch {} };

  const refreshPublic = async () => {
    // 핵심 데이터만 블로킹 (빠름): 시세 + 트렌딩 + 최신글 + 핫전략 + 탑트레이더
    const [q, t, l, hs, tt] = await Promise.all([
      api.getMarketQuotes().catch(() => ({ quotes: [] as MarketQuote[] })),
      api.getTrending().catch(() => [] as TrendingPost[]),
      api.getPosts({ sort: "latest", page: 1 }).catch(() => [] as PostListItem[]),
      api.getHotStrategies().catch(() => [] as HotStrategy[]),
      api.getTopTraders("week").catch(() => [] as TopTrader[]),
    ]);

    const quotes = (q as any).quotes || [];
    const trending = t as TrendingPost[];
    const latest = l as PostListItem[];
    setQuotes(quotes);
    setTrending(trending);
    setLatest(latest);
    setHotStrategies(hs as HotStrategy[]);
    setTopTraders(tt as TopTrader[]);

    const profitFeed = latest
      .filter((p) => p.category === "profit" || p.verified_profit_pct != null)
      .slice(0, 18);
    setFeedPosts(profitFeed);

    ssSet("dash:quotes", quotes);
    ssSet("dash:trending", trending);
  };

  const refreshNews = async () => {
    // 뉴스/게시판은 느릴 수 있으므로 별도 비동기 (non-blocking)
    const [nw, boards] = await Promise.all([
      api.getNews(12, true).catch(() => ({ items: [] as ExternalFeedItem[] })),
      api.getCommunities().catch(() => [] as CommunityBoard[]),
    ]);
    const newsItems = (nw as any).items || [];
    setNews(newsItems);
    setCommunityBoards(boards as CommunityBoard[]);
    ssSet("dash:news", newsItems);
  };

  const refreshXFeed = async () => {
    const xf = await api
      .getXFeed(20, true)
      .catch(() => ({ items: [] as ExternalFeedItem[], configured: true, accounts: [] as Array<{ username: string; url: string }> }));
    setXFeed((xf as any).items || []);
    setXConfigured(Boolean((xf as any).configured));
    setXAccounts((xf as any).accounts || []);
  };

  const refreshFollowSuggestions = async () => {
    if (!isAuthenticated) return;
    const suggestions = await api.getFollowSuggestions().catch(() => []);
    setFollowSuggestions(suggestions);
  };

  const refreshPrivate = async () => {
    if (!isAuthenticated) {
      setOverview(null);
      setBots([]);
      setFollowStats(null);
      setOnboarding(null);
      setMyPoints(null);
      setFollowFeed([]);
      return;
    }
    const [ov, bs, fs, ob, pts, ff] = await Promise.all([
      api.getDashboard().catch(() => null),
      api.getBots().catch(() => [] as Bot[]),
      api.getMyFollowStats().catch(() => null),
      api.getOnboardingStatus().catch(() => null),
      api.getMyPoints().catch(() => null),
      api.getFollowingFeed().catch(() => [] as FollowFeedItem[]),
    ]);
    setOverview(ov as DashboardOverview | null);
    setBots(bs as Bot[]);
    setFollowStats(fs as any);
    setOnboarding(ob as OnboardingStatus | null);
    setMyPoints(pts as UserPointsInfo | null);
    setFollowFeed(ff as FollowFeedItem[]);

    // Dismiss onboarding if all done
    if (ob) {
      const o = ob as OnboardingStatus;
      if (o.completed >= o.total) {
        setOnboardingDismissed(true);
      }
    }
  };

  useEffect(() => {
    // sessionStorage 캐시로 즉시 표시
    const cachedQuotes = ssGet("dash:quotes");
    const cachedTrending = ssGet("dash:trending");
    const cachedNews = ssGet("dash:news");
    if (cachedQuotes) setQuotes(cachedQuotes);
    if (cachedTrending) setTrending(cachedTrending);
    if (cachedNews) setNews(cachedNews);

    let cancelled = false;
    setLoading(true);
    refreshPublic()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // 뉴스/X피드는 느리므로 완전 비동기 (UI 블로킹 없음)
    refreshNews().catch(() => {});
    refreshXFeed().catch(() => {});
    refreshFollowSuggestions().catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.getStrategyRanking(rankPeriod).then((r) => {
      if (!cancelled) setRanking(r);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [rankPeriod]);

  useEffect(() => {
    refreshPrivate().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    const id = window.setInterval(() => {
      refreshPublic().catch(() => {});
      refreshXFeed().catch(() => {});
    }, 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Per-coin flash trigger with individual timers
  const triggerFlash = useRef((market: string, dir: "up" | "down") => {
    const existing = flashTimersRef.current.get(market);
    if (existing) clearTimeout(existing);
    setFlashMap((prev) => new Map(prev).set(market, dir));
    const timer = setTimeout(() => {
      setFlashMap((prev) => {
        const next = new Map(prev);
        next.delete(market);
        return next;
      });
      flashTimersRef.current.delete(market);
    }, 1200);
    flashTimersRef.current.set(market, timer);
  }).current;

  // Upbit WebSocket for real-time individual price updates
  useEffect(() => {
    if (quotes.length === 0) return;
    const codes = quotes.slice(0, 8).map((q) => q.market);
    // Skip if codes haven't changed
    if (JSON.stringify(codes) === JSON.stringify(wsCodesRef.current) && wsRef.current?.readyState === WebSocket.OPEN) return;
    wsCodesRef.current = codes;

    // Init prevPrices from current quotes
    quotes.forEach((q) => prevPricesRef.current.set(q.market, q.trade_price));

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let alive = true;

    const connect = () => {
      if (!alive) return;
      try {
        ws = new WebSocket("wss://api.upbit.com/websocket/v1");
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        ws.onopen = () => {
          ws?.send(
            JSON.stringify([
              { ticket: "bitram-live" },
              { type: "ticker", codes, isOnlyRealtime: true },
            ])
          );
        };

        ws.onmessage = (event) => {
          try {
            const text = new TextDecoder("utf-8").decode(event.data as ArrayBuffer);
            const d = JSON.parse(text);
            if (d.type !== "ticker" || !d.code) return;

            const newPrice = d.trade_price as number;
            const oldPrice = prevPricesRef.current.get(d.code);

            if (oldPrice !== undefined && oldPrice !== newPrice) {
              triggerFlash(d.code, newPrice > oldPrice ? "up" : "down");
            }
            prevPricesRef.current.set(d.code, newPrice);

            setQuotes((prev) =>
              prev.map((q) =>
                q.market === d.code
                  ? {
                      ...q,
                      trade_price: newPrice,
                      signed_change_rate_pct: (d.signed_change_rate ?? 0) * 100,
                      change: d.change ?? q.change,
                      acc_trade_volume_24h: d.acc_trade_volume_24h ?? q.acc_trade_volume_24h,
                    }
                  : q
              )
            );
          } catch {}
        };

        ws.onclose = () => {
          wsRef.current = null;
          if (alive) reconnectTimer = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        if (alive) reconnectTimer = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      alive = false;
      clearTimeout(reconnectTimer);
      ws?.close();
      wsRef.current = null;
      // Clean up per-coin flash timers
      flashTimersRef.current.forEach((t) => clearTimeout(t));
      flashTimersRef.current.clear();
    };
    // Only reconnect when the set of market codes changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes.length > 0 ? quotes.map((q) => q.market).join(",") : ""]);

  const tickerText = useMemo(() => {
    const parts: string[] = [];

    const btc = quotes.find((q) => q.symbol === "BTC");
    const eth = quotes.find((q) => q.symbol === "ETH");
    if (btc) parts.push(`BTC ${btc.trade_price.toLocaleString()} (${pctText(btc.signed_change_rate_pct)})`);
    if (eth) parts.push(`ETH ${eth.trade_price.toLocaleString()} (${pctText(eth.signed_change_rate_pct)})`);

    const movers = [...quotes]
      .filter((q) => Number.isFinite(q.signed_change_rate_pct))
      .sort((a, b) => Math.abs(b.signed_change_rate_pct) - Math.abs(a.signed_change_rate_pct))
      .slice(0, 4);
    if (movers.length) {
      parts.push(
        `급등/급락: ${movers
          .map((m) => `${m.symbol} ${pctText(m.signed_change_rate_pct)}`)
          .join(" · ")}`
      );
    }

    const n0 = news[0];
    const n1 = news[1];
    if (n0) parts.push(`속보: ${n0.title_ko || n0.title}`);
    if (n1) parts.push(`속보: ${n1.title_ko || n1.title}`);

    const xTop = xFeed[0];
    if (xTop && xConfigured) parts.push(`X: ${xTop.title_ko || xTop.title}`);

    return parts.length ? parts.join("   |   ") : "실시간 데이터를 불러오는 중...";
  }, [quotes, news, xFeed, xConfigured]);

  const tickerInnerRef = useRef<HTMLDivElement>(null);
  const [tickerDuration, setTickerDuration] = useState(60);
  const TICKER_SPEED = 55; // px/s — 고정 속도
  useEffect(() => {
    const el = tickerInnerRef.current;
    if (!el) return;
    const w = el.scrollWidth;
    if (w > 0) setTickerDuration(Math.max(20, w / TICKER_SPEED));
  }, [tickerText]);

  const coinBoardSlugMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const board of communityBoards) {
      const symbol =
        (board.coin_symbol || board.coin_pair?.split("-").pop() || board.slug || "")
          .toUpperCase()
          .trim();
      if (symbol) map.set(symbol, board.slug);
    }
    return map;
  }, [communityBoards]);

  return (
    <div className="min-h-screen">
      {!embedded ? (
        <header className="sticky top-0 z-50 border-b border-slate-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="inline-flex items-center"
              >
                <BitramLogo markClassName="h-5 w-5" />
              </Link>
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md bg-blue-500 text-white text-xs font-bold tracking-tight">
                업비트 노코드 자동매매
              </span>
            </div>
            {isAuthenticated ? (
              <nav className="hidden md:flex items-center gap-1.5">
                {navItems.map((item) => {
                  const Icon: LucideIcon = item.icon;
                  const active = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-base font-medium transition ${
                        active ? "bg-blue-50 dark:bg-blue-500/15 text-blue-500" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden lg:inline">{item.label}</span>
                      <span className="lg:hidden sr-only">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            ) : null}
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              {isAuthenticated ? (
                <>
                  <NotificationBell />
                  <Link
                    href="/settings"
                    className={`text-sm font-medium transition ${
                      pathname.startsWith("/settings") ? "text-blue-500" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                    }`}
                  >
                    {user?.nickname}
                  </Link>
                  <button
                    type="button"
                    onClick={logout}
                    className="px-3 py-1.5 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                  >
                    로그아웃
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                  >
                    로그인
                  </Link>
                  <Link
                    href="/register"
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-blue-500 text-white hover:bg-blue-500 transition"
                  >
                    무료 시작
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>
      ) : null}

      <main className={`${containerClass} text-sm ${!embedded && isAuthenticated ? "pb-28 md:pb-0" : ""}`}>
        {/* Hero Banner for non-authenticated */}
        {!isAuthenticated && (
          <section className="mb-5 rounded-2xl overflow-hidden shadow-sm bg-gradient-to-br from-blue-500 to-blue-600 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded-md bg-white/20 text-white text-sm font-bold">Upbit</span>
                  <span className="px-2 py-0.5 rounded-md bg-white/20 text-white text-sm font-bold">No-Code</span>
                  <span className="px-2 py-0.5 rounded-md bg-white/20 text-white text-sm font-bold">Auto Trading</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">
                  업비트 노코드 자동매매
                </h2>
                <p className="mt-2 text-sm text-white/80 leading-relaxed max-w-lg">
                  코딩 없이 전략을 만들고, AI가 최적화하고, 봇이 24시간 자동으로 매매합니다.
                  <br className="hidden sm:block" />
                  전략 복사 한 번이면 바로 시작할 수 있습니다.
                </p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <Link
                  href="/register"
                  className="px-6 py-3 rounded-xl bg-white text-blue-600 text-sm font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all text-center"
                >
                  무료로 시작하기
                </Link>
                <Link
                  href="/strategies/ai"
                  className="px-6 py-2.5 rounded-xl bg-white/15 text-white text-sm font-semibold hover:bg-white/25 transition text-center"
                >
                  AI 전략 미리보기
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Top: LED Ticker Board */}
        <section className="rounded-2xl overflow-hidden shadow-lg led-panel border border-slate-600/40 dark:border-slate-700/50">
          <div className="bg-[#1c1c1c] dark:bg-[#080808]">
            {/* LED scrolling ticker */}
            <div className="px-4 py-2.5 flex items-center gap-3 border-b border-slate-600/40 dark:border-slate-800/80">
              <span className="relative inline-flex items-center gap-1.5 text-[10px] font-black px-2 py-1 rounded bg-red-500/20 text-red-400 border border-red-500/30 led-glow">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                </span>
                LIVE
              </span>
              <div className="flex-1 overflow-hidden">
                <div className="ticker">
                  <div className="ticker__inner" ref={tickerInnerRef} style={{ animationDuration: `${tickerDuration}s` }}>
                    <span className="led-text text-sm text-white">{tickerText}</span>
                    <span className="mx-6 text-slate-500">•</span>
                    <span className="led-text text-sm text-white">{tickerText}</span>
                  </div>
                </div>
              </div>
              <Link
                href="/strategies/ai"
                className="hidden sm:inline-flex px-3 py-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition led-text"
              >
                AI 전략 찾기
              </Link>
            </div>

            {/* LED coin cards */}
            <div className="px-3 py-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
              {loading && quotes.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="rounded-lg bg-[#242424] dark:bg-[#111] border border-slate-600/30 dark:border-slate-800 px-3 py-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="animate-pulse h-3.5 w-8 rounded bg-slate-800" />
                      <div className="animate-pulse h-3.5 w-10 rounded bg-slate-800" />
                    </div>
                    <div className="animate-pulse h-4 w-16 rounded bg-slate-800" />
                  </div>
                ))
              ) : quotes.length === 0 ? (
                <div className="col-span-full text-sm led-text text-amber-500 py-2">시세 데이터 수신 대기 중...</div>
              ) : (
                quotes.slice(0, 8).map((q) => {
                  const boardSlug = coinBoardSlugMap.get((q.symbol || "").toUpperCase());
                  const href = boardSlug ? `/community?board=${boardSlug}` : "/community";
                  const isUp = q.signed_change_rate_pct >= 0;
                  const flash = flashMap.get(q.market);
                  return (
                  <Link
                    key={q.market}
                    href={href}
                    className={`relative rounded-lg bg-[#242424] dark:bg-[#0e0e0e] border border-slate-600/30 dark:border-slate-800/80 px-3 py-2.5 min-w-0 block transition hover:border-slate-500 dark:hover:border-slate-600 group ${flash === "up" ? "price-flash-up" : flash === "down" ? "price-flash-down" : ""}`}
                  >
                    <div className={`absolute bottom-0 inset-x-0 h-[2px] ${isUp ? "bg-emerald-500/50" : "bg-red-500/50"}`} />
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="text-sm font-black text-slate-300 whitespace-nowrap led-glow">{q.symbol}</span>
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded whitespace-nowrap ${isUp ? "bg-emerald-500/10 text-emerald-400 led-glow" : "bg-red-500/10 text-red-400 led-glow"}`}>
                        {pctText(q.signed_change_rate_pct)}
                      </span>
                    </div>
                    <div className={`text-sm font-black whitespace-nowrap led-glow ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                      {q.trade_price.toLocaleString()}<span className="text-[10px] font-normal text-slate-600 ml-0.5">원</span>
                    </div>
                  </Link>
                )})
              )}
            </div>
          </div>
        </section>

        {/* ── Community Hot Topics + Live Chat ─────────────────── */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 인기글 */}
          <section className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-hidden shadow-sm flex flex-col lg:h-[380px]">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 bg-orange-500 rounded-full" />
                <Flame className="h-4 w-4 text-orange-500" />
                <span className="text-[15px] font-bold text-slate-800 dark:text-slate-100">인기글</span>
                <span className="text-[10px] text-orange-600 bg-orange-400/10 px-2 py-0.5 rounded-full font-black tracking-wide">TOP 5</span>
              </div>
              <Link href="/community" className="text-xs text-slate-400 dark:text-slate-500 hover:text-blue-500 transition">더보기 →</Link>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading && trending.length === 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {Array.from({ length: 5 }).map((_, i) => <TrendingRowSkeleton key={i} />)}
                </div>
              ) : trending.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 h-full">
                  <span className="text-2xl">🔥</span>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">아직 인기글이 없어요</p>
                  <Link href="/community/new" className="text-xs text-blue-500 hover:underline">첫 글 작성하기 →</Link>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {trending.slice(0, 5).map((t, idx) => (
                    <Link
                      key={t.id}
                      href={`/community/${t.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition group"
                    >
                      <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${
                        idx === 0 ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-500"
                          : idx === 1 ? "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                          : idx === 2 ? "bg-orange-500/15 text-orange-600"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                      }`}>{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 group-hover:text-blue-500 transition truncate leading-snug">
                          {t.title}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                          {t.author.level != null && <span className="text-[10px] font-black text-blue-500">Lv.{t.author.level}</span>}
                          <span>{t.author.nickname}</span>
                          <span className="inline-flex items-center gap-0.5"><ThumbsUp className="h-3 w-3" />{t.like_count}</span>
                          <span className="inline-flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{t.comment_count}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* 실시간 채팅 미리보기 */}
          <LiveChatPreview />
        </div>

        {/* Onboarding — compact progress bar */}
        {isAuthenticated && onboarding && !onboardingDismissed && onboarding.completed < onboarding.total && (
          <div className="mt-6 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-blue-500/8 dark:bg-blue-500/10 border border-blue-200/40 dark:border-blue-500/20">
            <span className="text-[11px] font-bold text-blue-500 shrink-0">시작 가이드</span>
            <div className="flex-1 h-1 bg-blue-100 dark:bg-blue-900/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${(onboarding.completed / onboarding.total) * 100}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">{onboarding.completed}/{onboarding.total}</span>
            {myPoints && <span className="text-[11px] font-black text-blue-500 shrink-0">Lv.{myPoints.level}</span>}
            <Link href="/settings" className="text-[11px] text-blue-500 hover:underline shrink-0">자세히</Link>
            <button onClick={() => setOnboardingDismissed(true)} className="text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 transition shrink-0 text-base leading-none">×</button>
          </div>
        )}

        {/* News + X (translated) */}
        <section className="mt-8 grid lg:grid-cols-12 gap-6">
          <section className="lg:col-span-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 bg-violet-500 rounded-full" />
                <span className="text-[15px] font-bold text-slate-800 dark:text-slate-100">코인 뉴스</span>
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-yellow-400/15 text-yellow-600 dark:text-yellow-400 tracking-wider">⚡FAST</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-500 dark:text-violet-400">AI번역</span>
              </div>
              <Link href="/news" className="text-xs text-slate-400 dark:text-slate-500 hover:text-blue-500 transition">
                전체보기 →
              </Link>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {news.length === 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {Array.from({ length: 5 }).map((_, i) => <NewsRowSkeleton key={i} />)}
                </div>
              ) : (
                news.slice(0, 5).map((n, i) => (
                  <a
                    key={`${n.url}-${i}`}
                    href={n.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">{n.source}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">{timeAgo(n.published_ts ?? n.published_at)}</span>
                      </div>
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-blue-500 transition line-clamp-2 leading-snug">{n.title_ko || n.title}</div>
                    </div>
                    <svg className="w-3 h-3 text-slate-300 dark:text-slate-600 shrink-0 mt-1 group-hover:text-blue-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>
                ))
              )}
            </div>
          </section>

          <section className="lg:col-span-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 bg-slate-800 dark:bg-slate-200 rounded-full" />
                <span className="text-[15px] font-bold text-slate-800 dark:text-slate-100">X 피드</span>
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-yellow-400/15 text-yellow-600 dark:text-yellow-400 tracking-wider">⚡FAST</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-500 dark:text-violet-400">AI번역</span>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/x" className="text-xs text-blue-500 hover:text-blue-500 hover:underline">
                  전체보기
                </Link>
                <span className={`text-xs px-2 py-0.5 rounded-full ${xConfigured ? "bg-emerald-400/10 text-emerald-600" : "bg-amber-400/10 text-amber-600"}`}>
                  {xConfigured ? "ON" : "SETUP"}
                </span>
              </div>
            </div>
            <div className="p-3 space-y-2">
              {!xConfigured ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  백엔드 `.env`에 `X_FEED_URLS`(콤마로 여러개) 설정하면 여기에 표시됩니다.
                </div>
              ) : xFeed.length === 0 ? (
                xAccounts.length === 0 ? (
                  <div className="space-y-1.5 py-1">
                    {Array.from({ length: 4 }).map((_, i) => <NewsRowSkeleton key={i} />)}
                  </div>
                ) : xAccounts.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">추천 크립토 계정</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {xAccounts.slice(0, 10).map((acc) => (
                        <a
                          key={acc.username}
                          href={acc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 p-2 rounded-lg bg-slate-50/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-500/30 hover:shadow-sm transition"
                        >
                          <span className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-black text-slate-500 dark:text-slate-400">𝕏</span>
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">@{acc.username}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 dark:text-slate-400">피드 데이터가 없습니다.</div>
                )
              ) : (
                <>
                  {xFeed.slice(0, 5).map((x, i) => (
                    <a
                      key={`${x.url}-${i}`}
                      href={x.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">{x.source}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">{timeAgo(x.published_ts ?? x.published_at)}</span>
                      </div>
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-500 transition line-clamp-1">{x.title_ko || x.title}</div>
                    </a>
                  ))}
                  {followSuggestions.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div className="text-xs text-slate-400 dark:text-slate-500 mb-1.5">추천 팔로우</div>
                      <div className="space-y-1.5">
                        {followSuggestions.slice(0, 5).map((u) => (
                          <Link
                            key={u.user_id}
                            href={`/user/${u.nickname}`}
                            className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-500/30 transition"
                          >
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-emerald-400 flex items-center justify-center text-[11px] font-black text-white shrink-0">
                              {u.nickname.charAt(0)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{u.nickname}</div>
                              <div className="text-[10px] text-slate-400 dark:text-slate-500">
                                글 {u.post_count} · 전략 {u.strategy_count} · 팔로워 {u.follower_count}
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </section>

        {/* Partner Recruitment Banner */}
        <section className="mt-8 rounded-2xl overflow-hidden border border-dashed border-amber-300/60 dark:border-amber-500/30 bg-gradient-to-r from-amber-50/80 via-orange-50/60 to-amber-50/80 dark:from-amber-900/10 dark:via-orange-900/10 dark:to-amber-900/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="text-xl shrink-0">🤝</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">운영 파트너 · 광고주 모집중</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-black animate-pulse">OPEN</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">커뮤니티 운영 · 마케팅 · 콘텐츠 경험자 환영 | 배너 · 스폰서 광고 문의</p>
              </div>
            </div>
            <a
              href="mailto:jyy2co@gmail.com"
              className="shrink-0 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition text-center"
            >
              문의하기
            </a>
          </div>
        </section>

        {/* Main: 2 columns — 추천 팔로우 + 최신 글 */}
        <section className="mt-8 grid lg:grid-cols-12 gap-5">
          {/* Left: 추천 팔로우 */}
          <section className="lg:col-span-4 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 bg-blue-500 rounded-full" />
                <span className="text-[15px] font-bold text-slate-800 dark:text-slate-100">추천 팔로우</span>
              </div>
              <Link href="/community" className="text-xs text-blue-500 hover:underline">전체보기</Link>
            </div>
            <div className="p-3 space-y-2">
              {followSuggestions.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
                  {loading ? "불러오는 중..." : isAuthenticated ? "추천할 유저가 없습니다." : "로그인하면 추천 유저를 볼 수 있어요."}
                </div>
              ) : (
                followSuggestions.slice(0, 6).map((u) => (
                  <Link
                    key={u.user_id}
                    href={`/user/${u.nickname}`}
                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-500/30 hover:shadow-sm transition"
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-emerald-400 flex items-center justify-center text-sm font-black text-white shrink-0">
                      {u.nickname.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{u.nickname}</div>
                      {u.bio ? (
                        <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">{u.bio}</div>
                      ) : (
                        <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                          글 {u.post_count} · 전략 {u.strategy_count} · 팔로워 {u.follower_count}
                        </div>
                      )}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>

          {/* Right: 최신 글 */}
          <section className="lg:col-span-8 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                <span className="text-[15px] font-bold text-slate-800 dark:text-slate-100">최신 글</span>
              </div>
              <div className="flex items-center gap-2">
                {isAuthenticated && (
                  <Link
                    href="/community/new"
                    className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-semibold hover:bg-blue-600 transition"
                  >
                    글쓰기
                  </Link>
                )}
                <Link href="/community" className="text-xs text-blue-500 hover:underline">전체보기</Link>
              </div>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {latest.length === 0 ? (
                <div className="p-6 text-sm text-slate-500 dark:text-slate-400">{loading ? "불러오는 중..." : "아직 게시글이 없습니다."}</div>
              ) : (
                latest.slice(0, 8).map((p) => (
                  <Link
                    key={p.id}
                    href={`/community/${p.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                  >
                    <CategoryPill category={p.category as any} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{p.title}</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 shrink-0">
                      <span>{p.author.nickname}</span>
                      <span>👍{p.like_count}</span>
                      <span>💬{p.comment_count}</span>
                      <span>{timeAgo(p.created_at)}</span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>
        </section>

        {/* Bottom: My bots/performance */}
        <section className="mt-5 rounded-2xl overflow-hidden shadow-sm">
          {/* Header with gradient */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-3.5 sm:px-5 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="text-sm sm:text-base font-bold text-white">내 봇 / 내 수익</div>
                {myPoints && (
                  <span className="text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-white/15 text-white/90 font-bold backdrop-blur">
                    Lv.{myPoints.level} · {myPoints.total_points}P
                  </span>
                )}
              </div>
              {isAuthenticated ? (
                <div className="flex items-center gap-2 sm:gap-3">
                  <Link href="/bots" className="text-xs sm:text-sm text-white/70 hover:text-white transition">
                    봇 관리
                  </Link>
                  <Link href="/trades" className="text-xs sm:text-sm text-white/70 hover:text-white transition">
                    거래내역
                  </Link>
                </div>
              ) : (
                <Link href="/login" className="text-sm text-white/70 hover:text-white transition">
                  로그인해서 내 데이터 보기
                </Link>
              )}
            </div>
          </div>

          {!isAuthenticated ? (
            <div className="bg-white dark:bg-slate-900 border border-t-0 border-slate-200/60 dark:border-slate-700/60 rounded-b-2xl p-3.5 sm:p-5">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 p-3 sm:p-4 text-center">
                  <div className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mb-1">오늘 수익</div>
                  <div className="text-base sm:text-lg font-black text-slate-300 dark:text-slate-600">-</div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 p-3 sm:p-4 text-center">
                  <div className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mb-1">활성 봇</div>
                  <div className="text-base sm:text-lg font-black text-slate-300 dark:text-slate-600">-</div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 p-3 sm:p-4 text-center">
                  <div className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mb-1">팔로워</div>
                  <div className="text-base sm:text-lg font-black text-slate-300 dark:text-slate-600">-</div>
                </div>
              </div>
              <div className="mt-4 text-center">
                <Link href="/register" className="inline-flex px-6 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-bold hover:bg-blue-600 transition">
                  무료로 시작하기
                </Link>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-t-0 border-slate-200/60 dark:border-slate-700/60 rounded-b-2xl">
              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100 dark:divide-slate-800 border-b border-slate-100 dark:border-slate-800">
                <div className="p-3 sm:p-5">
                  <div className="text-xs sm:text-sm text-slate-400 dark:text-slate-500">누적 수익</div>
                  <div className={`mt-1 sm:mt-1.5 text-base sm:text-xl font-black ${overview?.performance.total_profit != null ? (overview.performance.total_profit >= 0 ? "text-emerald-600" : "text-red-600") : "text-slate-700 dark:text-slate-200"}`}>
                    {overview ? `${overview.performance.total_profit >= 0 ? "+" : ""}${formatKrw(overview.performance.total_profit)}` : "0원"}
                  </div>
                </div>
                <div className="p-3 sm:p-5">
                  <div className="text-xs sm:text-sm text-slate-400 dark:text-slate-500">총 거래</div>
                  <div className="mt-1 sm:mt-1.5 text-base sm:text-xl font-black text-slate-700 dark:text-slate-200">{overview ? `${overview.performance.total_trades.toLocaleString()}회` : "0회"}</div>
                </div>
                <div className="p-3 sm:p-5">
                  <div className="text-xs sm:text-sm text-slate-400 dark:text-slate-500">승률</div>
                  <div className="mt-1 sm:mt-1.5 text-base sm:text-xl font-black text-slate-700 dark:text-slate-200">{overview ? `${overview.performance.win_rate}%` : "0%"}</div>
                </div>
                <div className="p-3 sm:p-5">
                  <div className="text-xs sm:text-sm text-slate-400 dark:text-slate-500">팔로워 / 팔로잉</div>
                  <div className="mt-1 sm:mt-1.5 text-base sm:text-xl font-black text-slate-700 dark:text-slate-200">
                    {(followStats?.follower_count ?? 0).toLocaleString()} / {(followStats?.following_count ?? 0).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Bots section */}
              <div className="p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-bold text-slate-700 dark:text-slate-200">실행 중 봇</div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 font-bold">
                      {bots.filter((b) => b.status === "running").length}개 활성
                    </span>
                  </div>
                  <Link href="/bots" className="text-xs text-blue-500 hover:underline">전체보기</Link>
                </div>
                {bots.length === 0 ? (
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center">
                    <div className="text-3xl mb-2">🤖</div>
                    <div className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-1">아직 등록된 봇이 없어요</div>
                    <div className="text-sm text-slate-400 dark:text-slate-500 mb-3">전략을 만들고 봇을 실행해보세요</div>
                    <Link href="/strategies" className="inline-flex px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-bold hover:bg-blue-600 transition">
                      전략 만들기
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {bots.slice(0, 6).map((b) => {
                      const isRunning = b.status === "running";
                      const isBusy = botBusy === b.id;
                      return (
                        <div key={b.id} className={`rounded-xl border p-4 transition ${isRunning ? "bg-white dark:bg-slate-900 border-emerald-200/60 shadow-sm" : "bg-slate-50 dark:bg-slate-800 border-slate-200/60 dark:border-slate-700/60"}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${isRunning ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" : "bg-slate-300"}`} />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{b.name}</span>
                              </div>
                              <div className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-400 dark:text-slate-500">
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-medium">{b.pair ? b.pair.replace("KRW-", "") : "-"}</span>
                                <span>{isRunning ? "운영중" : "정지"}</span>
                              </div>
                            </div>
                            <div className={`text-sm font-black whitespace-nowrap ${b.total_profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                              {b.total_profit >= 0 ? "+" : ""}
                              {formatKrw(b.total_profit)}
                            </div>
                          </div>

                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={async () => {
                                setBotBusy(b.id);
                                try {
                                  if (isRunning) await api.stopBot(b.id);
                                  else await api.startBot(b.id);
                                  const updated = await api.getBots().catch(() => []);
                                  setBots(updated as Bot[]);
                                } finally {
                                  setBotBusy(null);
                                }
                              }}
                              className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition disabled:opacity-50 ${
                                isRunning ? "bg-red-50 text-red-500 border border-red-200/60 hover:bg-red-100" : "bg-emerald-500 text-white hover:bg-emerald-600"
                              }`}
                            >
                              {isRunning ? "중지" : "시작"}
                            </button>
                            <Link
                              href="/bots"
                              className="flex-1 text-center px-3 py-2 rounded-lg text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                            >
                              관리
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {!embedded ? (
          <footer className="mt-10 py-10 text-sm text-slate-500 dark:text-slate-400">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="font-bold text-slate-600 dark:text-slate-300">BITRAM</div>
                <div className="text-xs mt-1">
                  본 서비스는 투자자문이 아니며, 모든 투자 판단과 책임은 사용자에게 있습니다.
                </div>
              </div>
              <div className="text-xs">© 2026 BitramLab.</div>
            </div>
          </footer>
        ) : null}
      </main>

      {/* Mobile Bottom Nav (only for non-embedded authenticated view) */}
      {!embedded && isAuthenticated ? (
        <nav className="md:hidden fixed bottom-3 inset-x-0 z-50 px-3">
          <div className="relative mx-auto max-w-md rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 p-2 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
            <div className="flex items-center justify-between gap-0.5">
              {navItems.map((item) => {
                const Icon: LucideIcon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 transition-all duration-200 ${
                      active
                        ? "bg-blue-50 dark:bg-blue-500/15 text-blue-500 shadow-[inset_0_0_0_1px_rgba(49,130,246,0.2)]"
                        : "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? "drop-shadow-[0_0_8px_rgba(49,130,246,0.5)]" : ""}`} />
                    <span className="truncate text-xs font-medium leading-none whitespace-nowrap">
                      {item.label}
                    </span>
                    {active ? <span className="absolute -top-1 h-1.5 w-6 rounded-full bg-blue-500/80" /> : null}
                  </Link>
                );
              })}
            </div>
            <div className="pointer-events-none absolute inset-x-6 -top-px h-px bg-gradient-to-r from-transparent via-blue-300/25 to-transparent" />
          </div>
        </nav>
      ) : null}

      <style jsx>{`
        .ticker {
          position: relative;
          width: 100%;
          overflow: hidden;
          white-space: nowrap;
        }
        .ticker__inner {
          display: inline-block;
          padding-left: 100%;
          animation: marquee linear infinite;
        }
        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-100%);
          }
        }
      `}</style>
      <style jsx global>{`
        /* LED dot-matrix overlay */
        .led-panel { position: relative; }
        .led-panel::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px);
          background-size: 4px 4px;
          pointer-events: none;
          border-radius: inherit;
        }
        .led-text {
          font-family: 'Courier New', 'Lucida Console', 'Monaco', monospace;
          letter-spacing: 0.5px;
        }
        .led-glow {
        }
        /* Flash: border-only, no background change */
        @keyframes priceFlashUp {
          0% { box-shadow: inset 0 0 0 2px rgba(16, 185, 129, 0.9), 0 0 16px rgba(16, 185, 129, 0.35); }
          60% { box-shadow: inset 0 0 0 1px rgba(16, 185, 129, 0.4), 0 0 6px rgba(16, 185, 129, 0.1); }
          100% { box-shadow: none; }
        }
        @keyframes priceFlashDown {
          0% { box-shadow: inset 0 0 0 2px rgba(239, 68, 68, 0.9), 0 0 16px rgba(239, 68, 68, 0.35); }
          60% { box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.4), 0 0 6px rgba(239, 68, 68, 0.1); }
          100% { box-shadow: none; }
        }
        .price-flash-up { animation: priceFlashUp 1.2s ease-out; }
        .price-flash-down { animation: priceFlashDown 1.2s ease-out; }
      `}</style>
    </div>
  );
}

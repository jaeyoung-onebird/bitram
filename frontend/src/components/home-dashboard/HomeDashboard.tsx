"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  Heart,
  MessageCircle,
  Puzzle,
  ReceiptText,
  ShieldCheck,
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

  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [myPoints, setMyPoints] = useState<UserPointsInfo | null>(null);
  const [followFeed, setFollowFeed] = useState<FollowFeedItem[]>([]);
  const [feedTab, setFeedTab] = useState<"profit" | "following">("profit");

  const containerClass = embedded ? "" : "max-w-7xl mx-auto px-4 py-4 sm:py-6";

  const refreshPublic = async () => {
    const [q, t, l, hs, tt, nw, boards] = await Promise.all([
      api.getMarketQuotes().catch(() => ({ quotes: [] as MarketQuote[] })),
      api.getTrending().catch(() => [] as TrendingPost[]),
      api.getPosts({ sort: "latest", page: 1 }).catch(() => [] as PostListItem[]),
      api.getHotStrategies().catch(() => [] as HotStrategy[]),
      api.getTopTraders("week").catch(() => [] as TopTrader[]),
      api.getNews(12, true).catch(() => ({ items: [] as ExternalFeedItem[] })),
      api.getCommunities().catch(() => [] as CommunityBoard[]),
    ]);

    setQuotes((q as any).quotes || []);
    setTrending(t as TrendingPost[]);
    setLatest(l as PostListItem[]);
    setHotStrategies(hs as HotStrategy[]);
    setTopTraders(tt as TopTrader[]);
    setNews((nw as any).items || []);
    setCommunityBoards(boards as CommunityBoard[]);

    const profitFeed = (l as PostListItem[])
      .filter((p) => p.category === "profit" || p.verified_profit_pct != null)
      .slice(0, 18);
    setFeedPosts(profitFeed);
  };

  const refreshXFeed = async () => {
    const xf = await api
      .getXFeed(20, true)
      .catch(() => ({ items: [] as ExternalFeedItem[], configured: true, accounts: [] as Array<{ username: string; url: string }> }));
    setXFeed((xf as any).items || []);
    setXConfigured(Boolean((xf as any).configured));
    setXAccounts((xf as any).accounts || []);
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
    let cancelled = false;
    setLoading(true);
    refreshPublic()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // X feed can be slow due external RSS/translation. Load it separately.
    refreshXFeed().catch(() => {});
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

    const headline = news[0];
    if (headline) parts.push(`속보: ${headline.title_ko || headline.title}`);

    const xTop = xFeed[0];
    if (xTop && xConfigured) parts.push(`X: ${xTop.title_ko || xTop.title}`);

    return parts.length ? parts.join("   |   ") : "실시간 데이터를 불러오는 중...";
  }, [quotes, news, xFeed, xConfigured]);

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

        {/* Top: Market / Breaking ticker */}
        <section className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800 overflow-hidden shadow-sm">
          <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-200/60 dark:border-slate-700/60">
            <span className="text-xs font-black px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 border border-emerald-400/20">
              LIVE
            </span>
            <div className="flex-1 overflow-hidden">
              <div className="ticker">
                <div className="ticker__inner">
                  <span className="text-sm text-slate-700 dark:text-slate-200">{tickerText}</span>
                  <span className="mx-6 text-slate-500 dark:text-slate-400">•</span>
                  <span className="text-sm text-slate-700 dark:text-slate-200">{tickerText}</span>
                </div>
              </div>
            </div>
            <Link
              href="/strategies/ai"
              className="hidden sm:inline-flex px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-500 text-sm font-semibold transition"
            >
              AI 전략 찾기
            </Link>
          </div>
          <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {quotes.length === 0 ? (
              <div className="col-span-full text-sm text-slate-500 dark:text-slate-400">{loading ? "시세 불러오는 중..." : "시세 데이터가 없습니다."}</div>
            ) : (
              quotes.slice(0, 8).map((q) => {
                const boardSlug = coinBoardSlugMap.get((q.symbol || "").toUpperCase());
                const href = boardSlug ? `/community/boards/${boardSlug}` : "/community/boards";
                return (
                <Link
                  key={q.market}
                  href={href}
                  className="rounded-xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 px-3 py-2 min-w-0 block transition hover:border-blue-300/60 dark:hover:border-blue-500/40 hover:bg-blue-50/40 dark:hover:bg-blue-900/10"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">{q.symbol}</span>
                    <span className={`text-xs font-black whitespace-nowrap ${pctClass(q.signed_change_rate_pct)}`}>
                      {pctText(q.signed_change_rate_pct)}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">{q.trade_price.toLocaleString()}<span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 ml-0.5">원</span></div>
                  <div className="mt-0.5 text-sm text-slate-400 dark:text-slate-500 whitespace-nowrap truncate"><span className="text-[10px]">vol </span>{Math.round(q.acc_trade_volume_24h).toLocaleString()}</div>
                </Link>
              )})
            )}
          </div>
        </section>

        {/* Partner Recruitment Banner */}
        <section className="mt-5 rounded-2xl overflow-hidden border border-amber-300/40 dark:border-amber-500/20 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 dark:from-amber-900/20 dark:via-orange-900/15 dark:to-amber-900/20 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0 mt-0.5">🤝</span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">운영 파트너 모집중</h3>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-bold animate-pulse">모집중</span>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  BITRAM 플랫폼을 함께 성장시킬 운영 파트너를 찾습니다. 코인 커뮤니티 운영, 마케팅, 콘텐츠 제작 경험이 있는 분을 환영합니다.
                </p>
              </div>
            </div>
            <a
              href="mailto:jyy2co@gmail.com"
              className="shrink-0 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition text-center shadow-sm"
            >
              문의하기
            </a>
          </div>
        </section>

        {/* Onboarding Checklist + Level Badge */}
        {isAuthenticated && onboarding && !onboardingDismissed && (
          <section className="mt-5 rounded-2xl border border-blue-200/60 dark:border-blue-500/20 bg-blue-50/50 dark:bg-slate-800/80 overflow-hidden shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-base font-bold text-blue-600 dark:text-blue-400">시작 가이드</div>
                {myPoints && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500 text-white font-bold">
                    Lv.{myPoints.level} {myPoints.level_name} · {myPoints.total_points}P
                  </span>
                )}
              </div>
              <button
                onClick={() => setOnboardingDismissed(true)}
                className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition"
              >
                닫기
              </button>
            </div>
            <div className="w-full h-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${onboarding.completed * 20}%` }}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { done: onboarding.steps.first_strategy, label: "첫 전략 만들기", href: "/strategies" },
                { done: onboarding.steps.first_backtest, label: "백테스트 실행", href: "/strategies" },
                { done: onboarding.steps.first_post, label: "첫 글 작성", href: "/community/new" },
                { done: onboarding.steps.first_follow, label: "유저 팔로우", href: "/community" },
                { done: onboarding.steps.api_key_added, label: "API 키 등록", href: "/settings" },
              ].map((step) => (
                <Link
                  key={step.label}
                  href={step.href}
                  className={`p-2 rounded-lg text-center text-xs font-medium transition ${
                    step.done
                      ? "bg-blue-100 dark:bg-blue-500/20 text-blue-500 line-through"
                      : "bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/15"
                  }`}
                >
                  {step.done ? "✓ " : ""}{step.label}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Community Hot Topics ─────────────────────────── */}
        {trending.length > 0 && (
          <section className="mt-5 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                <div className="text-base font-bold dark:text-slate-100">커뮤니티 핫토픽</div>
                <span className="text-xs text-orange-600 bg-orange-400/10 px-2 py-0.5 rounded-full font-bold">HOT</span>
              </div>
              <Link href="/community" className="text-xs text-blue-500 hover:underline">더보기</Link>
            </div>

            <div className="p-3 grid sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {trending.slice(0, 5).map((t, idx) => (
                <Link
                  key={t.id}
                  href={`/community/${t.id}`}
                  className="group block p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 hover:border-blue-400/40 dark:hover:border-blue-500/30 hover:shadow-sm transition"
                >
                  {/* Rank + Category */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${
                      idx === 0 ? "bg-yellow-500/20 text-yellow-600"
                        : idx === 1 ? "bg-gray-400/20 text-slate-700 dark:text-slate-200"
                        : idx === 2 ? "bg-orange-500/20 text-orange-600"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                    }`}>
                      {idx + 1}
                    </span>
                    <CategoryPill category={t.category as any} />
                    {t.has_strategy && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 shrink-0">전략</span>
                    )}
                  </div>

                  {/* Title */}
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-200 line-clamp-2 group-hover:text-blue-500 transition min-h-[2.5rem]">
                    {t.title}
                  </div>

                  {/* Author */}
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                    {t.author.level != null && (
                      <span className="text-[10px] font-black text-blue-500">Lv.{t.author.level}</span>
                    )}
                    <span className="truncate">{t.author.nickname}</span>
                  </div>

                  {/* Engagement stats */}
                  <div className="mt-2 flex items-center gap-2.5 text-xs text-slate-400 dark:text-slate-500">
                    <span className="inline-flex items-center gap-0.5">
                      <Heart className="h-3 w-3" />
                      {t.like_count}
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <MessageCircle className="h-3 w-3" />
                      {t.comment_count}
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <Eye className="h-3 w-3" />
                      {t.view_count}
                    </span>
                  </div>

                  {/* Verified profit */}
                  {t.verified_profit_pct != null && (
                    <div className={`mt-1.5 text-xs font-black ${pctClass(t.verified_profit_pct)}`}>
                      수익 {pctText(t.verified_profit_pct)}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* News + X (translated) */}
        <section className="mt-5 grid lg:grid-cols-12 gap-5">
          <section className="lg:col-span-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="text-base font-bold dark:text-slate-100">코인 뉴스 <span className="text-xs font-medium text-slate-400 dark:text-slate-500">(AI번역)</span></div>
              <Link href="/news" className="text-xs text-blue-500 hover:text-blue-500 hover:underline">
                전체보기
              </Link>
            </div>
            <div className="p-3 space-y-2">
              {news.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">{loading ? "불러오는 중..." : "뉴스 데이터가 없습니다."}</div>
              ) : (
                news.slice(0, 5).map((n, i) => (
                  <a
                    key={`${n.url}-${i}`}
                    href={n.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-slate-500 dark:text-slate-400 truncate">{n.source}</div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">{timeAgo(n.published_ts ?? n.published_at)}</div>
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-200 line-clamp-1">{n.title_ko || n.title}</div>
                  </a>
                ))
              )}
            </div>
          </section>

          <section className="lg:col-span-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="text-base font-bold dark:text-slate-100">X 피드 <span className="text-xs font-medium text-slate-400 dark:text-slate-500">(AI번역)</span></div>
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
                loading ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400">불러오는 중...</div>
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
                xFeed.slice(0, 5).map((x, i) => (
                  <a
                    key={`${x.url}-${i}`}
                    href={x.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-slate-500 dark:text-slate-400 truncate">{x.source}</div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">{timeAgo(x.published_ts ?? x.published_at)}</div>
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-200 line-clamp-1">{x.title_ko || x.title}</div>
                  </a>
                ))
              )}
            </div>
          </section>
        </section>

        {/* Main: 3 columns */}
        <section className="mt-5 grid lg:grid-cols-12 gap-5">
          {/* Left: Strategy ranking */}
          <section className="order-2 lg:order-1 lg:col-span-3 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="text-base font-bold dark:text-slate-100">수익률 랭킹</div>
                <div className="flex gap-1">
                  {(["week", "month", "all"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setRankPeriod(p)}
                      className={`text-xs px-2 py-1 rounded-full transition ${
                        rankPeriod === p ? "bg-blue-500 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"
                      }`}
                    >
                      {p === "week" ? "7D" : p === "month" ? "30D" : "ALL"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {ranking.length === 0 ? (
                <div className="p-4 text-sm text-slate-500 dark:text-slate-400">{loading ? "불러오는 중..." : "랭킹 데이터가 없습니다."}</div>
              ) : (
                ranking.slice(0, 10).map((item, idx) => {
                  const pct = getReturnPct(item);
                  return (
                    <div key={item.post_id} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                      <div className="flex items-start gap-2.5">
                        <RankBadge n={idx + 1} />
                        <div className="flex-1 min-w-0">
                          <Link href={`/community/${item.post_id}`} className="block">
                            <div className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{item.title}</div>
                            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400 truncate">
                              {item.author} · ♥ {item.like_count} · 💬 {item.comment_count} · 복사 {item.copy_count}
                            </div>
                          </Link>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className={`text-xs font-black ${pct != null ? pctClass(pct) : "text-slate-500 dark:text-slate-400"}`}>
                              {pct != null ? pctText(pct) : "ROI -"}
                            </div>
                            <button
                              type="button"
                              disabled={busyCopy === item.post_id}
                              onClick={async () => {
                                setBusyCopy(item.post_id);
                                try {
                                  await api.copyStrategyFromPost(item.post_id);
                                  router.push("/strategies");
                                } finally {
                                  setBusyCopy(null);
                                }
                              }}
                              className="px-2.5 py-1 rounded-lg text-sm font-bold bg-orange-500/10 text-orange-600 border border-orange-300/30 hover:bg-orange-500/15 transition disabled:opacity-50"
                            >
                              복사
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Center: Profit feed + Following */}
          <section className="order-1 lg:order-2 lg:col-span-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setFeedTab("profit")}
                  className={`text-base font-bold transition ${feedTab === "profit" ? "text-slate-800 dark:text-slate-100" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"}`}
                >
                  인증 피드
                </button>
                {isAuthenticated && (
                  <button
                    onClick={() => setFeedTab("following")}
                    className={`text-base font-bold transition ${feedTab === "following" ? "text-slate-800 dark:text-slate-100" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"}`}
                  >
                    팔로잉
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isAuthenticated ? (
                  <Link
                    href="/community/new"
                    className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm font-semibold hover:bg-blue-500 transition"
                  >
                    수익 인증 올리기
                  </Link>
                ) : (
                  <Link
                    href="/login"
                    className="px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-500 text-white text-sm font-semibold transition"
                  >
                    로그인
                  </Link>
                )}
              </div>
            </div>

            {feedTab === "following" && isAuthenticated ? (
              followFeed.length === 0 ? (
                <div className="p-6 text-sm text-slate-500 dark:text-slate-400">팔로잉한 유저의 활동이 없습니다.</div>
              ) : (
                <div className="p-3 space-y-2">
                  {followFeed.map((item) => (
                    <Link
                      key={item.post_id}
                      href={`/community/${item.post_id}`}
                      className="block p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <CategoryPill category={item.type as any} />
                          <span className="text-sm font-bold text-slate-600 dark:text-slate-300 truncate">{item.author.nickname}</span>
                        </div>
                        <span className="text-sm text-slate-500 dark:text-slate-400 shrink-0">{timeAgo(item.created_at)}</span>
                      </div>
                      <div className="mt-1.5 text-sm font-bold text-slate-700 dark:text-slate-200 line-clamp-1">{item.title}</div>
                    </Link>
                  ))}
                </div>
              )
            ) : feedPosts.length === 0 ? (
              <div className="p-6 text-sm text-slate-500 dark:text-slate-400">{loading ? "불러오는 중..." : "아직 인증 피드가 없습니다."}</div>
            ) : (
              <div className="p-3 grid sm:grid-cols-2 gap-3">
                {feedPosts.map((p) => (
                  <div key={p.id} className="rounded-xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 p-3 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <CategoryPill category={p.category as any} />
                        <span className="text-sm text-slate-500 dark:text-slate-400 truncate">{p.author.nickname}</span>
                        <span className="text-sm text-slate-500 dark:text-slate-400">{kstTime(p.created_at)}</span>
                      </div>
                      {p.verified_profit_pct != null ? (
                        <span className={`text-xs font-black ${pctClass(p.verified_profit_pct)}`}>
                          {pctText(p.verified_profit_pct)}
                        </span>
                      ) : null}
                    </div>
                    <Link href={`/community/${p.id}`} className="block">
                      <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-2">{p.title}</div>
                      <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        ♥ {p.like_count} · 💬 {p.comment_count} · 👀 {p.view_count} · {timeAgo(p.created_at)}
                      </div>
                    </Link>
                    <div className="mt-3 flex items-center gap-2">
                      <Link
                        href={`/community/${p.id}`}
                        className="flex-1 text-center px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold transition"
                      >
                        보기
                      </Link>
                      {p.has_strategy ? (
                        <button
                          type="button"
                          disabled={busyCopy === p.id}
                          onClick={async () => {
                            setBusyCopy(p.id);
                            try {
                              await api.copyStrategyFromPost(p.id);
                              router.push("/strategies");
                            } finally {
                              setBusyCopy(null);
                            }
                          }}
                          className="flex-1 text-center px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-600 border border-orange-300/30 hover:bg-orange-500/15 text-sm font-semibold transition disabled:opacity-50"
                        >
                          전략 복사
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Right: Market ranking + hot + top traders */}
          <aside className="order-3 lg:order-3 lg:col-span-3 space-y-5">
            <section className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="text-base font-bold dark:text-slate-100 whitespace-nowrap">인기 전략</div>
                  <span className="text-xs text-orange-600 bg-orange-400/10 px-2 py-0.5 rounded-full whitespace-nowrap">HOT</span>
                </div>
                <Link href="/strategies" className="text-xs text-blue-500 hover:text-blue-500 hover:underline">
                  더 보기
                </Link>
              </div>
              <div className="p-3 grid gap-2.5">
                {hotStrategies.length === 0 ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400">{loading ? "불러오는 중..." : "데이터가 없습니다."}</div>
                ) : (
                  hotStrategies.slice(0, 4).map((s) => (
                    <Link
                      key={s.strategy_id}
                      href={`/community/${s.post_id}`}
                      className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 hover:border-orange-400/30 transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {s.pair.replace("KRW-", "")}
                        </span>
                        <span className="text-sm text-slate-500 dark:text-slate-400">{s.timeframe}</span>
                      </div>
                      <div className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{s.name}</div>
                      <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">by {s.author}</div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-orange-600">복사 {s.copy_count}회</span>
                        {s.return_pct != null ? (
                          <span className={`text-xs font-black ${pctClass(Number(s.return_pct))}`}>
                            {pctText(Number(s.return_pct))}
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="text-base font-bold dark:text-slate-100">TOP 트레이더</div>
                  <span className="text-xs text-emerald-600 bg-emerald-400/10 px-2 py-0.5 rounded-full">이번 주</span>
                </div>
                <Link href="/community" className="text-xs text-blue-500 hover:text-blue-500 hover:underline">
                  더 보기
                </Link>
              </div>
              <div className="p-3 space-y-2">
                {topTraders.length === 0 ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400">{loading ? "불러오는 중..." : "데이터가 없습니다."}</div>
                ) : (
                  topTraders.slice(0, 5).map((t) => (
                    <div key={t.user_id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800">
                      <RankBadge n={t.rank} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{t.nickname}</div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">{t.trade_count}건 · 승률 {t.win_rate}%</div>
                      </div>
                      <div className={`text-xs font-black ${t.total_profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {t.total_profit >= 0 ? "+" : ""}
                        {Math.round(t.total_profit).toLocaleString()}원
                      </div>
                      {isAuthenticated ? (
                        <button
                          type="button"
                          disabled={followBusy === t.user_id}
                          onClick={async () => {
                            setFollowBusy(t.user_id);
                            try {
                              const isFollowing = Boolean(t.is_following);
                              if (isFollowing) await api.unfollowUser(t.user_id);
                              else await api.followUser(t.user_id);
                              const updated = await api.getTopTraders("week").catch(() => []);
                              setTopTraders(updated as TopTrader[]);
                              api.getMyFollowStats().then(setFollowStats).catch(() => {});
                            } finally {
                              setFollowBusy(null);
                            }
                          }}
                          className={`ml-1 px-2 py-1 rounded-lg text-sm font-bold transition disabled:opacity-50 ${
                            t.is_following
                              ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                              : "bg-blue-500 text-white hover:bg-blue-500"
                          }`}
                        >
                          {t.is_following ? "팔로잉" : "팔로우"}
                        </button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
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
                    Lv.{myPoints.level} {myPoints.level_name} · {myPoints.total_points}P
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
          animation: marquee 48s linear infinite;
        }
        @media (max-width: 640px) {
          .ticker__inner {
            animation-duration: 64s;
          }
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
    </div>
  );
}

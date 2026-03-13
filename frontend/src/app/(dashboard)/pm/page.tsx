"use client";
// Polymarket Auto Trading Dashboard
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { PMStats, PMBot, PMPosition, PMTrade } from "@/types";
import MarketsTab from "./_components/MarketsTab";
import BotsTab from "./_components/BotsTab";
import PositionsTab from "./_components/PositionsTab";
import SettingsTab from "./_components/SettingsTab";
import AIAnalysisTab from "./_components/AIAnalysisTab";

type Tab = "dashboard" | "markets" | "bots" | "positions" | "ai" | "settings";

export default function PolymarketPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [stats, setStats] = useState<PMStats | null>(null);
  const [bots, setBots] = useState<PMBot[]>([]);
  const [positions, setPositions] = useState<PMPosition[]>([]);
  const [recentTrades, setRecentTrades] = useState<PMTrade[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [marketStatus, setMarketStatus] = useState<{
    active_rounds: number;
    status: string;
    next_round_at?: string;
    next_round_in_min?: number;
  } | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const [s, b, p, t, st, ms] = await Promise.all([
        api.pmGetStats(),
        api.pmGetBots(),
        api.pmGetPositions(),
        api.pmGetAllTrades(1),
        api.pmGetStatus(),
        api.pmGetMarketStatus(),
      ]);
      setStats(s);
      setBots(b);
      setPositions(p);
      setRecentTrades(t.slice(0, 10));
      setConnected(st.connected);
      setMarketStatus(ms);
      setLastUpdated(new Date());
    } catch {
      // Not connected or no auth
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 10_000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "markets", label: "Markets" },
    { key: "bots", label: "Bots" },
    { key: "positions", label: "Positions" },
    { key: "ai", label: "AI Analysis" },
    { key: "settings", label: "Settings" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Polymarket</h1>
          <p className="text-sm text-slate-500 mt-1">Prediction Market Auto Trading</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-slate-400">
              {lastUpdated.toLocaleTimeString("ko-KR")} updated
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                connected ? "bg-green-500 animate-pulse" : "bg-red-500"
              }`}
            />
            <span className="text-sm text-slate-500">
              {connected ? "Live" : "Disconnected"}
            </span>
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200/60 dark:border-slate-700/60 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "dashboard" && (
        <DashboardView
          stats={stats}
          bots={bots}
          positions={positions}
          recentTrades={recentTrades}
          marketStatus={marketStatus}
          onNavigate={setTab}
        />
      )}
      {tab === "markets" && <MarketsTab />}
      {tab === "bots" && <BotsTab onRefresh={fetchDashboard} />}
      {tab === "positions" && <PositionsTab />}
      {tab === "ai" && <AIAnalysisTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

// ─── Dashboard Overview ──────────────────────────────────────────────────

function DashboardView({
  stats,
  bots,
  positions,
  recentTrades,
  marketStatus,
  onNavigate,
}: {
  stats: PMStats | null;
  bots: PMBot[];
  positions: PMPosition[];
  recentTrades: PMTrade[];
  marketStatus: {
    active_rounds: number;
    status: string;
    next_round_at?: string;
    next_round_in_min?: number;
  } | null;
  onNavigate: (tab: Tab) => void;
}) {
  const activeBots = bots.filter((b) => b.status === "running");

  return (
    <div className="space-y-6">
      {/* Market Status Banner */}
      {marketStatus && (
        <div className={`rounded-xl p-4 border ${
          marketStatus.status === "active"
            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
            : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
        }`}>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${
              marketStatus.status === "active" ? "bg-green-500 animate-pulse" : "bg-amber-500"
            }`} />
            <span className="font-medium text-sm">
              {marketStatus.status === "active"
                ? `${marketStatus.active_rounds} active 5-min rounds`
                : "No active 5-min rounds"
              }
            </span>
            {marketStatus.status !== "active" && marketStatus.next_round_in_min && (
              <span className="text-xs text-slate-500 ml-2">
                Next round in {marketStatus.next_round_in_min > 60
                  ? `${Math.floor(marketStatus.next_round_in_min / 60)}h ${Math.round(marketStatus.next_round_in_min % 60)}m`
                  : `${Math.round(marketStatus.next_round_in_min)}m`
                }
                {marketStatus.next_round_at && (
                  <> ({new Date(marketStatus.next_round_at).toLocaleString("ko-KR", {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                  })})</>
                )}
              </span>
            )}
          </div>
          {marketStatus.status !== "active" && (
            <p className="text-xs text-slate-500 mt-1">
              Bot will automatically trade when rounds become active.
            </p>
          )}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total P&L"
          value={`$${(stats?.total_profit_usdc ?? 0).toFixed(2)}`}
          color={
            (stats?.total_profit_usdc ?? 0) >= 0 ? "text-green-600" : "text-red-500"
          }
        />
        <StatCard label="Active Bots" value={String(stats?.active_bots ?? 0)} />
        <StatCard label="Open Positions" value={String(stats?.total_positions ?? 0)} />
        <StatCard
          label="Win Rate"
          value={`${(stats?.win_rate ?? 0).toFixed(1)}%`}
          sub={`${stats?.win_trades ?? 0}/${stats?.total_trades ?? 0}`}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Active Bots */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Active Bots</h2>
            <button
              onClick={() => onNavigate("bots")}
              className="text-sm text-blue-500 hover:text-blue-600"
            >
              View All
            </button>
          </div>
          {activeBots.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No active bots</p>
          ) : (
            <div className="space-y-3">
              {activeBots.map((bot) => (
                <div
                  key={bot.id}
                  className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="font-medium text-sm">{bot.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {bot.bot_type}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      bot.total_profit_usdc >= 0 ? "text-green-600" : "text-red-500"
                    }`}
                  >
                    {bot.total_profit_usdc >= 0 ? "+" : ""}${bot.total_profit_usdc.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Arbitrage Opportunities */}
        <ArbitragePreview />
      </div>

      {/* Open Positions */}
      {positions.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">보유 포지션</h2>
            <button
              onClick={() => onNavigate("positions")}
              className="text-sm text-blue-500 hover:text-blue-600"
            >
              전체 보기
            </button>
          </div>
          <div className="space-y-2">
            {positions.map((pos, i) => {
              const isArb = pos.type === "arbitrage";
              return (
                <div
                  key={`${pos.condition_id}-${i}`}
                  className="flex items-center justify-between py-3 px-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg"
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-sm font-medium truncate">
                      {pos.question || pos.market_slug || "Unknown Market"}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      {pos.bot_name && <span>{pos.bot_name}</span>}
                      {isArb ? (
                        <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600">
                          ARB
                        </span>
                      ) : (
                        <span className={`px-1.5 py-0.5 rounded ${
                          pos.outcome === "Yes"
                            ? "bg-green-100 dark:bg-green-900/30 text-green-600"
                            : "bg-red-100 dark:bg-red-900/30 text-red-600"
                        }`}>
                          {pos.outcome}
                        </span>
                      )}
                      <span>@${(pos.entry_price ?? 0).toFixed(2)}</span>
                      <span>× {(pos.quantity ?? pos.shares ?? 0).toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold">
                      ${((pos.entry_price ?? 0) * (pos.quantity ?? 0)).toFixed(2)}
                    </p>
                    {pos.entry_time && (
                      <p className="text-[10px] text-slate-400">
                        {new Date(pos.entry_time).toLocaleString("ko-KR", {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                        })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Trades */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">최근 거래</h2>
          <button
            onClick={() => onNavigate("positions")}
            className="text-sm text-blue-500 hover:text-blue-600"
          >
            전체 보기
          </button>
        </div>
        {recentTrades.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">거래 내역이 없습니다</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-left text-xs">
                  <th className="pb-2 font-medium">마켓</th>
                  <th className="pb-2 font-medium">방향</th>
                  <th className="pb-2 font-medium">가격</th>
                  <th className="pb-2 font-medium">수량</th>
                  <th className="pb-2 font-medium">금액</th>
                  <th className="pb-2 font-medium">손익</th>
                  <th className="pb-2 font-medium">시각</th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2 max-w-[250px]">
                      <p className="truncate text-sm">{t.question || t.market_slug || "-"}</p>
                      <span className={`text-[10px] ${t.outcome === "Yes" ? "text-green-600" : "text-red-500"}`}>
                        {t.outcome}
                      </span>
                    </td>
                    <td>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                        t.side === "buy"
                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600"
                          : "bg-orange-100 dark:bg-orange-900/30 text-orange-600"
                      }`}>
                        {t.side === "buy" ? "매수" : "매도"}
                      </span>
                    </td>
                    <td className="text-xs">${t.price.toFixed(4)}</td>
                    <td className="text-xs">{t.quantity?.toFixed(1) ?? "-"}</td>
                    <td className="text-xs">${t.total_usdc.toFixed(2)}</td>
                    <td>
                      {t.profit_usdc != null ? (
                        <span className={`text-xs font-medium ${
                          t.profit_usdc >= 0 ? "text-green-600" : "text-red-500"
                        }`}>
                          {t.profit_usdc >= 0 ? "+" : ""}${t.profit_usdc.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="text-[10px] text-slate-400 whitespace-nowrap">
                      {t.executed_at
                        ? new Date(t.executed_at).toLocaleString("ko-KR", {
                            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                          })
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Components ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color || ""}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ArbitragePreview() {
  const [opps, setOpps] = useState<import("@/types").PMArbitrageOpportunity[]>([]);

  useEffect(() => {
    api.pmGetArbitrageOpportunities(0.01, 5000).then(setOpps).catch(() => {});
  }, []);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-5">
      <h2 className="font-semibold mb-4">Arbitrage Opportunities</h2>
      {opps.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">No opportunities found</p>
      ) : (
        <div className="space-y-3">
          {opps.slice(0, 5).map((o) => (
            <div
              key={o.condition_id}
              className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0"
            >
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm truncate">{o.question}</p>
                <p className="text-xs text-slate-400">
                  Yes {o.yes_price.toFixed(2)} + No {o.no_price.toFixed(2)} = {o.total_cost.toFixed(2)}
                </p>
              </div>
              <span className="text-sm font-medium text-green-600 whitespace-nowrap">
                +{o.expected_profit_pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

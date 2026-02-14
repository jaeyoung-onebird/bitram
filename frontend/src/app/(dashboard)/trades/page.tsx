"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { Bot, Trade } from "@/types";

type SideFilter = "all" | "buy" | "sell";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function TradesPage() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [allTrades, setAllTrades] = useState<(Trade & { bot_name: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [sideFilter, setSideFilter] = useState<SideFilter>("all");

  const fetchData = useCallback(async () => {
    try {
      const botList = await api.getBots();
      setBots(botList);

      const tradePromises = botList.map(async (bot) => {
        try {
          const trades = await api.getBotTrades(bot.id);
          return trades.map((t) => ({ ...t, bot_name: bot.name }));
        } catch {
          return [];
        }
      });

      const results = await Promise.all(tradePromises);
      const merged = results.flat().sort(
        (a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime()
      );
      setAllTrades(merged);
    } catch (err) {
      console.error("Failed to fetch trades:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredTrades = allTrades.filter((t) => {
    if (sideFilter === "all") return true;
    return t.side === sideFilter;
  });

  // Summary stats
  const totalTrades = allTrades.length;
  const buyTrades = allTrades.filter((t) => t.side === "buy").length;
  const sellTrades = allTrades.filter((t) => t.side === "sell").length;
  const totalProfit = allTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
  const profitableTrades = allTrades.filter((t) => t.profit !== null && t.profit > 0).length;
  const lossTrades = allTrades.filter((t) => t.profit !== null && t.profit < 0).length;
  const winRate = profitableTrades + lossTrades > 0
    ? ((profitableTrades / (profitableTrades + lossTrades)) * 100).toFixed(1)
    : "0.0";
  const totalVolume = allTrades.reduce((sum, t) => sum + t.total_krw, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 dark:text-slate-400">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">거래 내역</h1>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
          <div className="text-sm text-slate-400 dark:text-slate-500 mb-1">총 거래</div>
          <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{totalTrades}회</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">매수 {buyTrades} / 매도 {sellTrades}</div>
        </div>
        <div className={`p-4 bg-white dark:bg-slate-900 rounded-xl border ${totalProfit >= 0 ? "border-green-500/20" : "border-red-500/20"}`}>
          <div className="text-sm text-slate-400 dark:text-slate-500 mb-1">총 수익</div>
          <div className={`text-xl font-bold ${totalProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
            {totalProfit >= 0 ? "+" : ""}{totalProfit.toLocaleString()}원
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-blue-500/20">
          <div className="text-sm text-slate-400 dark:text-slate-500 mb-1">승률</div>
          <div className="text-xl font-bold text-blue-500">{winRate}%</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{profitableTrades}승 / {lossTrades}패</div>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
          <div className="text-sm text-slate-400 dark:text-slate-500 mb-1">총 거래대금</div>
          <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{totalVolume.toLocaleString()}원</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400 dark:text-slate-500 mr-1">필터:</span>
        {(["all", "buy", "sell"] as SideFilter[]).map((filter) => {
          const labels: Record<SideFilter, string> = { all: "전체", buy: "매수", sell: "매도" };
          return (
            <button
              key={filter}
              onClick={() => setSideFilter(filter)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                sideFilter === filter
                  ? filter === "buy"
                    ? "border-green-500/30 bg-green-500/10 text-green-400"
                    : filter === "sell"
                    ? "border-red-500/30 bg-red-500/10 text-red-400"
                    : "border-blue-500/30 bg-blue-500/10 text-blue-500"
                  : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm"
              }`}
            >
              {labels[filter]}
            </button>
          );
        })}
        <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">{filteredTrades.length}건</span>
      </div>

      {/* Trades Table */}
      {filteredTrades.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-500 dark:text-slate-400">
          <svg className="w-16 h-16 mb-4 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-lg mb-1">거래 내역이 없습니다</p>
          <p className="text-sm">봇을 실행하면 거래 내역이 여기에 표시됩니다.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">일시</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">페어</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">구분</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">가격</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">수량</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">수익</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">사유</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/50">
                {filteredTrades.map((trade) => (
                  <tr key={trade.id} className="hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition">
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-600 dark:text-slate-300">{formatDate(trade.executed_at)}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{trade.bot_name}</div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                      {trade.pair.replace("KRW-", "")}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        trade.side === "buy"
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-rose-500/10 text-rose-600"
                      }`}>
                        {trade.side === "buy" ? "매수" : "매도"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600 dark:text-slate-300">
                      {trade.price.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-400 dark:text-slate-500">
                      {trade.quantity.toFixed(8).replace(/\.?0+$/, "")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {trade.profit !== null ? (
                        <div>
                          <span className={`text-sm font-medium ${trade.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {trade.profit >= 0 ? "+" : ""}{trade.profit.toLocaleString()}원
                          </span>
                          {trade.profit_pct !== null && (
                            <div className={`text-xs ${trade.profit_pct >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {trade.profit_pct >= 0 ? "+" : ""}{trade.profit_pct.toFixed(2)}%
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 max-w-[150px] truncate">
                      {trade.trigger_reason || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="md:hidden space-y-2">
            {filteredTrades.map((trade) => (
              <div key={trade.id} className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      trade.side === "buy"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-rose-500/10 text-rose-600"
                    }`}>
                      {trade.side === "buy" ? "매수" : "매도"}
                    </span>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {trade.pair.replace("KRW-", "")}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(trade.executed_at)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="text-slate-400 dark:text-slate-500">
                    {trade.price.toLocaleString()}원 x {trade.quantity.toFixed(8).replace(/\.?0+$/, "")}
                  </div>
                  {trade.profit !== null ? (
                    <span className={`font-medium ${trade.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {trade.profit >= 0 ? "+" : ""}{trade.profit.toLocaleString()}원
                      {trade.profit_pct !== null && (
                        <span className="text-xs ml-1">
                          ({trade.profit_pct >= 0 ? "+" : ""}{trade.profit_pct.toFixed(2)}%)
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">-</span>
                  )}
                </div>
                {trade.trigger_reason && (
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{trade.trigger_reason}</div>
                )}
                <div className="text-xs text-slate-500 dark:text-slate-400">{trade.bot_name}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

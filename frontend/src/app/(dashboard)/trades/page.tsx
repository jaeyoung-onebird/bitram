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
        <div className="text-gray-500">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">거래 내역</h1>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-[#1a2332] rounded-xl border border-gray-800">
          <div className="text-xs text-gray-400 mb-1">총 거래</div>
          <div className="text-xl font-bold text-gray-100">{totalTrades}회</div>
          <div className="text-xs text-gray-500 mt-1">매수 {buyTrades} / 매도 {sellTrades}</div>
        </div>
        <div className={`p-4 bg-[#1a2332] rounded-xl border ${totalProfit >= 0 ? "border-green-500/20" : "border-red-500/20"}`}>
          <div className="text-xs text-gray-400 mb-1">총 수익</div>
          <div className={`text-xl font-bold ${totalProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
            {totalProfit >= 0 ? "+" : ""}{totalProfit.toLocaleString()}원
          </div>
        </div>
        <div className="p-4 bg-[#1a2332] rounded-xl border border-blue-500/20">
          <div className="text-xs text-gray-400 mb-1">승률</div>
          <div className="text-xl font-bold text-blue-400">{winRate}%</div>
          <div className="text-xs text-gray-500 mt-1">{profitableTrades}승 / {lossTrades}패</div>
        </div>
        <div className="p-4 bg-[#1a2332] rounded-xl border border-gray-800">
          <div className="text-xs text-gray-400 mb-1">총 거래대금</div>
          <div className="text-xl font-bold text-gray-100">{totalVolume.toLocaleString()}원</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400 mr-1">필터:</span>
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
                    : "border-blue-500/30 bg-blue-500/10 text-blue-400"
                  : "border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-700"
              }`}
            >
              {labels[filter]}
            </button>
          );
        })}
        <span className="text-xs text-gray-600 ml-2">{filteredTrades.length}건</span>
      </div>

      {/* Trades Table */}
      {filteredTrades.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-500">
          <svg className="w-16 h-16 mb-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-lg mb-1">거래 내역이 없습니다</p>
          <p className="text-sm">봇을 실행하면 거래 내역이 여기에 표시됩니다.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-[#1a2332] border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">일시</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">페어</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">구분</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">가격</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">수량</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">수익</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">사유</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {filteredTrades.map((trade) => (
                  <tr key={trade.id} className="hover:bg-[#111827]/50 transition">
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-300">{formatDate(trade.executed_at)}</div>
                      <div className="text-[10px] text-gray-600">{trade.bot_name}</div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-200">
                      {trade.pair.replace("KRW-", "")}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        trade.side === "buy"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}>
                        {trade.side === "buy" ? "매수" : "매도"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-300">
                      {trade.price.toLocaleString()}원
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-400">
                      {trade.quantity.toFixed(8).replace(/\.?0+$/, "")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {trade.profit !== null ? (
                        <div>
                          <span className={`text-sm font-medium ${trade.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {trade.profit >= 0 ? "+" : ""}{trade.profit.toLocaleString()}원
                          </span>
                          {trade.profit_pct !== null && (
                            <div className={`text-[10px] ${trade.profit_pct >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {trade.profit_pct >= 0 ? "+" : ""}{trade.profit_pct.toFixed(2)}%
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[150px] truncate">
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
              <div key={trade.id} className="bg-[#1a2332] border border-gray-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      trade.side === "buy"
                        ? "bg-green-500/20 text-green-400"
                        : "bg-red-500/20 text-red-400"
                    }`}>
                      {trade.side === "buy" ? "매수" : "매도"}
                    </span>
                    <span className="text-sm font-medium text-gray-200">
                      {trade.pair.replace("KRW-", "")}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">{formatDate(trade.executed_at)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="text-gray-400">
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
                    <span className="text-gray-600">-</span>
                  )}
                </div>
                {trade.trigger_reason && (
                  <div className="text-xs text-gray-500 truncate">{trade.trigger_reason}</div>
                )}
                <div className="text-[10px] text-gray-600">{trade.bot_name}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

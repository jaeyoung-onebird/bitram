"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { PMPosition, PMTrade } from "@/types";

type View = "positions" | "trades";

export default function PositionsTab() {
  const [view, setView] = useState<View>("positions");
  const [positions, setPositions] = useState<PMPosition[]>([]);
  const [trades, setTrades] = useState<PMTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (view === "positions") {
        const data = await api.pmGetPositions();
        setPositions(data);
      } else {
        const data = await api.pmGetAllTrades(page);
        setTrades(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [view, page]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
        {(["positions", "trades"] as const).map((v) => (
          <button
            key={v}
            onClick={() => { setView(v); setPage(1); }}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors capitalize ${
              view === v
                ? "bg-white dark:bg-slate-700 font-medium shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : view === "positions" ? (
        <PositionsList positions={positions} />
      ) : (
        <TradesList trades={trades} page={page} onPageChange={setPage} />
      )}
    </div>
  );
}

function PositionsList({ positions }: { positions: PMPosition[] }) {
  if (positions.length === 0) {
    return <div className="text-center py-12 text-slate-400">No open positions</div>;
  }

  return (
    <div className="space-y-3">
      {positions.map((pos, i) => {
        const isArb = pos.type === "arbitrage";
        return (
          <div
            key={`${pos.condition_id || pos.token_id}-${i}`}
            className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {pos.question || pos.market_slug || "Unknown Market"}
                </p>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                  {pos.bot_name && <span>Bot: {pos.bot_name}</span>}
                  {isArb ? (
                    <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600">
                      Arbitrage
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
                </div>
              </div>
              <div className="text-right shrink-0 ml-3">
                {isArb ? (
                  <>
                    <p className="text-sm font-bold text-green-600">
                      +${(pos.expected_profit ?? 0).toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {pos.shares?.toFixed(1)} shares
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold">
                      Entry: ${pos.entry_price.toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-400">
                      Qty: {pos.quantity.toFixed(1)}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TradesList({
  trades,
  page,
  onPageChange,
}: {
  trades: PMTrade[];
  page: number;
  onPageChange: (p: number) => void;
}) {
  if (trades.length === 0 && page === 1) {
    return <div className="text-center py-12 text-slate-400">No trades yet</div>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-left text-xs">
              <th className="pb-2 font-medium">Time</th>
              <th className="pb-2 font-medium">Market</th>
              <th className="pb-2 font-medium">Side</th>
              <th className="pb-2 font-medium">Outcome</th>
              <th className="pb-2 font-medium">Price</th>
              <th className="pb-2 font-medium">Amount</th>
              <th className="pb-2 font-medium">P&L</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-2 text-xs text-slate-400 whitespace-nowrap">
                  {new Date(t.executed_at).toLocaleDateString()}{" "}
                  {new Date(t.executed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="py-2 max-w-[200px] truncate">{t.question || t.market_slug}</td>
                <td>
                  <span className={t.side === "buy" ? "text-blue-500" : "text-orange-500"}>
                    {t.side.toUpperCase()}
                  </span>
                </td>
                <td>
                  <span className={t.outcome === "Yes" ? "text-green-600" : "text-red-500"}>
                    {t.outcome}
                  </span>
                </td>
                <td>${t.price.toFixed(2)}</td>
                <td>${t.total_usdc.toFixed(2)}</td>
                <td>
                  {t.profit_usdc != null ? (
                    <span className={t.profit_usdc >= 0 ? "text-green-600" : "text-red-500"}>
                      {t.profit_usdc >= 0 ? "+" : ""}${t.profit_usdc.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center gap-2 mt-4">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-30"
        >
          Prev
        </button>
        <span className="px-3 py-1.5 text-sm text-slate-400">Page {page}</span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={trades.length < 50}
          className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-30"
        >
          Next
        </button>
      </div>
    </div>
  );
}

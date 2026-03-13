"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { PMMarket } from "@/types";

export default function MarketsTab() {
  const [markets, setMarkets] = useState<PMMarket[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchMarkets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.pmGetMarkets({
        search: search || undefined,
        limit: 50,
      });
      setMarkets(data);
    } catch {
      setMarkets([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(fetchMarkets, search ? 500 : 0);
    return () => clearTimeout(timer);
  }, [fetchMarkets, search]);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search markets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading markets...</div>
      ) : markets.length === 0 ? (
        <div className="text-center py-12 text-slate-400">No markets found</div>
      ) : (
        <div className="grid gap-3">
          {markets.map((m) => {
            const condId = m.conditionId || m.condition_id || "";
            const prices = m.outcomePrices || [];
            const yesPrice = prices[0] ? parseFloat(prices[0]) : null;
            const noPrice = prices[1] ? parseFloat(prices[1]) : null;
            const volume = m.volume24hr || m.volumeNum || 0;

            return (
              <div
                key={condId}
                className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm leading-snug">{m.question}</h3>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                      {m.tags && m.tags.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                          {m.tags[0]}
                        </span>
                      )}
                      <span>Vol ${(Number(volume) / 1000).toFixed(0)}K</span>
                      {m.liquidityNum && (
                        <span>Liq ${(m.liquidityNum / 1000).toFixed(0)}K</span>
                      )}
                      {m.endDate && (
                        <span>
                          Ends {new Date(m.endDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {yesPrice != null && (
                      <div className="text-center">
                        <div className="text-xs text-slate-400">Yes</div>
                        <div className="text-sm font-bold text-green-600">
                          {(yesPrice * 100).toFixed(0)}¢
                        </div>
                      </div>
                    )}
                    {noPrice != null && (
                      <div className="text-center">
                        <div className="text-xs text-slate-400">No</div>
                        <div className="text-sm font-bold text-red-500">
                          {(noPrice * 100).toFixed(0)}¢
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

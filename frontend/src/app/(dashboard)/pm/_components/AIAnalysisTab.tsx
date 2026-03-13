"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { PMAICandidate, PMAIAnalysis, PMAILogEntry, PMAIAccuracy } from "@/types";

type View = "scan" | "history" | "accuracy";

const CATEGORY_COLORS: Record<string, string> = {
  politics: "bg-blue-100 dark:bg-blue-900/30 text-blue-600",
  sports: "bg-green-100 dark:bg-green-900/30 text-green-600",
  crypto: "bg-orange-100 dark:bg-orange-900/30 text-orange-600",
  macro: "bg-purple-100 dark:bg-purple-900/30 text-purple-600",
  culture: "bg-pink-100 dark:bg-pink-900/30 text-pink-600",
  other: "bg-slate-100 dark:bg-slate-800 text-slate-500",
};

export default function AIAnalysisTab() {
  const [view, setView] = useState<View>("scan");

  return (
    <div className="space-y-4">
      {/* View Toggle */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
        {([
          { key: "scan" as const, label: "AI Scan" },
          { key: "history" as const, label: "History" },
          { key: "accuracy" as const, label: "Accuracy" },
        ]).map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              view === v.key
                ? "bg-white dark:bg-slate-700 font-medium shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "scan" && <ScanView />}
      {view === "history" && <HistoryView />}
      {view === "accuracy" && <AccuracyView />}
    </div>
  );
}

// ─── Scan View ──────────────────────────────────────────────────────────

function ScanView() {
  const [candidates, setCandidates] = useState<PMAICandidate[]>([]);
  const [scanning, setScanning] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, PMAIAnalysis>>({});
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const runScan = async () => {
    setScanning(true);
    try {
      const data = await api.pmAIScan();
      setCandidates(data);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const analyzeMarket = async (c: PMAICandidate) => {
    setAnalyzing(c.condition_id);
    try {
      const result = await api.pmAIAnalyze({
        condition_id: c.condition_id,
        question: c.question,
        description: c.description,
        yes_price: c.yes_price,
        no_price: c.no_price,
        category: c.category,
        end_date: c.end_date,
      });
      setAnalyses((prev) => ({ ...prev, [c.condition_id]: result }));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(null);
    }
  };

  const categories = ["all", ...new Set(candidates.map((c) => c.category))];
  const filtered = categoryFilter === "all"
    ? candidates
    : candidates.filter((c) => c.category === categoryFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">AI Market Scanner</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Scan markets and run Claude AI probability analysis
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          {scanning ? "Scanning..." : "Scan Markets"}
        </button>
      </div>

      {candidates.length > 0 && (
        <>
          {/* Category Filter */}
          <div className="flex gap-1.5 flex-wrap">
            {categories.map((cat) => {
              const count = cat === "all" ? candidates.length : candidates.filter((c) => c.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors capitalize ${
                    categoryFilter === cat
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600"
                      : "border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>

          {/* Market Cards */}
          <div className="space-y-3">
            {filtered.map((c) => {
              const analysis = analyses[c.condition_id];
              return (
                <div
                  key={c.condition_id}
                  className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm leading-snug">{c.question}</h3>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded capitalize ${CATEGORY_COLORS[c.category] || CATEGORY_COLORS.other}`}>
                          {c.category}
                        </span>
                        <span>Vol ${(c.volume_24h / 1000).toFixed(0)}K</span>
                        <span>Liq ${(c.liquidity / 1000).toFixed(0)}K</span>
                        <span>Spread {(c.spread * 100).toFixed(1)}%</span>
                        {c.end_date && (
                          <span>Ends {new Date(c.end_date).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-center">
                        <div className="text-xs text-slate-400">Yes</div>
                        <div className="text-sm font-bold text-green-600">
                          {(c.yes_price * 100).toFixed(0)}c
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-slate-400">No</div>
                        <div className="text-sm font-bold text-red-500">
                          {(c.no_price * 100).toFixed(0)}c
                        </div>
                      </div>
                      <button
                        onClick={() => analyzeMarket(c)}
                        disabled={analyzing === c.condition_id}
                        className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white text-xs rounded-lg transition-colors whitespace-nowrap"
                      >
                        {analyzing === c.condition_id ? "Analyzing..." : "AI Analyze"}
                      </button>
                    </div>
                  </div>

                  {/* Analysis Result */}
                  {analysis && (
                    <AnalysisCard analysis={analysis} marketYesPrice={c.yes_price} />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {!scanning && candidates.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg mb-2">No candidates yet</p>
          <p className="text-sm">Click &quot;Scan Markets&quot; to discover tradeable markets</p>
        </div>
      )}
    </div>
  );
}

// ─── Analysis Card ──────────────────────────────────────────────────────

function AnalysisCard({ analysis, marketYesPrice }: { analysis: PMAIAnalysis; marketYesPrice: number }) {
  if (analysis.error) {
    return (
      <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-xs text-red-600">Analysis failed: {analysis.error}</p>
      </div>
    );
  }

  const sideColor = analysis.recommended_side === "YES"
    ? "text-green-600 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
    : analysis.recommended_side === "NO"
    ? "text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
    : "text-slate-500 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700";

  return (
    <div className={`mt-3 p-4 border rounded-lg ${sideColor}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold">
            {analysis.recommended_side}
          </span>
          <span className="text-sm font-medium">
            Claude: {(analysis.probability * 100).toFixed(0)}%
            <span className="text-xs text-slate-400 ml-1">
              (market: {(marketYesPrice * 100).toFixed(0)}%)
            </span>
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span>Edge: <strong>{analysis.edge_pct.toFixed(1)}%</strong></span>
          <span>Conf: <strong>{(analysis.confidence * 100).toFixed(0)}%</strong></span>
          {analysis.kelly_fraction > 0 && (
            <span>Kelly: <strong>{(analysis.kelly_fraction * 100).toFixed(1)}%</strong></span>
          )}
        </div>
      </div>

      {/* Probability Bar */}
      <div className="relative h-3 bg-slate-200 dark:bg-slate-700 rounded-full mb-3 overflow-hidden">
        <div
          className="absolute h-full bg-purple-500 rounded-full"
          style={{ width: `${analysis.probability * 100}%` }}
        />
        <div
          className="absolute h-full w-0.5 bg-slate-600 dark:bg-slate-300"
          style={{ left: `${marketYesPrice * 100}%` }}
          title={`Market: ${(marketYesPrice * 100).toFixed(0)}%`}
        />
      </div>

      <p className="text-sm mb-2">{analysis.reasoning}</p>

      {analysis.key_factors.length > 0 && (
        <div className="mb-2">
          <span className="text-xs font-medium text-slate-500">Key Factors:</span>
          <ul className="mt-1 space-y-0.5">
            {analysis.key_factors.map((f, i) => (
              <li key={i} className="text-xs text-slate-600 dark:text-slate-400">+ {f}</li>
            ))}
          </ul>
        </div>
      )}

      {analysis.risks.length > 0 && (
        <div>
          <span className="text-xs font-medium text-slate-500">Risks:</span>
          <ul className="mt-1 space-y-0.5">
            {analysis.risks.map((r, i) => (
              <li key={i} className="text-xs text-slate-600 dark:text-slate-400">- {r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── History View ───────────────────────────────────────────────────────

function HistoryView() {
  const [logs, setLogs] = useState<PMAILogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.pmAIGetLogs(100).then(setLogs).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading...</div>;

  if (logs.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p>No analysis history yet</p>
        <p className="text-xs mt-1">Run AI Analyze on markets to build history</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">{logs.length} analysis entries</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-left text-xs">
              <th className="pb-2 font-medium">Time</th>
              <th className="pb-2 font-medium">Market</th>
              <th className="pb-2 font-medium">Category</th>
              <th className="pb-2 font-medium">Market P</th>
              <th className="pb-2 font-medium">Claude P</th>
              <th className="pb-2 font-medium">Edge</th>
              <th className="pb-2 font-medium">Conf</th>
              <th className="pb-2 font-medium">Signal</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-2 text-xs text-slate-400 whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString("ko-KR", {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </td>
                <td className="py-2 max-w-[200px] truncate text-xs">
                  {log.question}
                </td>
                <td>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${CATEGORY_COLORS[log.category] || CATEGORY_COLORS.other}`}>
                    {log.category}
                  </span>
                </td>
                <td className="text-xs">{(log.market_yes_price * 100).toFixed(0)}%</td>
                <td className="text-xs font-medium">{(log.claude_probability * 100).toFixed(0)}%</td>
                <td className="text-xs">
                  <span className={log.edge >= 0.10 ? "text-green-600 font-medium" : "text-slate-400"}>
                    {(log.edge * 100).toFixed(1)}%
                  </span>
                </td>
                <td className="text-xs">{(log.claude_confidence * 100).toFixed(0)}%</td>
                <td>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                    log.recommended_side === "YES"
                      ? "bg-green-100 dark:bg-green-900/30 text-green-600"
                      : log.recommended_side === "NO"
                      ? "bg-red-100 dark:bg-red-900/30 text-red-500"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                  }`}>
                    {log.recommended_side}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Accuracy View ──────────────────────────────────────────────────────

function AccuracyView() {
  const [accuracy, setAccuracy] = useState<PMAIAccuracy | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.pmAIGetAccuracy().then(setAccuracy).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading...</div>;

  if (!accuracy || accuracy.total === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p>No accuracy data yet</p>
        <p className="text-xs mt-1">Run --scan-only for 3-5 days to collect prediction data</p>
      </div>
    );
  }

  const brierLabel = accuracy.brier_score == null
    ? "N/A"
    : accuracy.brier_score < 0.20
    ? "Good"
    : accuracy.brier_score < 0.25
    ? "Marginal"
    : "Poor";

  const brierColor = accuracy.brier_score == null
    ? "text-slate-400"
    : accuracy.brier_score < 0.20
    ? "text-green-600"
    : accuracy.brier_score < 0.25
    ? "text-yellow-600"
    : "text-red-500";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="font-semibold">Claude Prediction Accuracy</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Brier Score benchmark: 0.00 = perfect, 0.25 = coin flip
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Analyses" value={String(accuracy.total)} />
        <MetricCard label="Resolved" value={String(accuracy.resolved)} sub={`${accuracy.pending} pending`} />
        <MetricCard label="Traded" value={String(accuracy.traded)} sub={`${accuracy.skipped} skipped`} />
        <MetricCard
          label="Brier Score"
          value={accuracy.brier_score?.toFixed(4) ?? "N/A"}
          sub={brierLabel}
          color={brierColor}
        />
      </div>

      {accuracy.accuracy != null && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-5">
          <h3 className="font-medium mb-3">Directional Accuracy</h3>
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold">
              {(accuracy.accuracy * 100).toFixed(1)}%
            </div>
            <div className="flex-1">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    accuracy.accuracy >= 0.65 ? "bg-green-500" : accuracy.accuracy >= 0.5 ? "bg-yellow-500" : "bg-red-500"
                  }`}
                  style={{ width: `${accuracy.accuracy * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>0%</span>
                <span>50% (coin flip)</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {Object.keys(accuracy.categories).length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-5">
          <h3 className="font-medium mb-3">Category Breakdown</h3>
          <div className="space-y-2">
            {Object.entries(accuracy.categories)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, count]) => (
                <div key={cat} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.other}`}>
                      {cat}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${(count / accuracy.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Guide */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-5 text-sm text-slate-500">
        <h3 className="font-medium text-slate-600 dark:text-slate-300 mb-2">Accuracy Guide</h3>
        <ul className="space-y-1 text-xs">
          <li><strong>Brier &lt; 0.20</strong> — Edge likely exists, profitable trading possible</li>
          <li><strong>Brier 0.20-0.25</strong> — Marginal edge, consider tighter filters</li>
          <li><strong>Brier &gt; 0.25</strong> — Worse than coin flip, review strategy</li>
          <li><strong>Tip:</strong> Run scan-only for 3-5 days before live trading to validate accuracy</li>
        </ul>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-4">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color || ""}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

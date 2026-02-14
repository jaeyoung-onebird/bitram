"use client";
import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Strategy, BacktestResult, BacktestTrade } from "@/types";
import {
  ArrowLeft,
  FlaskConical,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  ArrowUpDown,
  Clock,
  RefreshCw,
} from "lucide-react";
import clsx from "clsx";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  AreaChart,
  ReferenceLine,
} from "recharts";

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color: "green" | "red" | "blue" | "orange" | "purple" | "gray";
  sub?: string;
}) {
  const colors: Record<string, string> = {
    green: "text-green-400",
    red: "text-red-400",
    blue: "text-blue-500",
    orange: "text-orange-400",
    purple: "text-purple-400",
    gray: "text-slate-600 dark:text-slate-300",
  };
  return (
    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</div>
      <div className={clsx("text-lg font-bold", colors[color])}>{value}</div>
      {sub && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  color: string;
  name: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-xl text-xs">
      <div className="text-slate-400 dark:text-slate-500 mb-1.5">{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-slate-400 dark:text-slate-500">{entry.name}:</span>
          <span className="text-slate-800 dark:text-slate-100 font-mono">
            {entry.value.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatCapitalInput(value: string): string {
  if (!value) return "";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num.toLocaleString("en-US");
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default function BacktestPage() {
  const params = useParams();
  const router = useRouter();
  const strategyId = params.id as string;

  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState("");

  // Backtest params
  const [period, setPeriod] = useState("3m");
  const [initialCapital, setInitialCapital] = useState("10000000");

  // Trade list
  const [sortField, setSortField] = useState<"entry_time" | "profit_pct">(
    "entry_time"
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [tradeFilter, setTradeFilter] = useState<"all" | "win" | "lose">(
    "all"
  );

  useEffect(() => {
    api
      .getStrategy(strategyId)
      .then(setStrategy)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [strategyId]);

  const handleRerun = async () => {
    setRerunning(true);
    setRerunError("");
    try {
      const result = await api.runBacktest(
        strategyId,
        period,
        Number(initialCapital) || 10_000_000
      );
      setStrategy((prev) =>
        prev ? { ...prev, backtest_result: result } : null
      );
    } catch (err) {
      setRerunError(
        err instanceof Error ? err.message : "백테스트 실행에 실패했습니다."
      );
    } finally {
      setRerunning(false);
    }
  };

  const bt = strategy?.backtest_result ?? null;

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!bt?.equity_curve) return [];
    return bt.equity_curve.map((pt) => ({
      time: pt.time.slice(0, 10), // YYYY-MM-DD
      equity: Math.round(pt.equity),
      price: Math.round(pt.price),
    }));
  }, [bt]);

  // Compute normalized chart for overlay comparison
  const normalizedChartData = useMemo(() => {
    if (!bt?.equity_curve || bt.equity_curve.length === 0) return [];
    const firstEquity = bt.equity_curve[0].equity;
    const firstPrice = bt.equity_curve[0].price;
    return bt.equity_curve.map((pt) => ({
      time: pt.time.slice(0, 10),
      strategy: ((pt.equity / firstEquity - 1) * 100),
      benchmark: ((pt.price / firstPrice - 1) * 100),
    }));
  }, [bt]);

  // Filtered & sorted trades
  const trades = useMemo(() => {
    if (!bt?.trades) return [];
    let filtered = [...bt.trades];

    if (tradeFilter === "win") {
      filtered = filtered.filter((t) => t.profit >= 0);
    } else if (tradeFilter === "lose") {
      filtered = filtered.filter((t) => t.profit < 0);
    }

    filtered.sort((a, b) => {
      const aVal =
        sortField === "entry_time"
          ? new Date(a.entry_time).getTime()
          : a.profit_pct;
      const bVal =
        sortField === "entry_time"
          ? new Date(b.entry_time).getTime()
          : b.profit_pct;
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });

    return filtered;
  }, [bt, sortField, sortDir, tradeFilter]);

  const toggleSort = (field: "entry_time" | "profit_pct") => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 dark:text-slate-400">로딩 중...</div>
      </div>
    );
  }

  if (!strategy) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-red-400 mb-4">전략을 찾을 수 없습니다.</p>
        <Link
          href="/strategies"
          className="text-blue-500 hover:underline text-sm"
        >
          전략 목록으로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Back link */}
      <Link
        href={`/strategies/${strategyId}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        {strategy.name}
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-purple-400" />
            백테스트 결과
          </h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
            <span className="font-mono text-blue-500">{strategy.pair}</span> /{" "}
            {strategy.timeframe}
          </p>
        </div>

        {/* Re-run controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-2 sm:px-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="1m">1개월</option>
            <option value="3m">3개월</option>
            <option value="6m">6개월</option>
            <option value="1y">1년</option>
            <option value="2y">2년</option>
          </select>
          <input
            type="text"
            inputMode="numeric"
            value={formatCapitalInput(initialCapital)}
            onChange={(e) =>
              setInitialCapital(e.target.value.replace(/[^\d]/g, ""))
            }
            className="w-28 sm:w-36 px-2 sm:px-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
            placeholder="초기 자본"
          />
          <button
            onClick={handleRerun}
            disabled={rerunning}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-white bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:cursor-not-allowed rounded-lg transition"
          >
            <RefreshCw
              className={clsx("w-3.5 h-3.5 sm:w-4 sm:h-4", rerunning && "animate-spin")}
            />
            {rerunning ? "..." : "재실행"}
          </button>
        </div>
      </div>

      {rerunError && (
        <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {rerunError}
        </div>
      )}

      {/* No backtest data */}
      {!bt && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm p-12 text-center">
          <FlaskConical className="w-10 h-10 text-slate-500 dark:text-slate-400 mx-auto mb-4" />
          <p className="text-slate-400 dark:text-slate-500 mb-2">백테스트 결과가 없습니다.</p>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
            위의 재실행 버튼을 클릭하여 백테스트를 실행하세요.
          </p>
        </div>
      )}

      {bt && (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="총 수익률"
              value={`${bt.total_return_pct >= 0 ? "+" : ""}${bt.total_return_pct.toFixed(2)}%`}
              color={bt.total_return_pct >= 0 ? "green" : "red"}
            />
            <StatCard
              label="벤치마크 수익률"
              value={`${bt.benchmark_return_pct >= 0 ? "+" : ""}${bt.benchmark_return_pct.toFixed(2)}%`}
              color={bt.benchmark_return_pct >= 0 ? "green" : "red"}
              sub="Buy & Hold"
            />
            <StatCard
              label="승률"
              value={`${bt.win_rate.toFixed(1)}%`}
              color="blue"
              sub={`${bt.win_trades}W / ${bt.lose_trades}L`}
            />
            <StatCard
              label="최대 낙폭 (MDD)"
              value={`${bt.max_drawdown_pct.toFixed(2)}%`}
              color="orange"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Sharpe Ratio"
              value={bt.sharpe_ratio.toFixed(2)}
              color={bt.sharpe_ratio >= 1 ? "green" : bt.sharpe_ratio >= 0 ? "gray" : "red"}
            />
            <StatCard
              label="Profit Factor"
              value={bt.profit_factor.toFixed(2)}
              color={bt.profit_factor >= 1.5 ? "green" : bt.profit_factor >= 1 ? "gray" : "red"}
            />
            <StatCard
              label="평균 수익 / 손실"
              value={`+${bt.avg_profit_pct.toFixed(2)}% / ${bt.avg_loss_pct.toFixed(2)}%`}
              color="purple"
            />
            <StatCard
              label="평균 보유 기간"
              value={`${bt.avg_holding_bars.toFixed(1)} 봉`}
              color="gray"
              sub={`총 ${bt.total_trades}거래 / ${bt.total_bars}봉`}
            />
          </div>

          {/* Equity Curve Chart */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm p-3.5 sm:p-5">
            <h2 className="font-bold flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-blue-500" />
              자산 곡선 (Equity Curve)
            </h2>
            {chartData.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient
                        id="equityGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#3b82f6"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="100%"
                          stopColor="#3b82f6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#1f2937"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 10, fill: "#6b7280" }}
                      tickLine={false}
                      axisLine={{ stroke: "#374151" }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#6b7280" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) =>
                        `${(v / 1_000_000).toFixed(1)}M`
                      }
                      width={55}
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                    />
                    <Area
                      type="monotone"
                      dataKey="equity"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#equityGradient)"
                      name="자산"
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-72 flex items-center justify-center text-slate-500 dark:text-slate-400 text-sm">
                차트 데이터가 없습니다.
              </div>
            )}
          </div>

          {/* Strategy vs Benchmark Comparison */}
          {normalizedChartData.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm p-3.5 sm:p-5">
              <h2 className="font-bold flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                전략 vs 벤치마크 수익률 비교
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                전략 수익률과 Buy &amp; Hold 수익률을 비교합니다.
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={normalizedChartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#1f2937"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 10, fill: "#6b7280" }}
                      tickLine={false}
                      axisLine={{ stroke: "#374151" }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#6b7280" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                      width={50}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        return (
                          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-xl text-xs">
                            <div className="text-slate-400 dark:text-slate-500 mb-1.5">{label}</div>
                            {payload.map((entry) => (
                              <div key={entry.dataKey} className="flex items-center gap-2">
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: entry.color }}
                                />
                                <span className="text-slate-400 dark:text-slate-500">{entry.name}:</span>
                                <span className="text-slate-800 dark:text-slate-100 font-mono">
                                  {typeof entry.value === "number"
                                    ? `${entry.value >= 0 ? "+" : ""}${entry.value.toFixed(2)}%`
                                    : entry.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine y={0} stroke="#374151" strokeDasharray="3 3" />
                    <Line
                      type="monotone"
                      dataKey="strategy"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      name="전략"
                    />
                    <Line
                      type="monotone"
                      dataKey="benchmark"
                      stroke="#6b7280"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                      name="벤치마크"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-6 mt-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-4 h-0.5 bg-blue-500 rounded" />
                  <span className="text-slate-400 dark:text-slate-500">전략</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-4 h-0.5 bg-slate-500 rounded border-dashed" />
                  <span className="text-slate-400 dark:text-slate-500">벤치마크 (Buy &amp; Hold)</span>
                </div>
              </div>
            </div>
          )}

          {/* Trade List */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm p-3.5 sm:p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-bold flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-green-400" />
                거래 내역 ({trades.length}건)
              </h2>
              <div className="flex gap-1">
                {(
                  [
                    { value: "all", label: "전체" },
                    { value: "win", label: "수익" },
                    { value: "lose", label: "손실" },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setTradeFilter(f.value)}
                    className={clsx(
                      "px-3 py-1 rounded text-xs transition",
                      tradeFilter === f.value
                        ? "bg-blue-500 text-white"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 hover:border-gray-600 dark:hover:border-slate-600"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {trades.length === 0 ? (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
                해당하는 거래가 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      <th className="pb-2 text-left font-medium">#</th>
                      <th
                        className="pb-2 text-left font-medium cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 select-none"
                        onClick={() => toggleSort("entry_time")}
                      >
                        <span className="flex items-center gap-1">
                          진입 시간
                          {sortField === "entry_time" && (
                            <span>{sortDir === "asc" ? "^" : "v"}</span>
                          )}
                        </span>
                      </th>
                      <th className="pb-2 text-left font-medium">청산 시간</th>
                      <th className="pb-2 text-right font-medium">진입가</th>
                      <th className="pb-2 text-right font-medium">청산가</th>
                      <th className="pb-2 text-right font-medium">수량</th>
                      <th
                        className="pb-2 text-right font-medium cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 select-none"
                        onClick={() => toggleSort("profit_pct")}
                      >
                        <span className="flex items-center justify-end gap-1">
                          수익률
                          {sortField === "profit_pct" && (
                            <span>{sortDir === "asc" ? "^" : "v"}</span>
                          )}
                        </span>
                      </th>
                      <th className="pb-2 text-right font-medium">수익</th>
                      <th className="pb-2 text-center font-medium">
                        <Clock className="w-3 h-3 inline" />
                      </th>
                      <th className="pb-2 text-left font-medium">사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade: BacktestTrade, idx: number) => (
                      <tr
                        key={idx}
                        className="border-b border-slate-100/50 dark:border-slate-800/50 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition"
                      >
                        <td className="py-2.5 text-slate-500 dark:text-slate-400 text-xs">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 text-slate-600 dark:text-slate-300 font-mono text-xs">
                          {trade.entry_time.slice(0, 16).replace("T", " ")}
                        </td>
                        <td className="py-2.5 text-slate-600 dark:text-slate-300 font-mono text-xs">
                          {trade.exit_time.slice(0, 16).replace("T", " ")}
                        </td>
                        <td className="py-2.5 text-right text-slate-600 dark:text-slate-300 font-mono text-xs">
                          {trade.entry_price.toLocaleString()}
                        </td>
                        <td className="py-2.5 text-right text-slate-600 dark:text-slate-300 font-mono text-xs">
                          {trade.exit_price.toLocaleString()}
                        </td>
                        <td className="py-2.5 text-right text-slate-400 dark:text-slate-500 font-mono text-xs">
                          {trade.quantity.toFixed(6)}
                        </td>
                        <td
                          className={clsx(
                            "py-2.5 text-right font-mono font-bold text-xs",
                            trade.profit_pct >= 0
                              ? "text-green-400"
                              : "text-red-400"
                          )}
                        >
                          {trade.profit_pct >= 0 ? "+" : ""}
                          {trade.profit_pct.toFixed(2)}%
                        </td>
                        <td
                          className={clsx(
                            "py-2.5 text-right font-mono text-xs",
                            trade.profit >= 0
                              ? "text-green-400"
                              : "text-red-400"
                          )}
                        >
                          {trade.profit >= 0 ? "+" : ""}
                          {trade.profit.toLocaleString()}
                        </td>
                        <td className="py-2.5 text-center text-slate-500 dark:text-slate-400 text-xs">
                          {trade.holding_bars}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={clsx(
                              "text-xs px-1.5 py-0.5 rounded",
                              trade.reason === "take_profit"
                                ? "bg-emerald-500/10 text-emerald-600"
                                : trade.reason === "stop_loss"
                                  ? "bg-red-500/15 text-red-400"
                                  : "bg-slate-500/15 text-slate-400 dark:text-slate-500"
                            )}
                          >
                            {trade.reason === "take_profit"
                              ? "익절"
                              : trade.reason === "stop_loss"
                                ? "손절"
                                : trade.reason === "signal"
                                  ? "시그널"
                                  : trade.reason}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Backtest metadata */}
          <div className="text-xs text-slate-500 dark:text-slate-400 text-right">
            백테스트 기간: {bt.start_date} ~ {bt.end_date} | 총 {bt.total_bars}
            봉 | 초기 자본:{" "}
            {Number(initialCapital).toLocaleString()} KRW
          </div>
        </>
      )}
    </div>
  );
}

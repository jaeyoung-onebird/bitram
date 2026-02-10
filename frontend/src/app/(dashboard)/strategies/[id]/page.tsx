"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Strategy, StrategyCondition } from "@/types";
import {
  ArrowLeft,
  Pencil,
  FlaskConical,
  Bot,
  Globe,
  Lock,
  TrendingUp,
  TrendingDown,
  Clock,
  BarChart3,
  Shield,
  Zap,
  Copy,
} from "lucide-react";
import clsx from "clsx";

const OPERATOR_LABELS: Record<string, string> = {
  greater_than: ">",
  less_than: "<",
  equal: "=",
  greater_equal: ">=",
  less_equal: "<=",
  crosses_above: "Crosses Above",
  crosses_below: "Crosses Below",
};

const TIMEFRAME_LABELS: Record<string, string> = {
  "1m": "1분",
  "3m": "3분",
  "5m": "5분",
  "15m": "15분",
  "30m": "30분",
  "1h": "1시간",
  "4h": "4시간",
  "1d": "1일",
};

const ACTION_LABELS: Record<string, string> = {
  market_buy: "시장가 매수",
  market_sell: "시장가 매도",
  limit_buy: "지정가 매수",
  limit_sell: "지정가 매도",
};

export default function StrategyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const strategyId = params.id as string;

  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [backtesting, setBacktesting] = useState(false);
  const [btError, setBtError] = useState("");

  useEffect(() => {
    api
      .getStrategy(strategyId)
      .then(setStrategy)
      .catch((err) => {
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, [strategyId]);

  const handleRunBacktest = async () => {
    setBacktesting(true);
    setBtError("");
    try {
      const result = await api.runBacktest(strategyId);
      setStrategy((prev) =>
        prev ? { ...prev, backtest_result: result } : null
      );
      router.push(`/strategies/${strategyId}/backtest`);
    } catch (err) {
      setBtError(
        err instanceof Error ? err.message : "백테스트 실행에 실패했습니다."
      );
    } finally {
      setBacktesting(false);
    }
  };

  const handleCreateBot = () => {
    router.push(`/bots?create=true&strategy_id=${strategyId}`);
  };

  const handleDuplicate = async () => {
    try {
      await api.duplicateStrategy(strategyId);
      router.push("/strategies");
    } catch (err) {
      console.error(err);
      alert("복제에 실패했습니다.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    );
  }

  if (!strategy) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-red-400 mb-4">전략을 찾을 수 없습니다.</p>
        <Link
          href="/strategies"
          className="text-blue-400 hover:underline text-sm"
        >
          전략 목록으로 돌아가기
        </Link>
      </div>
    );
  }

  const config = strategy.config_json;
  const bt = strategy.backtest_result;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Back link */}
      <Link
        href="/strategies"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-300 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        전략 목록
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">{strategy.name}</h1>
            <span
              className={clsx(
                "flex items-center gap-1 text-xs px-2 py-0.5 rounded-full",
                strategy.is_public
                  ? "bg-green-500/15 text-green-400"
                  : "bg-gray-500/15 text-gray-400"
              )}
            >
              {strategy.is_public ? (
                <Globe className="w-3 h-3" />
              ) : (
                <Lock className="w-3 h-3" />
              )}
              {strategy.is_public ? "공개" : "비공개"}
            </span>
          </div>
          {strategy.description && (
            <p className="text-sm text-gray-400 mb-2">{strategy.description}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 font-mono">
              {strategy.pair}
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-purple-500/15 text-purple-400">
              {TIMEFRAME_LABELS[strategy.timeframe] || strategy.timeframe}
            </span>
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(strategy.created_at).toLocaleDateString("ko-KR")}
            </span>
            {strategy.copy_count > 0 && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Copy className="w-3 h-3" />
                {strategy.copy_count}회 복제됨
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => router.push(`/strategies/new?edit=${strategyId}`)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-blue-400 bg-[#1a2332] border border-gray-800 hover:border-blue-500/30 rounded-lg transition"
          >
            <Pencil className="w-4 h-4" />
            수정
          </button>
          <button
            onClick={handleRunBacktest}
            disabled={backtesting}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:cursor-not-allowed rounded-lg transition"
          >
            <FlaskConical className="w-4 h-4" />
            {backtesting ? "실행 중..." : "백테스트"}
          </button>
          <button
            onClick={handleCreateBot}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition"
          >
            <Bot className="w-4 h-4" />
            봇 생성
          </button>
          <button
            onClick={handleDuplicate}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-green-400 bg-[#1a2332] border border-gray-800 hover:border-green-500/30 rounded-lg transition"
            title="복제"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>

      {btError && (
        <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {btError}
        </div>
      )}

      {/* Backtest Result Summary */}
      {bt && (
        <div className="bg-[#1a2332] rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple-400" />
              백테스트 결과
            </h2>
            <Link
              href={`/strategies/${strategyId}/backtest`}
              className="text-sm text-blue-400 hover:underline"
            >
              상세 보기
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 bg-[#111827] rounded-lg text-center">
              <div className="text-[10px] text-gray-500 mb-1">총 수익률</div>
              <div
                className={clsx(
                  "text-xl font-bold flex items-center justify-center gap-1",
                  bt.total_return_pct >= 0 ? "text-green-400" : "text-red-400"
                )}
              >
                {bt.total_return_pct >= 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                {bt.total_return_pct >= 0 ? "+" : ""}
                {bt.total_return_pct.toFixed(2)}%
              </div>
            </div>
            <div className="p-3 bg-[#111827] rounded-lg text-center">
              <div className="text-[10px] text-gray-500 mb-1">승률</div>
              <div className="text-xl font-bold text-gray-100">
                {bt.win_rate.toFixed(1)}%
              </div>
              <div className="text-[10px] text-gray-500">
                {bt.win_trades}W / {bt.lose_trades}L
              </div>
            </div>
            <div className="p-3 bg-[#111827] rounded-lg text-center">
              <div className="text-[10px] text-gray-500 mb-1">MDD</div>
              <div className="text-xl font-bold text-orange-400">
                {bt.max_drawdown_pct.toFixed(2)}%
              </div>
            </div>
            <div className="p-3 bg-[#111827] rounded-lg text-center">
              <div className="text-[10px] text-gray-500 mb-1">Sharpe Ratio</div>
              <div className="text-xl font-bold text-blue-400">
                {bt.sharpe_ratio.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
            <div className="p-2 bg-[#111827] rounded-lg text-center">
              <div className="text-[10px] text-gray-500">총 거래</div>
              <div className="text-sm font-bold text-gray-300">
                {bt.total_trades}회
              </div>
            </div>
            <div className="p-2 bg-[#111827] rounded-lg text-center">
              <div className="text-[10px] text-gray-500">Profit Factor</div>
              <div className="text-sm font-bold text-gray-300">
                {bt.profit_factor.toFixed(2)}
              </div>
            </div>
            <div className="p-2 bg-[#111827] rounded-lg text-center">
              <div className="text-[10px] text-gray-500">평균 수익</div>
              <div className="text-sm font-bold text-green-400">
                +{bt.avg_profit_pct.toFixed(2)}%
              </div>
            </div>
            <div className="p-2 bg-[#111827] rounded-lg text-center">
              <div className="text-[10px] text-gray-500">평균 손실</div>
              <div className="text-sm font-bold text-red-400">
                {bt.avg_loss_pct.toFixed(2)}%
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs text-gray-500 text-right">
            기간: {bt.start_date} ~ {bt.end_date} ({bt.total_bars}봉)
          </div>
        </div>
      )}

      {!bt && (
        <div className="bg-[#1a2332] rounded-xl border border-gray-800 p-8 text-center">
          <FlaskConical className="w-8 h-8 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 mb-2">아직 백테스트를 실행하지 않았습니다.</p>
          <p className="text-gray-500 text-sm mb-4">
            백테스트를 실행하여 전략의 과거 성과를 확인하세요.
          </p>
          <button
            onClick={handleRunBacktest}
            disabled={backtesting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 rounded-lg transition"
          >
            <FlaskConical className="w-4 h-4" />
            {backtesting ? "실행 중..." : "백테스트 실행"}
          </button>
        </div>
      )}

      {/* Strategy Configuration */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Conditions */}
        <div className="bg-[#1a2332] rounded-xl border border-gray-800 p-5">
          <h3 className="font-bold flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-yellow-400" />
            진입 조건
          </h3>
          <div className="mb-3">
            <span
              className={clsx(
                "text-xs px-2 py-0.5 rounded font-bold",
                config.conditions_logic === "AND"
                  ? "bg-blue-600/20 text-blue-400"
                  : "bg-orange-600/20 text-orange-400"
              )}
            >
              {config.conditions_logic === "AND"
                ? "AND - 모두 충족"
                : "OR - 하나만 충족"}
            </span>
          </div>
          <div className="space-y-2">
            {config.conditions.map((cond: StrategyCondition, idx: number) => (
              <div
                key={idx}
                className="p-3 bg-[#111827] rounded-lg text-sm"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">{idx + 1}.</span>
                  <span className="text-blue-400 font-mono font-medium">
                    {cond.indicator.toUpperCase()}
                  </span>
                  {Object.keys(cond.params).length > 0 && (
                    <span className="text-gray-500 text-xs">
                      (
                      {Object.entries(cond.params)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(", ")}
                      )
                    </span>
                  )}
                  {cond.output_key && (
                    <span className="text-purple-400 text-xs">
                      .{cond.output_key}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-yellow-400 text-xs font-medium">
                    {OPERATOR_LABELS[cond.operator] || cond.operator}
                  </span>
                  <span className="text-green-400 font-mono text-xs">
                    {typeof cond.value === "number"
                      ? cond.value
                      : JSON.stringify(cond.value)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action & Safety */}
        <div className="space-y-4">
          {/* Action */}
          <div className="bg-[#1a2332] rounded-xl border border-gray-800 p-5">
            <h3 className="font-bold flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-green-400" />
              액션
            </h3>
            <div className="p-3 bg-[#111827] rounded-lg">
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-gray-500">주문 유형</span>
                <span
                  className={clsx(
                    "font-medium",
                    config.action.type.includes("buy")
                      ? "text-green-400"
                      : "text-red-400"
                  )}
                >
                  {ACTION_LABELS[config.action.type] || config.action.type}
                </span>
                <span className="text-gray-500">수량 기준</span>
                <span className="text-gray-100">
                  {config.action.amount_type === "percent"
                    ? "비율 (%)"
                    : "고정 금액 (KRW)"}
                </span>
                <span className="text-gray-500">수량</span>
                <span className="text-gray-100 font-mono">
                  {config.action.amount}
                  {config.action.amount_type === "percent" ? "%" : " KRW"}
                </span>
              </div>
            </div>
          </div>

          {/* Safety */}
          <div className="bg-[#1a2332] rounded-xl border border-gray-800 p-5">
            <h3 className="font-bold flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-blue-400" />
              안전 장치
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-red-500/10 rounded-lg text-center border border-red-500/15">
                <div className="text-[10px] text-gray-500 mb-1">손절</div>
                <div className="text-base font-bold text-red-400">
                  -{config.safety.stop_loss}%
                </div>
              </div>
              <div className="p-3 bg-green-500/10 rounded-lg text-center border border-green-500/15">
                <div className="text-[10px] text-gray-500 mb-1">익절</div>
                <div className="text-base font-bold text-green-400">
                  +{config.safety.take_profit}%
                </div>
              </div>
              <div className="p-3 bg-blue-500/10 rounded-lg text-center border border-blue-500/15">
                <div className="text-[10px] text-gray-500 mb-1">
                  최대 포지션
                </div>
                <div className="text-base font-bold text-blue-400">
                  {config.safety.max_position}%
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Raw JSON */}
      <details className="bg-[#1a2332] rounded-xl border border-gray-800 p-5">
        <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-300 transition select-none">
          Config JSON 보기
        </summary>
        <pre className="mt-3 text-xs text-gray-500 overflow-x-auto font-mono bg-[#0a0e17] p-3 rounded-lg max-h-64 overflow-y-auto">
          {JSON.stringify(config, null, 2)}
        </pre>
      </details>
    </div>
  );
}

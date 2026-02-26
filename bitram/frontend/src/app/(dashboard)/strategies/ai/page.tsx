"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import type { AIGenerateResponse, AIStrategyResult } from "@/types";
import Link from "next/link";
import { useRouter } from "next/navigation";

const PAIRS = ["KRW-BTC", "KRW-ETH", "KRW-XRP", "KRW-SOL", "KRW-DOGE", "KRW-ADA", "KRW-AVAX", "KRW-DOT"];
const TIMEFRAMES = [
  { value: "5m", label: "5분" },
  { value: "15m", label: "15분" },
  { value: "1h", label: "1시간" },
  { value: "4h", label: "4시간" },
  { value: "1d", label: "1일" },
];
const STYLES = [
  { value: "aggressive", label: "공격적", desc: "높은 수익, 높은 리스크", color: "text-red-400 bg-red-500/10 border-red-500/30" },
  { value: "balanced", label: "균형", desc: "적당한 리스크/리워드", color: "text-blue-500 bg-blue-500/10 border-blue-500/30" },
  { value: "conservative", label: "보수적", desc: "안정적 수익, 낮은 리스크", color: "text-green-400 bg-green-500/10 border-green-500/30" },
  { value: "scalping", label: "스캘핑", desc: "초단타, 빠른 진입/탈출", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30" },
  { value: "swing", label: "스윙", desc: "중장기 트렌드 추종", color: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
];

export default function AIStrategyPage() {
  const router = useRouter();
  const [pair, setPair] = useState("KRW-BTC");
  const [timeframe, setTimeframe] = useState("15m");
  const [style, setStyle] = useState("balanced");
  const [provider, setProvider] = useState<"claude" | "openai">("claude");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIGenerateResponse | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await api.aiGenerate({ pair, timeframe, style, provider, count: 5 });
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "AI 전략 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (s: AIStrategyResult) => {
    setSaving(result?.strategies.indexOf(s) ?? null);
    try {
      await api.aiSave({
        name: s.name,
        description: s.description,
        pair,
        timeframe,
        config_json: s.config_json as unknown as Record<string, unknown>,
      });
      router.push("/strategies");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
      setSaving(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link href="/strategies" className="text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition">&larr;</Link>
        <h1 className="text-2xl font-bold">AI 전략 찾기</h1>
        <span className="text-xs px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-600 border border-purple-400/30">
          BETA
        </span>
      </div>

      <p className="text-slate-400 dark:text-slate-500 text-sm">
        AI가 다양한 전략을 자동 생성하고 백테스트해서 수익 나는 전략만 찾아줍니다.
      </p>

      {/* Settings */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm p-6 space-y-5">
        {/* Pair */}
        <div>
          <label className="text-sm text-slate-400 dark:text-slate-500 mb-2 block">코인</label>
          <div className="flex flex-wrap gap-2">
            {PAIRS.map((p) => (
              <button
                key={p}
                onClick={() => setPair(p)}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  pair === p
                    ? "bg-blue-500 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100"
                }`}
              >
                {p.replace("KRW-", "")}
              </button>
            ))}
          </div>
        </div>

        {/* Timeframe */}
        <div>
          <label className="text-sm text-slate-400 dark:text-slate-500 mb-2 block">타임프레임</label>
          <div className="flex gap-2">
            {TIMEFRAMES.map((t) => (
              <button
                key={t.value}
                onClick={() => setTimeframe(t.value)}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  timeframe === t.value
                    ? "bg-blue-500 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Style */}
        <div>
          <label className="text-sm text-slate-400 dark:text-slate-500 mb-2 block">트레이딩 스타일</label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {STYLES.map((s) => (
              <button
                key={s.value}
                onClick={() => setStyle(s.value)}
                className={`p-3 rounded-lg border text-left transition ${
                  style === s.value ? s.color : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                <div className="text-sm font-medium">{s.label}</div>
                <div className="text-xs opacity-70 mt-0.5">{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Provider */}
        <div>
          <label className="text-sm text-slate-400 dark:text-slate-500 mb-2 block">AI 모델</label>
          <div className="flex gap-2">
            {[
              { value: "claude", label: "Claude" },
              { value: "openai", label: "OpenAI" },
            ].map((p) => (
              <button
                key={p.value}
                onClick={() => setProvider(p.value as "claude" | "openai")}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  provider === p.value
                    ? "bg-blue-500 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            선택한 모델로 전략을 생성합니다. (백테스트는 동일)
          </p>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full py-3 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              AI가 전략을 분석 중... (10~20초 소요)
            </span>
          ) : (
            "AI 전략 찾기 시작"
          )}
        </button>

        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">
              AI 분석 결과
              <span className="text-sm text-slate-400 dark:text-slate-500 font-normal ml-2">
                {result.total_generated}개 생성 / {result.profitable_count}개 수익
              </span>
            </h2>
          </div>

          {result.strategies.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm p-8 text-center text-slate-500 dark:text-slate-400">
              <p>수익 나는 전략을 찾지 못했습니다.</p>
              <p className="text-sm mt-1">다른 설정으로 다시 시도해보세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {result.strategies.map((s, i) => (
                <StrategyCard
                  key={i}
                  strategy={s}
                  rank={i + 1}
                  onSave={() => handleSave(s)}
                  isSaving={saving === i}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StrategyCard({
  strategy: s,
  rank,
  onSave,
  isSaving,
}: {
  strategy: AIStrategyResult;
  rank: number;
  onSave: () => void;
  isSaving: boolean;
}) {
  const bt = s.backtest;
  const isProfit = bt.total_return_pct > 0;

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-xl border p-5 ${
      isProfit ? "border-green-500/20" : "border-slate-200 dark:border-slate-700"
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              rank <= 3 ? "bg-amber-500/10 text-amber-600" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
            }`}>
              #{rank}
            </span>
            <h3 className="font-bold">{s.name}</h3>
            {isProfit && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">수익</span>
            )}
          </div>
          <p className="text-sm text-slate-400 dark:text-slate-500 mb-3">{s.description}</p>

          {/* Backtest Stats */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <StatBox
              label="수익률"
              value={`${bt.total_return_pct >= 0 ? "+" : ""}${bt.total_return_pct.toFixed(1)}%`}
              color={bt.total_return_pct >= 0 ? "green" : "red"}
            />
            <StatBox label="승률" value={`${bt.win_rate.toFixed(0)}%`} color={bt.win_rate >= 50 ? "green" : "yellow"} />
            <StatBox label="거래수" value={`${bt.total_trades}`} color="blue" />
            <StatBox label="MDD" value={`${bt.max_drawdown_pct.toFixed(1)}%`} color="red" />
            <StatBox label="Sharpe" value={bt.sharpe_ratio.toFixed(2)} color={bt.sharpe_ratio > 1 ? "green" : "gray"} />
            <StatBox
              label="PF"
              value={bt.profit_factor > 99 ? "∞" : bt.profit_factor.toFixed(1)}
              color={bt.profit_factor > 1.5 ? "green" : "gray"}
            />
          </div>

          {/* Conditions Preview */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {s.config_json.conditions.map((c, i) => (
              <span key={i} className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-slate-600 dark:text-slate-300">
                {c.indicator}({Object.values(c.params).join(",")}) {operatorLabel(c.operator)}{" "}
                {typeof c.value === "number" ? c.value : (c.value as { indicator: string }).indicator}
              </span>
            ))}
            <span className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-slate-500 dark:text-slate-400">
              손절 {s.config_json.safety.stop_loss}% / 익절 +{s.config_json.safety.take_profit}%
            </span>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex-shrink-0 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold transition disabled:opacity-50"
        >
          {isSaving ? "저장 중..." : "내 전략에 저장"}
        </button>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    green: "text-green-400",
    red: "text-red-400",
    yellow: "text-yellow-400",
    blue: "text-blue-500",
    gray: "text-slate-400 dark:text-slate-500",
  };
  return (
    <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded text-center">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`text-sm font-bold ${colors[color] || "text-white"}`}>{value}</div>
    </div>
  );
}

function operatorLabel(op: string): string {
  const map: Record<string, string> = {
    greater_than: ">",
    less_than: "<",
    equal: "=",
    greater_equal: ">=",
    less_equal: "<=",
    crosses_above: "↗",
    crosses_below: "↘",
  };
  return map[op] || op;
}

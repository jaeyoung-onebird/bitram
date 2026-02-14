"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { Strategy } from "@/types";
import {
  Plus,
  Pencil,
  FlaskConical,
  Trash2,
  Copy,
  Lock,
  Globe,
  TrendingUp,
  TrendingDown,
  BarChart3,
  BookOpenCheck,
  Blocks,
  SlidersHorizontal,
  Rocket,
} from "lucide-react";

export default function StrategiesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  const fetchStrategies = () => {
    api
      .getStrategies()
      .then(setStrategies)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStrategies();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("정말 이 전략을 삭제하시겠습니까?")) return;
    setDeleting(id);
    try {
      await api.deleteStrategy(id);
      setStrategies((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error(err);
      toast("삭제에 실패했습니다.", "error");
    } finally {
      setDeleting(null);
    }
  };

  const handleDuplicate = async (id: string) => {
    setDuplicating(id);
    try {
      await api.duplicateStrategy(id);
      fetchStrategies();
    } catch (err) {
      console.error(err);
      toast("복제에 실패했습니다.", "error");
    } finally {
      setDuplicating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 dark:text-slate-400">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold">전략 목록</h1>
        <div className="flex gap-1.5 sm:gap-2">
          <Link
            href="/strategies/ai"
            className="flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:brightness-110 text-white text-xs sm:text-sm font-medium rounded-lg transition"
          >
            AI로 찾기
          </Link>
          <Link
            href="/strategies/new"
            className="flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-blue-500 hover:bg-blue-500 text-white text-xs sm:text-sm font-medium rounded-lg transition"
          >
            <Plus className="w-4 h-4" />
            만들기
          </Link>
        </div>
      </div>

      {/* Empty State */}
      {strategies.length === 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 md:p-8">
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-12">
            <BarChart3 className="mb-4 h-12 w-12 text-slate-500 dark:text-slate-400" />
            <p className="mb-2 text-slate-600 dark:text-slate-300">아직 만든 전략이 없습니다.</p>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              아래 튜토리얼대로 3분 안에 첫 전략을 만들 수 있어요.
            </p>
            <Link
              href="/strategies/new"
              className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" />
              전략 만들기
            </Link>
          </div>

          <div className="mt-6 rounded-xl border border-blue-500/25 bg-gradient-to-b from-blue-500/10 to-cyan-500/5 p-5">
            <div className="mb-4 flex items-center gap-2 text-blue-600">
              <BookOpenCheck className="h-4 w-4" />
              <h2 className="text-sm font-semibold">전략 만들기 빠른 튜토리얼</h2>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-blue-400/20 bg-slate-50/70 dark:bg-slate-800/70 p-4">
                <div className="mb-2 flex items-center gap-2 text-sky-600">
                  <Blocks className="h-4 w-4" />
                  <span className="text-xs font-semibold">STEP 1</span>
                </div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">기본 정보 입력</p>
                <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
                  전략 이름, 거래쌍, 타임프레임을 먼저 정하세요.
                </p>
              </div>

              <div className="rounded-lg border border-blue-400/20 bg-slate-50/70 dark:bg-slate-800/70 p-4">
                <div className="mb-2 flex items-center gap-2 text-blue-500">
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="text-xs font-semibold">STEP 2</span>
                </div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">진입/청산 규칙 조립</p>
                <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
                  RSI, MACD 등 지표 블록을 조건으로 연결하세요.
                </p>
              </div>

              <div className="rounded-lg border border-blue-400/20 bg-slate-50/70 dark:bg-slate-800/70 p-4">
                <div className="mb-2 flex items-center gap-2 text-emerald-600">
                  <Rocket className="h-4 w-4" />
                  <span className="text-xs font-semibold">STEP 3</span>
                </div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">백테스트 후 저장</p>
                <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
                  백테스트로 성과를 확인하고 전략을 저장하세요.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                href="/strategies/new"
                className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600"
              >
                튜토리얼 시작
              </Link>
              <span className="text-sm text-slate-400 dark:text-slate-500">
                팁: 첫 전략은 `KRW-BTC` + `15m` 조합으로 테스트하면 안정적입니다.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Strategy Cards Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {strategies.map((strategy) => {
          const bt = strategy.backtest_result;
          const hasBacktest = bt !== null;
          const returnPositive = hasBacktest && bt.total_return_pct >= 0;

          return (
            <div
              key={strategy.id}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition overflow-hidden"
            >
              {/* Card Header */}
              <div className="p-3.5 sm:p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/strategies/${strategy.id}`}
                      className="text-base font-bold hover:text-blue-500 transition truncate block"
                    >
                      {strategy.name}
                    </Link>
                    {strategy.description && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {strategy.description}
                      </p>
                    )}
                  </div>
                  <span
                    className={`ml-2 flex-shrink-0 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                      strategy.is_public
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-slate-500/15 text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {strategy.is_public ? (
                      <Globe className="w-3 h-3" />
                    ) : (
                      <Lock className="w-3 h-3" />
                    )}
                    {strategy.is_public ? "공개" : "비공개"}
                  </span>
                </div>

                {/* Pair & Timeframe */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 font-mono">
                    {strategy.pair}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-500/15 text-purple-400 font-mono">
                    {strategy.timeframe}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 ml-auto">
                    {new Date(strategy.created_at).toLocaleDateString("ko-KR")}
                  </span>
                </div>

                {/* Backtest Summary */}
                {hasBacktest ? (
                  <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <div className="text-center">
                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">수익률</div>
                      <div
                        className={`text-sm font-bold flex items-center justify-center gap-0.5 ${
                          returnPositive ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {returnPositive ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {returnPositive ? "+" : ""}
                        {bt.total_return_pct.toFixed(1)}%
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">승률</div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        {bt.win_rate.toFixed(1)}%
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">MDD</div>
                      <div className="text-sm font-bold text-orange-400">
                        {bt.max_drawdown_pct.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      백테스트 미실행
                    </span>
                  </div>
                )}
              </div>

              {/* Card Actions */}
              <div className="flex border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => router.push(`/strategies/${strategy.id}`)}
                  className="flex-1 flex items-center justify-center gap-1 px-1.5 sm:px-3 py-2 sm:py-2.5 text-[11px] sm:text-sm text-slate-400 dark:text-slate-500 hover:text-blue-500 hover:bg-blue-500/5 transition"
                  title="수정"
                >
                  <Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  수정
                </button>
                <button
                  onClick={() =>
                    router.push(`/strategies/${strategy.id}/backtest`)
                  }
                  className="flex-1 flex items-center justify-center gap-1 px-1.5 sm:px-3 py-2 sm:py-2.5 text-[11px] sm:text-sm text-slate-400 dark:text-slate-500 hover:text-purple-400 hover:bg-purple-500/5 transition border-l border-slate-200 dark:border-slate-700"
                  title="백테스트"
                >
                  <FlaskConical className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  백테스트
                </button>
                <button
                  onClick={() => handleDuplicate(strategy.id)}
                  disabled={duplicating === strategy.id}
                  className="flex-1 flex items-center justify-center gap-1 px-1.5 sm:px-3 py-2 sm:py-2.5 text-[11px] sm:text-sm text-slate-400 dark:text-slate-500 hover:text-green-400 hover:bg-green-500/5 transition border-l border-slate-200 dark:border-slate-700 disabled:opacity-50"
                  title="복제"
                >
                  <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  {duplicating === strategy.id ? "..." : "복제"}
                </button>
                <button
                  onClick={() => handleDelete(strategy.id)}
                  disabled={deleting === strategy.id}
                  className="flex-1 flex items-center justify-center gap-1 px-1.5 sm:px-3 py-2 sm:py-2.5 text-[11px] sm:text-sm text-slate-400 dark:text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition border-l border-slate-200 dark:border-slate-700 disabled:opacity-50"
                  title="삭제"
                >
                  <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  {deleting === strategy.id ? "..." : "삭제"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

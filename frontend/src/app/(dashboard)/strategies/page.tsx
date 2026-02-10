"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
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
      alert("삭제에 실패했습니다.");
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
      alert("복제에 실패했습니다.");
    } finally {
      setDuplicating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">전략 목록</h1>
        <Link
          href="/strategies/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          새 전략 만들기
        </Link>
      </div>

      {/* Empty State */}
      {strategies.length === 0 && (
        <div className="rounded-2xl border border-gray-800 bg-[#1a2332] p-6 md:p-8">
          <div className="flex flex-col items-center justify-center rounded-xl border border-gray-700/60 bg-[#121b2b] py-12">
            <BarChart3 className="mb-4 h-12 w-12 text-gray-600" />
            <p className="mb-2 text-gray-300">아직 만든 전략이 없습니다.</p>
            <p className="mb-6 text-sm text-gray-500">
              아래 튜토리얼대로 3분 안에 첫 전략을 만들 수 있어요.
            </p>
            <Link
              href="/strategies/new"
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" />
              전략 만들기
            </Link>
          </div>

          <div className="mt-6 rounded-xl border border-blue-500/25 bg-gradient-to-b from-blue-500/10 to-cyan-500/5 p-5">
            <div className="mb-4 flex items-center gap-2 text-blue-300">
              <BookOpenCheck className="h-4 w-4" />
              <h2 className="text-sm font-semibold">전략 만들기 빠른 튜토리얼</h2>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-blue-400/20 bg-[#0f172a]/70 p-4">
                <div className="mb-2 flex items-center gap-2 text-sky-300">
                  <Blocks className="h-4 w-4" />
                  <span className="text-xs font-semibold">STEP 1</span>
                </div>
                <p className="text-sm font-medium text-gray-100">기본 정보 입력</p>
                <p className="mt-1 text-xs text-gray-400">
                  전략 이름, 거래쌍, 타임프레임을 먼저 정하세요.
                </p>
              </div>

              <div className="rounded-lg border border-blue-400/20 bg-[#0f172a]/70 p-4">
                <div className="mb-2 flex items-center gap-2 text-indigo-300">
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="text-xs font-semibold">STEP 2</span>
                </div>
                <p className="text-sm font-medium text-gray-100">진입/청산 규칙 조립</p>
                <p className="mt-1 text-xs text-gray-400">
                  RSI, MACD 등 지표 블록을 조건으로 연결하세요.
                </p>
              </div>

              <div className="rounded-lg border border-blue-400/20 bg-[#0f172a]/70 p-4">
                <div className="mb-2 flex items-center gap-2 text-emerald-300">
                  <Rocket className="h-4 w-4" />
                  <span className="text-xs font-semibold">STEP 3</span>
                </div>
                <p className="text-sm font-medium text-gray-100">백테스트 후 저장</p>
                <p className="mt-1 text-xs text-gray-400">
                  백테스트로 성과를 확인하고 전략을 저장하세요.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                href="/strategies/new"
                className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-500"
              >
                튜토리얼 시작
              </Link>
              <span className="text-xs text-gray-400">
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
              className="bg-[#1a2332] rounded-xl border border-gray-800 hover:border-gray-700 transition overflow-hidden"
            >
              {/* Card Header */}
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/strategies/${strategy.id}`}
                      className="text-base font-bold hover:text-blue-400 transition truncate block"
                    >
                      {strategy.name}
                    </Link>
                    {strategy.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {strategy.description}
                      </p>
                    )}
                  </div>
                  <span
                    className={`ml-2 flex-shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${
                      strategy.is_public
                        ? "bg-green-500/15 text-green-400"
                        : "bg-gray-500/15 text-gray-400"
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
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 font-mono">
                    {strategy.pair}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-500/15 text-purple-400 font-mono">
                    {strategy.timeframe}
                  </span>
                  <span className="text-[10px] text-gray-500 ml-auto">
                    {new Date(strategy.created_at).toLocaleDateString("ko-KR")}
                  </span>
                </div>

                {/* Backtest Summary */}
                {hasBacktest ? (
                  <div className="grid grid-cols-3 gap-2 p-3 bg-[#111827] rounded-lg">
                    <div className="text-center">
                      <div className="text-[10px] text-gray-500 mb-0.5">수익률</div>
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
                      <div className="text-[10px] text-gray-500 mb-0.5">승률</div>
                      <div className="text-sm font-bold text-gray-100">
                        {bt.win_rate.toFixed(1)}%
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-gray-500 mb-0.5">MDD</div>
                      <div className="text-sm font-bold text-orange-400">
                        {bt.max_drawdown_pct.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center p-3 bg-[#111827] rounded-lg">
                    <span className="text-xs text-gray-500">
                      백테스트 미실행
                    </span>
                  </div>
                )}
              </div>

              {/* Card Actions */}
              <div className="flex border-t border-gray-800">
                <button
                  onClick={() => router.push(`/strategies/${strategy.id}`)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs text-gray-400 hover:text-blue-400 hover:bg-blue-500/5 transition"
                  title="수정"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  수정
                </button>
                <button
                  onClick={() =>
                    router.push(`/strategies/${strategy.id}/backtest`)
                  }
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs text-gray-400 hover:text-purple-400 hover:bg-purple-500/5 transition border-l border-gray-800"
                  title="백테스트"
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                  백테스트
                </button>
                <button
                  onClick={() => handleDuplicate(strategy.id)}
                  disabled={duplicating === strategy.id}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs text-gray-400 hover:text-green-400 hover:bg-green-500/5 transition border-l border-gray-800 disabled:opacity-50"
                  title="복제"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {duplicating === strategy.id ? "..." : "복제"}
                </button>
                <button
                  onClick={() => handleDelete(strategy.id)}
                  disabled={deleting === strategy.id}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs text-gray-400 hover:text-red-400 hover:bg-red-500/5 transition border-l border-gray-800 disabled:opacity-50"
                  title="삭제"
                >
                  <Trash2 className="w-3.5 h-3.5" />
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

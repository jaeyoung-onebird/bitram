"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { MarketplaceStrategy } from "@/types";

export default function MarketplacePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<MarketplaceStrategy[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copyBusy, setCopyBusy] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [pair, setPair] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [sort, setSort] = useState("copies");
  const [page, setPage] = useState(1);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.getMarketplace({ pair: pair || undefined, timeframe: timeframe || undefined, sort, search: search || undefined, page });
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [pair, timeframe, sort, page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchData();
  };

  const handleCopy = async (id: string) => {
    setCopyBusy(id);
    try {
      await api.duplicateStrategy(id);
      router.push("/strategies");
    } catch (err) {
      toast(err instanceof Error ? err.message : "복사에 실패했습니다.", "error");
    } finally {
      setCopyBusy(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">전략 마켓플레이스</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">공개된 전략을 탐색하고 복사해 사용하세요</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="전략 이름 검색..."
            className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-slate-200 focus:outline-none focus:border-blue-500 transition"
          />
        </form>
        <select value={pair} onChange={(e) => { setPair(e.target.value); setPage(1); }}
          className="px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-slate-200 focus:outline-none focus:border-blue-500 transition appearance-none">
          <option value="">전체 페어</option>
          <option value="KRW-BTC">BTC</option>
          <option value="KRW-ETH">ETH</option>
          <option value="KRW-XRP">XRP</option>
          <option value="KRW-SOL">SOL</option>
        </select>
        <select value={timeframe} onChange={(e) => { setTimeframe(e.target.value); setPage(1); }}
          className="px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-slate-200 focus:outline-none focus:border-blue-500 transition appearance-none">
          <option value="">전체 타임프레임</option>
          <option value="15m">15분</option>
          <option value="1h">1시간</option>
          <option value="4h">4시간</option>
          <option value="1d">1일</option>
        </select>
        <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}
          className="px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-slate-200 focus:outline-none focus:border-blue-500 transition appearance-none">
          <option value="copies">복사순</option>
          <option value="newest">최신순</option>
          <option value="profit">수익률순</option>
        </select>
      </div>

      {/* Strategy Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">로딩 중...</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-500 dark:text-slate-400">
          <p className="text-lg mb-2">전략이 없습니다</p>
          <p className="text-sm">검색 조건을 변경해보세요.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => (
            <div key={s.id} className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-5 space-y-3 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 truncate">{s.name}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">by {s.author_nickname}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{s.pair.replace("KRW-", "")}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{s.timeframe}</span>
                </div>
              </div>

              {s.description && (
                <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{s.description}</p>
              )}

              {s.backtest_summary && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <div className="text-sm text-slate-400 dark:text-slate-500">수익률</div>
                    <div className={`text-base font-bold ${(s.backtest_summary.total_return_pct ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {s.backtest_summary.total_return_pct != null ? `${s.backtest_summary.total_return_pct >= 0 ? "+" : ""}${s.backtest_summary.total_return_pct.toFixed(1)}%` : "-"}
                    </div>
                  </div>
                  <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <div className="text-sm text-slate-400 dark:text-slate-500">승률</div>
                    <div className="text-base font-bold text-slate-700 dark:text-slate-200">
                      {s.backtest_summary.win_rate != null ? `${s.backtest_summary.win_rate.toFixed(1)}%` : "-"}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-sm text-slate-500 dark:text-slate-400">복사 {s.copy_count}회</span>
                <button
                  onClick={() => handleCopy(s.id)}
                  disabled={copyBusy === s.id}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                >
                  {copyBusy === s.id ? "..." : "복사하기"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm disabled:opacity-50 transition"
          >
            이전
          </button>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {page} / {Math.ceil(total / 20)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(total / 20)}
            className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm disabled:opacity-50 transition"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { useToast } from "@/components/Toast";
import { Star, X } from "lucide-react";
import type { MarketplaceStrategy } from "@/types";

interface ReviewData { avg_rating: number | null; count: number }

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const cls = size === "md" ? "w-5 h-5" : "w-3.5 h-3.5";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${cls} ${i <= rating ? "text-amber-400 fill-amber-400" : "text-slate-300 dark:text-slate-600"}`} />
      ))}
    </div>
  );
}

export default function MarketplacePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isAuthenticated } = useAuthStore();
  const [items, setItems] = useState<MarketplaceStrategy[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copyBusy, setCopyBusy] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, ReviewData>>({});

  // Review modal state
  const [reviewModal, setReviewModal] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewList, setReviewList] = useState<Array<{ id: string; nickname: string; rating: number; comment: string; created_at: string }>>([]);

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
      // Fetch ratings for all strategies
      const ratingMap: Record<string, ReviewData> = {};
      await Promise.all(res.items.map(async (s: MarketplaceStrategy) => {
        try {
          const r = await api.getStrategyReviews(s.id);
          ratingMap[s.id] = { avg_rating: r.avg_rating, count: r.count };
        } catch { ratingMap[s.id] = { avg_rating: null, count: 0 }; }
      }));
      setRatings(ratingMap);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const openReviewModal = async (strategyId: string) => {
    setReviewModal(strategyId);
    setReviewRating(5);
    setReviewComment("");
    try {
      const r = await api.getStrategyReviews(strategyId);
      setReviewList(r.reviews);
    } catch { setReviewList([]); }
  };

  const submitReview = async () => {
    if (!reviewModal) return;
    setReviewSubmitting(true);
    try {
      await api.createStrategyReview(reviewModal, reviewRating, reviewComment);
      toast("리뷰가 등록되었습니다", "success");
      const r = await api.getStrategyReviews(reviewModal);
      setReviewList(r.reviews);
      setRatings((prev) => ({ ...prev, [reviewModal]: { avg_rating: r.avg_rating, count: r.count } }));
      setReviewComment("");
    } catch { toast("리뷰 등록 실패", "error"); }
    setReviewSubmitting(false);
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
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-500 dark:text-slate-400">복사 {s.copy_count}회</span>
                  {ratings[s.id]?.avg_rating != null && (
                    <button onClick={() => openReviewModal(s.id)} className="flex items-center gap-1 text-sm text-amber-500 hover:text-amber-600 transition">
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                      <span className="font-medium">{ratings[s.id].avg_rating!.toFixed(1)}</span>
                      <span className="text-slate-400 text-xs">({ratings[s.id].count})</span>
                    </button>
                  )}
                  {ratings[s.id]?.count === 0 && (
                    <button onClick={() => openReviewModal(s.id)} className="text-xs text-slate-400 hover:text-blue-500 transition">
                      리뷰 쓰기
                    </button>
                  )}
                </div>
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

      {/* Review Modal */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm" onClick={() => setReviewModal(null)} />
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">전략 리뷰</h2>
              <button onClick={() => setReviewModal(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Existing reviews */}
              {reviewList.length > 0 ? (
                <div className="space-y-3">
                  {reviewList.map((r) => (
                    <div key={r.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{r.nickname}</span>
                        <StarRating rating={r.rating} />
                      </div>
                      {r.comment && <p className="text-sm text-slate-600 dark:text-slate-400">{r.comment}</p>}
                      <span className="text-[10px] text-slate-400 mt-1 block">{new Date(r.created_at).toLocaleDateString("ko-KR")}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">아직 리뷰가 없습니다</p>
              )}

              {/* Write review */}
              {isAuthenticated && (
                <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">리뷰 작성</h3>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <button key={i} onClick={() => setReviewRating(i)}>
                        <Star className={`w-6 h-6 transition ${i <= reviewRating ? "text-amber-400 fill-amber-400" : "text-slate-300 dark:text-slate-600"}`} />
                      </button>
                    ))}
                    <span className="text-sm font-medium text-slate-500 ml-2">{reviewRating}점</span>
                  </div>
                  <textarea
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="전략 사용 후기를 남겨주세요 (선택)"
                    maxLength={500}
                    rows={3}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 rounded-lg text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition resize-none"
                  />
                  <button
                    onClick={submitReview}
                    disabled={reviewSubmitting}
                    className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                  >
                    {reviewSubmitting ? "등록 중..." : "리뷰 등록"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

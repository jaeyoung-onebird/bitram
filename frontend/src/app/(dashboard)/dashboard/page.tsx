"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DashboardOverview } from "@/types";
import Link from "next/link";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDashboard().then(setData).catch(console.error).finally(() => setLoading(false));
    const interval = setInterval(() => { api.getDashboard().then(setData).catch(() => {}); }, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-gray-500">로딩 중...</div></div>;
  if (!data) return <div className="text-red-400">데이터를 불러올 수 없습니다.</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">대시보드</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="활성 봇" value={`${data.bots.active}개`} sub={`전체 ${data.bots.total}개`} color="blue" />
        <StatCard label="총 수익" value={`${data.performance.total_profit >= 0 ? "+" : ""}${data.performance.total_profit.toLocaleString()}원`}
          color={data.performance.total_profit >= 0 ? "green" : "red"} />
        <StatCard label="총 거래" value={`${data.performance.total_trades}회`} color="purple" />
        <StatCard label="승률" value={`${data.performance.win_rate}%`} color="yellow" />
      </div>

      {/* Bot Status */}
      <div className="bg-[#1a2332] rounded-xl border border-gray-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">봇 현황</h2>
          <Link href="/bots" className="text-sm text-blue-400 hover:underline">모두 보기</Link>
        </div>
        <div className="grid grid-cols-4 gap-3 text-center">
          <div className="p-3 bg-blue-500/10 rounded-lg">
            <div className="text-2xl font-bold text-blue-400">{data.bots.active}</div>
            <div className="text-xs text-gray-400">실행 중</div>
          </div>
          <div className="p-3 bg-yellow-500/10 rounded-lg">
            <div className="text-2xl font-bold text-yellow-400">{data.bots.paused}</div>
            <div className="text-xs text-gray-400">일시정지</div>
          </div>
          <div className="p-3 bg-red-500/10 rounded-lg">
            <div className="text-2xl font-bold text-red-400">{data.bots.error}</div>
            <div className="text-xs text-gray-400">오류</div>
          </div>
          <div className="p-3 bg-gray-500/10 rounded-lg">
            <div className="text-2xl font-bold text-gray-400">{data.bots.total - data.bots.active - data.bots.paused - data.bots.error}</div>
            <div className="text-xs text-gray-400">대기</div>
          </div>
        </div>
      </div>

      {/* Recent Trades */}
      <div className="bg-[#1a2332] rounded-xl border border-gray-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">최근 거래</h2>
          <Link href="/trades" className="text-sm text-blue-400 hover:underline">모두 보기</Link>
        </div>
        {data.recent_trades.length === 0 ? (
          <p className="text-gray-500 text-sm">아직 거래 내역이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {data.recent_trades.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-3 bg-[#111827] rounded-lg">
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${t.side === "buy" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                    {t.side === "buy" ? "매수" : "매도"}
                  </span>
                  <span className="text-sm font-medium">{t.pair.replace("KRW-", "")}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm">{t.price.toLocaleString()}원</div>
                  {t.profit !== null && (
                    <div className={`text-xs ${t.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {t.profit >= 0 ? "+" : ""}{t.profit.toLocaleString()}원
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-4">
        <Link href="/strategies/new"
          className="p-6 bg-[#1a2332] border border-gray-800 rounded-xl hover:border-blue-500/30 transition group">
          <div className="text-2xl mb-2">🧩</div>
          <div className="font-bold group-hover:text-blue-400 transition">새 전략 만들기</div>
          <div className="text-sm text-gray-400">노코드로 매매 전략 조립</div>
        </Link>
        <Link href="/community"
          className="p-6 bg-[#1a2332] border border-gray-800 rounded-xl hover:border-purple-500/30 transition group">
          <div className="text-2xl mb-2">💬</div>
          <div className="font-bold group-hover:text-purple-400 transition">커뮤니티</div>
          <div className="text-sm text-gray-400">전략 공유 & 수익 인증</div>
        </Link>
        <Link href="/settings"
          className="p-6 bg-[#1a2332] border border-gray-800 rounded-xl hover:border-green-500/30 transition group">
          <div className="text-2xl mb-2">🔑</div>
          <div className="font-bold group-hover:text-green-400 transition">API 키 등록</div>
          <div className="text-sm text-gray-400">업비트 API 연동하기</div>
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  const colors: Record<string, string> = {
    blue: "border-blue-500/20 text-blue-400",
    green: "border-green-500/20 text-green-400",
    red: "border-red-500/20 text-red-400",
    yellow: "border-yellow-500/20 text-yellow-400",
    purple: "border-purple-500/20 text-purple-400",
  };
  return (
    <div className={`p-4 bg-[#1a2332] rounded-xl border ${colors[color] || "border-gray-800"}`}>
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-xl font-bold ${colors[color]?.split(" ")[1] || "text-white"}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

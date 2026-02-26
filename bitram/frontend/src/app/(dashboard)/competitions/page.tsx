"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { Competition, CompetitionLeaderboardItem } from "@/types";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  upcoming: { label: "예정", cls: "bg-blue-500/10 text-blue-600" },
  active: { label: "진행 중", cls: "bg-emerald-500/10 text-emerald-600" },
  ended: { label: "종료", cls: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400" },
};

export default function CompetitionsPage() {
  const { toast } = useToast();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinBusy, setJoinBusy] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<CompetitionLeaderboardItem[]>([]);
  const [lbLoading, setLbLoading] = useState(false);

  useEffect(() => {
    api.getCompetitions()
      .then(setCompetitions)
      .catch(() => setCompetitions([]))
      .finally(() => setLoading(false));
  }, []);

  const handleJoin = async (id: string) => {
    setJoinBusy(id);
    try {
      await api.joinCompetition(id);
      // Refresh
      const updated = await api.getCompetitions();
      setCompetitions(updated);
    } catch (err) {
      toast(err instanceof Error ? err.message : "참가에 실패했습니다.", "error");
    } finally {
      setJoinBusy(null);
    }
  };

  const toggleLeaderboard = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setLbLoading(true);
    try {
      const lb = await api.getCompetitionLeaderboard(id);
      setLeaderboard(lb);
    } catch {
      setLeaderboard([]);
    } finally {
      setLbLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">로딩 중...</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">트레이딩 대회</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">대회에 참가하고 실력을 겨뤄보세요</p>
      </div>

      {competitions.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-500 dark:text-slate-400">
          <p className="text-lg mb-2">예정된 대회가 없습니다</p>
          <p className="text-sm">곧 새로운 대회가 열릴 예정입니다.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {competitions.map((c) => {
            const statusCfg = STATUS_LABELS[c.status] || STATUS_LABELS.ended;
            const canJoin = c.status !== "ended";
            const isExpanded = expandedId === c.id;

            return (
              <div key={c.id} className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm overflow-hidden">
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{c.title}</h3>
                      {c.description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{c.description}</p>}
                    </div>
                    <span className={`text-sm px-2.5 py-1 rounded-full shrink-0 ${statusCfg.cls}`}>
                      {statusCfg.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div className="text-sm text-slate-400 dark:text-slate-500">시작</div>
                      <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{new Date(c.start_date).toLocaleDateString("ko-KR")}</div>
                    </div>
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div className="text-sm text-slate-400 dark:text-slate-500">종료</div>
                      <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{new Date(c.end_date).toLocaleDateString("ko-KR")}</div>
                    </div>
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div className="text-sm text-slate-400 dark:text-slate-500">참가자</div>
                      <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{c.participant_count} / {c.max_participants}</div>
                    </div>
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div className="text-sm text-slate-400 dark:text-slate-500">상금</div>
                      <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{c.prize_description || "-"}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    {canJoin && (
                      <button
                        onClick={() => handleJoin(c.id)}
                        disabled={joinBusy === c.id}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                      >
                        {joinBusy === c.id ? "참가 중..." : "참가하기"}
                      </button>
                    )}
                    <button
                      onClick={() => toggleLeaderboard(c.id)}
                      className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium rounded-lg transition"
                    >
                      {isExpanded ? "리더보드 닫기" : "리더보드 보기"}
                    </button>
                  </div>
                </div>

                {/* Leaderboard */}
                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-slate-800 p-5">
                    {lbLoading ? (
                      <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">로딩 중...</div>
                    ) : leaderboard.length === 0 ? (
                      <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">아직 참가자가 없습니다.</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-sm text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                            <th className="py-2 text-left">순위</th>
                            <th className="py-2 text-left">닉네임</th>
                            <th className="py-2 text-right">수익</th>
                            <th className="py-2 text-right">거래</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leaderboard.map((entry) => (
                            <tr key={entry.user_id} className="border-b border-slate-50 dark:border-slate-800">
                              <td className="py-2 font-bold text-slate-700 dark:text-slate-200">{entry.rank}</td>
                              <td className="py-2 text-slate-700 dark:text-slate-200">{entry.nickname}</td>
                              <td className={`py-2 text-right font-bold ${entry.profit_krw >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {entry.profit_krw >= 0 ? "+" : ""}{Math.round(entry.profit_krw).toLocaleString()}원
                              </td>
                              <td className="py-2 text-right text-slate-500 dark:text-slate-400">{entry.trade_count}건</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

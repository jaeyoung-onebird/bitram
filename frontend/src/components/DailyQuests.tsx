"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { DailyQuest } from "@/types";

const QUEST_ICONS: Record<string, string> = {
  login: "M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1",
  post: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  comment: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  like: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  share: "M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z",
  default: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
};

function getIconPath(questId: string): string {
  for (const key of Object.keys(QUEST_ICONS)) {
    if (questId.toLowerCase().includes(key)) return QUEST_ICONS[key];
  }
  return QUEST_ICONS.default;
}

export default function DailyQuests() {
  const { toast } = useToast();
  const [quests, setQuests] = useState<DailyQuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const fetchQuests = useCallback(async () => {
    try {
      const result = await api.getDailyQuests();
      setQuests(result.quests);
    } catch (err) {
      console.error("Failed to fetch daily quests:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuests();
  }, [fetchQuests]);

  const handleClaim = async (questId: string) => {
    setClaimingId(questId);
    try {
      const result = await api.claimQuest(questId);
      if (result.ok) {
        toast(`퀘스트 보상 +${result.points}P 획득!`, "success");
        setQuests((prev) =>
          prev.map((q) => (q.id === questId ? { ...q, claimed: true } : q))
        );
      }
    } catch (err: any) {
      console.error("Failed to claim quest:", err);
      toast(err?.message || "보상 받기에 실패했습니다.", "error");
    } finally {
      setClaimingId(null);
    }
  };

  const completedCount = quests.filter((q) => q.current >= q.target).length;
  const claimedCount = quests.filter((q) => q.claimed).length;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition lg:cursor-default"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
            오늘의 퀘스트
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {completedCount}/{quests.length}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform lg:hidden ${collapsed ? "" : "rotate-180"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Content */}
      <div className={`${collapsed ? "hidden lg:block" : ""}`}>
        {loading ? (
          <div className="px-4 pb-4 text-sm text-slate-500 dark:text-slate-400 text-center">로딩 중...</div>
        ) : quests.length === 0 ? (
          <div className="px-4 pb-4 text-sm text-slate-500 dark:text-slate-400 text-center">퀘스트가 없습니다.</div>
        ) : (
          <div className="px-4 pb-4 space-y-3">
            {/* Progress summary */}
            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${quests.length > 0 ? (claimedCount / quests.length) * 100 : 0}%` }}
              />
            </div>

            {/* Quest list */}
            {quests.map((quest) => {
              const isComplete = quest.current >= quest.target;
              const canClaim = isComplete && !quest.claimed;
              const progress = Math.min(100, (quest.current / quest.target) * 100);

              return (
                <div
                  key={quest.id}
                  className={`flex items-center gap-3 p-2.5 rounded-lg transition ${
                    quest.claimed
                      ? "opacity-50"
                      : canClaim
                      ? "bg-amber-50 dark:bg-amber-500/5 ring-1 ring-amber-500/20"
                      : ""
                  }`}
                >
                  {/* Icon */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    quest.claimed
                      ? "bg-slate-100 dark:bg-slate-800"
                      : isComplete
                      ? "bg-amber-500/10"
                      : "bg-slate-100 dark:bg-slate-800"
                  }`}>
                    {quest.claimed ? (
                      <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className={`w-4 h-4 ${isComplete ? "text-amber-500" : "text-slate-400 dark:text-slate-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={getIconPath(quest.id)} />
                      </svg>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-medium truncate ${quest.claimed ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-200"}`}>
                        {quest.title}
                      </span>
                      <span className="text-xs font-bold text-amber-500 shrink-0">+{quest.points}P</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            quest.claimed ? "bg-emerald-500" : isComplete ? "bg-amber-500" : "bg-blue-400"
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                        {quest.current}/{quest.target}
                      </span>
                    </div>
                  </div>

                  {/* Claim button */}
                  {canClaim && (
                    <button
                      onClick={() => handleClaim(quest.id)}
                      disabled={claimingId === quest.id}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg disabled:opacity-50 transition shrink-0"
                    >
                      {claimingId === quest.id ? "..." : "받기"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

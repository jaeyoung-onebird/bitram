"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { UserPointsInfo } from "@/types";

export default function AttendancePage() {
  const [points, setPoints] = useState<UserPointsInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.getMyPoints()
      .then((r) => { if (mounted) setPoints(r); })
      .catch(console.error)
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 dark:text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!points) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 dark:text-slate-400">Failed to load</div>
      </div>
    );
  }

  const streak = points.login_streak;
  const todayKST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const todayStr = `${todayKST.getFullYear()}-${String(todayKST.getMonth() + 1).padStart(2, "0")}-${String(todayKST.getDate()).padStart(2, "0")}`;
  const checkedToday = points.last_login_date ? points.last_login_date.startsWith(todayStr) : false;

  const milestones = [
    { days: 7, reward: 50, label: "7일 연속" },
    { days: 30, reward: 200, label: "30일 연속" },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Back */}
      <Link href="/community" className="inline-flex items-center gap-1 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        커뮤니티
      </Link>

      {/* Streak Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl shadow-sm p-6 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">출석체크</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">매일 로그인하면 자동으로 출석 체크됩니다</p>
        </div>

        {/* Today Status */}
        <div className="flex flex-col items-center gap-3">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center ${checkedToday ? "bg-blue-500" : "bg-slate-200 dark:bg-slate-700"}`}>
            {checkedToday ? (
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-10 h-10 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <div className="text-center">
            <div className={`text-sm font-bold ${checkedToday ? "text-blue-500" : "text-slate-400 dark:text-slate-500"}`}>
              {checkedToday ? "오늘 출석 완료!" : "오늘 아직 미출석"}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              로그인 시 자동 출석 +5P
            </div>
          </div>
        </div>

        {/* Streak Count */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 text-center space-y-1">
          <div className="text-4xl font-black text-blue-500">{streak}</div>
          <div className="text-sm font-medium text-slate-600 dark:text-slate-300">연속 출석일</div>
        </div>

        {/* 7-day visual */}
        <div className="space-y-2">
          <div className="text-sm font-bold text-slate-700 dark:text-slate-200">이번 주 출석</div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }, (_, i) => {
              const filled = i < Math.min(streak, 7);
              return (
                <div
                  key={i}
                  className={`aspect-square rounded-lg flex items-center justify-center text-xs font-bold ${
                    filled
                      ? "bg-blue-500 text-white"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {i + 1}
                </div>
              );
            })}
          </div>
        </div>

        {/* Milestones */}
        <div className="space-y-3">
          <div className="text-sm font-bold text-slate-700 dark:text-slate-200">연속 출석 보너스</div>
          {milestones.map((ms) => {
            const achieved = streak >= ms.days;
            const progress = Math.min(100, (streak / ms.days) * 100);
            return (
              <div key={ms.days} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${achieved ? "text-blue-500" : "text-slate-600 dark:text-slate-300"}`}>
                      {ms.label}
                    </span>
                    {achieved && (
                      <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm font-bold text-amber-500">+{ms.reward}P</span>
                </div>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${achieved ? "bg-blue-500" : "bg-blue-400"}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500 text-right">
                  {Math.min(streak, ms.days)} / {ms.days}일
                </div>
              </div>
            );
          })}
        </div>

        {/* Info */}
        <div className="bg-blue-50 dark:bg-blue-500/10 rounded-xl p-4 space-y-2">
          <div className="text-sm font-bold text-blue-600 dark:text-blue-400">출석 포인트 안내</div>
          <ul className="text-xs text-blue-500/80 dark:text-blue-400/80 space-y-1">
            <li>- 매일 로그인 시 자동으로 5P 지급</li>
            <li>- 7일 연속 출석 시 보너스 50P (1회)</li>
            <li>- 30일 연속 출석 시 보너스 200P (1회)</li>
            <li>- 하루라도 빠지면 연속 일수가 초기화됩니다</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

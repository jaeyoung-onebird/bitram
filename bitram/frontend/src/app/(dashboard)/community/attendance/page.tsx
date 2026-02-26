"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { AttendanceStatus } from "@/types";

const STREAK_BONUSES = [
  { days: 3, bonus: 5, label: "3일 연속" },
  { days: 7, bonus: 20, label: "7일 연속" },
  { days: 14, bonus: 50, label: "14일 연속" },
  { days: 30, bonus: 100, label: "30일 연속" },
];

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function getKSTDate(date?: Date): Date {
  const d = date ? new Date(date) : new Date();
  return new Date(d.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getCalendarDays(year: number, month: number): { date: Date; dateStr: string; isCurrentMonth: boolean }[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay();
  const days: { date: Date; dateStr: string; isCurrentMonth: boolean }[] = [];

  // Previous month filler
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, dateStr: toDateStr(d), isCurrentMonth: false });
  }

  // Current month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const d = new Date(year, month, i);
    days.push({ date: d, dateStr: toDateStr(d), isCurrentMonth: true });
  }

  // Next month filler
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ date: d, dateStr: toDateStr(d), isCurrentMonth: false });
    }
  }

  return days;
}

export default function AttendancePage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [pointsEarned, setPointsEarned] = useState<number | null>(null);
  const [bonusEarned, setBonusEarned] = useState<number | null>(null);
  const [fireAnim, setFireAnim] = useState(false);

  const now = getKSTDate();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const fetchStatus = useCallback(async () => {
    try {
      const result = await api.getAttendanceStatus();
      setStatus(result);
    } catch (err) {
      console.error("Failed to fetch attendance status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (status && status.streak > 0) {
      setFireAnim(true);
      const t = setTimeout(() => setFireAnim(false), 2000);
      return () => clearTimeout(t);
    }
  }, [status?.streak]);

  const handleCheckIn = async () => {
    setChecking(true);
    try {
      const result = await api.checkIn();
      setPointsEarned(result.points);
      setBonusEarned(result.bonus > 0 ? result.bonus : null);
      toast(`출석체크 완료! +${result.points}P${result.bonus > 0 ? ` (보너스 +${result.bonus}P)` : ""}`, "success");
      await fetchStatus();
    } catch (err: any) {
      console.error("Failed to check in:", err);
      toast(err?.message || "출석체크에 실패했습니다.", "error");
    } finally {
      setChecking(false);
    }
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 dark:text-slate-400">로딩 중...</div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 dark:text-slate-400">데이터를 불러올 수 없습니다.</div>
      </div>
    );
  }

  const checkedDatesSet = new Set(status.checked_dates);
  const calendarDays = getCalendarDays(viewYear, viewMonth);
  const todayStr = toDateStr(now);
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  // Count check-ins this month for display
  const monthCheckins = status.checked_dates.filter((d) => {
    const parts = d.split("-");
    return parseInt(parts[0]) === viewYear && parseInt(parts[1]) === viewMonth + 1;
  }).length;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Back */}
      <Link href="/community" className="inline-flex items-center gap-1 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        커뮤니티
      </Link>

      {/* Main Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl shadow-sm p-6 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">출석체크</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">매일 출석체크하고 포인트를 받으세요!</p>
        </div>

        {/* Streak Counter */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className={`text-6xl transition-transform duration-300 ${fireAnim ? "scale-125" : "scale-100"}`}>
              {status.streak > 0 ? (
                <span className="inline-block animate-pulse">&#x1F525;</span>
              ) : (
                <span className="opacity-30">&#x1F525;</span>
              )}
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-black text-blue-500">{status.streak}일</div>
            <div className="text-sm font-medium text-slate-600 dark:text-slate-300 mt-1">연속 출석</div>
          </div>
        </div>

        {/* Check-in Button */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleCheckIn}
            disabled={status.checked_today || checking}
            className={`w-full max-w-xs px-8 py-4 rounded-2xl text-lg font-bold transition-all duration-200 ${
              status.checked_today
                ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                : "bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl active:scale-95"
            }`}
          >
            {checking ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                체크 중...
              </span>
            ) : status.checked_today ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
                출석 완료!
              </span>
            ) : (
              "출석체크"
            )}
          </button>
          {pointsEarned !== null && (
            <div className="text-center animate-fade-in">
              <span className="text-sm font-bold text-emerald-500">+{pointsEarned}P 획득!</span>
              {bonusEarned && (
                <span className="text-sm font-bold text-amber-500 ml-2">보너스 +{bonusEarned}P</span>
              )}
            </div>
          )}
        </div>

        {/* Monthly Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-slate-800 dark:text-slate-100">{status.total_this_month}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">이번 달 출석</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-black text-blue-500">{status.streak}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">연속 출석일</div>
          </div>
        </div>

        {/* Calendar View */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button onClick={handlePrevMonth} className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {viewYear}년 {viewMonth + 1}월
              {isCurrentMonth && <span className="text-xs font-normal text-slate-400 dark:text-slate-500 ml-2">({monthCheckins}일 출석)</span>}
            </h3>
            <button onClick={handleNextMonth} className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-slate-400 dark:text-slate-500 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map(({ date, dateStr, isCurrentMonth: isCurMonth }, idx) => {
              const isChecked = checkedDatesSet.has(dateStr);
              const isToday = dateStr === todayStr;
              return (
                <div
                  key={idx}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs relative transition ${
                    !isCurMonth
                      ? "text-slate-300 dark:text-slate-700"
                      : isToday
                      ? "bg-blue-50 dark:bg-blue-500/10 text-blue-500 font-bold ring-1 ring-blue-500/30"
                      : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  <span>{date.getDate()}</span>
                  {isChecked && isCurMonth && (
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-0.5" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Streak Bonuses */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">연속 출석 보너스</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {STREAK_BONUSES.map((bonus) => {
              const achieved = status.streak >= bonus.days;
              return (
                <div
                  key={bonus.days}
                  className={`rounded-xl p-3 text-center border transition ${
                    achieved
                      ? "bg-blue-50 dark:bg-blue-500/10 border-blue-500/30"
                      : "bg-slate-50 dark:bg-slate-800 border-slate-200/60 dark:border-slate-700/60"
                  }`}
                >
                  <div className={`text-xs font-bold ${achieved ? "text-blue-500" : "text-slate-500 dark:text-slate-400"}`}>
                    {bonus.label}
                  </div>
                  <div className={`text-lg font-black mt-1 ${achieved ? "text-blue-500" : "text-slate-800 dark:text-slate-100"}`}>
                    +{bonus.bonus}P
                  </div>
                  {achieved && (
                    <svg className="w-4 h-4 text-blue-500 mx-auto mt-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                  {!achieved && (
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                      {Math.max(0, bonus.days - status.streak)}일 남음
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Info */}
        <div className="bg-blue-50 dark:bg-blue-500/10 rounded-xl p-4 space-y-2">
          <div className="text-sm font-bold text-blue-600 dark:text-blue-400">출석 포인트 안내</div>
          <ul className="text-xs text-blue-500/80 dark:text-blue-400/80 space-y-1">
            <li>- 매일 출석체크 시 기본 5P 지급</li>
            <li>- 3일 연속 출석: +5P 보너스</li>
            <li>- 7일 연속 출석: +20P 보너스</li>
            <li>- 14일 연속 출석: +50P 보너스</li>
            <li>- 30일 연속 출석: +100P 보너스</li>
            <li>- 하루라도 빠지면 연속 일수가 초기화됩니다</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

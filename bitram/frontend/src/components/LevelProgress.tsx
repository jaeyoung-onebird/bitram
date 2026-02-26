"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import LevelBadge from "@/components/LevelBadge";
import type { LevelInfo } from "@/types";

export default function LevelProgress() {
  const [info, setInfo] = useState<LevelInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.getLevelInfo()
      .then((r) => { if (mounted) setInfo(r); })
      .catch(console.error)
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-4 animate-pulse">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24 mb-3" />
        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded w-full mb-2" />
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-32" />
      </div>
    );
  }

  if (!info) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LevelBadge level={info.level} size="md" />
        </div>
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
          {info.points_current.toLocaleString()}P
        </span>
      </div>

      {/* Progress bar - always shows since levels are infinite */}
      <div className="space-y-1.5">
        <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, info.progress * 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
          <span>{(info.progress * 100).toFixed(1)}%</span>
          <span>
            다음: Lv.{info.level + 1}
            {info.points_next !== null && (
              <span className="ml-1">({(info.points_next - info.points_current).toLocaleString()}P 남음)</span>
            )}
          </span>
        </div>
      </div>

      {/* Perks */}
      {info.perks.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-bold text-slate-600 dark:text-slate-300">현재 혜택</div>
          <ul className="space-y-1">
            {info.perks.map((perk, i) => (
              <li key={i} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <svg className="w-3 h-3 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {perk}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

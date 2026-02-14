"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-64 animate-fade-in">
      <div className="rounded-2xl border border-red-100 bg-red-50 dark:bg-red-950/30 dark:border-red-900/40 p-8 text-center max-w-md">
        <div className="text-4xl mb-4">!</div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">
          문제가 발생했습니다
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          페이지를 불러오는 중 오류가 발생했습니다. 다시 시도해 주세요.
        </p>
        <button
          onClick={reset}
          className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}

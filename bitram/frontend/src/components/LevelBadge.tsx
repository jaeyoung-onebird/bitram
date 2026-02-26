"use client";

interface LevelBadgeProps {
  level: number;
  color?: string;
  size?: "sm" | "md";
  name?: string; // kept for compatibility, ignored
}

function getLevelStyle(level: number) {
  if (level < 5)
    return { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-500 dark:text-slate-400", border: "border-slate-300 dark:border-slate-600" };
  if (level < 10)
    return { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-300 dark:border-emerald-600" };
  if (level < 20)
    return { bg: "bg-blue-50 dark:bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-300 dark:border-blue-600" };
  if (level < 30)
    return { bg: "bg-purple-50 dark:bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", border: "border-purple-300 dark:border-purple-600" };
  if (level < 50)
    return { bg: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-300 dark:border-amber-600" };
  return { bg: "bg-red-50 dark:bg-red-500/10", text: "text-red-600 dark:text-red-400", border: "border-red-300 dark:border-red-600" };
}

export default function LevelBadge({ level, size = "sm" }: LevelBadgeProps) {
  const style = getLevelStyle(level);
  const sizeClasses = size === "sm"
    ? "text-[10px] px-1.5 py-0.5"
    : "text-xs px-2 py-0.5";

  return (
    <span className={`inline-flex items-center ${sizeClasses} rounded-full border font-bold tabular-nums ${style.bg} ${style.text} ${style.border}`}>
      Lv.{level}
    </span>
  );
}

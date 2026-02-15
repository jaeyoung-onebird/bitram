"use client";

interface LevelBadgeProps {
  level: number;
  name: string;
  color?: string;
  size?: "sm" | "md";
}

const LEVEL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  gray: { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-500 dark:text-slate-400", border: "border-slate-300 dark:border-slate-600" },
  green: { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-300 dark:border-emerald-600" },
  blue: { bg: "bg-blue-50 dark:bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-300 dark:border-blue-600" },
  purple: { bg: "bg-purple-50 dark:bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", border: "border-purple-300 dark:border-purple-600" },
  orange: { bg: "bg-orange-50 dark:bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", border: "border-orange-300 dark:border-orange-600" },
  red: { bg: "bg-red-50 dark:bg-red-500/10", text: "text-red-600 dark:text-red-400", border: "border-red-300 dark:border-red-600" },
  gold: { bg: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-300 dark:border-amber-600" },
};

function getColorStyle(color?: string) {
  if (color && LEVEL_COLORS[color]) return LEVEL_COLORS[color];
  // Default: derive from level if no color given
  return LEVEL_COLORS.blue;
}

export default function LevelBadge({ level, name, color, size = "sm" }: LevelBadgeProps) {
  const style = getColorStyle(color);
  const sizeClasses = size === "sm"
    ? "text-[10px] px-1.5 py-0.5 gap-0.5"
    : "text-xs px-2 py-0.5 gap-1";

  return (
    <span className={`inline-flex items-center ${sizeClasses} rounded-full border font-bold ${style.bg} ${style.text} ${style.border}`}>
      <span>Lv.{level}</span>
      <span className="font-medium">{name}</span>
    </span>
  );
}

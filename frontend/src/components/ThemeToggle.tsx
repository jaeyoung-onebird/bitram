"use client";
import { useEffect, useState } from "react";
import { useThemeStore } from "@/lib/store";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  if (!mounted) return null;

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:text-slate-500 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
    >
      {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}

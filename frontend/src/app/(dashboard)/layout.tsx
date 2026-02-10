"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { useEffect, useState } from "react";
import {
  Bot,
  ChartColumn,
  MessageCircle,
  Puzzle,
  ReceiptText,
  Settings,
  type LucideIcon,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "대시보드", icon: ChartColumn },
  { href: "/strategies", label: "전략", icon: Puzzle },
  { href: "/bots", label: "봇", icon: Bot },
  { href: "/trades", label: "거래내역", icon: ReceiptText },
  { href: "/community", label: "커뮤니티", icon: MessageCircle },
  { href: "/settings", label: "설정", icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !isAuthenticated) router.push("/login");
  }, [mounted, isAuthenticated, router]);

  if (!mounted || !isAuthenticated) return null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Nav */}
      <header className="sticky top-0 z-50 bg-[#0a0e17]/90 backdrop-blur border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            BITRAM
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  pathname.startsWith(item.href) ? "bg-blue-600/20 text-blue-400" : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400 hidden sm:block">{user?.nickname}</span>
            <button onClick={logout} className="text-xs text-gray-500 hover:text-gray-300 transition">로그아웃</button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 pb-28 md:pb-6">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-3 inset-x-0 z-50 px-3">
        <div className="relative mx-auto max-w-md rounded-2xl border border-slate-700/60 bg-slate-950/88 p-2 backdrop-blur-xl shadow-[0_12px_30px_rgba(2,6,23,0.65)]">
          <div className="flex items-center justify-between gap-1">
            {NAV_ITEMS.slice(0, 5).map((item) => {
              const Icon: LucideIcon = item.icon;
              const active = pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 transition-all duration-200 ${
                    active
                      ? "bg-gradient-to-b from-blue-500/20 to-cyan-400/5 text-blue-300 shadow-[inset_0_0_0_1px_rgba(96,165,250,0.35)]"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                  }`}
                >
                  <Icon className={`h-[18px] w-[18px] ${active ? "drop-shadow-[0_0_10px_rgba(96,165,250,0.7)]" : ""}`} />
                  <span className="truncate text-[11px] font-medium leading-none tracking-tight">
                    {item.label}
                  </span>
                  {active ? <span className="absolute -top-1 h-1.5 w-6 rounded-full bg-blue-400/90" /> : null}
                </Link>
              );
            })}
          </div>
          <div className="pointer-events-none absolute inset-x-12 -top-px h-px bg-gradient-to-r from-transparent via-blue-300/30 to-transparent" />
        </div>
      </nav>
    </div>
  );
}

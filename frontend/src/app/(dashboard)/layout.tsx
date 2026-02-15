"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { useEffect, useState } from "react";
import BitramLogo from "@/components/brand/BitramLogo";
import NotificationBell from "@/components/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";
import { ToastProvider } from "@/components/Toast";
import ScrollToTop from "@/components/ScrollToTop";
import {
  Bot,
  ChartColumn,
  LogOut,
  MessageCircle,
  Puzzle,
  ReceiptText,
  ShieldCheck,
  Store,
  type LucideIcon,
} from "lucide-react";

const CORE_NAV_ITEMS = [
  { href: "/dashboard", label: "대시보드", icon: ChartColumn },
  { href: "/strategies", label: "전략", icon: Puzzle },
  { href: "/bots", label: "봇", icon: Bot },
  { href: "/marketplace", label: "마켓", icon: Store },
  { href: "/trades", label: "거래내역", icon: ReceiptText },
  { href: "/community", label: "커뮤니티", icon: MessageCircle },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const navItems = user?.plan === "admin"
    ? [...CORE_NAV_ITEMS, { href: "/admin", label: "관리자", icon: ShieldCheck }]
    : CORE_NAV_ITEMS;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !isAuthenticated) router.push("/login");
  }, [mounted, isAuthenticated, router]);

  if (!mounted || !isAuthenticated) return null;

  return (
    <ToastProvider>
    <div className="min-h-screen flex flex-col">
      {/* Top Nav */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="inline-flex items-center" aria-label="BITRAM 홈">
              <BitramLogo />
            </Link>
            <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md bg-blue-500 text-white text-xs font-bold tracking-tight">
              업비트 노코드 자동매매
            </span>
          </div>
          <nav aria-label="메인 네비게이션" className="hidden md:flex items-center gap-1.5">
            {navItems.map((item) => {
              const Icon: LucideIcon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-base font-medium transition ${
                    active
                      ? "bg-blue-50 dark:bg-blue-500/15 text-blue-500"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden lg:inline">{item.label}</span>
                  <span className="lg:hidden sr-only">{item.label}</span>
                                  </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
            <div className="hidden sm:block w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
            <Link
              href="/settings"
              className={`hidden sm:inline text-sm font-medium transition ${
                pathname.startsWith("/settings")
                  ? "text-blue-500"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              {user?.nickname}
            </Link>
            <Link
              href="/settings"
              aria-label="설정"
              className={`sm:hidden p-1.5 rounded-lg transition ${
                pathname.startsWith("/settings")
                  ? "text-blue-500"
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </Link>
            <button onClick={logout} aria-label="로그아웃" className="hidden sm:inline-flex text-xs px-2 py-1 rounded-md text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">로그아웃</button>
            <button onClick={logout} aria-label="로그아웃" className="sm:hidden p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main aria-label="메인 콘텐츠" className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 pb-28 md:pb-6">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav aria-label="모바일 네비게이션" className="md:hidden fixed bottom-3 inset-x-0 z-50 px-3">
        <div className="relative mx-auto max-w-md rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 p-2 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-between gap-0.5">
            {navItems.map((item) => {
              const Icon: LucideIcon = item.icon;
              const active = pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 transition-all duration-200 ${
                    active
                      ? "bg-blue-50 dark:bg-blue-500/15 text-blue-500 shadow-[inset_0_0_0_1px_rgba(49,130,246,0.2)]"
                      : "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  <span className="relative">
                    <Icon aria-hidden="true" className={`h-4 w-4 ${active ? "drop-shadow-[0_0_8px_rgba(49,130,246,0.5)]" : ""}`} />
                                      </span>
                  <span className="truncate text-xs font-medium leading-none whitespace-nowrap">
                    {item.label}
                  </span>
                  {active ? <span className="absolute -top-1 h-1.5 w-6 rounded-full bg-blue-500/80" /> : null}
                </Link>
              );
            })}
          </div>
          <div className="pointer-events-none absolute inset-x-6 -top-px h-px bg-gradient-to-r from-transparent via-blue-300/25 to-transparent" />
        </div>
      </nav>
      <ScrollToTop />
    </div>
    </ToastProvider>
  );
}

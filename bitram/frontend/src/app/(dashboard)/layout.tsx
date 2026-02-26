"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import BitramLogo from "@/components/brand/BitramLogo";
import NotificationBell from "@/components/NotificationBell";
import ThemeToggle from "@/components/ThemeToggle";
import { ToastProvider } from "@/components/Toast";
import ScrollToTop from "@/components/ScrollToTop";
import OnboardingModal from "@/components/OnboardingModal";
import LevelBadge from "@/components/LevelBadge";
import type { LevelInfo } from "@/types";
import {
  BarChart2,
  Cpu,
  LogOut,
  Mail,
  MessageSquare,
  MessageCircle,
  Layers,
  FileText,
  ShieldCheck,
  Package2,
  Award,
  type LucideIcon,
} from "lucide-react";

const CORE_NAV_ITEMS = [
  { href: "/dashboard", label: "대시보드", icon: BarChart2 },
  { href: "/strategies", label: "전략", icon: Layers },
  { href: "/bots", label: "봇", icon: Cpu },
  { href: "/marketplace", label: "마켓", icon: Package2 },
  { href: "/community", label: "커뮤니티", icon: MessageSquare },
  { href: "/chat", label: "채팅", icon: MessageCircle },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // no-op
    } finally {
      logout();
      router.push("/login");
    }
  };
  const [mounted, setMounted] = useState(false);
  const [levelInfo, setLevelInfo] = useState<LevelInfo | null>(null);
  const navItems = user?.plan === "admin"
    ? [...CORE_NAV_ITEMS, { href: "/admin", label: "관리자", icon: ShieldCheck }]
    : CORE_NAV_ITEMS;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    if (isAuthenticated) return;
    // Try to restore session from cookie (OAuth redirect or existing session)
    api.getMe().then((data) => {
      if (data?.id) {
        useAuthStore.getState().setAuth(data);
      }
      // Don't redirect to login — allow browsing without auth
    }).catch(() => {
      // Guest mode — no redirect
    });
  }, [mounted, isAuthenticated]);

  useEffect(() => {
    if (!mounted || !isAuthenticated) return;
    api.getLevelInfo().then(setLevelInfo).catch(() => {});
  }, [mounted, isAuthenticated]);

  if (!mounted) return null;

  return (
    <ToastProvider>
    <div className="min-h-screen flex flex-col">
      {/* Top Nav */}
      <header className="sticky top-0 z-50 bg-white dark:bg-[#0f1724] border-b border-slate-200/70 dark:border-slate-800/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-8">

          {/* Logo */}
          <Link href="/dashboard" className="inline-flex items-center shrink-0" aria-label="BITRAM 홈">
            <BitramLogo markClassName="h-7 w-7" />
          </Link>

          {/* Center Nav */}
          <nav aria-label="메인 네비게이션" className="hidden md:flex items-stretch h-14 gap-1">
            {navItems.map((item) => {
              const Icon: LucideIcon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative inline-flex items-center gap-2 px-4 text-sm font-medium transition-colors ${
                    active
                      ? "text-blue-500 dark:text-blue-400"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                  {item.label}
                  {active && (
                    <span className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-500 dark:bg-blue-400 rounded-t-full" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3 shrink-0">
            <ThemeToggle />
            {isAuthenticated ? (
              <>
                <NotificationBell />
                <div className="hidden sm:block w-px h-5 bg-slate-200 dark:bg-slate-700" />
                <Link
                  href="/settings"
                  className={`hidden sm:inline-flex items-center gap-1.5 text-sm font-medium transition ${
                    pathname.startsWith("/settings")
                      ? "text-blue-500 dark:text-blue-400"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                  }`}
                >
                  {levelInfo
                    ? <LevelBadge level={levelInfo.level} size="sm" />
                    : <span className="w-6 h-6 rounded-full bg-blue-500/15 text-blue-500 dark:text-blue-400 text-xs font-black flex items-center justify-center">
                        {user?.nickname?.charAt(0)?.toUpperCase() ?? "U"}
                      </span>
                  }
                  {user?.nickname}
                </Link>
                <button
                  onClick={handleLogout}
                  aria-label="로그아웃"
                  className="hidden sm:inline-flex text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 transition"
                >
                  로그아웃
                </button>
                <button onClick={handleLogout} aria-label="로그아웃" className="sm:hidden p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition">
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition"
                >
                  로그인
                </Link>
                <Link
                  href="/register"
                  className="text-sm font-bold px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition"
                >
                  무료 시작
                </Link>
              </>
            )}
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
                    <Icon aria-hidden="true" strokeWidth={1.5} className={`h-4 w-4 ${active ? "drop-shadow-[0_0_8px_rgba(49,130,246,0.5)]" : ""}`} />
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
      <OnboardingModal />
    </div>
    </ToastProvider>
  );
}

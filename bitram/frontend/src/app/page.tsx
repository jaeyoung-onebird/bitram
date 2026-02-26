"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const FEATURES = [
  {
    icon: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z",
    title: "노코드 전략 빌더",
    desc: "RSI, MACD, 볼린저밴드 등 20개 이상의 기술 지표를 드래그앤드롭으로 조합하세요.",
  },
  {
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
    title: "AI 전략 생성",
    desc: "AI가 수익성 높은 전략을 자동으로 생성하고 백테스트까지 완료합니다.",
  },
  {
    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    title: "실전 백테스트",
    desc: "과거 데이터 기반 시뮬레이션으로 전략 성과를 미리 확인하세요.",
  },
  {
    icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
    title: "24시간 자동매매",
    desc: "봇이 전략에 따라 자동으로 매수/매도합니다. 잠자는 동안에도.",
  },
  {
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
    title: "트레이더 커뮤니티",
    desc: "수익 인증, 전략 공유, 실시간 토론. 고수의 전략을 1클릭 복사.",
  },
  {
    icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
    title: "안전한 API 키 관리",
    desc: "AES-256 암호화로 업비트 API 키를 안전하게 보관합니다.",
  },
];

const STATS = [
  { label: "등록 전략", value: "500+" },
  { label: "일일 거래량", value: "1억+" },
  { label: "기술 지표", value: "20+" },
  { label: "가입 트레이더", value: "1,000+" },
];

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
          <Link href="/" className="text-xl font-black bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
            BITRAM
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/community" className="hidden sm:inline-flex px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition">
              커뮤니티
            </Link>
            <Link href="/news" className="hidden sm:inline-flex px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition">
              뉴스
            </Link>
            <Link href="/login" className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition">
              로그인
            </Link>
            <Link href="/register" className="px-5 py-2 text-sm font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-xl shadow-sm shadow-blue-500/20 transition">
              무료 시작
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/80 via-white to-purple-50/50 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900" />
        <div className={`relative max-w-4xl mx-auto text-center transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full text-sm font-semibold">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            업비트 공식 API 연동
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white leading-tight tracking-tight">
            코딩 없이<br />
            <span className="bg-gradient-to-r from-blue-500 via-blue-500 to-purple-600 bg-clip-text text-transparent">
              자동매매
            </span>를 시작하세요
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            전략을 조립하고, AI로 최적화하고, 봇으로 실행하세요.<br className="hidden sm:inline" />
            트레이더 커뮤니티에서 수익 인증된 전략을 복사할 수도 있습니다.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-10">
            <Link href="/register" className="w-full sm:w-auto px-8 py-3.5 text-base font-bold bg-blue-500 hover:bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all">
              무료로 시작하기
            </Link>
            <Link href="/dashboard" className="w-full sm:w-auto px-8 py-3.5 text-base font-bold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-all">
              커뮤니티 둘러보기
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 border-y border-slate-200/60 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl font-black text-slate-900 dark:text-white">{s.value}</div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white">3단계로 자동매매 시작</h2>
            <p className="mt-3 text-slate-500 dark:text-slate-400">복잡한 코딩은 필요 없습니다</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "전략 조립", desc: "기술 지표를 선택하고 매수/매도 조건을 설정하세요. 또는 AI에게 맡기세요.", color: "blue" },
              { step: "02", title: "백테스트 검증", desc: "과거 데이터로 수익률, 승률, 최대 낙폭을 확인하세요.", color: "purple" },
              { step: "03", title: "봇 실행", desc: "API 키를 연결하고 봇을 실행하면 24시간 자동매매가 시작됩니다.", color: "emerald" },
            ].map((item) => (
              <div key={item.step} className="relative p-6 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl">
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl bg-${item.color}-500/10 text-${item.color}-500 text-sm font-black mb-4`}>
                  {item.step}
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{item.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white">강력한 기능</h2>
            <p className="mt-3 text-slate-500 dark:text-slate-400">트레이딩에 필요한 모든 것</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="p-6 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl hover:shadow-lg hover:-translate-y-0.5 transition-all">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={f.icon} />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Community Preview */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white">트레이더 커뮤니티</h2>
            <p className="mt-3 text-slate-500 dark:text-slate-400">수익 인증, 전략 공유, 고수의 노하우를 바로 복사</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", title: "수익 인증", desc: "봇 실거래 데이터로 자동 검증된 수익률을 확인하세요" },
              { icon: "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z", title: "1클릭 전략 복사", desc: "고수의 전략을 복사해서 내 봇에 바로 적용하세요" },
              { icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6", title: "랭킹 & 리더보드", desc: "최고 수익 트레이더와 인기 전략을 실시간으로 확인" },
            ].map((item) => (
              <div key={item.title} className="p-6 bg-gradient-to-br from-blue-500/5 to-purple-500/5 dark:from-blue-500/10 dark:to-purple-500/10 border border-blue-200/30 dark:border-blue-800/30 rounded-2xl text-center">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">{item.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-gradient-to-r from-blue-500 to-purple-600">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-black text-white">지금 바로 시작하세요</h2>
          <p className="mt-4 text-lg text-blue-100">무료 플랜으로 전략 빌더, 백테스트, 커뮤니티를 모두 이용하세요.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <Link href="/register" className="w-full sm:w-auto px-8 py-3.5 text-base font-bold bg-white text-blue-600 hover:bg-blue-50 rounded-2xl shadow-lg transition-all">
              무료 회원가입
            </Link>
            <Link href="/login" className="w-full sm:w-auto px-8 py-3.5 text-base font-bold border-2 border-white/30 text-white hover:bg-white/10 rounded-2xl transition-all">
              로그인
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 bg-slate-50 dark:bg-slate-900 border-t border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm font-bold text-slate-400 dark:text-slate-500">BITRAM</div>
          <div className="flex items-center gap-6 text-sm text-slate-400 dark:text-slate-500">
            <Link href="/community" className="hover:text-slate-600 dark:hover:text-slate-300 transition">커뮤니티</Link>
            <Link href="/news" className="hover:text-slate-600 dark:hover:text-slate-300 transition">뉴스</Link>
            <Link href="/login" className="hover:text-slate-600 dark:hover:text-slate-300 transition">로그인</Link>
          </div>
          <div className="text-xs text-slate-400 dark:text-slate-600">&copy; 2026 BITRAM. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}

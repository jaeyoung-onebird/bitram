"use client";
import Link from "next/link";

const FEATURES = [
  { icon: "🧩", title: "노코드 전략 빌더", desc: "블록을 조립하듯 매매 전략을 만드세요. RSI, MACD, 볼린저밴드 등 20+ 지표 지원" },
  { icon: "📊", title: "백테스팅", desc: "과거 데이터로 전략을 검증하세요. 수익률, MDD, 샤프비율까지 한눈에" },
  { icon: "🤖", title: "24시간 자동매매", desc: "설정한 전략을 클라우드에서 자동으로 실행. 잠자는 동안에도 매매" },
  { icon: "🛡️", title: "리스크 관리", desc: "손절/익절 자동 설정. 최대 투자금 제한으로 안전하게" },
  { icon: "💬", title: "커뮤니티", desc: "전략 공유, 수익 인증, 카피 트레이딩. 모든 기능이 무료입니다" },
  { icon: "📱", title: "텔레그램 알림", desc: "매수/매도 체결, 봇 상태 변경을 실시간으로 알림" },
];


export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-[#0a0e17]/80 backdrop-blur border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            BITRAM
          </div>
          <div className="flex gap-3">
            <Link href="/login" className="px-4 py-2 text-sm text-gray-300 hover:text-white transition">
              로그인
            </Link>
            <Link href="/register" className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded-lg transition">
              무료 시작하기
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block px-4 py-1.5 mb-6 text-sm bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20">
            업비트 전용 노코드 봇 빌더
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            코딩 없이<br />
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              자동매매 전략
            </span>을 만드세요
          </h1>
          <p className="text-lg text-gray-400 mb-10 max-w-2xl mx-auto">
            전략을 만들고, 공유하고, 함께 성장하세요.
            커뮤니티와 함께하는 스마트한 자동매매 플랫폼입니다.
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/register"
              className="px-8 py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl font-semibold text-lg transition shadow-lg shadow-blue-500/25">
              무료로 시작하기
            </Link>
          </div>
          <p className="mt-4 text-sm text-gray-500">모든 기능 무료 - 지금 바로 시작하세요</p>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 bg-[#111827]/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">이렇게 간단합니다</h2>
          <p className="text-gray-400 text-center mb-16">3단계로 자동매매를 시작하세요</p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "전략 조립", desc: "IF RSI < 30 THEN 매수 10%\n블록을 끌어다 놓으세요" },
              { step: "02", title: "백테스팅", desc: "과거 데이터로 수익률을 검증\n파라미터를 조정하세요" },
              { step: "03", title: "봇 실행", desc: "버튼 하나로 24시간 자동매매\n텔레그램으로 알림 수신" },
            ].map((item) => (
              <div key={item.step} className="relative p-8 rounded-2xl bg-[#1a2332] border border-gray-800">
                <div className="text-5xl font-black text-blue-500/20 mb-4">{item.step}</div>
                <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                <p className="text-gray-400 whitespace-pre-line">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-16">주요 기능</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="p-6 rounded-xl bg-[#1a2332] border border-gray-800 hover:border-blue-500/30 transition">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-bold mb-2">{f.title}</h3>
                <p className="text-sm text-gray-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Community */}
      <section className="py-20 px-6 bg-[#111827]/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">커뮤니티와 함께 성장하세요</h2>
          <p className="text-gray-400 text-center mb-16">전략을 공유하고, 검증하고, 함께 수익을 만들어가세요</p>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { icon: "🔗", title: "전략 공유", desc: "내 전략을 공유하고 다른 트레이더의 전략을 탐색하세요. 블록 단위로 쉽게 이해할 수 있습니다." },
              { icon: "✅", title: "수익 인증", desc: "실제 거래 데이터 기반 수익률 인증. 검증된 전략만 신뢰하세요." },
              { icon: "🏆", title: "전략 랭킹", desc: "수익률, 복사 수, 좋아요 기반 랭킹 시스템. 최고의 전략을 한눈에 확인하세요." },
              { icon: "📋", title: "카피 트레이딩", desc: "마음에 드는 전략을 원클릭으로 복사하여 바로 실행하세요." },
            ].map((item) => (
              <div key={item.title} className="p-6 rounded-xl border bg-[#1a2332] border-gray-800 hover:border-blue-500/30 transition">
                <div className="text-3xl mb-3">{item.icon}</div>
                <h3 className="font-bold text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-gray-400">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link href="/register"
              className="px-8 py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl font-semibold text-lg transition shadow-lg shadow-blue-500/25 inline-block">
              무료로 시작하기
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-gray-800">
        <div className="max-w-5xl mx-auto text-center">
          <div className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-4">
            BITRAM
          </div>
          <p className="text-sm text-gray-500 max-w-lg mx-auto">
            본 서비스는 투자자문이 아니며, 모든 투자 판단과 책임은 사용자에게 있습니다.
            암호화폐 투자는 원금 손실의 위험이 있습니다.
          </p>
          <p className="text-xs text-gray-600 mt-4">© 2026 BitramLab. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

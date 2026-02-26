"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "bitram_onboarded";

const STEPS = [
  {
    icon: (
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    title: "전략을 탐색해보세요",
    desc: "다른 트레이더들의 검증된 전략을 둘러보고 백테스트 결과를 확인하세요. 나에게 맞는 전략을 찾는 것이 첫 번째 단계예요.",
    cta: "전략 보러 가기",
    href: "/strategies",
  },
  {
    icon: (
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    title: "전략을 복사해 봇을 돌려보세요",
    desc: "마음에 드는 전략을 한 클릭으로 내 봇에 복사할 수 있어요. 커뮤니티 게시글의 전략복사 버튼을 눌러보세요.",
    cta: "커뮤니티 보러 가기",
    href: "/community",
  },
  {
    icon: (
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
      </svg>
    ),
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    title: "결과를 커뮤니티에 공유하세요",
    desc: "백테스트 결과 화면에서 '커뮤니티 공유' 버튼을 누르면 결과가 자동으로 채워진 글쓰기 화면이 열려요. 내 전략을 세상에 알려보세요!",
    cta: "바로 시작하기",
    href: null,
  },
];

export default function OnboardingModal() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        // Slight delay so page renders first
        setTimeout(() => setVisible(true), 800);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setVisible(false);
  };

  const handleCta = () => {
    const current = STEPS[step];
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
      if (current.href) router.push(current.href);
    }
  };

  const handleStepCta = (href: string | null) => {
    if (href) router.push(href);
    dismiss();
  };

  if (!visible) return null;

  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={dismiss}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in">
        {/* Close */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition z-10"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Step indicator */}
        <div className="flex justify-center gap-1.5 pt-5 pb-0">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-blue-500" : "w-1.5 bg-slate-200 dark:bg-slate-700"
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-7 py-6 text-center">
          {/* Icon */}
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl ${current.bg} ${current.color} mb-5`}>
            {current.icon}
          </div>

          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
            {current.title}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
            {current.desc}
          </p>

          {/* CTA */}
          <button
            onClick={handleCta}
            className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold rounded-xl transition shadow-sm"
          >
            {step < STEPS.length - 1 ? "다음" : "시작하기"}
          </button>

          {/* Secondary action */}
          {current.href && (
            <button
              onClick={() => handleStepCta(current.href)}
              className="mt-2 w-full py-2.5 text-sm text-blue-500 hover:text-blue-600 font-medium transition"
            >
              {current.cta} →
            </button>
          )}

          {/* Skip */}
          <button
            onClick={dismiss}
            className="mt-1 text-xs text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition"
          >
            건너뛰기
          </button>
        </div>

        {/* Step count */}
        <div className="px-7 pb-5 text-center">
          <span className="text-[11px] text-slate-300 dark:text-slate-700">
            {step + 1} / {STEPS.length}
          </span>
        </div>
      </div>
    </div>
  );
}

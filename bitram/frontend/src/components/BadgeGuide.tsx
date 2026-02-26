"use client";
import { Award } from "lucide-react";

interface BadgeDefinition {
  type: string;
  label: string;
  description: string;
  requirement: string;
  color: string;
}

const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { type: "early_adopter", label: "얼리 어답터", description: "비트램 초기 가입자", requirement: "초기 가입 시 자동 부여", color: "text-amber-500 bg-amber-500/10" },
  { type: "helpful", label: "도움왕", description: "커뮤니티에서 유용한 답변 제공", requirement: "댓글 좋아요 50개 이상", color: "text-emerald-500 bg-emerald-500/10" },
  { type: "top_contributor", label: "탑 기여자", description: "활발한 커뮤니티 활동", requirement: "게시글 30개 + 좋아요 100개", color: "text-blue-500 bg-blue-500/10" },
  { type: "verified_trader", label: "인증 트레이더", description: "실전 매매 성과 인증", requirement: "봇 실거래 수익 인증", color: "text-violet-500 bg-violet-500/10" },
  { type: "strategy_master", label: "전략 마스터", description: "높은 성과의 전략 보유", requirement: "전략 복사 수 50회 이상", color: "text-rose-500 bg-rose-500/10" },
  { type: "consistent_profit", label: "꾸준한 수익", description: "지속적인 수익 달성", requirement: "3개월 연속 양의 수익률", color: "text-cyan-500 bg-cyan-500/10" },
  { type: "creator", label: "크리에이터", description: "크리에이터 프로그램 참여", requirement: "크리에이터 조건 충족", color: "text-orange-500 bg-orange-500/10" },
  { type: "silver_creator", label: "실버 크리에이터", description: "우수 크리에이터", requirement: "팔로워 50명 + 전략 복사 100회", color: "text-slate-400 bg-slate-400/10" },
  { type: "gold_creator", label: "골드 크리에이터", description: "최고 수준 크리에이터", requirement: "팔로워 200명 + 전략 복사 500회", color: "text-yellow-500 bg-yellow-500/10" },
  { type: "platinum_creator", label: "플래티넘 크리에이터", description: "전설적인 크리에이터", requirement: "팔로워 1000명 + 전략 복사 2000회", color: "text-indigo-400 bg-indigo-400/10" },
];

interface BadgeGuideProps {
  earnedBadges?: string[];
}

export default function BadgeGuide({ earnedBadges = [] }: BadgeGuideProps) {
  const earned = new Set(earnedBadges);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Award className="w-5 h-5 text-amber-500" />
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">뱃지 해금 가이드</h2>
      </div>
      <div className="space-y-2.5">
        {BADGE_DEFINITIONS.map((badge) => {
          const isEarned = earned.has(badge.type);
          return (
            <div
              key={badge.type}
              className={`flex items-start gap-3 p-3 rounded-xl border transition ${
                isEarned
                  ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/5"
                  : "border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${badge.color}`}>
                <Award className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{badge.label}</span>
                  {isEarned && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold">
                      획득
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{badge.description}</p>
                <p className={`text-[11px] mt-1 font-medium ${isEarned ? "text-emerald-500" : "text-slate-400 dark:text-slate-500"}`}>
                  {badge.requirement}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

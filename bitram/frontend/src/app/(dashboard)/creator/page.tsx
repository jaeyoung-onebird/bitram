"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";

type CreatorTier = {
  name: string;
  key: string;
  badge_type: string;
  monthly_points: number;
  extra_bots: number;
  perks: string[];
};

type CreatorStatus = {
  score: number;
  components: {
    post_count: number;
    total_likes: number;
    strategy_copy_count: number;
    follower_count: number;
    score: number;
  };
  tier: CreatorTier | null;
  next_tier: { name: string; key: string; min_score: number; points_needed: number } | null;
  all_tiers: Array<{ name: string; key: string; min_score: number; perks: string[] }>;
  claimed_this_month: boolean;
};

type TopCreator = {
  rank: number;
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  score: number;
  post_count: number;
  total_likes: number;
  strategy_copy_count: number;
  follower_count: number;
  tier: string | null;
  tier_name: string | null;
};

const TIER_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  bronze: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/30",
    glow: "shadow-amber-500/20",
  },
  silver: {
    bg: "bg-slate-300/10",
    text: "text-slate-500 dark:text-slate-300",
    border: "border-slate-400/30",
    glow: "shadow-slate-400/20",
  },
  gold: {
    bg: "bg-yellow-500/10",
    text: "text-yellow-600 dark:text-yellow-400",
    border: "border-yellow-500/30",
    glow: "shadow-yellow-500/20",
  },
  platinum: {
    bg: "bg-cyan-500/10",
    text: "text-cyan-600 dark:text-cyan-400",
    border: "border-cyan-500/30",
    glow: "shadow-cyan-500/20",
  },
};

const TIER_ICONS: Record<string, string> = {
  bronze: "\u{1F949}",
  silver: "\u{1F948}",
  gold: "\u{1F947}",
  platinum: "\u{1F48E}",
};

function TierBadge({ tierKey, name }: { tierKey: string; name: string }) {
  const colors = TIER_COLORS[tierKey] || TIER_COLORS.bronze;
  const icon = TIER_ICONS[tierKey] || "";
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${colors.bg} ${colors.text} border ${colors.border}`}>
      {icon} {name}
    </span>
  );
}

export default function CreatorPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<CreatorStatus | null>(null);
  const [topCreators, setTopCreators] = useState<TopCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getCreatorStatus().catch(() => null),
      api.getTopCreators().catch(() => []),
    ]).then(([s, t]) => {
      setStatus(s);
      setTopCreators(t);
    }).finally(() => setLoading(false));
  }, []);

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const result = await api.claimCreatorReward();
      if (result.ok) {
        toast(result.message, "success");
        // Refresh status
        const updated = await api.getCreatorStatus();
        setStatus(updated);
      } else {
        toast(result.message, "error");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "보상 수령에 실패했습니다.", "error");
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">
        로딩 중...
      </div>
    );
  }

  const score = status?.score ?? 0;
  const tier = status?.tier;
  const nextTier = status?.next_tier;
  const components = status?.components;

  // Progress bar calculation
  let progressPercent = 0;
  let progressLabel = "";
  if (nextTier) {
    const currentMin = tier
      ? (status?.all_tiers.find((t) => t.key === tier.key)?.min_score ?? 0)
      : 0;
    const range = nextTier.min_score - currentMin;
    const progress = score - currentMin;
    progressPercent = range > 0 ? Math.min(100, Math.round((progress / range) * 100)) : 0;
    progressLabel = `${nextTier.name}까지 ${nextTier.points_needed}점`;
  } else if (tier) {
    progressPercent = 100;
    progressLabel = "최고 등급 달성!";
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">크리에이터 프로그램</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
          콘텐츠를 공유하고 크리에이터 보상을 받으세요
        </p>
      </div>

      {/* My Creator Status */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 space-y-5">
          {/* Tier & Score */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-2xl font-black">
                {tier ? TIER_ICONS[tier.key] || "C" : "C"}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-slate-800 dark:text-slate-100">내 크리에이터 현황</span>
                  {tier && <TierBadge tierKey={tier.key} name={tier.name} />}
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  크리에이터 점수: <span className="font-bold text-slate-700 dark:text-slate-200">{score.toLocaleString()}점</span>
                </p>
              </div>
            </div>

            {/* Claim Button */}
            {tier && (
              <button
                onClick={handleClaim}
                disabled={claiming || status?.claimed_this_month}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  status?.claimed_this_month
                    ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-lg shadow-blue-500/25"
                }`}
              >
                {claiming
                  ? "수령 중..."
                  : status?.claimed_this_month
                  ? "이번 달 수령 완료"
                  : `월간 보상 수령 (${tier.monthly_points}P)`}
              </button>
            )}
          </div>

          {/* Progress Bar */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-500 dark:text-slate-400">
                {tier ? tier.name : "등급 없음"}
              </span>
              <span className="text-slate-500 dark:text-slate-400">{progressLabel}</span>
            </div>
            <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-700"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Score Breakdown */}
          {components && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <div className="text-xs text-slate-400 dark:text-slate-500">게시글</div>
                <div className="text-lg font-bold text-slate-700 dark:text-slate-200">{components.post_count}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500">x5 = {components.post_count * 5}점</div>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <div className="text-xs text-slate-400 dark:text-slate-500">받은 좋아요</div>
                <div className="text-lg font-bold text-slate-700 dark:text-slate-200">{components.total_likes}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500">x2 = {components.total_likes * 2}점</div>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <div className="text-xs text-slate-400 dark:text-slate-500">전략 복사</div>
                <div className="text-lg font-bold text-slate-700 dark:text-slate-200">{components.strategy_copy_count}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500">x10 = {components.strategy_copy_count * 10}점</div>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <div className="text-xs text-slate-400 dark:text-slate-500">팔로워</div>
                <div className="text-lg font-bold text-slate-700 dark:text-slate-200">{components.follower_count}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500">x3 = {components.follower_count * 3}점</div>
              </div>
            </div>
          )}

          {/* Current Perks */}
          {tier && (
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">현재 혜택</h3>
              <div className="flex flex-wrap gap-2">
                {tier.perks.map((perk, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-medium">
                    {perk}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!tier && (
            <div className="text-center py-4 text-sm text-slate-500 dark:text-slate-400">
              크리에이터 등급에 도달하려면 100점 이상이 필요합니다.<br />
              게시글 작성, 전략 공유, 팔로워 확보를 통해 점수를 올려보세요!
            </div>
          )}
        </div>
      </div>

      {/* Tier Explanation */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">등급별 혜택</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(status?.all_tiers ?? []).map((t) => {
              const colors = TIER_COLORS[t.key] || TIER_COLORS.bronze;
              const isActive = tier?.key === t.key;
              return (
                <div
                  key={t.key}
                  className={`relative p-4 rounded-xl border-2 transition-all ${
                    isActive
                      ? `${colors.border} ${colors.bg} shadow-lg ${colors.glow}`
                      : "border-slate-200/60 dark:border-slate-700/60"
                  }`}
                >
                  {isActive && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                      <span className="px-2 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded-full">
                        현재 등급
                      </span>
                    </div>
                  )}
                  <div className="text-center mb-3">
                    <div className="text-3xl mb-1">{TIER_ICONS[t.key]}</div>
                    <div className={`text-sm font-bold ${colors.text}`}>{t.name}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">{t.min_score.toLocaleString()}점 이상</div>
                  </div>
                  <ul className="space-y-1.5">
                    {t.perks.map((perk, i) => (
                      <li key={i} className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-1.5">
                        <span className="text-emerald-500 mt-0.5 shrink-0">&#10003;</span>
                        {perk}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Score Calculation Formula */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3">점수 계산 방법</h2>
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
          <code className="text-sm text-slate-700 dark:text-slate-300 block text-center">
            점수 = (게시글 x 5) + (받은 좋아요 x 2) + (전략 복사 x 10) + (팔로워 x 3)
          </code>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 text-center">
          점수는 활동에 따라 자동으로 계산됩니다. 매월 1회 등급에 따른 보상을 수령할 수 있습니다.
        </p>
      </div>

      {/* Top Creators Leaderboard */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">
            TOP 크리에이터
          </h2>

          {topCreators.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">
              아직 크리에이터가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2.5 text-left font-medium w-12">#</th>
                    <th className="py-2.5 text-left font-medium">크리에이터</th>
                    <th className="py-2.5 text-right font-medium">점수</th>
                    <th className="py-2.5 text-right font-medium hidden sm:table-cell">게시글</th>
                    <th className="py-2.5 text-right font-medium hidden sm:table-cell">좋아요</th>
                    <th className="py-2.5 text-right font-medium hidden md:table-cell">전략복사</th>
                    <th className="py-2.5 text-right font-medium hidden md:table-cell">팔로워</th>
                    <th className="py-2.5 text-right font-medium">등급</th>
                  </tr>
                </thead>
                <tbody>
                  {topCreators.map((creator) => {
                    const rankColors =
                      creator.rank === 1
                        ? "text-yellow-500 font-black"
                        : creator.rank === 2
                        ? "text-slate-400 font-bold"
                        : creator.rank === 3
                        ? "text-amber-600 font-bold"
                        : "text-slate-500 dark:text-slate-400";

                    return (
                      <tr
                        key={creator.user_id}
                        className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                      >
                        <td className={`py-3 ${rankColors}`}>{creator.rank}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            {creator.avatar_url ? (
                              <img
                                src={creator.avatar_url}
                                alt=""
                                className="w-7 h-7 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-blue-500/15 text-blue-500 text-xs font-black flex items-center justify-center">
                                {creator.nickname?.charAt(0)?.toUpperCase() ?? "?"}
                              </div>
                            )}
                            <span className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-[120px]">
                              {creator.nickname}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 text-right font-bold text-slate-700 dark:text-slate-200">
                          {creator.score.toLocaleString()}
                        </td>
                        <td className="py-3 text-right text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                          {creator.post_count}
                        </td>
                        <td className="py-3 text-right text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                          {creator.total_likes}
                        </td>
                        <td className="py-3 text-right text-slate-500 dark:text-slate-400 hidden md:table-cell">
                          {creator.strategy_copy_count}
                        </td>
                        <td className="py-3 text-right text-slate-500 dark:text-slate-400 hidden md:table-cell">
                          {creator.follower_count}
                        </td>
                        <td className="py-3 text-right">
                          {creator.tier ? (
                            <TierBadge tierKey={creator.tier} name={creator.tier_name || ""} />
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

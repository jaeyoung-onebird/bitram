"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { Bot, Strategy, ExchangeKey } from "@/types";

const STATUS_CONFIG: Record<string, { label: string; className: string; dot: string }> = {
  running: { label: "실행 중", className: "bg-green-500/20 text-green-400", dot: "bg-green-400" },
  paused: { label: "일시정지", className: "bg-yellow-500/20 text-yellow-400", dot: "bg-yellow-400" },
  idle: { label: "대기", className: "bg-gray-500/20 text-gray-400", dot: "bg-gray-400" },
  stopped: { label: "중지", className: "bg-gray-500/20 text-gray-400", dot: "bg-gray-500" },
  error: { label: "오류", className: "bg-red-500/20 text-red-400", dot: "bg-red-400" },
};

export default function BotsPage() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [keys, setKeys] = useState<ExchangeKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modal form state
  const [formName, setFormName] = useState("");
  const [formStrategyId, setFormStrategyId] = useState("");
  const [formKeyId, setFormKeyId] = useState("");
  const [formMaxInvestment, setFormMaxInvestment] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const fetchBots = useCallback(async () => {
    try {
      const result = await api.getBots();
      setBots(result);
    } catch (err) {
      console.error("Failed to fetch bots:", err);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetchBots(),
      api.getStrategies().then(setStrategies).catch(console.error),
      api.getKeys().then(setKeys).catch(console.error),
    ]).finally(() => setLoading(false));
  }, [fetchBots]);

  const handleAction = async (botId: string, action: "start" | "stop" | "pause") => {
    setActionLoading(botId);
    try {
      if (action === "start") await api.startBot(botId);
      else if (action === "stop") await api.stopBot(botId);
      else if (action === "pause") await api.pauseBot(botId);
      await fetchBots();
    } catch (err) {
      console.error(`Failed to ${action} bot:`, err);
      alert(`봇 ${action === "start" ? "시작" : action === "stop" ? "중지" : "일시정지"}에 실패했습니다.`);
    } finally {
      setActionLoading(null);
    }
  };

  const openModal = () => {
    setFormName("");
    setFormStrategyId("");
    setFormKeyId("");
    setFormMaxInvestment("");
    setFormErrors({});
    setShowModal(true);
  };

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};
    if (!formName.trim()) errs.name = "봇 이름을 입력해주세요.";
    if (!formStrategyId) errs.strategy = "전략을 선택해주세요.";
    if (!formKeyId) errs.key = "API 키를 선택해주세요.";
    if (!formMaxInvestment || Number(formMaxInvestment) <= 0) errs.investment = "최대 투자금을 입력해주세요.";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreateBot = async () => {
    if (!validateForm()) return;
    setFormSubmitting(true);
    try {
      await api.createBot({
        name: formName.trim(),
        strategy_id: formStrategyId,
        exchange_key_id: formKeyId,
        max_investment: Number(formMaxInvestment),
      });
      setShowModal(false);
      await fetchBots();
    } catch (err) {
      console.error("Failed to create bot:", err);
      alert("봇 생성에 실패했습니다.");
    } finally {
      setFormSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">봇 관리</h1>
          <p className="text-sm text-gray-400 mt-1">
            활성 봇 {bots.filter((b) => b.status === "running").length}개 / 전체 {bots.length}개
          </p>
        </div>
        <button
          onClick={openModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
        >
          새 봇 만들기
        </button>
      </div>

      {/* Bot Cards */}
      {bots.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <svg className="w-16 h-16 mb-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-lg mb-2">등록된 봇이 없습니다</p>
          <p className="text-sm">전략을 기반으로 자동매매 봇을 만들어보세요.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {bots.map((bot) => {
            const statusCfg = STATUS_CONFIG[bot.status] || STATUS_CONFIG.idle;
            const isActive = bot.status === "running";
            const isPaused = bot.status === "paused";
            const isLoading = actionLoading === bot.id;

            return (
              <div
                key={bot.id}
                className="bg-[#1a2332] border border-gray-800 rounded-xl p-5 space-y-4 hover:border-gray-700 transition"
              >
                {/* Top: name + status */}
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-100 truncate">{bot.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {bot.strategy_name || "전략 없음"}
                    </p>
                  </div>
                  <span className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full shrink-0 ${statusCfg.className}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} ${isActive ? "animate-pulse" : ""}`} />
                    {statusCfg.label}
                  </span>
                </div>

                {/* Pair */}
                {bot.pair && (
                  <div className="text-sm text-gray-400">
                    <span className="text-gray-500">페어:</span>{" "}
                    <span className="text-gray-200 font-medium">{bot.pair.replace("KRW-", "")}/KRW</span>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2.5 bg-[#111827] rounded-lg">
                    <div className="text-[10px] text-gray-500 uppercase mb-0.5">총 수익</div>
                    <div className={`text-sm font-bold ${bot.total_profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {bot.total_profit >= 0 ? "+" : ""}
                      {bot.total_profit.toLocaleString()}원
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#111827] rounded-lg">
                    <div className="text-[10px] text-gray-500 uppercase mb-0.5">승률</div>
                    <div className="text-sm font-bold text-gray-200">
                      {bot.win_rate.toFixed(1)}%
                      <span className="text-[10px] text-gray-500 ml-1">
                        ({bot.win_trades}/{bot.total_trades})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Error message */}
                {bot.status === "error" && bot.error_message && (
                  <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-xs text-red-400 truncate">{bot.error_message}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
                  {(bot.status === "idle" || bot.status === "stopped" || bot.status === "error" || isPaused) && (
                    <button
                      onClick={() => handleAction(bot.id, "start")}
                      disabled={isLoading}
                      className="flex-1 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 text-xs font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {isLoading ? "..." : "시작"}
                    </button>
                  )}
                  {isActive && (
                    <button
                      onClick={() => handleAction(bot.id, "pause")}
                      disabled={isLoading}
                      className="flex-1 px-3 py-1.5 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 text-xs font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {isLoading ? "..." : "일시정지"}
                    </button>
                  )}
                  {(isActive || isPaused) && (
                    <button
                      onClick={() => handleAction(bot.id, "stop")}
                      disabled={isLoading}
                      className="flex-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {isLoading ? "..." : "중지"}
                    </button>
                  )}
                </div>

                {/* Started at */}
                {bot.started_at && (
                  <div className="text-[10px] text-gray-600">
                    시작: {new Date(bot.started_at).toLocaleString("ko-KR")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Bot Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-[#1a2332] border border-gray-800 rounded-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">새 봇 만들기</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Bot name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">봇 이름 *</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="예: BTC 자동매매 봇"
                className="w-full px-3 py-2.5 bg-[#111827] border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
              />
              {formErrors.name && <p className="text-xs text-red-400">{formErrors.name}</p>}
            </div>

            {/* Strategy select */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">전략 선택 *</label>
              <select
                value={formStrategyId}
                onChange={(e) => setFormStrategyId(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#111827] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition appearance-none"
              >
                <option value="">전략을 선택하세요</option>
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.pair} / {s.timeframe})
                  </option>
                ))}
              </select>
              {formErrors.strategy && <p className="text-xs text-red-400">{formErrors.strategy}</p>}
              {strategies.length === 0 && (
                <p className="text-xs text-gray-500">전략이 없습니다. 먼저 전략을 만들어주세요.</p>
              )}
            </div>

            {/* API Key select */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">API 키 *</label>
              <select
                value={formKeyId}
                onChange={(e) => setFormKeyId(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#111827] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition appearance-none"
              >
                <option value="">API 키를 선택하세요</option>
                {keys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label || k.exchange} {k.is_valid ? "" : "(무효)"}
                  </option>
                ))}
              </select>
              {formErrors.key && <p className="text-xs text-red-400">{formErrors.key}</p>}
              {keys.length === 0 && (
                <p className="text-xs text-gray-500">등록된 API 키가 없습니다. 설정에서 등록해주세요.</p>
              )}
            </div>

            {/* Max investment */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">최대 투자금 (KRW) *</label>
              <input
                type="number"
                value={formMaxInvestment}
                onChange={(e) => setFormMaxInvestment(e.target.value)}
                placeholder="예: 1000000"
                min={0}
                className="w-full px-3 py-2.5 bg-[#111827] border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
              />
              {formMaxInvestment && Number(formMaxInvestment) > 0 && (
                <p className="text-xs text-gray-500">
                  {Number(formMaxInvestment).toLocaleString()}원
                </p>
              )}
              {formErrors.investment && <p className="text-xs text-red-400">{formErrors.investment}</p>}
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 rounded-lg transition"
              >
                취소
              </button>
              <button
                onClick={handleCreateBot}
                disabled={formSubmitting}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {formSubmitting ? "생성 중..." : "봇 생성"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

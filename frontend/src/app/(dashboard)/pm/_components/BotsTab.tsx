"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { PMBot } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  running: "bg-green-500",
  idle: "bg-slate-400",
  paused: "bg-yellow-500",
  error: "bg-red-500",
  stopped: "bg-slate-400",
};

export default function BotsTab({ onRefresh }: { onRefresh?: () => void }) {
  const [bots, setBots] = useState<PMBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetchBots = useCallback(async () => {
    try {
      const data = await api.pmGetBots();
      setBots(data);
    } catch {
      setBots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh bots every 10 seconds
  useEffect(() => {
    fetchBots();
    const interval = setInterval(fetchBots, 10_000);
    return () => clearInterval(interval);
  }, [fetchBots]);

  const handleAction = async (botId: string, action: "start" | "stop" | "pause" | "delete") => {
    try {
      if (action === "start") await api.pmStartBot(botId);
      else if (action === "stop") await api.pmStopBot(botId);
      else if (action === "pause") await api.pmPauseBot(botId);
      else if (action === "delete") {
        if (!confirm("정말 삭제하시겠습니까?")) return;
        await api.pmDeleteBot(botId);
      }
      await fetchBots();
      onRefresh?.();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "작업 실패");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">PM Bots</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors"
        >
          + New Bot
        </button>
      </div>

      {showCreate && (
        <CreateBotForm
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchBots();
            onRefresh?.();
          }}
        />
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : bots.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p>No bots yet</p>
          <p className="text-xs mt-1">Create a scanner or arbitrage bot to get started</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {bots.map((bot) => (
            <BotCard key={bot.id} bot={bot} onAction={handleAction} />
          ))}
        </div>
      )}
    </div>
  );
}

function BotCard({
  bot,
  onAction,
}: {
  bot: PMBot;
  onAction: (id: string, action: "start" | "stop" | "pause" | "delete") => void;
}) {
  const winRate = bot.total_trades > 0
    ? ((bot.win_trades / bot.total_trades) * 100).toFixed(1)
    : "0";

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[bot.status] || "bg-slate-400"} ${bot.status === "running" ? "animate-pulse" : ""}`} />
          <h3 className="font-medium">{bot.name}</h3>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 capitalize">
          {bot.bot_type}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <p className="text-xs text-slate-400">P&L</p>
          <p className={`font-bold text-sm ${bot.total_profit_usdc >= 0 ? "text-green-600" : "text-red-500"}`}>
            {bot.total_profit_usdc >= 0 ? "+" : ""}${bot.total_profit_usdc.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Win Rate</p>
          <p className="font-bold text-sm">{winRate}%</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Trades</p>
          <p className="font-bold text-sm">{bot.total_trades}</p>
        </div>
      </div>

      {bot.current_positions.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-slate-400 mb-2">
            {bot.current_positions.length}개 보유 포지션
          </p>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {bot.current_positions.map((pos, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2"
              >
                <div className="flex-1 min-w-0 mr-2">
                  <p className="truncate text-slate-700 dark:text-slate-300">
                    {pos.question || pos.market_slug || "Unknown"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {pos.type === "arbitrage" ? (
                      <span className="px-1 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 text-[10px]">
                        ARB
                      </span>
                    ) : (
                      <span className={`px-1 py-0.5 rounded text-[10px] ${
                        pos.outcome === "Yes"
                          ? "bg-green-100 dark:bg-green-900/30 text-green-600"
                          : "bg-red-100 dark:bg-red-900/30 text-red-600"
                      }`}>
                        {pos.outcome}
                      </span>
                    )}
                    <span className="text-slate-400">
                      @${pos.entry_price?.toFixed(2) ?? pos.yes_price?.toFixed(2) ?? "?"} × {(pos.quantity ?? pos.shares ?? 0).toFixed(1)}
                    </span>
                  </div>
                </div>
                <span className="font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  ${((pos.entry_price ?? 0) * (pos.quantity ?? 0) || (pos.yes_price ?? 0 + (pos.no_price ?? 0)) * (pos.shares ?? 0)).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {bot.error_message && (
        <p className="text-xs text-red-500 mb-3 truncate">{bot.error_message}</p>
      )}

      <div className="flex gap-2">
        {(bot.status === "idle" || bot.status === "paused" || bot.status === "stopped" || bot.status === "error") && (
          <button
            onClick={() => onAction(bot.id, "start")}
            className="flex-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs rounded-lg"
          >
            Start
          </button>
        )}
        {bot.status === "running" && (
          <>
            <button
              onClick={() => onAction(bot.id, "pause")}
              className="flex-1 px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white text-xs rounded-lg"
            >
              Pause
            </button>
            <button
              onClick={() => onAction(bot.id, "stop")}
              className="flex-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs rounded-lg"
            >
              Stop
            </button>
          </>
        )}
        {bot.status !== "running" && (
          <button
            onClick={() => onAction(bot.id, "delete")}
            className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-500 text-xs rounded-lg"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function CreateBotForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [botType, setBotType] = useState<"ai" | "scanner" | "arbitrage">("ai");
  const [keys, setKeys] = useState<Array<{ id: string; label: string; is_valid: boolean }>>([]);
  const [selectedKeyId, setSelectedKeyId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Common settings
  const [maxExpiryMinutes, setMaxExpiryMinutes] = useState(5);
  const [positionSize, setPositionSize] = useState(50);
  const [maxPositions, setMaxPositions] = useState(10);
  const [maxTotalUsdc, setMaxTotalUsdc] = useState(500);
  const [scanInterval, setScanInterval] = useState(60);
  const [minVolume, setMinVolume] = useState(10000);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Scanner settings
  const [minPrice, setMinPrice] = useState(0.05);
  const [maxPrice, setMaxPrice] = useState(0.30);
  const [outcome, setOutcome] = useState<"Yes" | "No">("Yes");

  // Arbitrage settings
  const [minSpread, setMinSpread] = useState(0.02);

  const CATEGORIES = [
    { key: "crypto", label: "Crypto", keywords: "Bitcoin,BTC,ETH,Ethereum,crypto,Solana,SOL,XRP,token,DeFi,blockchain" },
    { key: "politics", label: "Politics", keywords: "president,election,congress,senate,governor,Trump,Biden,Republican,Democrat,vote,political" },
    { key: "sports", label: "Sports", keywords: "NFL,NBA,MLB,UFC,FIFA,Champions,Premier League,win,match,game,tournament,championship" },
    { key: "finance", label: "Finance", keywords: "Fed,interest rate,GDP,inflation,S&P,stock,NASDAQ,treasury,recession,CPI" },
    { key: "world", label: "World", keywords: "Iran,China,Russia,Ukraine,war,ceasefire,regime,strike,NATO,military" },
    { key: "tech", label: "Tech", keywords: "AI,Apple,Google,Tesla,SpaceX,Elon Musk,Meta,Microsoft,launch,IPO" },
    { key: "entertainment", label: "Entertainment", keywords: "Oscar,Grammy,movie,album,Netflix,box office,Billboard,Twitch,YouTube" },
  ];

  const toggleCategory = (key: string) => {
    setSelectedCategories((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]
    );
  };

  useEffect(() => {
    api.pmGetKeys().then((k) => {
      setKeys(k);
      const valid = k.find((x: { is_valid: boolean }) => x.is_valid);
      if (valid) setSelectedKeyId(valid.id);
    }).catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    if (!selectedKeyId) {
      alert("API 키를 선택해주세요. 설정 탭에서 먼저 키를 등록해주세요.");
      return;
    }
    setSubmitting(true);

    // Build category keywords list
    const categoryKeywords = selectedCategories.flatMap((key) => {
      const cat = CATEGORIES.find((c) => c.key === key);
      return cat ? cat.keywords.split(",") : [];
    });

    const config = botType === "ai"
      ? {
          filters: { max_expiry_minutes: maxExpiryMinutes, category_keywords: categoryKeywords },
          position_size_usdc: positionSize,
          max_open_positions: maxPositions,
          max_total_usdc: maxTotalUsdc,
          scan_interval_seconds: scanInterval,
        }
      : botType === "scanner"
      ? {
          filters: {
            min_volume_24h: minVolume,
            min_liquidity: 1000,
            categories: [],
            max_expiry_minutes: maxExpiryMinutes,
            category_keywords: categoryKeywords,
          },
          entry_conditions: { outcome, max_price: maxPrice, min_price: minPrice },
          exit_conditions: { take_profit_price: 0.60, stop_loss_price: 0.02, time_exit_hours: 168 },
          position_size_usdc: positionSize,
          max_open_positions: maxPositions,
          max_total_usdc: maxTotalUsdc,
          scan_interval_seconds: scanInterval,
        }
      : {
          min_spread: minSpread,
          min_volume_24h: minVolume,
          position_size_usdc: positionSize,
          max_open_positions: maxPositions,
          max_total_usdc: maxTotalUsdc,
          scan_interval_seconds: scanInterval,
          filters: { category_keywords: categoryKeywords },
        };

    try {
      await api.pmCreateBot({
        name,
        bot_type: botType,
        exchange_key_id: selectedKeyId || undefined,
        config,
      });
      onCreated();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "봇 생성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">새 봇 만들기</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          &times;
        </button>
      </div>

      {/* API Key Selection */}
      <div>
        <label className="block text-sm text-slate-500 mb-1">API 키</label>
        {keys.length === 0 ? (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              등록된 API 키가 없습니다. Settings 탭에서 먼저 키를 등록해주세요.
            </p>
          </div>
        ) : (
          <select
            value={selectedKeyId}
            onChange={(e) => setSelectedKeyId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="">키를 선택하세요</option>
            {keys.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label} {k.is_valid ? "✓" : "(유효하지 않음)"}
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label className="block text-sm text-slate-500 mb-1">봇 이름</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="내 스캐너 봇"
          className="w-full px-3 py-2 rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>
      <div>
        <label className="block text-sm text-slate-500 mb-1">전략 타입</label>
        <div className="flex gap-2">
          {([
            { key: "ai" as const, name: "AI 자율매매", desc: "Claude가 분석·판단" },
            { key: "scanner" as const, name: "Scanner", desc: "조건 기반 자동 진입" },
            { key: "arbitrage" as const, name: "Arbitrage", desc: "Yes+No 스프레드 차익" },
          ]).map((type) => (
            <button
              key={type.key}
              onClick={() => setBotType(type.key)}
              className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                botType === type.key
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600"
                  : "border-slate-200 dark:border-slate-700 text-slate-500"
              }`}
            >
              <div className="font-medium">{type.name}</div>
              <div className="text-xs mt-0.5 text-slate-400">{type.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Key Settings */}
      <div className="border border-slate-200/60 dark:border-slate-700/60 rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-medium text-slate-600 dark:text-slate-300">주요 설정</h4>

        <div>
          <label className="block text-xs text-slate-400 mb-1">카테고리 (미선택 시 전체)</label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => toggleCategory(cat.key)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  selectedCategories.includes(cat.key)
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600"
                    : "border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {(botType === "ai" || botType === "scanner") && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">타임프레임</label>
            <select
              value={maxExpiryMinutes}
              onChange={(e) => setMaxExpiryMinutes(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-transparent text-sm"
            >
              <option value={0}>전체 (제한 없음)</option>
              <option value={5}>5분 마켓</option>
              <option value={15}>5분 + 15분 마켓</option>
              <option value={60}>~ 1시간 마켓</option>
              <option value={240}>~ 4시간 마켓</option>
              <option value={1440}>~ Daily 마켓</option>
            </select>
            <p className="text-[10px] text-slate-400 mt-1">
              {maxExpiryMinutes === 5 ? "BTC/ETH/SOL 5분 Up/Down 마켓만" :
               maxExpiryMinutes === 15 ? "5분 + 15분 Up/Down 마켓" :
               maxExpiryMinutes === 0 ? "모든 활성 마켓 대상" :
               `${maxExpiryMinutes}분 이하 타임프레임 마켓`}
            </p>
          </div>
        )}

        {botType === "scanner" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">매수 방향</label>
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as "Yes" | "No")}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-transparent text-sm"
                >
                  <option value="Yes">Yes (긍정)</option>
                  <option value="No">No (부정)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">최소 가격 ($)</label>
                <input type="number" step="0.01" min="0" max="1" value={minPrice}
                  onChange={(e) => setMinPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-transparent text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">최대 가격 ($)</label>
                <input type="number" step="0.01" min="0" max="1" value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-transparent text-sm" />
              </div>
            </div>
          </>
        )}

        {botType === "arbitrage" && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">최소 스프레드</label>
            <input type="number" step="0.005" min="0" value={minSpread}
              onChange={(e) => setMinSpread(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-transparent text-sm" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">총 투자 한도 ($)</label>
            <input type="number" step="100" min="10" value={maxTotalUsdc}
              onChange={(e) => setMaxTotalUsdc(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-transparent text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">건당 금액 ($)</label>
            <input type="number" step="10" min="1" value={positionSize}
              onChange={(e) => setPositionSize(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-transparent text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">최대 포지션 수</label>
            <input type="number" step="1" min="1" max="50" value={maxPositions}
              onChange={(e) => setMaxPositions(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-transparent text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">스캔 간격 (초)</label>
            <input type="number" step="10" min="10" value={scanInterval}
              onChange={(e) => setScanInterval(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-transparent text-sm" />
          </div>
        </div>
        <p className="text-[10px] text-slate-400">
          예상 최대 투자: ${positionSize} × {maxPositions} = ${positionSize * maxPositions} (한도: ${maxTotalUsdc})
        </p>

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          {showAdvanced ? "▲ 고급 설정 숨기기" : "▼ 고급 설정 보기"}
        </button>

        {showAdvanced && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">최소 24h 거래량 ($)</label>
            <input type="number" step="1000" min="0" value={minVolume}
              onChange={(e) => setMinVolume(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-transparent text-sm" />
          </div>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
        >
          취소
        </button>
        <button
          onClick={handleCreate}
          disabled={!name.trim() || !selectedKeyId || submitting}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm rounded-lg"
        >
          {submitting ? "생성 중..." : "봇 생성"}
        </button>
      </div>
    </div>
  );
}

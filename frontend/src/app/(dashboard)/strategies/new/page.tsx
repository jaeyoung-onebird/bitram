"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import type {
  IndicatorDef,
  Strategy,
  StrategyCondition,
  StrategyAction,
  StrategySafety,
  StrategyConfig,
} from "@/types";
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Check,
  Save,
  AlertTriangle,
  Info,
} from "lucide-react";
import clsx from "clsx";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAIRS = [
  "KRW-BTC",
  "KRW-ETH",
  "KRW-XRP",
  "KRW-SOL",
  "KRW-DOGE",
  "KRW-ADA",
  "KRW-AVAX",
  "KRW-DOT",
  "KRW-MATIC",
  "KRW-LINK",
  "KRW-ATOM",
  "KRW-ETC",
  "KRW-BCH",
  "KRW-NEAR",
  "KRW-APT",
];

const TIMEFRAMES = [
  { value: "1m", label: "1분" },
  { value: "3m", label: "3분" },
  { value: "5m", label: "5분" },
  { value: "15m", label: "15분" },
  { value: "30m", label: "30분" },
  { value: "1h", label: "1시간" },
  { value: "4h", label: "4시간" },
  { value: "1d", label: "1일" },
];

const OPERATORS = [
  { value: "greater_than", label: "> (크다)" },
  { value: "less_than", label: "< (작다)" },
  { value: "equal", label: "= (같다)" },
  { value: "greater_equal", label: ">= (크거나 같다)" },
  { value: "less_equal", label: "<= (작거나 같다)" },
  { value: "crosses_above", label: "상향 돌파" },
  { value: "crosses_below", label: "하향 돌파" },
];

const ACTION_TYPES = [
  { value: "market_buy", label: "시장가 매수" },
  { value: "market_sell", label: "시장가 매도" },
  { value: "limit_buy", label: "지정가 매수" },
  { value: "limit_sell", label: "지정가 매도" },
] as const;

const STEP_LABELS = [
  { num: 1, title: "코인 & 타임프레임", desc: "종목과 봉 주기 선택" },
  { num: 2, title: "진입 조건", desc: "지표 기반 매매 조건 설정" },
  { num: 3, title: "액션", desc: "주문 유형과 수량 설정" },
  { num: 4, title: "안전 장치", desc: "손절/익절/최대 포지션" },
  { num: 5, title: "검토 & 저장", desc: "JSON 미리보기 및 저장" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConditionRow {
  id: string;
  indicator: string;
  params: Record<string, string>;
  output_key: string;
  operator: string;
  value: string;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function createEmptyCondition(): ConditionRow {
  return {
    id: generateId(),
    indicator: "",
    params: {},
    output_key: "",
    operator: "greater_than",
    value: "",
  };
}

function normalizePercentInput(value: string): string {
  return value.replace(/[^0-9.]/g, "");
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewStrategyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = Boolean(editId);

  // Step state
  const [step, setStep] = useState(1);

  // Step 1: Coin & Timeframe
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pair, setPair] = useState("KRW-BTC");
  const [timeframe, setTimeframe] = useState("1h");
  const [isPublic, setIsPublic] = useState(false);

  // Step 2: Conditions
  const [indicators, setIndicators] = useState<IndicatorDef[]>([]);
  const [indicatorsLoading, setIndicatorsLoading] = useState(true);
  const [conditions, setConditions] = useState<ConditionRow[]>([
    createEmptyCondition(),
  ]);
  const [conditionsLogic, setConditionsLogic] = useState<"AND" | "OR">("AND");

  // Step 3: Action
  const [actionType, setActionType] = useState<StrategyAction["type"]>("market_buy");
  const [amountType, setAmountType] = useState<StrategyAction["amount_type"]>("percent");
  const [amount, setAmount] = useState("10");

  // Step 4: Safety
  const [stopLoss, setStopLoss] = useState("5");
  const [takeProfit, setTakeProfit] = useState("10");
  const [maxPosition, setMaxPosition] = useState("50");

  // Submission
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Load indicators
  useEffect(() => {
    api
      .getIndicators()
      .then(setIndicators)
      .catch(() => setIndicators([]))
      .finally(() => setIndicatorsLoading(false));
  }, []);

  useEffect(() => {
    if (!editId) return;

    const fillFormFromStrategy = (strategy: Strategy) => {
      setName(strategy.name || "");
      setDescription(strategy.description || "");
      setPair(strategy.pair || "KRW-BTC");
      setTimeframe(strategy.timeframe || "1h");
      setIsPublic(Boolean(strategy.is_public));

      const config = strategy.config_json;
      const mappedConditions =
        (config.conditions || []).length > 0
          ? config.conditions.map((c) => {
              const params: Record<string, string> = {};
              for (const [k, v] of Object.entries(c.params || {})) {
                params[k] = String(v);
              }
              return {
                id: generateId(),
                indicator: c.indicator || "",
                params,
                output_key: c.output_key || "",
                operator: c.operator || "greater_than",
                value: typeof c.value === "number" ? String(c.value) : "0",
              };
            })
          : [createEmptyCondition()];

      setConditions(mappedConditions);
      setConditionsLogic(config.conditions_logic === "OR" ? "OR" : "AND");

      setActionType(config.action?.type || "market_buy");
      setAmountType(config.action?.amount_type || "percent");
      setAmount(String(config.action?.amount ?? 10));

      setStopLoss(String(Math.abs(config.safety?.stop_loss ?? 5)));
      setTakeProfit(String(Math.abs(config.safety?.take_profit ?? 10)));
      setMaxPosition(String(Math.abs(config.safety?.max_position ?? 50)));
    };

    setEditLoading(true);
    api
      .getStrategy(editId)
      .then(fillFormFromStrategy)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "전략 정보를 불러오지 못했습니다.");
      })
      .finally(() => setEditLoading(false));
  }, [editId]);

  // ─── Condition helpers ──────────────────────────────────────────────

  const updateCondition = useCallback(
    (id: string, updates: Partial<ConditionRow>) => {
      setConditions((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
      );
    },
    []
  );

  const addCondition = () => {
    setConditions((prev) => [...prev, createEmptyCondition()]);
  };

  const removeCondition = (id: string) => {
    if (conditions.length <= 1) return;
    setConditions((prev) => prev.filter((c) => c.id !== id));
  };

  const handleIndicatorChange = (id: string, indicatorName: string) => {
    const def = indicators.find((i) => i.name === indicatorName);
    const defaultParams: Record<string, string> = {};
    if (def) {
      for (const p of def.params) {
        // Set sensible defaults for common params
        if (p === "period" || p === "length") defaultParams[p] = "14";
        else if (p === "fast_period") defaultParams[p] = "12";
        else if (p === "slow_period") defaultParams[p] = "26";
        else if (p === "signal_period") defaultParams[p] = "9";
        else if (p === "multiplier") defaultParams[p] = "2";
        else if (p === "std_dev") defaultParams[p] = "2";
        else if (p === "atr_period") defaultParams[p] = "14";
        else if (p === "atr_multiplier") defaultParams[p] = "1.5";
        else defaultParams[p] = "14";
      }
    }
    updateCondition(id, {
      indicator: indicatorName,
      params: defaultParams,
      output_key: "",
    });
  };

  // ─── Validation ──────────────────────────────────────────────────────

  const validateStep = (s: number): string | null => {
    switch (s) {
      case 1:
        if (!name.trim()) return "전략 이름을 입력해주세요.";
        if (!pair) return "코인을 선택해주세요.";
        if (!timeframe) return "타임프레임을 선택해주세요.";
        return null;
      case 2:
        for (let i = 0; i < conditions.length; i++) {
          const c = conditions[i];
          if (!c.indicator)
            return `조건 ${i + 1}: 지표를 선택해주세요.`;
          if (!c.operator) return `조건 ${i + 1}: 연산자를 선택해주세요.`;
          if (!c.value && c.value !== "0")
            return `조건 ${i + 1}: 비교 값을 입력해주세요.`;
        }
        return null;
      case 3:
        if (!amount || parseFloat(amount) <= 0)
          return "주문 수량(%)을 입력해주세요.";
        if (amountType === "percent" && parseFloat(amount) > 100)
          return "비율은 100%를 넘을 수 없습니다.";
        return null;
      case 4:
        if (parseFloat(stopLoss) <= 0) return "손절 비율을 입력해주세요.";
        if (parseFloat(takeProfit) <= 0) return "익절 비율을 입력해주세요.";
        if (parseFloat(maxPosition) <= 0)
          return "최대 포지션 비율을 입력해주세요.";
        return null;
      default:
        return null;
    }
  };

  const goNext = () => {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setStep((s) => Math.min(s + 1, 5));
  };

  const goBack = () => {
    setError("");
    setStep((s) => Math.max(s - 1, 1));
  };

  // ─── Build config JSON ──────────────────────────────────────────────

  const buildConfig = (): StrategyConfig => {
    const parsedConditions: StrategyCondition[] = conditions.map((c) => {
      const numParams: Record<string, number> = {};
      for (const [k, v] of Object.entries(c.params)) {
        numParams[k] = parseFloat(v) || 0;
      }
      const cond: StrategyCondition = {
        indicator: c.indicator,
        params: numParams,
        operator: c.operator,
        value: parseFloat(c.value) || 0,
      };
      if (c.output_key) cond.output_key = c.output_key;
      return cond;
    });

    const action: StrategyAction = {
      type: actionType,
      amount_type: amountType,
      amount: parseFloat(amount) || 0,
    };

    const safety: StrategySafety = {
      // Backend validator expects stop_loss as negative percent (e.g. -5).
      stop_loss: -Math.abs(parseFloat(stopLoss) || 5),
      take_profit: Math.abs(parseFloat(takeProfit) || 10),
      max_position: Math.abs(parseFloat(maxPosition) || 50),
    };

    return {
      conditions: parsedConditions,
      conditions_logic: conditionsLogic,
      action,
      safety,
    };
  };

  const buildPayload = () => ({
    name: name.trim(),
    description: description.trim(),
    pair,
    timeframe,
    is_public: isPublic,
    config_json: buildConfig(),
  });

  // ─── Submit ──────────────────────────────────────────────────────────

  const handleSave = async () => {
    // Validate all steps
    for (let s = 1; s <= 4; s++) {
      const err = validateStep(s);
      if (err) {
        setError(err);
        setStep(s);
        return;
      }
    }

    setSaving(true);
    setError("");
    try {
      const strategy = isEditMode && editId
        ? await api.updateStrategy(editId, buildPayload())
        : await api.createStrategy(buildPayload());
      router.push(`/strategies/${strategy.id}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isEditMode
            ? "전략 수정에 실패했습니다."
            : "전략 저장에 실패했습니다."
      );
    } finally {
      setSaving(false);
    }
  };

  // ─── Get indicator def ──────────────────────────────────────────────

  const getIndicatorDef = (name: string): IndicatorDef | undefined =>
    indicators.find((i) => i.name === name);

  // Group indicators by category
  const groupedIndicators = indicators.reduce(
    (acc, ind) => {
      if (!acc[ind.category]) acc[ind.category] = [];
      acc[ind.category].push(ind);
      return acc;
    },
    {} as Record<string, IndicatorDef[]>
  );

  const categoryLabels: Record<string, string> = {
    trend: "추세",
    momentum: "모멘텀",
    volatility: "변동성",
    volume: "거래량",
    price: "가격",
  };

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {isEditMode ? "전략 수정" : "새 전략 만들기"}
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          {isEditMode
            ? "기존 전략 설정을 수정하세요."
            : "노코드 빌더로 나만의 매매 전략을 조립하세요."}
        </p>
      </div>

      {editLoading && (
        <div className="flex items-center justify-center py-6 text-gray-400 text-sm">
          전략 정보를 불러오는 중...
        </div>
      )}

      {/* Step Indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {STEP_LABELS.map((s, i) => (
          <button
            key={s.num}
            onClick={() => {
              // Allow clicking on completed / current steps
              if (s.num <= step) {
                setError("");
                setStep(s.num);
              }
            }}
            className={clsx(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-xs whitespace-nowrap transition",
              step === s.num
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : s.num < step
                  ? "bg-green-600/10 text-green-400 border border-green-500/20 cursor-pointer"
                  : "bg-[#111827] text-gray-500 border border-gray-800"
            )}
          >
            <span
              className={clsx(
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                step === s.num
                  ? "bg-blue-600 text-white"
                  : s.num < step
                    ? "bg-green-600 text-white"
                    : "bg-gray-700 text-gray-400"
              )}
            >
              {s.num < step ? <Check className="w-3 h-3" /> : s.num}
            </span>
            <span className="hidden sm:inline">{s.title}</span>
            {i < STEP_LABELS.length - 1 && (
              <ChevronRight className="w-3 h-3 text-gray-600 ml-1" />
            )}
          </button>
        ))}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Step Content */}
      <div className="bg-[#1a2332] rounded-xl border border-gray-800 p-6">
        {/* ── Step 1: Coin & Timeframe ────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold mb-1">코인 & 타임프레임</h2>
              <p className="text-sm text-gray-400">
                트레이딩할 종목과 캔들 타임프레임을 선택하세요.
              </p>
            </div>

            {/* Strategy Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                전략 이름 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: RSI 과매도 반등 전략"
                className="w-full px-4 py-2.5 bg-[#111827] border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
                maxLength={50}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                설명 (선택)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="전략에 대한 간단한 설명"
                rows={2}
                className="w-full px-4 py-2.5 bg-[#111827] border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition resize-none"
                maxLength={200}
              />
            </div>

            {/* Pair Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                코인 (마켓) <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {PAIRS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPair(p)}
                    className={clsx(
                      "px-3 py-2 rounded-lg text-sm font-mono transition border",
                      pair === p
                        ? "bg-blue-600/20 border-blue-500/40 text-blue-400"
                        : "bg-[#111827] border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300"
                    )}
                  >
                    {p.replace("KRW-", "")}
                  </button>
                ))}
              </div>
            </div>

            {/* Timeframe Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                타임프레임 <span className="text-red-400">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf.value}
                    onClick={() => setTimeframe(tf.value)}
                    className={clsx(
                      "px-4 py-2 rounded-lg text-sm transition border",
                      timeframe === tf.value
                        ? "bg-purple-600/20 border-purple-500/40 text-purple-400"
                        : "bg-[#111827] border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300"
                    )}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Visibility */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsPublic(!isPublic)}
                className={clsx(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition",
                  isPublic ? "bg-blue-600" : "bg-gray-700"
                )}
              >
                <span
                  className={clsx(
                    "inline-block h-4 w-4 rounded-full bg-white transition-transform",
                    isPublic ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
              <span className="text-sm text-gray-300">
                커뮤니티에 공개
              </span>
            </div>
          </div>
        )}

        {/* ── Step 2: Conditions ──────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold mb-1">진입 조건 설정</h2>
              <p className="text-sm text-gray-400">
                지표와 조건을 조합하여 매매 신호를 정의하세요.
              </p>
            </div>

            {indicatorsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-500">지표 목록 로딩 중...</div>
              </div>
            ) : (
              <>
                {/* Logic Selector */}
                {conditions.length > 1 && (
                  <div className="flex items-center gap-3 p-3 bg-[#111827] rounded-lg border border-gray-800">
                    <Info className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-400">
                      조건 결합 방식:
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setConditionsLogic("AND")}
                        className={clsx(
                          "px-3 py-1 rounded text-xs font-bold transition",
                          conditionsLogic === "AND"
                            ? "bg-blue-600 text-white"
                            : "bg-gray-700 text-gray-400 hover:text-gray-300"
                        )}
                      >
                        AND (모두 충족)
                      </button>
                      <button
                        onClick={() => setConditionsLogic("OR")}
                        className={clsx(
                          "px-3 py-1 rounded text-xs font-bold transition",
                          conditionsLogic === "OR"
                            ? "bg-blue-600 text-white"
                            : "bg-gray-700 text-gray-400 hover:text-gray-300"
                        )}
                      >
                        OR (하나만 충족)
                      </button>
                    </div>
                  </div>
                )}

                {/* Condition Rows */}
                <div className="space-y-4">
                  {conditions.map((cond, idx) => {
                    const def = getIndicatorDef(cond.indicator);

                    return (
                      <div key={cond.id} className="space-y-3">
                        {/* Logic divider between conditions */}
                        {idx > 0 && (
                          <div className="flex items-center gap-3">
                            <div className="flex-1 border-t border-gray-700" />
                            <span
                              className={clsx(
                                "text-xs font-bold px-2 py-0.5 rounded",
                                conditionsLogic === "AND"
                                  ? "bg-blue-600/20 text-blue-400"
                                  : "bg-orange-600/20 text-orange-400"
                              )}
                            >
                              {conditionsLogic}
                            </span>
                            <div className="flex-1 border-t border-gray-700" />
                          </div>
                        )}

                        <div className="p-4 bg-[#111827] rounded-lg border border-gray-800">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold text-gray-400">
                              조건 {idx + 1}
                            </span>
                            {conditions.length > 1 && (
                              <button
                                onClick={() => removeCondition(cond.id)}
                                className="text-gray-500 hover:text-red-400 transition"
                                title="조건 삭제"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {/* Row 1: Indicator selection */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                            <div>
                              <label className="block text-[11px] text-gray-500 mb-1">
                                지표 (Indicator)
                              </label>
                              <select
                                value={cond.indicator}
                                onChange={(e) =>
                                  handleIndicatorChange(cond.id, e.target.value)
                                }
                                className="w-full px-3 py-2 bg-[#0a0e17] border border-gray-700 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition"
                              >
                                <option value="">지표 선택...</option>
                                {Object.entries(groupedIndicators).map(
                                  ([cat, inds]) => (
                                    <optgroup
                                      key={cat}
                                      label={
                                        categoryLabels[cat] || cat
                                      }
                                    >
                                      {inds.map((ind) => (
                                        <option
                                          key={ind.name}
                                          value={ind.name}
                                        >
                                          {ind.name.toUpperCase()}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )
                                )}
                              </select>
                            </div>

                            {/* Output key for multi-output indicators */}
                            {def?.multi_output && (
                              <div>
                                <label className="block text-[11px] text-gray-500 mb-1">
                                  출력 키 (Output Key)
                                </label>
                                <input
                                  type="text"
                                  value={cond.output_key}
                                  onChange={(e) =>
                                    updateCondition(cond.id, {
                                      output_key: e.target.value,
                                    })
                                  }
                                  placeholder="예: upper, middle, lower"
                                  className="w-full px-3 py-2 bg-[#0a0e17] border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
                                />
                              </div>
                            )}
                          </div>

                          {/* Row 2: Params */}
                          {def && def.params.length > 0 && (
                            <div className="mb-3">
                              <label className="block text-[11px] text-gray-500 mb-1">
                                파라미터
                              </label>
                              <div className="flex flex-wrap gap-2">
                                {def.params.map((p) => (
                                  <div key={p} className="flex items-center gap-1.5">
                                    <span className="text-xs text-gray-400 font-mono">
                                      {p}:
                                    </span>
                                    <input
                                      type="number"
                                      value={cond.params[p] || ""}
                                      onChange={(e) =>
                                        updateCondition(cond.id, {
                                          params: {
                                            ...cond.params,
                                            [p]: e.target.value,
                                          },
                                        })
                                      }
                                      className="w-20 px-2 py-1.5 bg-[#0a0e17] border border-gray-700 rounded text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition text-center"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Row 3: Operator + Value */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] text-gray-500 mb-1">
                                연산자
                              </label>
                              <select
                                value={cond.operator}
                                onChange={(e) =>
                                  updateCondition(cond.id, {
                                    operator: e.target.value,
                                  })
                                }
                                className="w-full px-3 py-2 bg-[#0a0e17] border border-gray-700 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition"
                              >
                                {OPERATORS.map((op) => (
                                  <option key={op.value} value={op.value}>
                                    {op.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] text-gray-500 mb-1">
                                비교 값
                              </label>
                              <input
                                type="number"
                                value={cond.value}
                                onChange={(e) =>
                                  updateCondition(cond.id, {
                                    value: e.target.value,
                                  })
                                }
                                placeholder="예: 30, 70, 0.5"
                                className="w-full px-3 py-2 bg-[#0a0e17] border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add Condition */}
                <button
                  onClick={addCondition}
                  className="flex items-center gap-2 px-4 py-2.5 w-full justify-center border border-dashed border-gray-700 rounded-lg text-sm text-gray-400 hover:text-blue-400 hover:border-blue-500/30 transition"
                >
                  <Plus className="w-4 h-4" />
                  조건 추가
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Step 3: Action ──────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold mb-1">액션 설정</h2>
              <p className="text-sm text-gray-400">
                조건 충족 시 실행할 주문 유형과 수량을 설정하세요.
              </p>
            </div>

            {/* Action Type */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                주문 유형
              </label>
              <div className="grid grid-cols-2 gap-2">
                {ACTION_TYPES.map((at) => (
                  <button
                    key={at.value}
                    onClick={() => setActionType(at.value)}
                    className={clsx(
                      "px-4 py-3 rounded-lg text-sm font-medium transition border",
                      actionType === at.value
                        ? at.value.includes("buy")
                          ? "bg-green-600/15 border-green-500/30 text-green-400"
                          : "bg-red-600/15 border-red-500/30 text-red-400"
                        : "bg-[#111827] border-gray-700 text-gray-400 hover:border-gray-600"
                    )}
                  >
                    {at.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount Type */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                수량 기준
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setAmountType("percent")}
                  className={clsx(
                    "flex-1 px-4 py-2.5 rounded-lg text-sm transition border",
                    amountType === "percent"
                      ? "bg-blue-600/20 border-blue-500/30 text-blue-400"
                      : "bg-[#111827] border-gray-700 text-gray-400 hover:border-gray-600"
                  )}
                >
                  비율 (%)
                </button>
                <button
                  onClick={() => setAmountType("fixed")}
                  className={clsx(
                    "flex-1 px-4 py-2.5 rounded-lg text-sm transition border",
                    amountType === "fixed"
                      ? "bg-blue-600/20 border-blue-500/30 text-blue-400"
                      : "bg-[#111827] border-gray-700 text-gray-400 hover:border-gray-600"
                  )}
                >
                  고정 금액 (KRW)
                </button>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                {amountType === "percent" ? "주문 비율 (%)" : "주문 금액 (KRW)"}
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={
                    amountType === "percent" ? "예: 10" : "예: 100000"
                  }
                  min="0"
                  max={amountType === "percent" ? "100" : undefined}
                  className="w-full px-4 py-2.5 bg-[#111827] border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition pr-12"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                  {amountType === "percent" ? "%" : "KRW"}
                </span>
              </div>
              {amountType === "percent" && (
                <div className="flex gap-2 mt-2">
                  {[5, 10, 25, 50, 100].map((v) => (
                    <button
                      key={v}
                      onClick={() => setAmount(String(v))}
                      className={clsx(
                        "px-3 py-1 rounded text-xs transition",
                        amount === String(v)
                          ? "bg-blue-600 text-white"
                          : "bg-[#111827] text-gray-400 border border-gray-700 hover:border-gray-600"
                      )}
                    >
                      {v}%
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="p-4 bg-[#111827] rounded-lg border border-gray-800">
              <div className="text-xs text-gray-500 mb-2">액션 요약</div>
              <p className="text-sm text-gray-300">
                조건 충족 시{" "}
                <span className="text-blue-400 font-medium">
                  {ACTION_TYPES.find((a) => a.value === actionType)?.label}
                </span>
                ,{" "}
                <span className="text-blue-400 font-medium">
                  {amountType === "percent"
                    ? `잔고의 ${amount}%`
                    : `${Number(amount).toLocaleString()} KRW`}
                </span>{" "}
                만큼 주문 실행
              </p>
            </div>
          </div>
        )}

        {/* ── Step 4: Safety ──────────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold mb-1">안전 장치 설정</h2>
              <p className="text-sm text-gray-400">
                리스크 관리를 위한 손절/익절/최대 포지션을 설정하세요.
              </p>
            </div>

            {/* Stop Loss */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                손절 (Stop Loss) %
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(normalizePercentInput(e.target.value))}
                  min="0"
                  max="100"
                  step="0.5"
                  className="w-full px-4 py-2.5 bg-[#111827] border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500 transition pr-8"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                  %
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                진입가 대비 {Math.abs(parseFloat(stopLoss) || 0)}% 하락 시 자동 손절
              </p>
            </div>

            {/* Take Profit */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                익절 (Take Profit) %
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(normalizePercentInput(e.target.value))}
                  min="0"
                  max="1000"
                  step="0.5"
                  className="w-full px-4 py-2.5 bg-[#111827] border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500 transition pr-8"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                  %
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                진입가 대비 {Math.abs(parseFloat(takeProfit) || 0)}% 상승 시 자동 익절
              </p>
            </div>

            {/* Max Position */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                최대 포지션 (Max Position) %
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={maxPosition}
                  onChange={(e) => setMaxPosition(normalizePercentInput(e.target.value))}
                  min="0"
                  max="100"
                  step="5"
                  className="w-full px-4 py-2.5 bg-[#111827] border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500 transition pr-8"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                  %
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                전체 자산의 최대 {Math.abs(parseFloat(maxPosition) || 0)}% 까지만 포지션 보유
              </p>
            </div>

            {/* Visual Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-red-500/10 rounded-lg text-center border border-red-500/20">
                <div className="text-[10px] text-gray-500 mb-1">손절</div>
                <div className="text-lg font-bold text-red-400">
                  -{Math.abs(parseFloat(stopLoss) || 0)}%
                </div>
              </div>
              <div className="p-3 bg-green-500/10 rounded-lg text-center border border-green-500/20">
                <div className="text-[10px] text-gray-500 mb-1">익절</div>
                <div className="text-lg font-bold text-green-400">
                  +{Math.abs(parseFloat(takeProfit) || 0)}%
                </div>
              </div>
              <div className="p-3 bg-blue-500/10 rounded-lg text-center border border-blue-500/20">
                <div className="text-[10px] text-gray-500 mb-1">
                  최대 포지션
                </div>
                <div className="text-lg font-bold text-blue-400">
                  {Math.abs(parseFloat(maxPosition) || 0)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 5: Review & Save ───────────────────────────────────── */}
        {step === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold mb-1">검토 & 저장</h2>
              <p className="text-sm text-gray-400">
                설정한 전략을 검토하고 저장하세요.
              </p>
            </div>

            {/* Strategy Summary */}
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="p-4 bg-[#111827] rounded-lg border border-gray-800">
                <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">
                  기본 정보
                </h3>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <span className="text-gray-500">이름</span>
                  <span className="text-gray-100">{name}</span>
                  <span className="text-gray-500">종목</span>
                  <span className="text-gray-100 font-mono">{pair}</span>
                  <span className="text-gray-500">타임프레임</span>
                  <span className="text-gray-100">
                    {TIMEFRAMES.find((t) => t.value === timeframe)?.label}
                  </span>
                  <span className="text-gray-500">공개 여부</span>
                  <span className="text-gray-100">
                    {isPublic ? "공개" : "비공개"}
                  </span>
                </div>
              </div>

              {/* Conditions Summary */}
              <div className="p-4 bg-[#111827] rounded-lg border border-gray-800">
                <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">
                  진입 조건 ({conditions.length}개,{" "}
                  {conditionsLogic === "AND" ? "모두 충족" : "하나만 충족"})
                </h3>
                <div className="space-y-2">
                  {conditions.map((c, idx) => {
                    const opLabel =
                      OPERATORS.find((o) => o.value === c.operator)?.label ||
                      c.operator;
                    return (
                      <div
                        key={c.id}
                        className="text-sm text-gray-300 flex items-center gap-2"
                      >
                        <span className="text-xs text-gray-500 w-5">
                          {idx + 1}.
                        </span>
                        <span className="text-blue-400 font-mono">
                          {c.indicator.toUpperCase()}
                        </span>
                        {Object.keys(c.params).length > 0 && (
                          <span className="text-gray-500 text-xs">
                            (
                            {Object.entries(c.params)
                              .map(([k, v]) => `${k}=${v}`)
                              .join(", ")}
                            )
                          </span>
                        )}
                        {c.output_key && (
                          <span className="text-purple-400 text-xs">
                            .{c.output_key}
                          </span>
                        )}
                        <span className="text-yellow-400 text-xs font-medium">
                          {opLabel}
                        </span>
                        <span className="text-green-400 font-mono">
                          {c.value}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Summary */}
              <div className="p-4 bg-[#111827] rounded-lg border border-gray-800">
                <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">
                  액션
                </h3>
                <p className="text-sm text-gray-300">
                  {ACTION_TYPES.find((a) => a.value === actionType)?.label} /{" "}
                  {amountType === "percent"
                    ? `잔고의 ${amount}%`
                    : `${Number(amount).toLocaleString()} KRW`}
                </p>
              </div>

              {/* Safety Summary */}
              <div className="p-4 bg-[#111827] rounded-lg border border-gray-800">
                <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">
                  안전 장치
                </h3>
                <div className="grid grid-cols-3 gap-3 text-sm text-center">
                  <div>
                    <div className="text-gray-500 text-xs">손절</div>
                    <div className="text-red-400 font-bold">
                      -{Math.abs(parseFloat(stopLoss) || 0)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">익절</div>
                    <div className="text-green-400 font-bold">
                      +{Math.abs(parseFloat(takeProfit) || 0)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">최대 포지션</div>
                    <div className="text-blue-400 font-bold">
                      {Math.abs(parseFloat(maxPosition) || 0)}%
                    </div>
                  </div>
                </div>
              </div>

              {/* JSON Preview */}
              <div className="p-4 bg-[#111827] rounded-lg border border-gray-800">
                <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">
                  Config JSON 미리보기
                </h3>
                <pre className="text-xs text-gray-400 overflow-x-auto max-h-64 overflow-y-auto font-mono bg-[#0a0e17] p-3 rounded-lg">
                  {JSON.stringify(buildPayload(), null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={goBack}
          disabled={step === 1}
          className={clsx(
            "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition",
            step === 1
              ? "text-gray-600 cursor-not-allowed"
              : "text-gray-400 hover:text-white bg-[#1a2332] border border-gray-800 hover:border-gray-700"
          )}
        >
          <ChevronLeft className="w-4 h-4" />
          이전
        </button>

        <div className="text-xs text-gray-500">
          {step} / {STEP_LABELS.length}
        </div>

        {step < 5 ? (
          <button
            onClick={goNext}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition"
          >
            다음
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-green-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition"
          >
            <Save className="w-4 h-4" />
            {saving ? "저장 중..." : isEditMode ? "전략 수정" : "전략 저장"}
          </button>
        )}
      </div>
    </div>
  );
}

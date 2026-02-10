"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Strategy } from "@/types";

const CATEGORIES = [
  { key: "strategy", label: "전략공유", desc: "자신의 전략을 공유합니다" },
  { key: "profit", label: "수익인증", desc: "실제 수익 결과를 인증합니다" },
  { key: "question", label: "질문/답변", desc: "궁금한 점을 질문합니다" },
  { key: "free", label: "자유", desc: "자유롭게 이야기합니다" },
];

const CATEGORY_STYLE: Record<string, string> = {
  strategy: "border-blue-500/50 bg-blue-500/10 text-blue-400",
  profit: "border-green-500/50 bg-green-500/10 text-green-400",
  question: "border-yellow-500/50 bg-yellow-500/10 text-yellow-400",
  free: "border-gray-500/50 bg-gray-500/10 text-gray-400",
};

export default function NewPostPage() {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [strategyId, setStrategyId] = useState("");
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    api.getStrategies().then(setStrategies).catch(console.error);
  }, []);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!category) newErrors.category = "카테고리를 선택해주세요.";
    if (!title.trim()) newErrors.title = "제목을 입력해주세요.";
    else if (title.trim().length < 2) newErrors.title = "제목은 2자 이상 입력해주세요.";
    if (!content.trim()) newErrors.content = "내용을 입력해주세요.";
    else if (content.trim().length < 10) newErrors.content = "내용은 10자 이상 입력해주세요.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const post = await api.createPost({
        category,
        title: title.trim(),
        content: content.trim(),
        strategy_id: strategyId || undefined,
      });
      router.push(`/community/${post.id}`);
    } catch (err) {
      console.error("Failed to create post:", err);
      alert("게시글 작성에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCategory = CATEGORIES.find((c) => c.key === category);
  const selectedStrategy = strategies.find((s) => s.id === strategyId);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/community" className="text-gray-400 hover:text-white transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold">새 글 작성</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-3 py-1.5 text-sm border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 rounded-lg transition"
          >
            {showPreview ? "편집" : "미리보기"}
          </button>
        </div>
      </div>

      {showPreview ? (
        /* Preview */
        <div className="bg-[#1a2332] border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-200 mb-1">미리보기</h2>
          <div className="border-b border-gray-800 pb-4">
            {selectedCategory && (
              <span className={`text-xs px-2 py-0.5 rounded ${CATEGORY_STYLE[category] || ""} mr-2`}>
                {selectedCategory.label}
              </span>
            )}
            <h3 className="text-xl font-bold text-gray-100 mt-2">{title || "(제목 없음)"}</h3>
          </div>
          <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap min-h-[100px]">
            {content || "(내용 없음)"}
          </div>
          {selectedStrategy && (
            <div className="p-4 bg-[#111827] border border-gray-700 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-200">첨부된 전략</div>
                  <div className="text-xs text-gray-400">{selectedStrategy.name} ({selectedStrategy.pair} / {selectedStrategy.timeframe})</div>
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-4 border-t border-gray-800">
            <button
              onClick={() => setShowPreview(false)}
              className="px-4 py-2 text-sm border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 rounded-lg transition"
            >
              편집으로 돌아가기
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {submitting ? "등록 중..." : "게시하기"}
            </button>
          </div>
        </div>
      ) : (
        /* Edit form */
        <div className="space-y-6">
          {/* Category selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">카테고리 *</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => {
                    setCategory(cat.key);
                    setErrors((prev) => ({ ...prev, category: "" }));
                  }}
                  className={`p-3 rounded-lg border text-left transition ${
                    category === cat.key
                      ? CATEGORY_STYLE[cat.key]
                      : "border-gray-800 bg-[#1a2332] text-gray-400 hover:border-gray-700"
                  }`}
                >
                  <div className="text-sm font-medium">{cat.label}</div>
                  <div className="text-xs mt-0.5 opacity-70">{cat.desc}</div>
                </button>
              ))}
            </div>
            {errors.category && <p className="text-xs text-red-400">{errors.category}</p>}
          </div>

          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">제목 *</label>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setErrors((prev) => ({ ...prev, title: "" }));
              }}
              placeholder="제목을 입력하세요"
              maxLength={100}
              className="w-full px-4 py-3 bg-[#1a2332] border border-gray-800 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
            />
            <div className="flex items-center justify-between">
              {errors.title && <p className="text-xs text-red-400">{errors.title}</p>}
              <p className="text-xs text-gray-500 ml-auto">{title.length}/100</p>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">내용 *</label>
            <textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setErrors((prev) => ({ ...prev, content: "" }));
              }}
              placeholder="내용을 입력하세요..."
              rows={12}
              className="w-full px-4 py-3 bg-[#1a2332] border border-gray-800 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition resize-none"
            />
            {errors.content && <p className="text-xs text-red-400">{errors.content}</p>}
          </div>

          {/* Strategy attachment */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">전략 첨부 (선택)</label>
            <select
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
              className="w-full px-4 py-3 bg-[#1a2332] border border-gray-800 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500 transition appearance-none"
            >
              <option value="">전략을 선택하지 않음</option>
              {strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.name} ({strategy.pair} / {strategy.timeframe})
                </option>
              ))}
            </select>
            {strategies.length === 0 && (
              <p className="text-xs text-gray-500">
                등록된 전략이 없습니다.{" "}
                <Link href="/strategies/new" className="text-blue-400 hover:underline">
                  전략 만들기
                </Link>
              </p>
            )}
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-800">
            <Link
              href="/community"
              className="px-4 py-2 text-sm border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 rounded-lg transition"
            >
              취소
            </Link>
            <button
              onClick={() => {
                if (validate()) setShowPreview(true);
              }}
              className="px-4 py-2 text-sm border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 rounded-lg transition"
            >
              미리보기
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {submitting ? "등록 중..." : "게시하기"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { Strategy } from "@/types";

const CATEGORIES = [
  { key: "strategy", label: "전략공유", desc: "자신의 전략을 공유합니다" },
  { key: "profit", label: "수익인증", desc: "실제 수익 결과를 인증합니다" },
  { key: "chart", label: "차트분석", desc: "차트 분석과 시황을 공유합니다" },
  { key: "news", label: "뉴스/정보", desc: "코인 뉴스와 정보를 공유합니다" },
  { key: "question", label: "질문/답변", desc: "궁금한 점을 질문합니다" },
  { key: "humor", label: "유머", desc: "재미있는 이야기를 공유합니다" },
  { key: "free", label: "자유", desc: "자유롭게 이야기합니다" },
];

const CATEGORY_STYLE: Record<string, string> = {
  strategy: "border-blue-500/50 bg-blue-500/10 text-blue-500",
  profit: "border-green-500/50 bg-green-500/10 text-green-400",
  chart: "border-violet-500/50 bg-violet-500/10 text-violet-400",
  news: "border-cyan-500/50 bg-cyan-500/10 text-cyan-400",
  question: "border-yellow-500/50 bg-yellow-500/10 text-yellow-400",
  humor: "border-pink-500/50 bg-pink-500/10 text-pink-400",
  free: "border-gray-500/50 bg-slate-500/10 text-slate-400",
};

function renderContent(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <img key={key++} src={match[2]} alt={match[1] || "이미지"} className="max-w-full rounded-lg my-2" loading="lazy" />
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export default function NewPostPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [strategyId, setStrategyId] = useState("");
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);

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
      toast("게시글 작성에 실패했습니다. 다시 시도해주세요.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) {
          toast(`${file.name}: 5MB 이하만 업로드 가능합니다.`, "error");
          continue;
        }
        const result = await api.uploadImage(file);
        setImageUrls((prev) => [...prev, result.url]);
        setContent((prev) => prev + (prev ? "\n" : "") + `![이미지](${result.url})`);
      }
    } catch (err) {
      console.error("Failed to upload:", err);
      toast("이미지 업로드에 실패했습니다.", "error");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length === 0) return;
    e.preventDefault();
    setUploading(true);
    try {
      for (const file of imageFiles) {
        if (file.size > 5 * 1024 * 1024) {
          toast("5MB 이하만 업로드 가능합니다.", "error");
          continue;
        }
        const result = await api.uploadImage(file);
        setImageUrls((prev) => [...prev, result.url]);
        setContent((prev) => prev + (prev ? "\n" : "") + `![이미지](${result.url})`);
      }
    } catch (err) {
      console.error("Failed to upload:", err);
      toast("이미지 업로드에 실패했습니다.", "error");
    } finally {
      setUploading(false);
    }
  };

  const selectedCategory = CATEGORIES.find((c) => c.key === category);
  const selectedStrategy = strategies.find((s) => s.id === strategyId);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/community" className="text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold">새 글 작성</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:border-gray-600 rounded-lg transition"
          >
            {showPreview ? "편집" : "미리보기"}
          </button>
        </div>
      </div>

      {showPreview ? (
        /* Preview */
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-4 sm:p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-1">미리보기</h2>
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
            {selectedCategory && (
              <span className={`text-xs px-2 py-0.5 rounded ${CATEGORY_STYLE[category] || ""} mr-2`}>
                {selectedCategory.label}
              </span>
            )}
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-2">{title || "(제목 없음)"}</h3>
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap min-h-[100px]">
            {content ? renderContent(content) : "(내용 없음)"}
          </div>
          {selectedStrategy && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-200">첨부된 전략</div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">{selectedStrategy.name} ({selectedStrategy.pair} / {selectedStrategy.timeframe})</div>
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setShowPreview(false)}
              className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:border-gray-600 rounded-lg transition"
            >
              편집으로 돌아가기
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 sm:px-6 py-1.5 sm:py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs sm:text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
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
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">카테고리 *</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => {
                    setCategory(cat.key);
                    setErrors((prev) => ({ ...prev, category: "" }));
                  }}
                  className={`p-2 sm:p-3 rounded-lg border text-left transition ${
                    category === cat.key
                      ? CATEGORY_STYLE[cat.key]
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm"
                  }`}
                >
                  <div className="text-xs sm:text-sm font-medium">{cat.label}</div>
                  <div className="text-[10px] sm:text-xs mt-0.5 opacity-70">{cat.desc}</div>
                </button>
              ))}
            </div>
            {errors.category && <p className="text-xs text-red-400">{errors.category}</p>}
          </div>

          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">제목 *</label>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setErrors((prev) => ({ ...prev, title: "" }));
              }}
              placeholder="제목을 입력하세요"
              maxLength={100}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm sm:text-base text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
            />
            <div className="flex items-center justify-between">
              {errors.title && <p className="text-xs text-red-400">{errors.title}</p>}
              <p className="text-xs text-slate-500 dark:text-slate-400 ml-auto">{title.length}/100</p>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">내용 *</label>
              <label className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:border-gray-600 transition cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {uploading ? "업로드 중..." : "이미지 첨부"}
                <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
              </label>
            </div>
            <textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setErrors((prev) => ({ ...prev, content: "" }));
              }}
              onPaste={handlePaste}
              placeholder="내용을 입력하세요... (이미지 붙여넣기 가능, @닉네임으로 멘션 가능)"
              rows={12}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm sm:text-base text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition resize-none"
            />
            {imageUrls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {imageUrls.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
                    <button
                      onClick={() => {
                        setImageUrls((prev) => prev.filter((_, j) => j !== i));
                        setContent((prev) => prev.replace(`![이미지](${url})`, "").trim());
                      }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
            {errors.content && <p className="text-xs text-red-400">{errors.content}</p>}
          </div>

          {/* Strategy attachment */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">전략 첨부 (선택)</label>
            <select
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm sm:text-base text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500 transition appearance-none"
            >
              <option value="">전략을 선택하지 않음</option>
              {strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.name} ({strategy.pair} / {strategy.timeframe})
                </option>
              ))}
            </select>
            {strategies.length === 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                등록된 전략이 없습니다.{" "}
                <Link href="/strategies/new" className="text-blue-500 hover:underline">
                  전략 만들기
                </Link>
              </p>
            )}
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-2 sm:gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Link
              href="/community"
              className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:border-gray-600 rounded-lg transition"
            >
              취소
            </Link>
            <button
              onClick={() => {
                if (validate()) setShowPreview(true);
              }}
              className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:border-gray-600 rounded-lg transition"
            >
              미리보기
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 sm:px-6 py-1.5 sm:py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs sm:text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {submitting ? "등록 중..." : "게시하기"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";
import type { Strategy, CommunityBoard } from "@/types";

// ─── Markdown Rendering ────────────────────────────────────────────
function renderMarkdown(text: string): string {
  let html = text;
  html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-bold text-slate-800 dark:text-slate-100 mt-4 mb-2">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 mt-4 mb-2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-slate-800 dark:text-slate-100 mt-4 mb-2">$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em class="italic">$1</em>');
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 overflow-x-auto text-xs my-2"><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs text-pink-500 dark:text-pink-400">$1</code>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-4 border-blue-500/30 pl-4 py-1 my-2 text-slate-500 dark:text-slate-400 italic">$1</blockquote>');
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-full rounded-lg my-2" loading="lazy" />');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">$1</a>');
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$1</li>');
  html = html.replace(/^---$/gm, '<hr class="border-slate-200 dark:border-slate-700 my-4" />');
  html = html.replace(/\n\n/g, '<br/><br/>');
  html = html.replace(/\n/g, '<br/>');
  return html;
}

interface ToolbarAction {
  icon: string;
  label: string;
  prefix: string;
  suffix: string;
  block?: boolean;
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { icon: "B", label: "굵게", prefix: "**", suffix: "**" },
  { icon: "I", label: "기울임", prefix: "*", suffix: "*" },
  { icon: "H", label: "제목", prefix: "## ", suffix: "", block: true },
  { icon: "</>", label: "코드", prefix: "`", suffix: "`" },
  { icon: "link", label: "링크", prefix: "[", suffix: "](url)" },
  { icon: "img", label: "이미지", prefix: "![이미지](", suffix: ")" },
  { icon: ">", label: "인용", prefix: "> ", suffix: "", block: true },
  { icon: "list", label: "목록", prefix: "- ", suffix: "", block: true },
];

function NewPostForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const boardSlug = searchParams.get("board");
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [board, setBoard] = useState<CommunityBoard | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [strategyId, setStrategyId] = useState("");
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [contentFormat, setContentFormat] = useState<"plain" | "markdown">("plain");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  useEffect(() => {
    if (!boardSlug) {
      router.replace("/community");
      return;
    }
    api.getCommunity(boardSlug)
      .then(setBoard)
      .catch(() => router.replace("/community"))
      .finally(() => setBoardLoading(false));
    api.getStrategies().then(setStrategies).catch(console.error);
  }, [boardSlug, router]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = "제목을 입력해주세요.";
    else if (title.trim().length < 2) newErrors.title = "제목은 2자 이상 입력해주세요.";
    if (!content.trim()) newErrors.content = "내용을 입력해주세요.";
    else if (content.trim().length < 10) newErrors.content = "내용은 10자 이상 입력해주세요.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !board) return;
    setSubmitting(true);
    try {
      const post = await api.createPost({
        category: "free",
        title: title.trim(),
        content: content.trim(),
        strategy_id: strategyId || undefined,
        sub_community_id: board.id,
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

  const insertToolbar = useCallback((action: ToolbarAction) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.slice(start, end);
    const before = content.slice(0, start);
    const after = content.slice(end);
    let newContent: string;
    let newCursorPos: number;
    if (action.block) {
      const lineStart = before.lastIndexOf("\n") + 1;
      const linePrefix = before.slice(lineStart);
      newContent = before.slice(0, lineStart) + action.prefix + linePrefix + selectedText + action.suffix + after;
      newCursorPos = lineStart + action.prefix.length + linePrefix.length + selectedText.length + action.suffix.length;
    } else {
      newContent = before + action.prefix + (selectedText || "텍스트") + action.suffix + after;
      newCursorPos = start + action.prefix.length + (selectedText || "텍스트").length + action.suffix.length;
    }
    setContent(newContent);
    requestAnimationFrame(() => {
      textarea.focus();
      if (!selectedText && !action.block) {
        textarea.setSelectionRange(start + action.prefix.length, start + action.prefix.length + "텍스트".length);
      } else {
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  }, [content]);

  if (boardLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-slate-500 dark:text-slate-400">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={boardSlug ? `/community/boards/${boardSlug}` : "/community"}
          className="text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold">새 글 작성</h1>
          {board && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{board.name}</p>
          )}
        </div>
      </div>

      <div className="space-y-6">
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
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                <button
                  onClick={() => setContentFormat("plain")}
                  className={`px-2.5 py-1 text-xs rounded-md transition ${
                    contentFormat === "plain"
                      ? "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm"
                      : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                  }`}
                >
                  일반
                </button>
                <button
                  onClick={() => setContentFormat("markdown")}
                  className={`px-2.5 py-1 text-xs rounded-md transition ${
                    contentFormat === "markdown"
                      ? "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm"
                      : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                  }`}
                >
                  마크다운
                </button>
              </div>
              <label className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:border-gray-600 transition cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {uploading ? "업로드 중..." : "이미지 첨부"}
                <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
              </label>
            </div>
          </div>

          {contentFormat === "markdown" && (
            <div className="flex items-center gap-1 flex-wrap bg-slate-50 dark:bg-slate-800 rounded-lg p-1.5 border border-slate-200/60 dark:border-slate-700/60">
              {TOOLBAR_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => insertToolbar(action)}
                  title={action.label}
                  className="px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-white dark:hover:bg-slate-700 rounded transition"
                >
                  {action.icon === "link" ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  ) : action.icon === "img" ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  ) : action.icon === "list" ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  ) : (
                    <span className={action.icon === "B" ? "font-bold" : action.icon === "I" ? "italic" : ""}>{action.icon}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {contentFormat === "markdown" && (
            <div className="flex items-center gap-2 border-b border-slate-200/60 dark:border-slate-700/60">
              <button
                onClick={() => setActiveTab("edit")}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 transition -mb-px ${activeTab === "edit" ? "border-blue-500 text-blue-500" : "border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"}`}
              >
                편집
              </button>
              <button
                onClick={() => setActiveTab("preview")}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 transition -mb-px ${activeTab === "preview" ? "border-blue-500 text-blue-500" : "border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"}`}
              >
                미리보기
              </button>
            </div>
          )}

          {(contentFormat === "plain" || activeTab === "edit") ? (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setErrors((prev) => ({ ...prev, content: "" }));
              }}
              onPaste={handlePaste}
              placeholder={contentFormat === "markdown" ? "마크다운으로 작성하세요... (**굵게**, *기울임*, # 제목, > 인용)" : "내용을 입력하세요... (이미지 붙여넣기 가능, @닉네임으로 멘션 가능)"}
              rows={12}
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm sm:text-base text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition resize-none font-mono"
            />
          ) : (
            <div className="min-h-[280px] px-3 sm:px-4 py-2.5 sm:py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {content ? (
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
              ) : (
                <span className="text-slate-400 dark:text-slate-600">(내용 없음)</span>
              )}
            </div>
          )}

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
              <Link href="/strategies/new" className="text-blue-500 hover:underline">전략 만들기</Link>
            </p>
          )}
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-2 sm:gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <Link
            href={boardSlug ? `/community/boards/${boardSlug}` : "/community"}
            className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:border-gray-600 rounded-lg transition"
          >
            취소
          </Link>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 sm:px-6 py-1.5 sm:py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs sm:text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {submitting ? "등록 중..." : "게시하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NewPostPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-48"><div className="text-slate-500 dark:text-slate-400">로딩 중...</div></div>}>
      <NewPostForm />
    </Suspense>
  );
}

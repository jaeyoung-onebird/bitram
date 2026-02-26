"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { useToast } from "@/components/Toast";
import ReactionPicker from "@/components/ReactionPicker";
import ShareButtons from "@/components/ShareButtons";
import type { Post, Comment, ReactionCount } from "@/types";

const CATEGORY_LABEL: Record<string, string> = {
  strategy: "전략공유",
  profit: "수익인증",
  chart: "차트분석",
  news: "뉴스/정보",
  question: "질문/답변",
  humor: "유머",
  free: "자유",
};

const CATEGORY_BADGE_CLASS: Record<string, string> = {
  strategy: "bg-blue-500/10 text-blue-500",
  profit: "bg-emerald-500/10 text-emerald-600",
  chart: "bg-violet-500/10 text-violet-600",
  news: "bg-cyan-500/10 text-cyan-600",
  question: "bg-amber-500/10 text-amber-600",
  humor: "bg-pink-500/10 text-pink-600",
  free: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
};


function PostDetailSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-pulse">
      <div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-6 space-y-4">
        <div className="h-3 w-14 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="h-7 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="flex items-center gap-3 py-4 border-y border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
          <div className="space-y-1.5">
            <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-2.5 w-32 rounded bg-slate-200 dark:bg-slate-700" />
          </div>
        </div>
        <div className="space-y-2.5 pt-1">
          {[100, 100, 85, 100, 70].map((w, i) => (
            <div key={i} className={`h-3 rounded bg-slate-200 dark:bg-slate-700`} style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-6 space-y-6">
        <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-24 w-full rounded-lg bg-slate-200 dark:bg-slate-700" />
        {[1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderMarkdown(raw: string): React.ReactNode {
  // ── Inline formatter ─────────────────────────────────────────────────────
  function inlineFmt(str: string, baseKey: string): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    const re = /!\[([^\]]*)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
    let last = 0; let k = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(str)) !== null) {
      if (m.index > last) out.push(str.slice(last, m.index));
      if (m[0].startsWith("![")) {
        out.push(<img key={`${baseKey}-${k++}`} src={m[2]} alt={m[1]} className="max-w-full rounded-lg my-2 block" loading="lazy" />);
      } else if (m[0].startsWith("**")) {
        out.push(<strong key={`${baseKey}-${k++}`} className="font-bold">{m[3]}</strong>);
      } else if (m[0].startsWith("*")) {
        out.push(<em key={`${baseKey}-${k++}`} className="italic">{m[4]}</em>);
      } else if (m[0].startsWith("`")) {
        out.push(<code key={`${baseKey}-${k++}`} className="font-mono text-[0.82em] bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">{m[5]}</code>);
      } else {
        out.push(<a key={`${baseKey}-${k++}`} href={m[7]} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{m[6]}</a>);
      }
      last = re.lastIndex;
    }
    if (last < str.length) out.push(str.slice(last));
    return out;
  }

  // ── Block renderer ────────────────────────────────────────────────────────
  const lines = (raw || "").split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0; let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Heading
    const hm = line.match(/^(#{1,3})\s+(.*)/);
    if (hm) {
      const lvl = hm[1].length;
      const cls = lvl === 1 ? "text-2xl font-bold mt-6 mb-3 text-slate-900 dark:text-slate-50"
                : lvl === 2 ? "text-xl font-bold mt-5 mb-2 text-slate-800 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-1"
                :              "text-lg font-semibold mt-4 mb-1.5 text-slate-800 dark:text-slate-100";
      const Tag = `h${lvl}` as "h1"|"h2"|"h3";
      nodes.push(<Tag key={key++} className={cls}>{inlineFmt(hm[2], `h${key}`)}</Tag>);
      i++; continue;
    }

    // Code block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
      nodes.push(
        <pre key={key++} className="bg-slate-900 dark:bg-black rounded-xl p-4 overflow-x-auto my-3 text-emerald-300 text-sm font-mono leading-relaxed">
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      i++; continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const ql: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) { ql.push(lines[i].slice(2)); i++; }
      nodes.push(
        <blockquote key={key++} className="border-l-4 border-blue-400 dark:border-blue-500 pl-4 py-1 my-3 bg-blue-50/60 dark:bg-blue-500/5 rounded-r-lg italic text-slate-500 dark:text-slate-400">
          {ql.map((q, qi) => <p key={qi}>{inlineFmt(q, `bq${key}-${qi}`)}</p>)}
        </blockquote>
      );
      continue;
    }

    // HR
    if (/^-{3,}$/.test(line.trim())) {
      nodes.push(<hr key={key++} className="border-slate-200 dark:border-slate-700 my-4" />);
      i++; continue;
    }

    // Unordered list
    if (/^[-*+] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+] /.test(lines[i])) { items.push(lines[i].replace(/^[-*+] /, "")); i++; }
      nodes.push(
        <ul key={key++} className="list-disc pl-5 my-2 space-y-1 text-slate-600 dark:text-slate-300">
          {items.map((it, ii) => <li key={ii}>{inlineFmt(it, `ul${key}-${ii}`)}</li>)}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\d+\. /, "")); i++; }
      nodes.push(
        <ol key={key++} className="list-decimal pl-5 my-2 space-y-1 text-slate-600 dark:text-slate-300">
          {items.map((it, ii) => <li key={ii}>{inlineFmt(it, `ol${key}-${ii}`)}</li>)}
        </ol>
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") { i++; continue; }

    // Paragraph (greedy — collect until next block)
    const pLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === "" || /^#{1,3} /.test(l) || l.startsWith("```") || l.startsWith("> ") || /^[-*+] /.test(l) || /^\d+\. /.test(l) || /^-{3,}$/.test(l.trim())) break;
      pLines.push(l); i++;
    }
    if (pLines.length) {
      nodes.push(
        <p key={key++} className="text-slate-600 dark:text-slate-300 leading-relaxed mb-1.5">
          {pLines.map((pl, pi) => (
            <React.Fragment key={pi}>{inlineFmt(pl, `p${key}-${pi}`)}{pi < pLines.length - 1 && <br />}</React.Fragment>
          ))}
        </p>
      );
    }
  }

  return <div className="prose-md text-sm">{nodes}</div>;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

interface CommentItemProps {
  comment: Comment;
  replies: Comment[];
  postId: string;
  currentUserId?: string;
  onReplySubmit: () => void;
  isHot?: boolean;
}

function CommentItem({ comment, replies, postId, currentUserId, onReplySubmit, isHot }: CommentItemProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [liked, setLiked] = useState(comment.is_liked);
  const [likeCount, setLikeCount] = useState(comment.like_count);
  const [likedAnim, setLikedAnim] = useState(false);
  const isOwner = currentUserId === comment.author.id;

  const handleToggleLike = async () => {
    try {
      if (!liked) { setLikedAnim(true); setTimeout(() => setLikedAnim(false), 450); }
      const result = await api.toggleCommentLike(postId, comment.id);
      setLiked(result.liked);
      setLikeCount((prev) => (result.liked ? prev + 1 : prev - 1));
    } catch (err) {
      console.error("Failed to toggle comment like:", err);
    }
  };

  const handleReplySubmit = async () => {
    if (!replyContent.trim()) return;
    setSubmitting(true);
    try {
      await api.createComment(postId, replyContent.trim(), comment.id);
      setReplyContent("");
      setShowReplyForm(false);
      onReplySubmit();
    } catch (err) {
      console.error("Failed to create reply:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!editContent.trim()) return;
    setEditSubmitting(true);
    try {
      await api.updateComment(postId, comment.id, editContent.trim());
      setEditing(false);
      onReplySubmit();
    } catch (err) {
      console.error("Failed to edit comment:", err);
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("댓글을 삭제하시겠습니까?")) return;
    try {
      await api.deleteComment(postId, comment.id);
      onReplySubmit();
    } catch (err) {
      console.error("Failed to delete comment:", err);
    }
  };

  return (
    <div className={`space-y-3 ${isHot ? "relative rounded-xl border border-amber-300/60 dark:border-amber-500/30 bg-amber-500/5 p-4 -mx-1" : ""}`}>
      {isHot && (
        <div className="flex items-center gap-1.5 -mt-0.5 mb-2">
          <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">🏆 인기 댓글</span>
        </div>
      )}
      <div className="flex gap-3">
        <Link href={`/community/user/${comment.author.id}`} className="shrink-0 mt-0.5">
          {comment.author.avatar_url ? (
            <img src={comment.author.avatar_url} alt={comment.author.nickname} className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{comment.author.nickname.charAt(0)}</span>
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {comment.author.level != null && (
              <span className="text-xs font-black text-blue-500">Lv.{comment.author.level}</span>
            )}
            <Link href={`/community/user/${comment.author.id}`} className="text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-blue-500 transition">{comment.author.nickname}</Link>
            <span className="text-xs text-slate-500 dark:text-slate-400">{formatRelative(comment.created_at)}</span>
          </div>
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition resize-none"
              />
              <div className="flex gap-2">
                <button onClick={handleEdit} disabled={editSubmitting || !editContent.trim()} className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-lg disabled:opacity-50 transition">
                  {editSubmitting ? "..." : "수정"}
                </button>
                <button onClick={() => { setEditing(false); setEditContent(comment.content); }} className="px-3 py-1 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition">
                  취소
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{comment.content}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <button onClick={handleToggleLike} className={`text-xs transition flex items-center gap-1.5 ${liked ? "text-blue-500" : "text-slate-500 dark:text-slate-400 hover:text-blue-500"}`}>
              <span className="relative inline-flex">
                <svg className={`w-3 h-3 transition-transform ${likedAnim ? "animate-heart-pop" : ""}`} fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.037.15.544 2.913-.997 5.768-3.524 6.736a.44.44 0 00-.278.447c.044 1.39.156 2.53.354 3.417H5.25a2.25 2.25 0 01-2.25-2.25v-.894c0-.796.42-1.534 1.105-1.937A5.23 5.23 0 006.3 7.66c-.046-.38-.07-.765-.07-1.155A5.505 5.505 0 0111.735 1c2.243 0 4.203 1.348 5.063 3.276.138.31.245.632.318.966zM16.5 15h1.875a.625.625 0 01.625.625v5.25a.625.625 0 01-.625.625H16.5v-6.5z" />
                </svg>
                {likedAnim && <span className="animate-float-heart text-blue-500 text-[10px]">👍</span>}
              </span>
              {likeCount}
            </button>
            <button
              onClick={() => setShowReplyForm(!showReplyForm)}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
            >
              답글
            </button>
            {isOwner && !editing && (
              <>
                <button onClick={() => setEditing(true)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition">수정</button>
                <button onClick={handleDelete} className="text-xs text-slate-500 dark:text-slate-400 hover:text-red-400 transition">삭제</button>
              </>
            )}
          </div>

          {showReplyForm && (
            <div className="mt-3 flex gap-2">
              <input
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="답글을 입력하세요..."
                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleReplySubmit();
                  }
                }}
              />
              <button
                onClick={handleReplySubmit}
                disabled={submitting || !replyContent.trim()}
                className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {submitting ? "..." : "등록"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="ml-11 space-y-3 border-l-2 border-slate-200 dark:border-slate-700 pl-4">
          {replies.map((reply) => {
            const replyIsOwner = currentUserId === reply.author.id;
            return (
              <ReplyItem key={reply.id} reply={reply} postId={postId} isOwner={replyIsOwner} onUpdate={onReplySubmit} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReplyItem({ reply, postId, isOwner, onUpdate }: { reply: Comment; postId: string; isOwner: boolean; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(reply.content);
  const [busy, setBusy] = useState(false);
  const [liked, setLiked] = useState(reply.is_liked);
  const [likeCount, setLikeCount] = useState(reply.like_count);
  const [likedAnim, setLikedAnim] = useState(false);

  const handleToggleLike = async () => {
    try {
      if (!liked) { setLikedAnim(true); setTimeout(() => setLikedAnim(false), 450); }
      const result = await api.toggleCommentLike(postId, reply.id);
      setLiked(result.liked);
      setLikeCount((prev) => (result.liked ? prev + 1 : prev - 1));
    } catch (err) {
      console.error("Failed to toggle reply like:", err);
    }
  };

  const handleEdit = async () => {
    if (!editContent.trim()) return;
    setBusy(true);
    try {
      await api.updateComment(postId, reply.id, editContent.trim());
      setEditing(false);
      onUpdate();
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!confirm("답글을 삭제하시겠습니까?")) return;
    try { await api.deleteComment(postId, reply.id); onUpdate(); } catch {}
  };

  return (
    <div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {reply.author.level != null && (
            <span className="text-xs font-black text-blue-500">Lv.{reply.author.level}</span>
          )}
          <Link href={`/community/user/${reply.author.id}`} className="text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-blue-500 transition">{reply.author.nickname}</Link>
          <span className="text-xs text-slate-500 dark:text-slate-400">{formatRelative(reply.created_at)}</span>
          {isOwner && !editing && (
            <>
              <button onClick={() => setEditing(true)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition">수정</button>
              <button onClick={handleDelete} className="text-xs text-slate-500 dark:text-slate-400 hover:text-red-400 transition">삭제</button>
            </>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={2} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition resize-none" />
            <div className="flex gap-2">
              <button onClick={handleEdit} disabled={busy} className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-lg disabled:opacity-50 transition">{busy ? "..." : "수정"}</button>
              <button onClick={() => { setEditing(false); setEditContent(reply.content); }} className="px-3 py-1 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition">취소</button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{reply.content}</p>
        )}
        <div className="flex items-center gap-3 mt-1">
          <button onClick={handleToggleLike} className={`text-xs transition flex items-center gap-1.5 ${liked ? "text-blue-500" : "text-slate-500 dark:text-slate-400 hover:text-blue-500"}`}>
            <span className="relative inline-flex">
              <svg className={`w-3 h-3 ${likedAnim ? "animate-heart-pop" : ""}`} fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.037.15.544 2.913-.997 5.768-3.524 6.736a.44.44 0 00-.278.447c.044 1.39.156 2.53.354 3.417H5.25a2.25 2.25 0 01-2.25-2.25v-.894c0-.796.42-1.534 1.105-1.937A5.23 5.23 0 006.3 7.66c-.046-.38-.07-.765-.07-1.155A5.505 5.505 0 0111.735 1c2.243 0 4.203 1.348 5.063 3.276.138.31.245.632.318.966zM16.5 15h1.875a.625.625 0 01.625.625v5.25a.625.625 0 01-.625.625H16.5v-6.5z" />
              </svg>
              {likedAnim && <span className="animate-float-heart text-blue-500 text-[10px]">👍</span>}
            </span>
            {likeCount}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PostDetailPage() {
  const { toast } = useToast();
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const postId = params.id as string;

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentContent, setCommentContent] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [copying, setCopying] = useState(false);
  const [reactions, setReactions] = useState<ReactionCount[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDesc, setReportDesc] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [editingPost, setEditingPost] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editSeriesId, setEditSeriesId] = useState("");
  const [mySeries, setMySeries] = useState<Array<{ id: string; title: string; post_count: number }>>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const fetchPost = useCallback(async (guard?: { current: boolean }) => {
    try {
      const result = await api.getPost(postId);
      if (guard && !guard.current) return;
      setPost(result);
      setBookmarked(result.is_bookmarked);
    } catch (err) {
      console.error("Failed to fetch post:", err);
    }
  }, [postId]);

  const fetchComments = useCallback(async (guard?: { current: boolean }) => {
    try {
      const result = await api.getComments(postId);
      if (guard && !guard.current) return;
      setComments(result);
    } catch (err) {
      console.error("Failed to fetch comments:", err);
    }
  }, [postId]);

  const fetchReactions = useCallback(async (guard?: { current: boolean }) => {
    try {
      const result = await api.getReactions(postId);
      if (guard && !guard.current) return;
      setReactions(result);
    } catch (err) {
      console.error("Failed to fetch reactions:", err);
    }
  }, [postId]);

  useEffect(() => {
    const guard = { current: true };
    setLoading(true);
    Promise.all([fetchPost(guard), fetchComments(guard), fetchReactions(guard)]).finally(() => {
      if (guard.current) setLoading(false);
    });
    return () => { guard.current = false; };
  }, [fetchPost, fetchComments, fetchReactions]);

  const handleToggleBookmark = async () => {
    try {
      const result = await api.toggleBookmark(postId);
      setBookmarked(result.bookmarked);
    } catch (err) {
      console.error("Failed to toggle bookmark:", err);
    }
  };

  const handleToggleReaction = async (emoji: string) => {
    try {
      const result = await api.toggleReaction(postId, emoji);
      setReactions((prev) =>
        prev.map((r) =>
          r.emoji === emoji
            ? { ...r, reacted: result.reacted, count: result.reacted ? r.count + 1 : Math.max(0, r.count - 1) }
            : r
        ).concat(
          prev.some((r) => r.emoji === emoji)
            ? []
            : [{ emoji, count: result.reacted ? 1 : 0, reacted: result.reacted }]
        )
      );
    } catch (err) {
      console.error("Failed to toggle reaction:", err);
    }
  };

  const handleCopyStrategy = async () => {
    setCopying(true);
    try {
      await api.copyStrategyFromPost(postId);
      toast("전략이 내 전략 목록에 복사되었습니다!", "success");
    } catch (err) {
      console.error("Failed to copy strategy:", err);
      toast("전략 복사에 실패했습니다.", "error");
    } finally {
      setCopying(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!commentContent.trim()) return;
    setSubmittingComment(true);
    try {
      await api.createComment(postId, commentContent.trim());
      setCommentContent("");
      await fetchComments();
    } catch (err) {
      console.error("Failed to create comment:", err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeletePost = async () => {
    if (!confirm("정말 이 게시글을 삭제하시겠습니까?")) return;
    try {
      await api.deletePost(postId);
      router.push("/community");
    } catch (err) {
      console.error("Failed to delete post:", err);
    }
  };

  const handleStartEdit = () => {
    if (!post) return;
    setEditTitle(post.title);
    setEditContent(post.content);
    setEditSeriesId((post as any).series_id || "");
    setEditingPost(true);
    api.getMySeries().then(setMySeries).catch(console.error);
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim() || !editContent.trim()) return;
    setEditSubmitting(true);
    try {
      const updated = await api.updatePost(postId, { title: editTitle.trim(), content: editContent.trim(), series_id: editSeriesId });
      setPost(updated);
      setEditingPost(false);
      toast("게시글이 수정되었습니다.", "success");
    } catch (err) {
      console.error("Failed to update post:", err);
      toast("수정에 실패했습니다.", "error");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleReport = async () => {
    if (!reportReason) return;
    setReportSubmitting(true);
    try {
      await api.report("post", postId, reportReason, reportDesc || undefined);
      toast("신고가 접수되었습니다.", "success");
      setShowReportModal(false);
      setReportReason("");
      setReportDesc("");
    } catch (err) {
      console.error("Failed to report:", err);
      toast("신고 접수에 실패했습니다.", "error");
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: post?.title, url });
      } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      toast("링크가 복사되었습니다!", "success");
    }
  };

  if (loading) {
    return <PostDetailSkeleton />;
  }

  if (!post) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-red-400 mb-4">게시글을 찾을 수 없습니다.</p>
        <Link href="/community" className="text-blue-500 hover:underline text-sm">
          커뮤니티로 돌아가기
        </Link>
      </div>
    );
  }

  const topLevelComments = comments.filter((c) => !c.parent_id);
  const repliesMap: Record<string, Comment[]> = {};
  comments.forEach((c) => {
    if (c.parent_id) {
      if (!repliesMap[c.parent_id]) repliesMap[c.parent_id] = [];
      repliesMap[c.parent_id].push(c);
    }
  });

  // hot comment: highest liked comment (min 3 likes)
  const maxCommentLikes = topLevelComments.reduce((m, c) => Math.max(m, c.like_count), 0);
  const hotCommentId = maxCommentLikes >= 3
    ? topLevelComments.find((c) => c.like_count === maxCommentLikes)?.id
    : undefined;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Back nav */}
      <Link href="/community" className="inline-flex items-center gap-1 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        커뮤니티
      </Link>

      {/* Post */}
      <article className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-4 sm:p-6 space-y-4">
        {/* Category + Title */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs px-2 py-0.5 rounded ${CATEGORY_BADGE_CLASS[post.category] || "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`}>
              {CATEGORY_LABEL[post.category] || post.category}
            </span>
            {post.is_pinned && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 font-medium">
                고정
              </span>
            )}
          </div>
          {editingPost ? (
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-lg font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500 transition"
            />
          ) : (
            <h1 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100">{post.title}</h1>
          )}
        </div>

        {/* Author info */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <Link href={`/community/user/${post.author.id}`} className="shrink-0">
              {post.author.avatar_url ? (
                <img
                  src={post.author.avatar_url}
                  alt={post.author.nickname}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                  <span className="text-sm font-bold text-slate-500 dark:text-slate-400">
                    {post.author.nickname.charAt(0)}
                  </span>
                </div>
              )}
            </Link>
            <div>
              <div className="flex items-center gap-2">
                {post.author.level != null && (
                  <span className="text-xs font-black text-blue-500">Lv.{post.author.level}</span>
                )}
                <Link href={`/community/user/${post.author.id}`} className="text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-blue-500 transition">{post.author.nickname}</Link>
                <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(post.created_at)}</span>
              </div>
              {post.author.bio && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-1">{post.author.bio}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>조회 {post.view_count}</span>
            <span>댓글 {post.comment_count}</span>
            {user?.id === post.author.id && (
              <>
                <button onClick={handleStartEdit} className="text-slate-400 hover:text-blue-500 dark:text-slate-500 dark:hover:text-blue-400 transition">
                  수정
                </button>
                <button onClick={handleDeletePost} className="text-red-400 hover:text-red-600 transition">
                  삭제
                </button>
              </>
            )}
          </div>
        </div>

        {/* Verified profit badge */}
        {post.verified_profit && (
          <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
            <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <span className="text-sm font-medium text-green-400">수익 인증 완료</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 ml-2">
                실제 거래 데이터 기반으로 검증됨
              </span>
            </div>
          </div>
        )}

        {/* Content */}
        {editingPost ? (
          <div className="space-y-3">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition resize-y"
            />
            {mySeries.length > 0 && (
              <select
                value={editSeriesId}
                onChange={(e) => setEditSeriesId(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500 transition"
              >
                <option value="">시리즈 없음</option>
                {mySeries.map((s) => (
                  <option key={s.id} value={s.id}>{s.title} ({s.post_count}편)</option>
                ))}
              </select>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveEdit}
                disabled={editSubmitting || !editTitle.trim() || !editContent.trim()}
                className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {editSubmitting ? "저장 중..." : "저장"}
              </button>
              <button
                onClick={() => setEditingPost(false)}
                className="px-4 py-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <div className="min-h-[100px]">
            {renderMarkdown(post.content)}
          </div>
        )}

        {/* Strategy card */}
        {post.strategy_id && post.strategy_name && (
          <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-200">첨부된 전략</div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">{post.strategy_name}</div>
                </div>
              </div>
              <button
                onClick={handleCopyStrategy}
                disabled={copying}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {copying ? "복사 중..." : "전략 복사하기"}
              </button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            {/* 좋아요 / 싫어요 */}
            <ReactionPicker
              targetType="post"
              targetId={postId}
              reactions={reactions}
              onReact={handleToggleReaction}
            />
          </div>

          <div className="flex items-center gap-3">
            {/* 북마크 */}
            <button
              onClick={handleToggleBookmark}
              className={`flex items-center gap-1.5 text-sm transition ${
                bookmarked ? "text-yellow-500" : "text-slate-400 dark:text-slate-500 hover:text-yellow-500"
              }`}
            >
              <svg className="w-4 h-4" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              <span className="text-xs hidden sm:inline">북마크</span>
            </button>

            {/* 공유 */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:inline mr-0.5">공유</span>
              <ShareButtons
                title={post.title}
                url={typeof window !== "undefined" ? window.location.href : ""}
                description={post.content.slice(0, 100)}
              />
            </div>

            {/* 신고 */}
            {user?.id !== post.author.id && (
              <button onClick={() => setShowReportModal(true)} className="text-xs text-slate-400 dark:text-slate-500 hover:text-red-400 transition">
                신고
              </button>
            )}
          </div>
        </div>
      </article>

      {/* Comments Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-6 space-y-6">
        <h2 className="font-bold text-slate-800 dark:text-slate-100">댓글 {comments.length}개</h2>

        {/* Comment input */}
        <div>
          <div className="flex-1 space-y-2">
            <textarea
              id="comment-input"
              value={commentContent}
              onChange={(e) => setCommentContent(e.target.value)}
              placeholder="댓글을 입력하세요..."
              rows={3}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition resize-none"
            />
            <div className="flex justify-end">
              <button
                onClick={handleSubmitComment}
                disabled={submittingComment || !commentContent.trim()}
                className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {submittingComment ? "등록 중..." : "댓글 등록"}
              </button>
            </div>
          </div>
        </div>

        {/* Comment list */}
        {topLevelComments.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">아직 댓글이 없습니다. 첫 번째 댓글을 남겨보세요!</p>
        ) : (
          <div className="space-y-6">
            {topLevelComments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                replies={repliesMap[comment.id] || []}
                postId={postId}
                currentUserId={user?.id}
                onReplySubmit={fetchComments}
                isHot={comment.id === hotCommentId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Mobile FAB: 댓글 쓰기 */}
      <div className="fixed bottom-20 right-4 lg:hidden z-20">
        <button
          onClick={() => {
            const el = document.getElementById("comment-input");
            if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
          }}
          className="w-12 h-12 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white rounded-full shadow-lg flex items-center justify-center transition"
          aria-label="댓글 쓰기"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4z" />
          </svg>
        </button>
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-6 w-full max-w-md mx-4 space-y-4">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">게시글 신고</h3>
            <div className="space-y-2">
              <label className="text-sm text-slate-600 dark:text-slate-300">신고 사유</label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition"
              >
                <option value="">선택해주세요</option>
                <option value="spam">스팸/광고</option>
                <option value="abuse">욕설/비방</option>
                <option value="fraud">사기/허위정보</option>
                <option value="inappropriate">부적절한 콘텐츠</option>
                <option value="other">기타</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-600 dark:text-slate-300">상세 설명 (선택)</label>
              <textarea
                value={reportDesc}
                onChange={(e) => setReportDesc(e.target.value)}
                placeholder="추가 설명을 입력하세요..."
                rows={3}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowReportModal(false); setReportReason(""); setReportDesc(""); }}
                className="px-4 py-2 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition"
              >
                취소
              </button>
              <button
                onClick={handleReport}
                disabled={!reportReason || reportSubmitting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg disabled:opacity-50 transition"
              >
                {reportSubmitting ? "접수 중..." : "신고하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

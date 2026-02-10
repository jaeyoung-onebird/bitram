"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import type { Post, Comment } from "@/types";

const CATEGORY_LABEL: Record<string, string> = {
  strategy: "전략공유",
  profit: "수익인증",
  question: "질문/답변",
  free: "자유",
};

const CATEGORY_BADGE_CLASS: Record<string, string> = {
  strategy: "bg-blue-500/20 text-blue-400",
  profit: "bg-green-500/20 text-green-400",
  question: "bg-yellow-500/20 text-yellow-400",
  free: "bg-gray-500/20 text-gray-400",
};


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
  onReplySubmit: () => void;
}

function CommentItem({ comment, replies, postId, onReplySubmit }: CommentItemProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-300 shrink-0">
          {comment.author.nickname[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-200">{comment.author.nickname}</span>
            <span className="text-xs text-gray-500">{formatRelative(comment.created_at)}</span>
          </div>
          <p className="text-sm text-gray-300 whitespace-pre-wrap">{comment.content}</p>
          <div className="flex items-center gap-3 mt-2">
            <button className="text-xs text-gray-500 hover:text-gray-300 transition flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              {comment.like_count}
            </button>
            <button
              onClick={() => setShowReplyForm(!showReplyForm)}
              className="text-xs text-gray-500 hover:text-gray-300 transition"
            >
              답글
            </button>
          </div>

          {showReplyForm && (
            <div className="mt-3 flex gap-2">
              <input
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="답글을 입력하세요..."
                className="flex-1 px-3 py-2 bg-[#111827] border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
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
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {submitting ? "..." : "등록"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="ml-11 space-y-3 border-l-2 border-gray-800 pl-4">
          {replies.map((reply) => {
            return (
              <div key={reply.id} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-[10px] text-gray-300 shrink-0">
                  {reply.author.nickname[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-200">{reply.author.nickname}</span>
                    <span className="text-xs text-gray-500">{formatRelative(reply.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{reply.content}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const postId = params.id as string;

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentContent, setCommentContent] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [copying, setCopying] = useState(false);

  const fetchPost = useCallback(async () => {
    try {
      const result = await api.getPost(postId);
      setPost(result);
      setLiked(result.is_liked);
      setBookmarked(result.is_bookmarked);
      setLikeCount(result.like_count);
    } catch (err) {
      console.error("Failed to fetch post:", err);
    }
  }, [postId]);

  const fetchComments = useCallback(async () => {
    try {
      const result = await api.getComments(postId);
      setComments(result);
    } catch (err) {
      console.error("Failed to fetch comments:", err);
    }
  }, [postId]);

  useEffect(() => {
    Promise.all([fetchPost(), fetchComments()]).finally(() => setLoading(false));
  }, [fetchPost, fetchComments]);

  const handleToggleLike = async () => {
    try {
      const result = await api.toggleLike(postId);
      setLiked(result.liked);
      setLikeCount((prev) => (result.liked ? prev + 1 : prev - 1));
    } catch (err) {
      console.error("Failed to toggle like:", err);
    }
  };

  const handleToggleBookmark = async () => {
    try {
      const result = await api.toggleBookmark(postId);
      setBookmarked(result.bookmarked);
    } catch (err) {
      console.error("Failed to toggle bookmark:", err);
    }
  };

  const handleCopyStrategy = async () => {
    setCopying(true);
    try {
      await api.copyStrategyFromPost(postId);
      alert("전략이 내 전략 목록에 복사되었습니다!");
    } catch (err) {
      console.error("Failed to copy strategy:", err);
      alert("전략 복사에 실패했습니다.");
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-red-400 mb-4">게시글을 찾을 수 없습니다.</p>
        <Link href="/community" className="text-blue-400 hover:underline text-sm">
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

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Back nav */}
      <Link href="/community" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        커뮤니티
      </Link>

      {/* Post */}
      <article className="bg-[#1a2332] border border-gray-800 rounded-xl p-6 space-y-4">
        {/* Category + Title */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs px-2 py-0.5 rounded ${CATEGORY_BADGE_CLASS[post.category] || "bg-gray-500/20 text-gray-400"}`}>
              {CATEGORY_LABEL[post.category] || post.category}
            </span>
            {post.is_pinned && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">
                고정
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-gray-100">{post.title}</h1>
        </div>

        {/* Author info */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-sm text-gray-300">
              {post.author.nickname[0]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-200">{post.author.nickname}</span>
              </div>
              <div className="text-xs text-gray-500">{formatDate(post.created_at)}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>조회 {post.view_count}</span>
            <span>댓글 {post.comment_count}</span>
            {user?.id === post.author.id && (
              <button onClick={handleDeletePost} className="text-red-400 hover:text-red-300 transition">
                삭제
              </button>
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
              <span className="text-xs text-gray-400 ml-2">
                실제 거래 데이터 기반으로 검증됨
              </span>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap min-h-[100px]">
          {post.content}
        </div>

        {/* Strategy card */}
        {post.strategy_id && post.strategy_name && (
          <div className="p-4 bg-[#111827] border border-gray-700 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-200">첨부된 전략</div>
                  <div className="text-xs text-gray-400">{post.strategy_name}</div>
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
        <div className="flex items-center gap-4 pt-2 border-t border-gray-800">
          <button
            onClick={handleToggleLike}
            className={`flex items-center gap-1.5 text-sm transition ${
              liked ? "text-red-400" : "text-gray-500 hover:text-red-400"
            }`}
          >
            <svg className="w-5 h-5" fill={liked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            좋아요 {likeCount}
          </button>
          <button
            onClick={handleToggleBookmark}
            className={`flex items-center gap-1.5 text-sm transition ${
              bookmarked ? "text-yellow-400" : "text-gray-500 hover:text-yellow-400"
            }`}
          >
            <svg className="w-5 h-5" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            북마크
          </button>
        </div>
      </article>

      {/* Comments Section */}
      <div className="bg-[#1a2332] border border-gray-800 rounded-xl p-6 space-y-6">
        <h2 className="font-bold text-gray-100">댓글 {comments.length}개</h2>

        {/* Comment input */}
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-300 shrink-0">
            {user?.nickname?.[0] || "?"}
          </div>
          <div className="flex-1 space-y-2">
            <textarea
              value={commentContent}
              onChange={(e) => setCommentContent(e.target.value)}
              placeholder="댓글을 입력하세요..."
              rows={3}
              className="w-full px-3 py-2 bg-[#111827] border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition resize-none"
            />
            <div className="flex justify-end">
              <button
                onClick={handleSubmitComment}
                disabled={submittingComment || !commentContent.trim()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {submittingComment ? "등록 중..." : "댓글 등록"}
              </button>
            </div>
          </div>
        </div>

        {/* Comment list */}
        {topLevelComments.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">아직 댓글이 없습니다. 첫 번째 댓글을 남겨보세요!</p>
        ) : (
          <div className="space-y-6">
            {topLevelComments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                replies={repliesMap[comment.id] || []}
                postId={postId}
                onReplySubmit={fetchComments}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

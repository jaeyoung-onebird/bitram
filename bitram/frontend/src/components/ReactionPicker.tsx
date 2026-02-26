"use client";

interface Reaction {
  emoji: string;
  count: number;
  reacted: boolean;
}

interface ReactionPickerProps {
  targetType: "post" | "comment";
  targetId: string;
  reactions: Reaction[];
  onReact: (emoji: string) => void;
}

export default function ReactionPicker({
  targetType: _targetType,
  targetId: _targetId,
  reactions,
  onReact,
}: ReactionPickerProps) {
  const reactionMap = new Map<string, Reaction>();
  for (const r of reactions) {
    reactionMap.set(r.emoji, r);
  }

  const like = reactionMap.get("thumbsup");
  const dislike = reactionMap.get("thumbsdown");

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onReact("thumbsup")}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
          like?.reacted
            ? "bg-blue-50 dark:bg-blue-500/15 border-blue-300 dark:border-blue-500/40 text-blue-600 dark:text-blue-400"
            : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-300 dark:hover:border-blue-500/40 hover:text-blue-500"
        }`}
      >
        <svg className="w-4 h-4" fill={like?.reacted ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
        </svg>
        좋아요
        {(like?.count ?? 0) > 0 && (
          <span className="text-xs">{like!.count}</span>
        )}
      </button>

      <button
        onClick={() => onReact("thumbsdown")}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
          dislike?.reacted
            ? "bg-rose-50 dark:bg-rose-500/15 border-rose-300 dark:border-rose-500/40 text-rose-600 dark:text-rose-400"
            : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-rose-300 dark:hover:border-rose-500/40 hover:text-rose-500"
        }`}
      >
        <svg className="w-4 h-4" fill={dislike?.reacted ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17" />
        </svg>
        싫어요
        {(dislike?.count ?? 0) > 0 && (
          <span className="text-xs">{dislike!.count}</span>
        )}
      </button>
    </div>
  );
}

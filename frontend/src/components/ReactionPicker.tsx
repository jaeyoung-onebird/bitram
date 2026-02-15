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

const EMOJI_MAP: { emoji: string; name: string }[] = [
  { emoji: "\uD83D\uDC4D", name: "thumbsup" },
  { emoji: "\u2764\uFE0F", name: "heart" },
  { emoji: "\uD83D\uDD25", name: "fire" },
  { emoji: "\uD83D\uDE80", name: "rocket" },
  { emoji: "\uD83D\uDC40", name: "eyes" },
  { emoji: "\uD83E\uDD14", name: "thinking" },
];

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

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {EMOJI_MAP.map(({ emoji, name }) => {
        const reaction = reactionMap.get(name);
        const count = reaction?.count ?? 0;
        const reacted = reaction?.reacted ?? false;

        return (
          <button
            key={name}
            onClick={() => onReact(name)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm transition ${
              reacted
                ? "bg-blue-100 dark:bg-blue-500/20 border border-blue-300 dark:border-blue-500/40"
                : "bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            <span className="text-base leading-none">{emoji}</span>
            {count > 0 && (
              <span
                className={`text-xs font-medium ${
                  reacted
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

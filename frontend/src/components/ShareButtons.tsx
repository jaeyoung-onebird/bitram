"use client";
import { useState } from "react";
import { useToast } from "@/components/Toast";

interface ShareButtonsProps {
  title: string;
  url: string;
  description?: string;
}

export default function ShareButtons({ title, url }: ShareButtonsProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const handleKakao = () => {
    window.open(
      `https://sharer.kakao.com/talk/friends/picker/shorturl?url=${encodedUrl}`,
      "kakao-share",
      "width=600,height=400"
    );
  };

  const handleTwitter = () => {
    window.open(
      `https://x.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
      "twitter-share",
      "width=600,height=400"
    );
  };

  const handleTelegram = () => {
    window.open(
      `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
      "telegram-share",
      "width=600,height=400"
    );
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast("링크 복사됨", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("링크 복사에 실패했습니다.", "error");
    }
  };

  const btnBase =
    "inline-flex items-center justify-center w-7 h-7 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100 transition";

  return (
    <div className="flex items-center gap-1.5">
      <button onClick={handleKakao} className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-[#FEE500] hover:bg-[#F5DC00] transition" title="카카오톡 공유">
        <svg className="w-3.5 h-3.5 text-[#3C1E1E]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3C6.477 3 2 6.477 2 10.5c0 2.47 1.607 4.636 4.03 5.896l-.916 3.39c-.073.27.228.483.474.335l3.964-2.385A12.29 12.29 0 0012 18c5.523 0 10-3.477 10-7.5S17.523 3 12 3z" />
        </svg>
      </button>

      <button onClick={handleTwitter} className={btnBase} title="X(Twitter) 공유">
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </button>

      <button onClick={handleTelegram} className={btnBase} title="텔레그램 공유">
        <svg className="w-3.5 h-3.5 text-[#0088CC]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      </button>

      <button
        onClick={handleCopyLink}
        className={`${btnBase} ${copied ? "border-emerald-400 dark:border-emerald-600 text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10" : ""}`}
        title="링크 복사"
      >
        {copied ? (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        )}
      </button>
    </div>
  );
}

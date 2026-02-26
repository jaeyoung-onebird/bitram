"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/components/Toast";

/* ------------------------------------------------------------------ */
/*  Kakao SDK type declarations (window.Kakao)                        */
/* ------------------------------------------------------------------ */
declare global {
  interface Window {
    Kakao?: {
      init: (key: string) => void;
      isInitialized: () => boolean;
      Share: {
        sendDefault: (params: {
          objectType: string;
          content: {
            title: string;
            description: string;
            imageUrl?: string;
            link: { webUrl: string; mobileWebUrl: string };
          };
          buttons?: Array<{
            title: string;
            link: { webUrl: string; mobileWebUrl: string };
          }>;
        }) => void;
      };
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Props                                                             */
/* ------------------------------------------------------------------ */
interface ShareButtonsProps {
  title: string;
  url?: string;
  description?: string;
}

/* ------------------------------------------------------------------ */
/*  Kakao SDK loader (singleton - loads once across all instances)     */
/* ------------------------------------------------------------------ */
let kakaoLoadPromise: Promise<void> | null = null;

function loadKakaoSDK(): Promise<void> {
  if (kakaoLoadPromise) return kakaoLoadPromise;

  kakaoLoadPromise = new Promise<void>((resolve, reject) => {
    // Already loaded
    if (window.Kakao) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";
    script.integrity =
      "sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Ber76";
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      kakaoLoadPromise = null;
      reject(new Error("Failed to load Kakao SDK"));
    };
    document.head.appendChild(script);
  });

  return kakaoLoadPromise;
}

function initKakao() {
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  if (!key) return false;
  if (!window.Kakao) return false;
  if (!window.Kakao.isInitialized()) {
    window.Kakao.init(key);
  }
  return window.Kakao.isInitialized();
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */
export default function ShareButtons({
  title,
  url,
  description,
}: ShareButtonsProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [kakaoReady, setKakaoReady] = useState(false);
  const mountedRef = useRef(true);

  // Resolve the share URL (fallback to current page)
  const shareUrl =
    url || (typeof window !== "undefined" ? window.location.href : "");

  // Load & initialise Kakao SDK once
  useEffect(() => {
    mountedRef.current = true;
    const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (!key) return;

    loadKakaoSDK()
      .then(() => {
        if (mountedRef.current && initKakao()) {
          setKakaoReady(true);
        }
      })
      .catch(() => {
        /* SDK load failed -- fallback will be used */
      });

    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* ---------- Kakao share ---------- */
  const handleKakao = useCallback(() => {
    const currentUrl = shareUrl || window.location.href;
    const desc = description || "";

    if (kakaoReady && window.Kakao) {
      window.Kakao.Share.sendDefault({
        objectType: "feed",
        content: {
          title,
          description: desc.length > 200 ? desc.slice(0, 197) + "..." : desc,
          link: {
            webUrl: currentUrl,
            mobileWebUrl: currentUrl,
          },
        },
        buttons: [
          {
            title: "자세히 보기",
            link: {
              webUrl: currentUrl,
              mobileWebUrl: currentUrl,
            },
          },
        ],
      });
    } else {
      // Fallback: open Kakao share picker
      const encodedUrl = encodeURIComponent(currentUrl);
      window.open(
        `https://sharer.kakao.com/talk/friends/picker/shorturl?url=${encodedUrl}`,
        "kakao-share",
        "width=600,height=400"
      );
    }
  }, [shareUrl, title, description, kakaoReady]);

  /* ---------- Twitter / X ---------- */
  const handleTwitter = useCallback(() => {
    const currentUrl = shareUrl || window.location.href;
    const encodedUrl = encodeURIComponent(currentUrl);
    const encodedTitle = encodeURIComponent(title);
    window.open(
      `https://x.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
      "twitter-share",
      "width=600,height=400"
    );
  }, [shareUrl, title]);

  /* ---------- Copy link ---------- */
  const handleCopyLink = useCallback(async () => {
    const currentUrl = shareUrl || window.location.href;
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      toast("링크가 복사되었습니다", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("링크 복사에 실패했습니다", "error");
    }
  }, [shareUrl, toast]);

  /* ---------- Styles ---------- */
  const btnBase =
    "inline-flex items-center justify-center w-7 h-7 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100 transition";

  return (
    <div className="flex items-center gap-1.5">
      {/* Kakao */}
      <button
        onClick={handleKakao}
        className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-[#FEE500] hover:bg-[#F5DC00] transition"
        title="카카오톡 공유"
      >
        <svg
          className="w-3.5 h-3.5 text-[#3C1E1E]"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 3C6.477 3 2 6.477 2 10.5c0 2.47 1.607 4.636 4.03 5.896l-.916 3.39c-.073.27.228.483.474.335l3.964-2.385A12.29 12.29 0 0012 18c5.523 0 10-3.477 10-7.5S17.523 3 12 3z" />
        </svg>
      </button>

      {/* Twitter / X */}
      <button onClick={handleTwitter} className={btnBase} title="X(Twitter) 공유">
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </button>

      {/* Copy link */}
      <button
        onClick={handleCopyLink}
        className={`${btnBase} ${
          copied
            ? "border-emerald-400 dark:border-emerald-600 text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
            : ""
        }`}
        title="링크 복사"
      >
        {copied ? (
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

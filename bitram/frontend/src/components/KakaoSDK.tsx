"use client";

import { useEffect } from "react";

/**
 * KakaoSDK -- loads the Kakao JavaScript SDK and initialises it.
 *
 * Usage:
 *   Place <KakaoSDK /> anywhere in your component tree (e.g. root layout).
 *   If NEXT_PUBLIC_KAKAO_JS_KEY is not set, nothing is rendered or loaded.
 *
 * The SDK is loaded only once regardless of how many times this component
 * mounts, thanks to a module-level singleton promise.
 *
 * Note: The global Window.Kakao type is declared in ShareButtons.tsx.
 */

let loadPromise: Promise<void> | null = null;

function ensureKakaoSDK(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Cannot load Kakao SDK on server"));
      return;
    }

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
      loadPromise = null;
      reject(new Error("Failed to load Kakao SDK script"));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}

export default function KakaoSDK() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (!key) return;

    ensureKakaoSDK()
      .then(() => {
        if (window.Kakao && !window.Kakao.isInitialized()) {
          window.Kakao.init(key);
        }
      })
      .catch(() => {
        // Silently fail -- ShareButtons has its own fallback
      });
  }, []);

  // This component renders nothing; it only produces a side-effect.
  return null;
}

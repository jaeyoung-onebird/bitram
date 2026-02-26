"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

export default function OAuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    api
      .getMe()
      .then((data) => {
        if (data?.id) {
          useAuthStore.getState().setAuth(data);
          router.replace("/dashboard");
        } else {
          router.replace("/login?error=oauth_failed");
        }
      })
      .catch(() => {
        router.replace("/login?error=oauth_failed");
      });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">로그인 처리 중...</p>
      </div>
    </div>
  );
}

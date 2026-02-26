"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("인증 토큰이 없습니다.");
      return;
    }

    let mounted = true;

    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/verify-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "인증에 실패했습니다." }));
          throw new Error(typeof err.detail === "string" ? err.detail : "인증에 실패했습니다.");
        }
        if (mounted) setStatus("success");
      } catch (err: unknown) {
        if (mounted) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "인증에 실패했습니다.");
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link
            href="/"
            className="inline-block text-2xl font-bold bg-gradient-to-r from-blue-500 via-blue-500 to-purple-600 bg-clip-text text-transparent"
          >
            BITRAM
          </Link>
          <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
            이메일 인증
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-8">
          {status === "loading" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              <p className="text-slate-600 dark:text-slate-300 text-sm">
                이메일 인증 중...
              </p>
            </div>
          )}

          {status === "success" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <CheckCircle className="w-16 h-16 text-emerald-500" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                이메일 인증이 완료되었습니다!
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                이제 로그인하여 서비스를 이용할 수 있습니다.
              </p>
              <Link
                href="/login"
                className="mt-2 px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl shadow-sm shadow-blue-500/20 transition"
              >
                로그인하기
              </Link>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <XCircle className="w-16 h-16 text-rose-500" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                인증 실패
              </h2>
              <p className="text-sm text-rose-600 dark:text-rose-400 text-center">
                {errorMessage}
              </p>
              <Link
                href="/login"
                className="mt-2 px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl shadow-sm shadow-blue-500/20 transition"
              >
                재발송
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}

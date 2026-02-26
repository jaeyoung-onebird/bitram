"use client";
import { useState } from "react";
import Link from "next/link";
import { Loader2, Mail, ArrowLeft } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "요청에 실패했습니다." }));
        throw new Error(typeof err.detail === "string" ? err.detail : "요청에 실패했습니다.");
      }
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "요청에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

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
            비밀번호 찾기
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-8">
          {sent ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 bg-blue-50 dark:bg-blue-500/10 rounded-full flex items-center justify-center">
                <Mail className="w-8 h-8 text-blue-500" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 text-center">
                이메일이 존재하면 재설정 링크가 발송됩니다.
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                이메일을 확인해주세요. 스팸 폴더도 확인해보시기 바랍니다.
              </p>
              <Link
                href="/login"
                className="mt-2 flex items-center gap-1.5 text-sm text-blue-500 font-medium hover:underline"
              >
                <ArrowLeft className="w-4 h-4" />
                로그인으로 돌아가기
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                비밀번호 찾기
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                가입 시 사용한 이메일을 입력하시면 비밀번호 재설정 링크를 보내드립니다.
              </p>

              {error && (
                <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg text-sm text-rose-600 dark:text-rose-400">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    이메일
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="example@email.com"
                    className="w-full px-4 py-3 bg-slate-50/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 focus:outline-none transition"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 rounded-xl font-semibold shadow-sm shadow-blue-500/20 transition flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? "전송 중..." : "재설정 링크 전송"}
                </button>
              </form>

              <p className="mt-6 text-center">
                <Link
                  href="/login"
                  className="text-sm text-blue-500 font-medium hover:underline flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  로그인으로 돌아가기
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

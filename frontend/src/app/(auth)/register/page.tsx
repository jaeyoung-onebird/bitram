"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ email: "", password: "", passwordConfirm: "", nickname: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (form.password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.register(form.email, form.password, form.nickname);
      setAuth(res.user, res.access_token, res.refresh_token);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <Link href="/" className="block text-center text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-8">
          BITRAM
        </Link>
        <div className="bg-[#1a2332] rounded-2xl border border-gray-800 p-8">
          <h1 className="text-xl font-bold mb-6">회원가입</h1>
          {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">닉네임</label>
              <input type="text" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} required
                className="w-full px-4 py-3 bg-[#111827] border border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none transition" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">이메일</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required
                className="w-full px-4 py-3 bg-[#111827] border border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none transition" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">비밀번호</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required
                className="w-full px-4 py-3 bg-[#111827] border border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none transition" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">비밀번호 확인</label>
              <input type="password" value={form.passwordConfirm} onChange={(e) => setForm({ ...form, passwordConfirm: e.target.value })} required
                className="w-full px-4 py-3 bg-[#111827] border border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none transition" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg font-medium transition">
              {loading ? "가입 중..." : "무료로 시작하기"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-gray-400">
            이미 계정이 있으신가요? <Link href="/login" className="text-blue-400 hover:underline">로그인</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

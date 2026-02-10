"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import type { ExchangeKey } from "@/types";


function TelegramSection() {
  const { user, updateUser } = useAuthStore();
  const [verifyCode, setVerifyCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [disconnecting, setDisconnecting] = useState(false);
  const isConnected = !!user?.telegram_chat_id;

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Poll /me every 3s while code is active to detect connection
  useEffect(() => {
    if (!verifyCode || countdown <= 0 || isConnected) return;
    const interval = setInterval(async () => {
      try {
        const me = await api.getMe();
        if (me.telegram_chat_id) {
          updateUser({ telegram_chat_id: me.telegram_chat_id });
          setVerifyCode(null);
          setCountdown(0);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [verifyCode, countdown, isConnected, updateUser]);

  const handleGenerateCode = async () => {
    setCodeLoading(true);
    try {
      const res = await api.generateTelegramCode();
      setVerifyCode(res.code);
      setCountdown(res.expires_in);
    } catch (err) {
      console.error("Failed to generate code:", err);
      alert("인증코드 발급에 실패했습니다.");
    } finally {
      setCodeLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("텔레그램 연동을 해제하시겠습니까? 알림을 받을 수 없게 됩니다.")) return;
    setDisconnecting(true);
    try {
      await api.disconnectTelegram();
      updateUser({ telegram_chat_id: null });
    } catch (err) {
      console.error("Failed to disconnect:", err);
      alert("연동 해제에 실패했습니다.");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <section className="bg-[#1a2332] border border-gray-800 rounded-xl p-6 space-y-4">
      <h2 className="text-lg font-bold text-gray-100">텔레그램 연동</h2>

      <div className="flex items-center gap-3">
        <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-green-400" : "bg-gray-600"}`} />
        <span className="text-sm text-gray-300">
          {isConnected ? "텔레그램 알림 연동 완료" : "텔레그램 미연동"}
        </span>
        {isConnected && (
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition ml-auto"
          >
            {disconnecting ? "해제 중..." : "연동 해제"}
          </button>
        )}
      </div>

      {!isConnected && (
        <div className="space-y-4">
          <div className="p-4 bg-[#111827] border border-gray-700 rounded-lg space-y-3">
            <h3 className="text-sm font-medium text-gray-200">연동 방법</h3>
            <ol className="space-y-2 text-sm text-gray-400">
              <li className="flex gap-2">
                <span className="text-blue-400 font-medium shrink-0">1.</span>
                <span>아래 &apos;인증코드 발급&apos; 버튼을 클릭합니다.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-medium shrink-0">2.</span>
                <span>텔레그램에서 <span className="text-blue-400 font-mono">@BitramBot</span>을 검색합니다.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-medium shrink-0">3.</span>
                <span>봇에게 <span className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-xs text-gray-300">/connect 인증코드</span> 를 보냅니다.</span>
              </li>
            </ol>
          </div>

          {verifyCode && countdown > 0 ? (
            <div className="p-4 bg-[#111827] border border-blue-500/30 rounded-lg text-center space-y-2">
              <div className="text-xs text-gray-400">인증코드 (5분 유효)</div>
              <div className="text-3xl font-mono font-bold text-blue-400 tracking-widest select-all">
                {verifyCode}
              </div>
              <div className="text-xs text-gray-500">
                텔레그램에서 <span className="font-mono text-gray-400">/connect {verifyCode}</span> 를 보내세요
              </div>
              <div className="text-xs text-gray-600">
                남은 시간: {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
              </div>
            </div>
          ) : (
            <button
              onClick={handleGenerateCode}
              disabled={codeLoading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {codeLoading ? "발급 중..." : "인증코드 발급"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default function SettingsPage() {
  const { user, updateUser } = useAuthStore();
  const [keys, setKeys] = useState<ExchangeKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  // Key form state
  const [keyAccessKey, setKeyAccessKey] = useState("");
  const [keySecretKey, setKeySecretKey] = useState("");
  const [keyLabel, setKeyLabel] = useState("");
  const [keySubmitting, setKeySubmitting] = useState(false);
  const [keyError, setKeyError] = useState("");

  // Nickname edit
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameValue, setNicknameValue] = useState(user?.nickname || "");

  const fetchKeys = useCallback(async () => {
    try {
      const result = await api.getKeys();
      setKeys(result);
    } catch (err) {
      console.error("Failed to fetch keys:", err);
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleRegisterKey = async () => {
    if (!keyAccessKey.trim() || !keySecretKey.trim()) {
      setKeyError("Access Key와 Secret Key를 모두 입력해주세요.");
      return;
    }
    setKeySubmitting(true);
    setKeyError("");
    try {
      await api.registerKey(keyAccessKey.trim(), keySecretKey.trim(), keyLabel.trim() || undefined);
      setKeyAccessKey("");
      setKeySecretKey("");
      setKeyLabel("");
      setShowKeyForm(false);
      await fetchKeys();
    } catch (err) {
      console.error("Failed to register key:", err);
      setKeyError("API 키 등록에 실패했습니다. 키를 다시 확인해주세요.");
    } finally {
      setKeySubmitting(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm("이 API 키를 삭제하시겠습니까? 이 키를 사용하는 봇이 중지됩니다.")) return;
    setDeletingKey(id);
    try {
      await api.deleteKey(id);
      await fetchKeys();
    } catch (err) {
      console.error("Failed to delete key:", err);
      alert("API 키 삭제에 실패했습니다.");
    } finally {
      setDeletingKey(null);
    }
  };

  const handleNicknameSave = async () => {
    if (!nicknameValue.trim() || nicknameValue.trim() === user?.nickname) {
      setEditingNickname(false);
      return;
    }
    try {
      // This would call an API to update nickname - using updateUser for local state
      updateUser({ nickname: nicknameValue.trim() });
      setEditingNickname(false);
    } catch (err) {
      console.error("Failed to update nickname:", err);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      <h1 className="text-2xl font-bold">설정</h1>

      {/* ───── Account Info ───── */}
      <section className="bg-[#1a2332] border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-100">계정 정보</h2>

        {/* Email */}
        <div className="flex items-center justify-between py-3 border-b border-gray-800">
          <div>
            <div className="text-xs text-gray-500 mb-0.5">이메일</div>
            <div className="text-sm text-gray-200">{user?.email}</div>
          </div>
        </div>

        {/* Nickname */}
        <div className="flex items-center justify-between py-3 border-b border-gray-800">
          <div className="flex-1">
            <div className="text-xs text-gray-500 mb-0.5">닉네임</div>
            {editingNickname ? (
              <div className="flex items-center gap-2">
                <input
                  value={nicknameValue}
                  onChange={(e) => setNicknameValue(e.target.value)}
                  className="px-2 py-1 bg-[#111827] border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleNicknameSave();
                    if (e.key === "Escape") setEditingNickname(false);
                  }}
                />
                <button onClick={handleNicknameSave} className="text-xs text-blue-400 hover:text-blue-300 transition">
                  저장
                </button>
                <button onClick={() => setEditingNickname(false)} className="text-xs text-gray-500 hover:text-gray-300 transition">
                  취소
                </button>
              </div>
            ) : (
              <div className="text-sm text-gray-200">{user?.nickname}</div>
            )}
          </div>
          {!editingNickname && (
            <button
              onClick={() => {
                setNicknameValue(user?.nickname || "");
                setEditingNickname(true);
              }}
              className="text-xs text-blue-400 hover:text-blue-300 transition"
            >
              변경
            </button>
          )}
        </div>

      </section>

      {/* ───── API Key Management ───── */}
      <section className="bg-[#1a2332] border border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-100">API 키 관리</h2>
          <button
            onClick={() => setShowKeyForm(!showKeyForm)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition"
          >
            {showKeyForm ? "취소" : "새 키 등록"}
          </button>
        </div>

        <p className="text-xs text-gray-500">
          업비트 API 키를 등록하여 자동매매를 시작하세요. Secret Key는 암호화되어 저장됩니다.
        </p>

        {/* Key registration form */}
        {showKeyForm && (
          <div className="p-4 bg-[#111827] border border-gray-700 rounded-lg space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">라벨 (선택)</label>
              <input
                value={keyLabel}
                onChange={(e) => setKeyLabel(e.target.value)}
                placeholder="예: 메인 계정"
                className="w-full px-3 py-2 bg-[#0a0e17] border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">Access Key *</label>
              <input
                value={keyAccessKey}
                onChange={(e) => setKeyAccessKey(e.target.value)}
                placeholder="업비트에서 발급받은 Access Key"
                className="w-full px-3 py-2 bg-[#0a0e17] border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">Secret Key *</label>
              <input
                type="password"
                value={keySecretKey}
                onChange={(e) => setKeySecretKey(e.target.value)}
                placeholder="업비트에서 발급받은 Secret Key"
                className="w-full px-3 py-2 bg-[#0a0e17] border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition font-mono"
              />
            </div>
            {keyError && <p className="text-xs text-red-400">{keyError}</p>}
            <button
              onClick={handleRegisterKey}
              disabled={keySubmitting}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {keySubmitting ? "등록 중..." : "API 키 등록"}
            </button>
          </div>
        )}

        {/* Key list */}
        {loadingKeys ? (
          <div className="text-sm text-gray-500 text-center py-4">로딩 중...</div>
        ) : keys.length === 0 ? (
          <div className="text-center py-6">
            <svg className="w-10 h-10 text-gray-700 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <p className="text-sm text-gray-500">등록된 API 키가 없습니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between p-3 bg-[#111827] border border-gray-800 rounded-lg"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${key.is_valid ? "bg-green-400" : "bg-red-400"}`} />
                  <div className="min-w-0">
                    <div className="text-sm text-gray-200 truncate">
                      {key.label || key.exchange}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{key.exchange}</span>
                      <span>{key.is_valid ? "유효" : "무효"}</span>
                      {key.last_verified_at && (
                        <span>확인: {new Date(key.last_verified_at).toLocaleDateString("ko-KR")}</span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteKey(key.id)}
                  disabled={deletingKey === key.id}
                  className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition shrink-0 ml-2"
                >
                  {deletingKey === key.id ? "삭제 중..." : "삭제"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ───── Telegram Connection ───── */}
      <TelegramSection />

    </div>
  );
}

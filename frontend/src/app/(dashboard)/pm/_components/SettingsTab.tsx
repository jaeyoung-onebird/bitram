"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { PMConnectionStatus } from "@/types";

type StoredKey = { id: string; label: string; is_valid: boolean; created_at: string };

export default function SettingsTab() {
  const [status, setStatus] = useState<PMConnectionStatus | null>(null);
  const [keys, setKeys] = useState<StoredKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [s, k] = await Promise.all([api.pmGetStatus(), api.pmGetKeys()]);
      setStatus(s);
      setKeys(k);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return <div className="text-center py-12 text-slate-400">Loading...</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Connection Status */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-5">
        <h2 className="font-semibold mb-4">연결 상태</h2>
        <div className="space-y-3">
          <StatusRow label="API 키 등록" ok={status?.has_api_key ?? false} />
          <StatusRow label="키 유효성" ok={status?.has_valid_key ?? false} />
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-slate-500">트레이딩 모드</span>
            <span className={`text-sm font-medium ${status?.paper_trading ? "text-yellow-600" : "text-green-600"}`}>
              {status?.paper_trading ? "Paper Trading (테스트)" : "Live Trading (실거래)"}
            </span>
          </div>
        </div>
        {!status?.has_api_key && (
          <p className="mt-3 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
            봇을 실행하려면 아래에서 Polymarket API 키를 등록해야 합니다.
          </p>
        )}
      </div>

      {/* Stored API Keys */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">등록된 API 키</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-lg transition-colors"
          >
            {showForm ? "취소" : "+ 키 등록"}
          </button>
        </div>

        {showForm && (
          <AddKeyForm
            onAdded={() => {
              setShowForm(false);
              fetchData();
            }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {keys.length === 0 && !showForm ? (
          <p className="text-sm text-slate-400 py-4 text-center">
            등록된 키가 없습니다. 위 버튼으로 Polymarket API 키를 등록하세요.
          </p>
        ) : (
          <div className="space-y-3">
            {keys.map((k) => (
              <KeyCard key={k.id} keyData={k} onRefresh={fetchData} />
            ))}
          </div>
        )}
      </div>

      {/* Setup Guide */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-5 text-sm text-slate-500">
        <h3 className="font-medium text-slate-600 dark:text-slate-300 mb-2">설정 가이드</h3>
        <ol className="list-decimal list-inside space-y-1.5">
          <li>polymarket.com &rarr; Settings &rarr; API Keys에서 키 생성</li>
          <li>API Key, Secret, Passphrase를 저장</li>
          <li>MetaMask에서 Polygon 지갑 Private Key 내보내기</li>
          <li>위 &ldquo;키 등록&rdquo; 버튼으로 등록</li>
          <li>Paper Trading 모드에서 테스트 후 Live로 전환</li>
        </ol>
      </div>
    </div>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`} />
        <span className={`text-sm ${ok ? "text-green-600" : "text-red-500"}`}>
          {ok ? "연결됨" : "미설정"}
        </span>
      </div>
    </div>
  );
}

function KeyCard({ keyData, onRefresh }: { keyData: StoredKey; onRefresh: () => void }) {
  const [verifying, setVerifying] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="flex items-center justify-between py-3 px-4 border border-slate-100 dark:border-slate-800 rounded-lg">
      <div className="flex items-center gap-3">
        <span className={`w-2.5 h-2.5 rounded-full ${keyData.is_valid ? "bg-green-500" : "bg-red-500"}`} />
        <div>
          <span className="text-sm font-medium">{keyData.label}</span>
          <p className="text-xs text-slate-400">
            {new Date(keyData.created_at).toLocaleDateString("ko-KR")} 등록
            {keyData.is_valid ? " · 유효" : " · 유효하지 않음"}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={async () => {
            setVerifying(true);
            try {
              const res = await api.pmVerifyKey(keyData.id);
              alert(res.is_valid ? "키가 유효합니다!" : "키가 유효하지 않습니다.");
              onRefresh();
            } catch {
              alert("검증에 실패했습니다.");
            } finally {
              setVerifying(false);
            }
          }}
          disabled={verifying}
          className="px-3 py-1.5 text-xs text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50"
        >
          {verifying ? "검증 중..." : "검증"}
        </button>
        <button
          onClick={async () => {
            if (!confirm("이 키를 삭제하시겠습니까?")) return;
            setDeleting(true);
            try {
              await api.pmDeleteKey(keyData.id);
              onRefresh();
            } catch {
              alert("삭제에 실패했습니다.");
            } finally {
              setDeleting(false);
            }
          }}
          disabled={deleting}
          className="px-3 py-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
        >
          {deleting ? "삭제 중..." : "삭제"}
        </button>
      </div>
    </div>
  );
}

function AddKeyForm({ onAdded, onCancel }: { onAdded: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    label: "Polymarket",
    api_key: "",
    api_secret: "",
    api_passphrase: "",
    private_key: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fields = [
    { key: "label" as const, label: "라벨 (구분용 이름)", type: "text", placeholder: "예: 내 메인 계정" },
    { key: "api_key" as const, label: "API Key", type: "password", placeholder: "Polymarket에서 발급받은 API Key" },
    { key: "api_secret" as const, label: "API Secret", type: "password", placeholder: "API Secret" },
    { key: "api_passphrase" as const, label: "API Passphrase", type: "password", placeholder: "API Passphrase" },
    { key: "private_key" as const, label: "Polygon Private Key", type: "password", placeholder: "MetaMask에서 내보낸 Private Key (0x...)" },
  ];

  const handleSubmit = async () => {
    if (!form.api_key || !form.api_secret || !form.api_passphrase) {
      alert("API Key, Secret, Passphrase는 필수입니다.");
      return;
    }
    setSubmitting(true);
    try {
      await api.pmRegisterKey(form);
      onAdded();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "키 등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-4 space-y-3 border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50/30 dark:bg-blue-900/10">
      <h3 className="text-sm font-medium text-blue-700 dark:text-blue-400">새 API 키 등록</h3>
      {fields.map((f) => (
        <div key={f.key}>
          <label className="block text-xs text-slate-500 mb-1">{f.label}</label>
          <input
            type={f.type}
            value={form[f.key]}
            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            placeholder={f.placeholder}
            className="w-full px-3 py-2 rounded-lg border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
      ))}
      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700">
          취소
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || !form.api_key}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          {submitting ? "등록 중..." : "등록"}
        </button>
      </div>
    </div>
  );
}

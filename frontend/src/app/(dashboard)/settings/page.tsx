"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { useToast } from "@/components/Toast";
import type { ExchangeKey, UserPointsInfo, PointLogItem, ReferralInfo, ReferralStats, NotificationPreferences } from "@/types";
import {
  User as UserIcon,
  Lock,
  Users,
  Activity,
  Key,
  Gift,
  MessageCircle,
  Trophy,
  Puzzle,
  Bot,
  ReceiptText,
  FileText,
  Bell,
  Mail,
  CheckCircle,
  Globe,
  ExternalLink,
} from "lucide-react";

/* ─────────────────────── Profile Section ─────────────────────── */
function ProfileSection() {
  const { user, updateUser } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(user?.nickname || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [socialTwitter, setSocialTwitter] = useState(user?.social_links?.twitter || "");
  const [socialGithub, setSocialGithub] = useState(user?.social_links?.github || "");
  const [socialBlog, setSocialBlog] = useState(user?.social_links?.blog || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resending, setResending] = useState(false);

  const handleSave = async () => {
    const nick = nickname.trim();
    if (!nick) {
      setError("닉네임을 입력해주세요.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const socialLinks: Record<string, string> = {};
      if (socialTwitter.trim()) socialLinks.twitter = socialTwitter.trim();
      if (socialGithub.trim()) socialLinks.github = socialGithub.trim();
      if (socialBlog.trim()) socialLinks.blog = socialBlog.trim();

      const res = await api.updateProfile({
        nickname: nick,
        avatar_url: avatarUrl.trim() || undefined,
        bio: bio.trim() || undefined,
        social_links: Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
      });
      updateUser({
        nickname: res.nickname,
        avatar_url: res.avatar_url,
        bio: res.bio,
        social_links: res.social_links,
      });
      setSuccess("프로필이 저장되었습니다.");
      setEditing(false);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "변경에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleResendVerification = async () => {
    setResending(true);
    setError("");
    try {
      await api.resendVerification();
      setSuccess("인증 메일이 재발송되었습니다. 이메일을 확인해주세요.");
      setTimeout(() => setSuccess(""), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "인증 메일 발송에 실패했습니다.");
    } finally {
      setResending(false);
    }
  };

  const startEditing = () => {
    setNickname(user?.nickname || "");
    setAvatarUrl(user?.avatar_url || "");
    setBio(user?.bio || "");
    setSocialTwitter(user?.social_links?.twitter || "");
    setSocialGithub(user?.social_links?.github || "");
    setSocialBlog(user?.social_links?.blog || "");
    setEditing(true);
    setError("");
  };

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">프로필</h2>
        </div>
        {!editing && (
          <button
            onClick={startEditing}
            className="text-sm text-blue-500 hover:text-blue-600 transition"
          >
            편집
          </button>
        )}
      </div>

      {success && (
        <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg text-xs text-emerald-600">{success}</div>
      )}
      {error && (
        <div className="p-2.5 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700 rounded-lg text-xs text-rose-600">{error}</div>
      )}

      {/* Email + Verification Status */}
      <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="text-sm text-slate-400 dark:text-slate-500 mb-0.5">이메일</div>
          <div className="flex items-center gap-2">
            <span className="text-base text-slate-700 dark:text-slate-200">{user?.email}</span>
            {user?.email_verified ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 text-xs font-medium rounded-full">
                <CheckCircle className="h-3 w-3" />
                인증됨
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-amber-600 dark:text-amber-400 text-xs font-medium rounded-full">
                <Mail className="h-3 w-3" />
                미인증
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!user?.email_verified && (
            <button
              onClick={handleResendVerification}
              disabled={resending}
              className="text-sm text-amber-500 hover:text-amber-600 disabled:opacity-50 transition"
            >
              {resending ? "발송 중..." : "재발송"}
            </button>
          )}
          <span className="text-sm text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">변경불가</span>
        </div>
      </div>

      {/* Nickname */}
      <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex-1">
          <div className="text-sm text-slate-400 dark:text-slate-500 mb-0.5">닉네임</div>
          {editing ? (
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={50}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-base text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition mt-1"
              placeholder="닉네임을 입력하세요"
            />
          ) : (
            <div className="text-base text-slate-700 dark:text-slate-200">{user?.nickname}</div>
          )}
        </div>
      </div>

      {/* Avatar URL */}
      <div className="py-3 border-b border-slate-100 dark:border-slate-800">
        <div className="text-sm text-slate-400 dark:text-slate-500 mb-0.5">아바타 URL</div>
        {editing ? (
          <div className="space-y-2 mt-1">
            <input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              maxLength={500}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-base text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition"
              placeholder="https://example.com/avatar.png"
            />
            <div className="text-xs text-slate-400 dark:text-slate-500 text-right">{avatarUrl.length}/500</div>
            {avatarUrl.trim() && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 dark:text-slate-500">미리보기:</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarUrl.trim()}
                  alt="아바타 미리보기"
                  className="w-12 h-12 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  onLoad={(e) => { (e.target as HTMLImageElement).style.display = "block"; }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {user?.avatar_url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={user.avatar_url}
                  alt="아바타"
                  className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <span className="text-sm text-slate-500 dark:text-slate-400 truncate max-w-xs">{user.avatar_url}</span>
              </>
            ) : (
              <span className="text-sm text-slate-400 dark:text-slate-500">설정되지 않음</span>
            )}
          </div>
        )}
      </div>

      {/* Bio */}
      <div className="py-3 border-b border-slate-100 dark:border-slate-800">
        <div className="text-sm text-slate-400 dark:text-slate-500 mb-0.5">자기소개</div>
        {editing ? (
          <div className="mt-1">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={200}
              rows={3}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-base text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition resize-none"
              placeholder="간단한 자기소개를 작성해주세요"
            />
            <div className={`text-xs text-right mt-1 ${bio.length >= 180 ? "text-amber-500" : "text-slate-400 dark:text-slate-500"}`}>
              {bio.length}/200
            </div>
          </div>
        ) : (
          <div className="text-base text-slate-700 dark:text-slate-200">
            {user?.bio || <span className="text-slate-400 dark:text-slate-500 text-sm">설정되지 않음</span>}
          </div>
        )}
      </div>

      {/* Social Links */}
      <div className="py-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Globe className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          <span className="text-sm text-slate-400 dark:text-slate-500">소셜 링크</span>
        </div>
        {editing ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500 dark:text-slate-400 w-16 shrink-0">Twitter</span>
              <input
                value={socialTwitter}
                onChange={(e) => setSocialTwitter(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition"
                placeholder="https://twitter.com/username"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500 dark:text-slate-400 w-16 shrink-0">GitHub</span>
              <input
                value={socialGithub}
                onChange={(e) => setSocialGithub(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition"
                placeholder="https://github.com/username"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500 dark:text-slate-400 w-16 shrink-0">Blog</span>
              <input
                value={socialBlog}
                onChange={(e) => setSocialBlog(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition"
                placeholder="https://blog.example.com"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {user?.social_links && Object.keys(user.social_links).length > 0 ? (
              Object.entries(user.social_links).map(([key, url]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 dark:text-slate-500 w-14 capitalize">{key}</span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-500 hover:text-blue-600 truncate flex items-center gap-1 transition"
                  >
                    {url}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
              ))
            ) : (
              <span className="text-sm text-slate-400 dark:text-slate-500">설정되지 않음</span>
            )}
          </div>
        )}
      </div>

      {/* Edit Actions */}
      {editing && (
        <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 transition">
            {saving ? "저장 중..." : "저장"}
          </button>
          <button onClick={() => setEditing(false)} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition">
            취소
          </button>
        </div>
      )}
    </section>
  );
}

/* ─────────────────────── Password Section ─────────────────────── */
function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [open, setOpen] = useState(false);

  const handleChange = async () => {
    setError("");
    if (newPw !== confirm) { setError("새 비밀번호가 일치하지 않습니다."); return; }
    if (newPw.length < 8) { setError("새 비밀번호는 8자 이상이어야 합니다."); return; }

    setLoading(true);
    try {
      await api.changePassword(current, newPw);
      setSuccess("비밀번호가 변경되었습니다.");
      setCurrent(""); setNewPw(""); setConfirm("");
      setOpen(false);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "변경에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">비밀번호 변경</h2>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} className="text-sm text-blue-500 hover:text-blue-600 transition">
            변경하기
          </button>
        )}
      </div>

      {success && (
        <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg text-xs text-emerald-600">{success}</div>
      )}

      {open && (
        <div className="space-y-3">
          {error && (
            <div className="p-2.5 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700 rounded-lg text-xs text-rose-600">{error}</div>
          )}
          <div>
            <label className="text-sm text-slate-400 dark:text-slate-500 mb-1 block">현재 비밀번호</label>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-base dark:text-slate-200 focus:outline-none focus:border-blue-500 transition" />
          </div>
          <div>
            <label className="text-sm text-slate-400 dark:text-slate-500 mb-1 block">새 비밀번호 (8자 이상)</label>
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-base dark:text-slate-200 focus:outline-none focus:border-blue-500 transition" />
          </div>
          <div>
            <label className="text-sm text-slate-400 dark:text-slate-500 mb-1 block">새 비밀번호 확인</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-base dark:text-slate-200 focus:outline-none focus:border-blue-500 transition"
              onKeyDown={(e) => e.key === "Enter" && handleChange()} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleChange} disabled={loading}
              className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-500 disabled:opacity-50 transition">
              {loading ? "변경 중..." : "비밀번호 변경"}
            </button>
            <button onClick={() => { setOpen(false); setError(""); setCurrent(""); setNewPw(""); setConfirm(""); }}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition">
              취소
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─────────────────── Follow Management Section ─────────────────── */
function FollowSection() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<"followers" | "following">("followers");
  const [followers, setFollowers] = useState<Array<{ user_id: string; nickname: string }>>([]);
  const [following, setFollowing] = useState<Array<{ user_id: string; nickname: string }>>([]);
  const [stats, setStats] = useState<{ follower_count: number; following_count: number } | null>(null);
  const [unfollowBusy, setUnfollowBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.getMyFollowStats().then(setStats).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user || loaded) return;
    Promise.all([
      api.getFollowers(user.id).catch(() => []),
      api.getFollowing(user.id).catch(() => []),
    ]).then(([f, g]) => {
      setFollowers(f);
      setFollowing(g);
      setLoaded(true);
    });
  }, [user, loaded]);

  const handleUnfollow = async (targetId: string) => {
    setUnfollowBusy(targetId);
    try {
      await api.unfollowUser(targetId);
      setFollowing((prev) => prev.filter((f) => f.user_id !== targetId));
      if (stats) setStats({ ...stats, following_count: Math.max(0, stats.following_count - 1) });
    } catch {}
    setUnfollowBusy(null);
  };

  const list = tab === "followers" ? followers : following;

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-blue-500" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">팔로워 / 팔로잉</h2>
      </div>

      {/* Stats */}
      <div className="flex gap-4">
        <button
          onClick={() => setTab("followers")}
          className={`text-center flex-1 p-3 rounded-xl border transition ${
            tab === "followers" ? "border-blue-200 bg-blue-50 dark:bg-blue-500/15 dark:border-blue-500/30" : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700"
          }`}
        >
          <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{stats?.follower_count ?? 0}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">팔로워</div>
        </button>
        <button
          onClick={() => setTab("following")}
          className={`text-center flex-1 p-3 rounded-xl border transition ${
            tab === "following" ? "border-blue-200 bg-blue-50 dark:bg-blue-500/15 dark:border-blue-500/30" : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700"
          }`}
        >
          <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{stats?.following_count ?? 0}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">팔로잉</div>
        </button>
      </div>

      {/* List */}
      <div className="max-h-64 overflow-y-auto space-y-1">
        {list.length === 0 ? (
          <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
            {tab === "followers" ? "아직 팔로워가 없습니다." : "아직 팔로잉한 유저가 없습니다."}
          </div>
        ) : (
          list.map((item) => (
            <div key={item.user_id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              <Link href={`/community/user/${item.user_id}`} className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-500 font-bold text-xs flex items-center justify-center shrink-0">
                  {item.nickname.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{item.nickname}</span>
              </Link>
              {tab === "following" && (
                <button
                  onClick={() => handleUnfollow(item.user_id)}
                  disabled={unfollowBusy === item.user_id}
                  className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-medium rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 disabled:opacity-50 transition shrink-0"
                >
                  {unfollowBusy === item.user_id ? "..." : "언팔로우"}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/* ──────────────────── Activity Stats Section ──────────────────── */
function ActivitySection() {
  const [stats, setStats] = useState<{
    post_count: number; strategy_count: number;
    bot_count: number; trade_count: number;
    plan: string; created_at: string;
  } | null>(null);

  useEffect(() => {
    api.getMyStats().then(setStats).catch(() => {});
  }, []);

  const items = stats ? [
    { icon: FileText, label: "작성 글", value: stats.post_count, href: "/community" },
    { icon: Puzzle, label: "전략", value: stats.strategy_count, href: "/strategies" },
    { icon: Bot, label: "봇", value: stats.bot_count, href: "/bots" },
    { icon: ReceiptText, label: "거래", value: stats.trade_count, href: "/trades" },
  ] : [];

  const joinDate = stats?.created_at
    ? new Date(stats.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-blue-500" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">내 활동</h2>
      </div>

      {stats ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-500/30 hover:bg-blue-50/50 dark:hover:bg-blue-500/10 transition text-center"
                >
                  <Icon className="h-5 w-5 text-slate-400 dark:text-slate-500 mx-auto mb-1.5" />
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{item.value}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{item.label}</div>
                </Link>
              );
            })}
          </div>
          {joinDate && (
            <div className="text-sm text-slate-500 dark:text-slate-400">
              가입일: <span className="font-medium text-slate-600 dark:text-slate-300">{joinDate}</span>
            </div>
          )}
        </>
      ) : (
        <div className="text-sm text-slate-500 dark:text-slate-400">로딩 중...</div>
      )}
    </section>
  );
}

/* ──────────────────── Points Guide Modal ──────────────────── */
const POINT_GUIDE = [
  { action: "login", label: "일일 로그인", points: 5, desc: "매일 로그인 시 1회 (한국시간 00시 기준)", icon: "🔑" },
  { action: "login_streak_7", label: "7일 연속 로그인", points: 50, desc: "7일 연속 로그인 달성 시 (1회)", icon: "🔥" },
  { action: "login_streak_30", label: "30일 연속 로그인", points: 200, desc: "30일 연속 로그인 달성 시 (1회)", icon: "💎" },
  { action: "post", label: "게시글 작성", points: 20, desc: "커뮤니티에 게시글 작성", icon: "📝" },
  { action: "first_post", label: "첫 게시글 작성", points: 30, desc: "첫 번째 게시글 작성 보너스 (1회)", icon: "🎉" },
  { action: "comment", label: "댓글 작성", points: 5, desc: "게시글에 댓글 작성", icon: "💬" },
  { action: "like_received", label: "좋아요 받기", points: 2, desc: "다른 유저로부터 좋아요를 받을 때", icon: "❤️" },
  { action: "strategy_shared", label: "전략 공유", points: 30, desc: "전략을 공개로 공유 (하루 1회)", icon: "📢" },
  { action: "strategy_copied", label: "전략 복사됨", points: 10, desc: "다른 유저가 내 전략을 복사", icon: "📋" },
  { action: "marketplace_copy", label: "마켓 전략 복사", points: 10, desc: "마켓에서 전략 복사 (하루 1회)", icon: "🛒" },
  { action: "first_backtest", label: "첫 백테스트", points: 50, desc: "첫 번째 백테스트 실행 (1회)", icon: "🧪" },
  { action: "backtest_run", label: "백테스트 실행", points: 5, desc: "백테스트 실행 (하루 최대 3회)", icon: "📊" },
  { action: "first_bot", label: "첫 봇 생성", points: 50, desc: "첫 번째 봇 생성 보너스 (1회)", icon: "🤖" },
  { action: "profit_shared", label: "수익 인증", points: 25, desc: "봇 수익을 커뮤니티에 공유", icon: "💰" },
  { action: "referral_inviter", label: "친구 초대 (추천인)", points: 100, desc: "초대한 친구가 가입 완료", icon: "🎁" },
  { action: "referral_invitee", label: "친구 초대 (가입자)", points: 50, desc: "추천 코드로 가입", icon: "🎊" },
  { action: "follower_milestone_10", label: "팔로워 10명", points: 100, desc: "팔로워 10명 돌파 (1회)", icon: "⭐" },
  { action: "follower_milestone_50", label: "팔로워 50명", points: 300, desc: "팔로워 50명 돌파 (1회)", icon: "🌟" },
  { action: "follower_milestone_100", label: "팔로워 100명", points: 500, desc: "팔로워 100명 돌파 (1회)", icon: "💫" },
  { action: "follower_milestone_500", label: "팔로워 500명", points: 1000, desc: "팔로워 500명 돌파 (1회)", icon: "👑" },
  { action: "follower_milestone_1000", label: "팔로워 1000명", points: 2000, desc: "팔로워 1000명 돌파 (1회)", icon: "🏆" },
];

const LEVEL_INFO = [
  { level: 1, name: "석탄", threshold: 0 },
  { level: 2, name: "아이언", threshold: 50 },
  { level: 3, name: "브론즈", threshold: 200 },
  { level: 4, name: "실버", threshold: 500 },
  { level: 5, name: "골드", threshold: 1000 },
  { level: 6, name: "플래티넘", threshold: 2000 },
  { level: 7, name: "사파이어", threshold: 5000 },
  { level: 8, name: "루비", threshold: 10000 },
  { level: 9, name: "에메랄드", threshold: 20000 },
  { level: 10, name: "다이아몬드", threshold: 50000 },
];

function PointsGuideModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"points" | "levels">("points");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[80vh] bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">포인트 & 레벨 안내</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 dark:border-slate-800">
          <button
            onClick={() => setTab("points")}
            className={`flex-1 py-3 text-sm font-medium transition ${
              tab === "points"
                ? "text-blue-500 border-b-2 border-blue-500"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            포인트 획득 항목
          </button>
          <button
            onClick={() => setTab("levels")}
            className={`flex-1 py-3 text-sm font-medium transition ${
              tab === "levels"
                ? "text-blue-500 border-b-2 border-blue-500"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            레벨 체계
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "points" ? (
            <div className="space-y-2">
              {POINT_GUIDE.map((item) => (
                <div key={item.action} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
                  <span className="text-xl shrink-0">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{item.label}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">{item.desc}</div>
                  </div>
                  <span className="text-sm font-bold text-blue-500 shrink-0">+{item.points}P</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {LEVEL_INFO.map((lv, i) => (
                <div key={lv.level} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
                  <span className="text-lg font-black text-blue-500 w-12 text-center shrink-0">Lv.{lv.level}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{lv.name}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">
                      {lv.threshold === 0 ? "시작" : `${lv.threshold.toLocaleString()}P 이상`}
                      {i < LEVEL_INFO.length - 1 && ` ~ ${(LEVEL_INFO[i + 1].threshold - 1).toLocaleString()}P`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────── Points Section ──────────────────── */
function PointsSection() {
  const [points, setPoints] = useState<UserPointsInfo | null>(null);
  const [history, setHistory] = useState<PointLogItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    api.getMyPoints().then(setPoints).catch(() => {});
  }, []);

  useEffect(() => {
    if (showHistory && history.length === 0) {
      api.getPointHistory().then(setHistory).catch(() => {});
    }
  }, [showHistory, history.length]);

  const progressPct = points
    ? points.next_threshold != null && points.next_threshold > 0
      ? Math.min(100, Math.round((points.total_points / points.next_threshold) * 100))
      : 100
    : 0;

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">포인트 & 레벨</h2>
        </div>
        <button
          onClick={() => setShowGuide(true)}
          className="text-sm text-blue-500 hover:text-blue-600 transition flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          점수 안내
        </button>
      </div>
      {points ? (
        <>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-blue-500">Lv.{points.level}</span>
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{points.level_name}</span>
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">{points.total_points.toLocaleString()} P</div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
              <span>다음 레벨까지</span>
              <span>{points.points_needed > 0 ? `${points.points_needed.toLocaleString()} P 남음` : "MAX"}</span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-sm text-blue-500 hover:text-blue-600 transition"
          >
            {showHistory ? "포인트 내역 닫기" : "포인트 내역 보기"}
          </button>
          {showHistory && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {history.length === 0 ? (
                <div className="text-xs text-slate-500 dark:text-slate-400">내역이 없습니다.</div>
              ) : (
                history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-slate-800 last:border-0">
                    <div className="min-w-0">
                      <div className="text-xs text-slate-700 dark:text-slate-200 truncate">{h.description}</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">{new Date(h.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</div>
                    </div>
                    <span className={`text-xs font-bold shrink-0 ml-2 ${h.points >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {h.points >= 0 ? "+" : ""}{h.points}P
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      ) : (
        <div className="text-sm text-slate-500 dark:text-slate-400">로딩 중...</div>
      )}
      {showGuide && <PointsGuideModal onClose={() => setShowGuide(false)} />}
    </section>
  );
}

/* ──────────────────── Referral Section ──────────────────── */
function ReferralSection() {
  const [referral, setReferral] = useState<ReferralInfo | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getReferralCode().then(setReferral).catch(() => {});
    api.getReferralStats().then(setStats).catch(() => {});
  }, []);

  const handleCopy = async () => {
    if (!referral) return;
    try {
      await navigator.clipboard.writeText(referral.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("링크를 복사하세요:", referral.link);
    }
  };

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-blue-500" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">친구 초대</h2>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">친구를 초대하면 추천인 100P, 가입자 50P를 받습니다.</p>
      {referral ? (
        <>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={referral.link}
              className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 font-mono"
            />
            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition shrink-0"
            >
              {copied ? "복사됨!" : "복사"}
            </button>
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            추천 코드: <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{referral.code}</span>
          </div>
        </>
      ) : (
        <div className="text-sm text-slate-500 dark:text-slate-400">로딩 중...</div>
      )}
      {stats && (
        <div className="flex items-center gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="text-center">
            <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{stats.total_referrals}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">총 초대</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-emerald-600">{stats.rewarded}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">보상 완료</div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ──────────────────── API Key Section ──────────────────── */
function ApiKeySection() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ExchangeKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [keyAccessKey, setKeyAccessKey] = useState("");
  const [keySecretKey, setKeySecretKey] = useState("");
  const [keyLabel, setKeyLabel] = useState("");
  const [keySubmitting, setKeySubmitting] = useState(false);
  const [keyError, setKeyError] = useState("");

  const fetchKeys = useCallback(async () => {
    try {
      setKeys(await api.getKeys());
    } catch {} finally {
      setLoadingKeys(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const handleRegister = async () => {
    if (!keyAccessKey.trim() || !keySecretKey.trim()) {
      setKeyError("Access Key와 Secret Key를 모두 입력해주세요.");
      return;
    }
    setKeySubmitting(true);
    setKeyError("");
    try {
      await api.registerKey(keyAccessKey.trim(), keySecretKey.trim(), keyLabel.trim() || undefined);
      setKeyAccessKey(""); setKeySecretKey(""); setKeyLabel("");
      setShowForm(false);
      await fetchKeys();
    } catch {
      setKeyError("API 키 등록에 실패했습니다. 키를 다시 확인해주세요.");
    } finally {
      setKeySubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 API 키를 삭제하시겠습니까? 이 키를 사용하는 봇이 중지됩니다.")) return;
    setDeletingKey(id);
    try {
      await api.deleteKey(id);
      await fetchKeys();
    } catch {
      toast("API 키 삭제에 실패했습니다.", "error");
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">API 키 관리</h2>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition"
        >
          {showForm ? "취소" : "새 키 등록"}
        </button>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">업비트 API 키를 등록하여 자동매매를 시작하세요. Secret Key는 암호화되어 저장됩니다.</p>

      {showForm && (
        <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-500 dark:text-slate-400">라벨 (선택)</label>
            <input value={keyLabel} onChange={(e) => setKeyLabel(e.target.value)} placeholder="예: 메인 계정"
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-base text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Access Key *</label>
            <input value={keyAccessKey} onChange={(e) => setKeyAccessKey(e.target.value)} placeholder="업비트에서 발급받은 Access Key"
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-base text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Secret Key *</label>
            <input type="password" value={keySecretKey} onChange={(e) => setKeySecretKey(e.target.value)} placeholder="업비트에서 발급받은 Secret Key"
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-base text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition font-mono" />
          </div>
          {keyError && <p className="text-xs text-red-500">{keyError}</p>}
          <button onClick={handleRegister} disabled={keySubmitting}
            className="w-full py-2 bg-blue-500 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition">
            {keySubmitting ? "등록 중..." : "API 키 등록"}
          </button>
        </div>
      )}

      {loadingKeys ? (
        <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">로딩 중...</div>
      ) : keys.length === 0 ? (
        <div className="text-center py-6">
          <Key className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-500 dark:text-slate-400">등록된 API 키가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((key) => (
            <div key={key.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${key.is_valid ? "bg-green-400" : "bg-red-400"}`} />
                <div className="min-w-0">
                  <div className="text-sm text-slate-700 dark:text-slate-200 truncate">{key.label || key.exchange}</div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{key.exchange}</span>
                    <span>{key.is_valid ? "유효" : "무효"}</span>
                    {key.last_verified_at && <span>확인: {new Date(key.last_verified_at).toLocaleDateString("ko-KR")}</span>}
                  </div>
                </div>
              </div>
              <button onClick={() => handleDelete(key.id)} disabled={deletingKey === key.id}
                className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 transition shrink-0 ml-2">
                {deletingKey === key.id ? "삭제 중..." : "삭제"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ──────────────────── Telegram Section ──────────────────── */
function TelegramSection() {
  const { toast } = useToast();
  const { user, updateUser } = useAuthStore();
  const [verifyCode, setVerifyCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [disconnecting, setDisconnecting] = useState(false);
  const isConnected = !!user?.telegram_chat_id;

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

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
    } catch {
      toast("인증코드 발급에 실패했습니다.", "error");
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
    } catch {
      toast("연동 해제에 실패했습니다.", "error");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-blue-500" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">텔레그램 연동</h2>
      </div>

      <div className="flex items-center gap-3">
        <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-green-400" : "bg-slate-300 dark:bg-slate-600"}`} />
        <span className="text-sm text-slate-600 dark:text-slate-300">
          {isConnected ? "텔레그램 알림 연동 완료" : "텔레그램 미연동"}
        </span>
        {isConnected && (
          <button onClick={handleDisconnect} disabled={disconnecting}
            className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 transition ml-auto">
            {disconnecting ? "해제 중..." : "연동 해제"}
          </button>
        )}
      </div>

      {!isConnected && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg space-y-3">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">연동 방법</h3>
            <ol className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
              <li className="flex gap-2">
                <span className="text-blue-500 font-medium shrink-0">1.</span>
                <span>아래 &apos;인증코드 발급&apos; 버튼을 클릭합니다.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-500 font-medium shrink-0">2.</span>
                <span>텔레그램에서 <span className="text-blue-500 font-mono">@BitramBot</span>을 검색합니다.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-500 font-medium shrink-0">3.</span>
                <span>봇에게 <span className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded font-mono text-xs text-slate-600 dark:text-slate-300">/connect 인증코드</span> 를 보냅니다.</span>
              </li>
            </ol>
          </div>
          {verifyCode && countdown > 0 ? (
            <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-blue-500/30 rounded-lg text-center space-y-2">
              <div className="text-xs text-slate-400 dark:text-slate-500">인증코드 (5분 유효)</div>
              <div className="text-3xl font-mono font-bold text-blue-500 tracking-widest select-all">{verifyCode}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                텔레그램에서 <span className="font-mono text-slate-400 dark:text-slate-500">/connect {verifyCode}</span> 를 보내세요
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                남은 시간: {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
              </div>
            </div>
          ) : (
            <button onClick={handleGenerateCode} disabled={codeLoading}
              className="w-full py-2.5 bg-blue-500 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition">
              {codeLoading ? "발급 중..." : "인증코드 발급"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/* ─────────────────── Notification Preferences Section ─────────────────── */
function NotificationPreferencesSection() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getNotificationPreferences()
      .then((data) => { setPrefs(data); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, []);

  const handleToggle = async (key: keyof NotificationPreferences) => {
    if (!prefs) return;
    const newValue = !prefs[key];
    setSaving(key);
    setError("");
    try {
      const updated = await api.updateNotificationPreferences({ [key]: newValue });
      setPrefs(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "설정 변경에 실패했습니다.");
    } finally {
      setSaving(null);
    }
  };

  const toggleItems: { key: keyof NotificationPreferences; label: string; desc: string }[] = [
    { key: "email_on_like", label: "좋아요 알림", desc: "내 게시글이나 댓글에 좋아요를 받으면 이메일로 알림" },
    { key: "email_on_comment", label: "댓글 알림", desc: "내 게시글에 새 댓글이 달리면 이메일로 알림" },
    { key: "email_on_follow", label: "팔로우 알림", desc: "새로운 팔로워가 생기면 이메일로 알림" },
    { key: "email_on_dm", label: "DM 알림", desc: "새 다이렉트 메시지가 오면 이메일로 알림" },
    { key: "email_weekly_digest", label: "주간 리포트", desc: "매주 활동 요약 및 인기 콘텐츠를 이메일로 수신" },
  ];

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5 text-blue-500" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">알림 설정</h2>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">이메일 알림 수신 여부를 설정합니다.</p>

      {error && (
        <div className="p-2.5 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700 rounded-lg text-xs text-rose-600">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500 dark:text-slate-400">로딩 중...</div>
      ) : prefs ? (
        <div className="space-y-1">
          {toggleItems.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.label}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500">{item.desc}</div>
              </div>
              <button
                onClick={() => handleToggle(item.key)}
                disabled={saving === item.key}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ml-3 ${
                  prefs[item.key]
                    ? "bg-blue-500"
                    : "bg-slate-200 dark:bg-slate-700"
                } ${saving === item.key ? "opacity-50" : ""}`}
                role="switch"
                aria-checked={prefs[item.key]}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    prefs[item.key] ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-slate-500 dark:text-slate-400">알림 설정을 불러올 수 없습니다.</div>
      )}
    </section>
  );
}

/* ──────────────────── Main Page ──────────────────── */
export default function SettingsPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">내정보</h1>

      <ProfileSection />
      <PasswordSection />
      <ActivitySection />
      <FollowSection />
      <PointsSection />
      <ReferralSection />
      <ApiKeySection />
      <TelegramSection />
      <NotificationPreferencesSection />
    </div>
  );
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

class ApiClient {
  private _token: string | null = null;

  setToken(token: string | null) {
    this._token = token;
  }

  private getToken(): string | null {
    if (this._token) return this._token;
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("bitram-auth");
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed?.state?.accessToken || null;
      }
    } catch {}
    return null;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_URL}${path}`, { ...options, headers });

    if (res.status === 401) {
      // Try refresh
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        headers["Authorization"] = `Bearer ${refreshed}`;
        const retry = await fetch(`${API_URL}${path}`, { ...options, headers });
        if (!retry.ok) throw new Error(await retry.text());
        return retry.json();
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem("bitram-auth");
        window.location.href = "/login";
      }
      throw new Error("Unauthorized");
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      const detail = err?.detail;
      if (detail && typeof detail === "object" && Array.isArray(detail.errors)) {
        throw new Error(detail.errors.join(", "));
      }
      throw new Error(
        typeof detail === "string"
          ? detail
          : err?.message || JSON.stringify(err)
      );
    }

    return res.json();
  }

  private async tryRefresh(): Promise<string | null> {
    try {
      const stored = localStorage.getItem("bitram-auth");
      if (!stored) return null;
      const { state } = JSON.parse(stored);
      if (!state?.refreshToken) return null;

      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: state.refreshToken }),
      });
      if (!res.ok) return null;

      const data = await res.json();
      const newState = { ...state, accessToken: data.access_token, refreshToken: data.refresh_token };
      localStorage.setItem("bitram-auth", JSON.stringify({ state: newState }));
      return data.access_token;
    } catch {
      return null;
    }
  }

  // ─── Auth ───────────────────────────────────────────────────────────
  register(email: string, password: string, nickname: string, referralCode?: string) {
    return this.request<{ access_token: string; refresh_token: string; user: { id: string; email: string; nickname: string; plan: string } }>("/api/auth/register", {
      method: "POST", body: JSON.stringify({ email, password, nickname, referral_code: referralCode || undefined }),
    });
  }
  login(email: string, password: string) {
    return this.request<{ access_token: string; refresh_token: string; user: { id: string; email: string; nickname: string; plan: string } }>("/api/auth/login", {
      method: "POST", body: JSON.stringify({ email, password }),
    });
  }
  getMe() {
    return this.request<import("@/types").User>("/api/auth/me");
  }
  updateProfile(data: { nickname?: string }) {
    return this.request<{ id: string; email: string; nickname: string; plan: string }>("/api/auth/profile", {
      method: "PATCH", body: JSON.stringify(data),
    });
  }
  changePassword(currentPassword: string, newPassword: string) {
    return this.request<{ ok: boolean; message: string }>("/api/auth/password", {
      method: "PATCH", body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
  }
  getMyStats() {
    return this.request<{ post_count: number; strategy_count: number; bot_count: number; trade_count: number; plan: string; created_at: string }>("/api/auth/my-stats");
  }
  getFollowers(userId: string, page = 1) {
    return this.request<Array<{ user_id: string; nickname: string }>>(`/api/follows/${userId}/followers?page=${page}`);
  }
  getFollowing(userId: string, page = 1) {
    return this.request<Array<{ user_id: string; nickname: string }>>(`/api/follows/${userId}/following?page=${page}`);
  }

  // ─── Keys ──────────────────────────────────────────────────────────
  registerKey(access_key: string, secret_key: string, label?: string) {
    return this.request("/api/keys", {
      method: "POST", body: JSON.stringify({ access_key, secret_key, label }),
    });
  }
  getKeys() {
    return this.request<import("@/types").ExchangeKey[]>("/api/keys");
  }
  deleteKey(id: string) {
    return this.request(`/api/keys/${id}`, { method: "DELETE" });
  }
  getBalance(id: string) {
    return this.request<{ krw: number; coins: unknown[] }>(`/api/keys/${id}/balance`);
  }

  // ─── Strategies ────────────────────────────────────────────────────
  getIndicators() {
    return this.request<import("@/types").IndicatorDef[]>("/api/strategies/indicators");
  }
  createStrategy(data: Record<string, unknown>) {
    return this.request<import("@/types").Strategy>("/api/strategies", {
      method: "POST", body: JSON.stringify(data),
    });
  }
  getStrategies() {
    return this.request<import("@/types").Strategy[]>("/api/strategies");
  }
  getStrategy(id: string) {
    return this.request<import("@/types").Strategy>(`/api/strategies/${id}`);
  }
  updateStrategy(id: string, data: Record<string, unknown>) {
    return this.request<import("@/types").Strategy>(`/api/strategies/${id}`, {
      method: "PUT", body: JSON.stringify(data),
    });
  }
  deleteStrategy(id: string) {
    return this.request(`/api/strategies/${id}`, { method: "DELETE" });
  }
  duplicateStrategy(id: string) {
    return this.request(`/api/strategies/${id}/duplicate`, { method: "POST" });
  }
  runBacktest(id: string, period: string = "3m", initial_capital: number = 10_000_000) {
    return this.request<import("@/types").BacktestResult>(`/api/strategies/${id}/backtest`, {
      method: "POST", body: JSON.stringify({ period, initial_capital }),
    });
  }
  aiGenerate(data: { pair: string; timeframe: string; style: string; provider?: string; count?: number }) {
    return this.request<import("@/types").AIGenerateResponse>("/api/strategies/ai-generate", {
      method: "POST", body: JSON.stringify(data),
    });
  }
  aiSave(data: { name: string; description: string; pair: string; timeframe: string; config_json: Record<string, unknown> }) {
    return this.request<import("@/types").Strategy>("/api/strategies/ai-save", {
      method: "POST", body: JSON.stringify(data),
    });
  }

  // ─── Bots ──────────────────────────────────────────────────────────
  createBot(data: { name: string; strategy_id: string; exchange_key_id: string; max_investment: number }) {
    return this.request<import("@/types").Bot>("/api/bots", {
      method: "POST", body: JSON.stringify(data),
    });
  }
  getBots() {
    return this.request<import("@/types").Bot[]>("/api/bots");
  }
  startBot(id: string) {
    return this.request(`/api/bots/${id}/start`, { method: "POST" });
  }
  stopBot(id: string) {
    return this.request(`/api/bots/${id}/stop`, { method: "POST" });
  }
  pauseBot(id: string) {
    return this.request(`/api/bots/${id}/pause`, { method: "POST" });
  }
  getBotTrades(id: string, page = 1) {
    return this.request<import("@/types").Trade[]>(`/api/bots/${id}/trades?page=${page}`);
  }

  // ─── Dashboard ─────────────────────────────────────────────────────
  getDashboard() {
    return this.request<import("@/types").DashboardOverview>("/api/dashboard/overview");
  }
  getPortfolio() {
    return this.request("/api/dashboard/portfolio");
  }
  getTopTraders(period: "week" | "month" | "all" = "week") {
    return this.request<import("@/types").TopTrader[]>(`/api/dashboard/top-traders?period=${period}`);
  }
  getHotStrategies() {
    return this.request<import("@/types").HotStrategy[]>("/api/dashboard/hot-strategies");
  }

  // ─── Follows ──────────────────────────────────────────────────────────
  followUser(user_id: string) {
    return this.request<{ ok: boolean; following: boolean }>(`/api/follows/${user_id}`, { method: "POST" });
  }
  unfollowUser(user_id: string) {
    return this.request<{ ok: boolean; following: boolean }>(`/api/follows/${user_id}`, { method: "DELETE" });
  }
  getMyFollowStats() {
    return this.request<{ follower_count: number; following_count: number }>("/api/follows/me");
  }
  getFeed() {
    return this.request<import("@/types").FeedItem[]>("/api/dashboard/feed");
  }
  getPlatformStats() {
    return this.request<import("@/types").PlatformStats>("/api/dashboard/platform-stats");
  }

  // ─── Admin ─────────────────────────────────────────────────────────
  getAdminOverview() {
    return this.request<import("@/types").AdminOverview>("/api/admin/overview");
  }

  // ─── Market ─────────────────────────────────────────────────────────
  getMarketQuotes(markets?: string[]) {
    const qs = new URLSearchParams();
    if (markets && markets.length > 0) {
      for (const m of markets) qs.append("markets", m);
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<{ quotes: import("@/types").MarketQuote[] }>(`/api/market/quotes${suffix}`);
  }

  // ─── Feeds ──────────────────────────────────────────────────────────
  getNews(limit: number = 12, translate: boolean = false) {
    return this.request<{ items: import("@/types").ExternalFeedItem[] }>(
      `/api/feeds/news?limit=${limit}&translate=${translate ? 1 : 0}`
    );
  }
  getXFeed(limit: number = 10, translate: boolean = true) {
    return this.request<{ items: import("@/types").ExternalFeedItem[]; configured: boolean }>(
      `/api/feeds/x?limit=${limit}&translate=${translate ? 1 : 0}`
    );
  }

  // ─── Community ─────────────────────────────────────────────────────
  getPosts(params: { category?: string; sort?: string; page?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.category) qs.set("category", params.category);
    if (params.sort) qs.set("sort", params.sort);
    if (params.page) qs.set("page", String(params.page));
    return this.request<import("@/types").PostListItem[]>(`/api/posts?${qs}`);
  }
  getPost(id: string) {
    return this.request<import("@/types").Post>(`/api/posts/${id}`);
  }
  createPost(data: { category: string; title: string; content: string; strategy_id?: string }) {
    return this.request<import("@/types").Post>("/api/posts", {
      method: "POST", body: JSON.stringify(data),
    });
  }
  deletePost(id: string) {
    return this.request(`/api/posts/${id}`, { method: "DELETE" });
  }
  toggleLike(id: string) {
    return this.request<{ liked: boolean }>(`/api/posts/${id}/like`, { method: "POST" });
  }
  toggleBookmark(id: string) {
    return this.request<{ bookmarked: boolean }>(`/api/posts/${id}/bookmark`, { method: "POST" });
  }
  getComments(postId: string) {
    return this.request<import("@/types").Comment[]>(`/api/posts/${postId}/comments`);
  }
  createComment(postId: string, content: string, parentId?: string) {
    return this.request(`/api/posts/${postId}/comments`, {
      method: "POST", body: JSON.stringify({ content, parent_id: parentId }),
    });
  }
  toggleCommentLike(postId: string, commentId: string) {
    return this.request<{ liked: boolean }>(`/api/posts/${postId}/comments/${commentId}/like`, { method: "POST" });
  }
  copyStrategyFromPost(postId: string) {
    return this.request(`/api/posts/${postId}/copy-strategy`, { method: "POST" });
  }
  getStrategyRanking(period: "week" | "month" | "all" = "all") {
    return this.request<import("@/types").StrategyRankingItem[]>(`/api/posts/ranking/strategies?period=${period}`);
  }

  // ─── Telegram ────────────────────────────────────────────────────
  generateTelegramCode() {
    return this.request<{ code: string; expires_in: number }>("/api/telegram/generate-code", {
      method: "POST",
    });
  }
  disconnectTelegram() {
    return this.request<{ status: string }>("/api/telegram/disconnect", {
      method: "POST",
    });
  }

  // ─── Trending & Profiles ──────────────────────────────────────────
  getTrending() {
    return this.request<import("@/types").TrendingPost[]>("/api/posts/trending");
  }
  getUserProfile(userId: string) {
    return this.request<import("@/types").UserProfile>(`/api/posts/user/${userId}/profile`);
  }

  // ─── Notifications ────────────────────────────────────────────────
  getNotifications(page = 1) {
    return this.request<import("@/types").Notification[]>(`/api/notifications?page=${page}`);
  }
  getUnreadCount() {
    return this.request<{ count: number }>("/api/notifications/unread-count");
  }
  markAllRead() {
    return this.request("/api/notifications/read-all", { method: "POST" });
  }
  markRead(id: string) {
    return this.request(`/api/notifications/${id}/read`, { method: "POST" });
  }

  // ─── Search ───────────────────────────────────────────────────────
  searchPosts(q: string, category?: string, page = 1) {
    const qs = new URLSearchParams({ q, page: String(page) });
    if (category) qs.set("category", category);
    return this.request<import("@/types").PostListItem[]>(`/api/search/posts?${qs}`);
  }
  searchUsers(q: string, page = 1) {
    return this.request<import("@/types").UserSearchResult[]>(`/api/search/users?q=${encodeURIComponent(q)}&page=${page}`);
  }

  // ─── Moderation ───────────────────────────────────────────────────
  report(target_type: string, target_id: string, reason: string, description?: string) {
    return this.request("/api/moderation/report", {
      method: "POST", body: JSON.stringify({ target_type, target_id, reason, description }),
    });
  }
  blockUser(userId: string) {
    return this.request(`/api/moderation/block/${userId}`, { method: "POST" });
  }
  unblockUser(userId: string) {
    return this.request(`/api/moderation/block/${userId}`, { method: "DELETE" });
  }

  // ─── Comments (edit/delete) ───────────────────────────────────────
  updateComment(postId: string, commentId: string, content: string) {
    return this.request<import("@/types").Comment>(`/api/posts/${postId}/comments/${commentId}`, {
      method: "PUT", body: JSON.stringify({ content }),
    });
  }
  deleteComment(postId: string, commentId: string) {
    return this.request(`/api/posts/${postId}/comments/${commentId}`, { method: "DELETE" });
  }

  // ─── Image Upload ────────────────────────────────────────────────
  async uploadImage(file: File): Promise<{ url: string }> {
    const token = this.getToken();
    const formData = new FormData();
    formData.append("file", file);
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/api/upload/image`, {
      method: "POST", headers, body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "업로드 실패" }));
      throw new Error(err.detail || "업로드 실패");
    }
    return res.json();
  }

  // ─── Badges ───────────────────────────────────────────────────────
  getUserBadges(userId: string) {
    return this.request<Array<{ type: string; label: string; awarded_at: string }>>(`/api/moderation/badges/${userId}`);
  }

  // ─── Onboarding ────────────────────────────────────────────────────
  getOnboardingStatus() {
    return this.request<import("@/types").OnboardingStatus>("/api/onboarding/status");
  }

  // ─── Points & Level ────────────────────────────────────────────────
  getMyPoints() {
    return this.request<import("@/types").UserPointsInfo>("/api/points/me");
  }
  getPointHistory(page = 1) {
    return this.request<import("@/types").PointLogItem[]>(`/api/points/history?page=${page}`);
  }
  getPointLeaderboard() {
    return this.request<import("@/types").PointLeaderboardItem[]>("/api/points/leaderboard");
  }

  // ─── Referral ──────────────────────────────────────────────────────
  getReferralCode() {
    return this.request<import("@/types").ReferralInfo>("/api/referral/my-code");
  }
  getReferralStats() {
    return this.request<import("@/types").ReferralStats>("/api/referral/stats");
  }

  // ─── Marketplace ──────────────────────────────────────────────────
  getMarketplace(params: { pair?: string; timeframe?: string; sort?: string; search?: string; page?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.pair) qs.set("pair", params.pair);
    if (params.timeframe) qs.set("timeframe", params.timeframe);
    if (params.sort) qs.set("sort", params.sort);
    if (params.search) qs.set("search", params.search);
    if (params.page) qs.set("page", String(params.page));
    return this.request<import("@/types").MarketplaceResponse>(`/api/marketplace?${qs}`);
  }

  // ─── Follow Feed ──────────────────────────────────────────────────
  getFollowingFeed(page = 1) {
    return this.request<import("@/types").FollowFeedItem[]>(`/api/feed/following?page=${page}`);
  }

  // ─── Competitions ─────────────────────────────────────────────────
  getCompetitions(status?: string) {
    const qs = status ? `?status=${status}` : "";
    return this.request<import("@/types").Competition[]>(`/api/competitions${qs}`);
  }
  joinCompetition(id: string) {
    return this.request(`/api/competitions/${id}/join`, { method: "POST" });
  }
  getCompetitionLeaderboard(id: string) {
    return this.request<import("@/types").CompetitionLeaderboardItem[]>(`/api/competitions/${id}/leaderboard`);
  }

  // ─── Bot Profit Share ─────────────────────────────────────────────
  shareBotProfit(botId: string) {
    return this.request<{ post_id: string; message: string }>(`/api/bots/${botId}/share-profit`, { method: "POST" });
  }
}

export const api = new ApiClient();

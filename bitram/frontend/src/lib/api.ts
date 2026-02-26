const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

class ApiClient {
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    const res = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: "include" });

    if (res.status === 401) {
      // Try refresh
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        const retry = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: "include" });
        if (!retry.ok) throw new Error(await retry.text());
        return retry.json();
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
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) return null;

      const data = await res.json();
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
  logout() {
    return this.request<{ ok: boolean }>("/api/auth/logout", {
      method: "POST",
    });
  }
  getWSToken() {
    return this.request<{ access_token: string }>("/api/auth/ws-token", {
      method: "POST",
    });
  }
  getChatHistory() {
    return this.request<{ messages: { nickname?: string; emoji?: string; content?: string; timestamp?: number }[] }>("/api/chat/history");
  }
  getChatInfo() {
    return this.request<{ online_count: number; message_count: number }>("/api/chat/info");
  }
  getMe() {
    return this.request<import("@/types").User>("/api/auth/me");
  }
  updateProfile(data: { nickname?: string; avatar_url?: string; bio?: string; social_links?: Record<string, string> }) {
    return this.request<{ id: string; email: string; nickname: string; plan: string; avatar_url: string | null; bio: string | null; social_links: Record<string, string> | null }>("/api/auth/profile", {
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
  getFollowSuggestions() {
    return this.request<Array<{ user_id: string; nickname: string; bio: string; post_count: number; strategy_count: number; follower_count: number }>>("/api/follows/suggestions");
  }
  getMyBookmarks(page = 1) {
    return this.request<{ items: Array<{ id: string; title: string; category: string; author_nickname: string; author_id: string; like_count: number; comment_count: number; view_count: number; created_at: string }>; total: number; page: number }>(`/api/posts/bookmarks/mine?page=${page}`);
  }
  getStrategyReviews(strategyId: string) {
    return this.request<{ reviews: Array<{ id: string; user_id: string; nickname: string; rating: number; comment: string; created_at: string }>; avg_rating: number | null; count: number }>(`/api/marketplace/${strategyId}/reviews`);
  }
  createStrategyReview(strategyId: string, rating: number, comment: string) {
    return this.request<{ ok: boolean }>(`/api/marketplace/${strategyId}/reviews`, {
      method: "POST", body: JSON.stringify({ rating, comment }),
    });
  }

  // ─── Email Verification & Password Reset ────────────────────────────
  verifyEmail(token: string) {
    return this.request<{ ok: boolean; message: string }>("/api/auth/verify-email", {
      method: "POST", body: JSON.stringify({ token }),
    });
  }
  resendVerification() {
    return this.request<{ ok: boolean; message: string }>("/api/auth/resend-verification", {
      method: "POST",
    });
  }
  forgotPassword(email: string) {
    return this.request<{ ok: boolean; message: string }>("/api/auth/forgot-password", {
      method: "POST", body: JSON.stringify({ email }),
    });
  }
  resetPassword(token: string, newPassword: string) {
    return this.request<{ ok: boolean; message: string }>("/api/auth/reset-password", {
      method: "POST", body: JSON.stringify({ token, new_password: newPassword }),
    });
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
    return this.request<{ items: import("@/types").ExternalFeedItem[]; configured: boolean; accounts?: Array<{ username: string; url: string }> }>(
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
  createPost(data: { category: string; title: string; content: string; strategy_id?: string; sub_community_id?: string; series_id?: string }) {
    return this.request<import("@/types").Post>("/api/posts", {
      method: "POST", body: JSON.stringify(data),
    });
  }
  updatePost(id: string, data: { title?: string; content?: string; series_id?: string | null }) {
    return this.request<import("@/types").Post>(`/api/posts/${id}`, {
      method: "PUT", body: JSON.stringify(data),
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
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_URL}/api/upload/image`, {
      method: "POST", body: formData, credentials: "include",
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

  // ─── Community Boards ──────────────────────────────────────────────
  getCommunities() {
    return this.request<import("@/types").CommunityBoard[]>("/api/communities");
  }
  getCommunity(slug: string) {
    return this.request<import("@/types").CommunityBoard>(`/api/communities/${slug}`);
  }
  getCommunityPosts(slug: string, page = 1) {
    return this.request<import("@/types").PostListItem[]>(`/api/communities/${slug}/posts?page=${page}`);
  }
  joinCommunity(slug: string) {
    return this.request<{ ok: boolean }>(`/api/communities/${slug}/join`, { method: "POST" });
  }
  leaveCommunity(slug: string) {
    return this.request<{ ok: boolean }>(`/api/communities/${slug}/leave`, { method: "DELETE" });
  }

  // ─── Sitemap ───────────────────────────────────────────────────────
  getSitemapPosts() {
    return this.request<Array<{ id: string; updated_at: string }>>("/api/posts/sitemap");
  }

  // ─── Reactions ──────────────────────────────────────────────────────
  toggleReaction(postId: string, emoji: string) {
    return this.request<{ reacted: boolean; emoji: string }>(`/api/posts/${postId}/react`, {
      method: "POST", body: JSON.stringify({ emoji }),
    });
  }
  getReactions(postId: string) {
    return this.request<import("@/types").ReactionCount[]>(`/api/posts/${postId}/reactions`);
  }

  // ─── Personalized Feed ─────────────────────────────────────────────
  getPersonalizedFeed(page = 1) {
    return this.request<import("@/types").PostListItem[]>(`/api/posts/personalized?page=${page}`);
  }

  // ─── DM ────────────────────────────────────────────────────────────
  getConversations() {
    return this.request<import("@/types").Conversation[]>("/api/dm/conversations");
  }
  createConversation(userId: string) {
    return this.request<import("@/types").Conversation>("/api/dm/conversations", {
      method: "POST", body: JSON.stringify({ user_id: userId }),
    });
  }
  getMessages(conversationId: string, page = 1) {
    return this.request<import("@/types").DirectMessage[]>(`/api/dm/conversations/${conversationId}/messages?page=${page}`);
  }
  sendMessage(conversationId: string, content: string) {
    return this.request<import("@/types").DirectMessage>(`/api/dm/conversations/${conversationId}/messages`, {
      method: "POST", body: JSON.stringify({ content }),
    });
  }
  markConversationRead(conversationId: string) {
    return this.request(`/api/dm/conversations/${conversationId}/read`, { method: "POST" });
  }
  getUnreadDMCount() {
    return this.request<{ count: number }>("/api/dm/unread-count");
  }

  // ─── Notification Preferences ──────────────────────────────────────
  getNotificationPreferences() {
    return this.request<import("@/types").NotificationPreferences>("/api/notifications/preferences");
  }
  updateNotificationPreferences(data: Partial<import("@/types").NotificationPreferences>) {
    return this.request<import("@/types").NotificationPreferences>("/api/notifications/preferences", {
      method: "PUT", body: JSON.stringify(data),
    });
  }

  // ─── Attendance ──────────────────────────────────────────────────────
  checkIn() {
    return this.request<import("@/types").AttendanceCheckInResult>("/api/attendance/check-in", { method: "POST" });
  }
  getAttendanceStatus() {
    return this.request<import("@/types").AttendanceStatus>("/api/attendance/status");
  }

  // ─── Daily Quests ──────────────────────────────────────────────────
  getDailyQuests() {
    return this.request<{ quests: import("@/types").DailyQuest[] }>("/api/quests/daily");
  }
  claimQuest(questId: string) {
    return this.request<{ ok: boolean; points: number }>(`/api/quests/claim/${questId}`, { method: "POST" });
  }

  // ─── Level Info ────────────────────────────────────────────────────
  async getLevelInfo(): Promise<import("@/types").LevelInfo> {
    const data = await this.request<{ current: import("@/types").LevelInfo }>("/api/points/level-info");
    return data.current;
  }

  // ─── Series ────────────────────────────────────────────────────────
  getSeries(page?: number) {
    return this.request<import("@/types").PostSeriesItem[]>(`/api/series?page=${page || 1}`);
  }
  getMySeries() {
    return this.request<import("@/types").PostSeriesItem[]>("/api/series/my");
  }
  getSeriesDetail(id: string) {
    return this.request<import("@/types").SeriesDetail>(`/api/series/${id}`);
  }
  createSeries(title: string, description: string) {
    return this.request<import("@/types").PostSeriesItem>("/api/series", {
      method: "POST", body: JSON.stringify({ title, description }),
    });
  }
  subscribeSeries(id: string) {
    return this.request<{ ok: boolean; subscribed: boolean }>(`/api/series/${id}/subscribe`, { method: "POST" });
  }

  // ─── Public Profile ────────────────────────────────────────────────
  getPublicProfile(nickname: string) {
    return this.request<import("@/types").PublicProfile>(`/api/auth/user/${nickname}`);
  }

  // ─── Moderation (Moderator+) ────────────────────────────────────────
  getModerationQueue(page = 1) {
    return this.request<{ total: number; items: import("@/types").ModerationQueueItem[] }>(`/api/moderation/queue?page=${page}`);
  }
  takeModerationAction(reportId: string, actionType: string, reason?: string) {
    return this.request<{ ok: boolean; message: string }>("/api/moderation/action", {
      method: "POST", body: JSON.stringify({ report_id: reportId, action_type: actionType, reason }),
    });
  }
  getModerationHistory(page = 1) {
    return this.request<import("@/types").ModerationActionItem[]>(`/api/moderation/actions/history?page=${page}`);
  }
  changeUserRole(userId: string, role: string) {
    return this.request<{ ok: boolean; message: string }>(`/api/moderation/admin/user/${userId}/role`, {
      method: "POST", body: JSON.stringify({ role }),
    });
  }

  // ─── Creator Program ──────────────────────────────────────────────
  getCreatorStatus() {
    return this.request<{
      score: number;
      components: { post_count: number; total_likes: number; strategy_copy_count: number; follower_count: number; score: number };
      tier: { name: string; key: string; badge_type: string; monthly_points: number; extra_bots: number; perks: string[] } | null;
      next_tier: { name: string; key: string; min_score: number; points_needed: number } | null;
      all_tiers: Array<{ name: string; key: string; min_score: number; perks: string[] }>;
      claimed_this_month: boolean;
    }>("/api/creator/status");
  }
  getTopCreators() {
    return this.request<Array<{
      rank: number; user_id: string; nickname: string; avatar_url: string | null;
      score: number; post_count: number; total_likes: number;
      strategy_copy_count: number; follower_count: number;
      tier: string | null; tier_name: string | null;
    }>>("/api/creator/top");
  }
  claimCreatorReward() {
    return this.request<{ ok: boolean; message: string; points_awarded?: number; tier?: string }>("/api/creator/claim", {
      method: "POST",
    });
  }
}

export const api = new ApiClient();

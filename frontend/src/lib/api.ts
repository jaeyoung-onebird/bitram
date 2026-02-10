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
  register(email: string, password: string, nickname: string) {
    return this.request<{ access_token: string; refresh_token: string; user: { id: string; email: string; nickname: string; plan: string } }>("/api/auth/register", {
      method: "POST", body: JSON.stringify({ email, password, nickname }),
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
  copyStrategyFromPost(postId: string) {
    return this.request(`/api/posts/${postId}/copy-strategy`, { method: "POST" });
  }
  getStrategyRanking() {
    return this.request("/api/posts/ranking/strategies");
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
    return this.request<import("@/types").PostListItem[]>("/api/posts/trending");
  }
  getUserProfile(userId: string) {
    return this.request<import("@/types").UserProfile>(`/api/posts/user/${userId}/profile`);
  }
}

export const api = new ApiClient();

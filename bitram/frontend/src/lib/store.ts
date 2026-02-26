import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  user: {
    id: string;
    email: string;
    nickname: string;
    plan: string;
    email_verified?: boolean;
    role?: string;
    avatar_url?: string | null;
    bio?: string | null;
    social_links?: Record<string, string> | null;
    telegram_chat_id?: string | null;
  } | null;
  isAuthenticated: boolean;
  setAuth: (user: AuthState["user"]) => void;
  updateUser: (data: Partial<NonNullable<AuthState["user"]>>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setAuth: (user) =>
        set({ user, isAuthenticated: true }),
      updateUser: (data) =>
        set((s) => ({ user: s.user ? { ...s.user, ...data } : null })),
      logout: () =>
        set({ user: null, isAuthenticated: false }),
    }),
    { name: "bitram-auth" }
  )
);

/* ─── Theme Store ──────────────────────────────────────────── */
type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "light",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "light" ? "dark" : "light" }),
    }),
    { name: "bitram-theme" }
  )
);

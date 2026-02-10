import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  user: { id: string; email: string; nickname: string; plan: string; telegram_chat_id?: string | null } | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: AuthState["user"], accessToken: string, refreshToken: string) => void;
  updateUser: (data: Partial<NonNullable<AuthState["user"]>>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken, isAuthenticated: true }),
      updateUser: (data) =>
        set((s) => ({ user: s.user ? { ...s.user, ...data } : null })),
      logout: () =>
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),
    }),
    { name: "bitram-auth" }
  )
);

import { create } from "zustand";
import { supabase } from "../lib/supabase";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
};

type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  setUser: (user: AuthUser | null) => void;
  setAccessToken: (token: string | null) => void;
  hydrate: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  loading: true,
  setUser: (user) => set({ user }),
  setAccessToken: (token) => set({ accessToken: token }),
  hydrate: async () => {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token ?? null;
    set({ accessToken, loading: false });
    const user = data.session?.user
      ? {
          id: data.session.user.id,
          email: data.session.user.email ?? "",
          name: data.session.user.user_metadata?.full_name || data.session.user.email || "User",
          avatar_url: data.session.user.user_metadata?.avatar_url || null,
        }
      : null;
    set({ user });
  },
  signInWithGoogle: async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, accessToken: null });
  },
}));

supabase.auth.onAuthStateChange(async (_event, session) => {
  const accessToken = session?.access_token ?? null;
  const user = session?.user
    ? {
        id: session.user.id,
        email: session.user.email ?? "",
        name: session.user.user_metadata?.full_name || session.user.email || "User",
        avatar_url: session.user.user_metadata?.avatar_url || null,
      }
    : null;

  useAuthStore.setState({ accessToken, user });
});

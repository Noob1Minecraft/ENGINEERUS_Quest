import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import type {
  AuthChangeEvent,
  Session,
  Subscription,
  User,
} from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { setApiAccessToken } from "../utils/api";

type AuthSnapshot = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

type AuthClient = {
  auth: {
    getSession: () => Promise<{ data: { session: Session | null }; error: Error | null }>;
    onAuthStateChange: (
      callback: (event: AuthChangeEvent, session: Session | null) => void,
    ) => { data: { subscription: Subscription } };
  };
};

export async function restoreAuthSession(
  client: AuthClient,
  onSnapshot: (snapshot: AuthSnapshot) => void,
): Promise<() => void> {
  let authEventReceived = false;
  const publishSnapshot = (source: string, snapshot: AuthSnapshot) => {
    console.info("[auth-token-trace]", {
      stage: "auth_snapshot_published",
      timestamp: new Date().toISOString(),
      source,
      hasSession: Boolean(snapshot.session),
      hasAccessToken: Boolean(snapshot.session?.access_token),
      hasUser: Boolean(snapshot.user),
    });
    setApiAccessToken(snapshot.session?.access_token ?? null);
    onSnapshot(snapshot);
  };

  const { data: listener } = client.auth.onAuthStateChange((event, session) => {
    authEventReceived = true;
    publishSnapshot(event, { session, user: session?.user ?? null, loading: false });
  });

  const { data, error } = await client.auth.getSession();
  if (error) {
    setApiAccessToken(null);
    listener.subscription.unsubscribe();
    throw error;
  }

  // Do not overwrite a newer auth event that arrived while getSession resolved.
  if (!authEventReceived) {
    publishSnapshot("GET_SESSION_FALLBACK", {
      session: data.session,
      user: data.session?.user ?? null,
      loading: false,
    });
  }

  return () => listener.subscription.unsubscribe();
}

type SignUpResult = { requiresEmailConfirmation: boolean };

type AuthContextValue = AuthSnapshot & {
  configured: boolean;
  signUp: (email: string, password: string, username: string) => Promise<SignUpResult>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase authentication is not configured.");
  }
  return supabase;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>({
    session: null,
    user: null,
    loading: isSupabaseConfigured,
  });

  useEffect(() => {
    if (!supabase) {
      setSnapshot({ session: null, user: null, loading: false });
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | undefined;

    restoreAuthSession(supabase, (nextSnapshot) => {
      if (active) setSnapshot(nextSnapshot);
    })
      .then((cleanup) => {
        if (active) unsubscribe = cleanup;
        else cleanup();
      })
      .catch(() => {
        if (active) setSnapshot({ session: null, user: null, loading: false });
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    ...snapshot,
    configured: isSupabaseConfigured,
    async signUp(email, password, username) {
      const client = requireSupabase();
      const normalizedUsername = username.trim();
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            username: normalizedUsername,
            display_name: normalizedUsername,
          },
        },
      });
      if (error) throw error;
      return { requiresEmailConfirmation: data.session === null };
    },
    async signInWithPassword(email, password) {
      const client = requireSupabase();
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    },
    async signInWithGoogle() {
      const client = requireSupabase();
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    },
    async signOut() {
      const client = requireSupabase();
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
  }), [snapshot]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}

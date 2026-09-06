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
import {
  hasPasswordRecoveryCallbackError,
  hasPasswordRecoveryIntent,
  readPasswordRecoveryMarker,
  removeAuthCallbackArtifacts,
  requestPasswordRecovery,
  resolvePasswordRecoveryStatus,
  updateRecoveredPassword,
  writePasswordRecoveryMarker,
  type PasswordRecoveryStatus,
} from "./passwordRecovery";

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
  onSnapshot: (snapshot: AuthSnapshot, event: AuthChangeEvent | null) => void,
): Promise<() => void> {
  let authEventReceived = false;
  const publishSnapshot = (snapshot: AuthSnapshot) => {
    setApiAccessToken(snapshot.session?.access_token ?? null);
    onSnapshot(snapshot, null);
  };

  const { data: listener } = client.auth.onAuthStateChange((event, session) => {
    authEventReceived = true;
    setApiAccessToken(session?.access_token ?? null);
    onSnapshot({ session, user: session?.user ?? null, loading: false }, event);
  });

  const { data, error } = await client.auth.getSession();
  if (error) {
    setApiAccessToken(null);
    listener.subscription.unsubscribe();
    throw error;
  }

  // Do not overwrite a newer auth event that arrived while getSession resolved.
  if (!authEventReceived) {
    publishSnapshot({
      session: data.session,
      user: data.session?.user ?? null,
      loading: false,
    });
  }

  return () => listener.subscription.unsubscribe();
}

type SignUpResult = { requiresEmailConfirmation: boolean };

type SignOutClient = {
  auth: {
    signOut: () => Promise<{ error: Error | null }>;
  };
};

export async function signOutAuthSession(
  client: SignOutClient,
  onSignedOut: () => void,
): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) throw error;

  setApiAccessToken(null);
  onSignedOut();
}

type AuthContextValue = AuthSnapshot & {
  configured: boolean;
  passwordRecoveryStatus: PasswordRecoveryStatus;
  signUp: (email: string, password: string, username: string) => Promise<SignUpResult>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  requestPasswordRecovery: (email: string) => Promise<void>;
  updateRecoveredPassword: (password: string) => Promise<void>;
  dismissPasswordRecovery: () => Promise<void>;
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
  const [passwordRecoveryStatus, setPasswordRecoveryStatus] = useState<PasswordRecoveryStatus>(() => {
    if (!isSupabaseConfigured || typeof window === 'undefined') return 'idle';
    if (hasPasswordRecoveryCallbackError(window.location)) return 'invalid';
    return hasPasswordRecoveryIntent(window.location)
      || readPasswordRecoveryMarker(window.sessionStorage)
      ? 'verifying'
      : 'idle';
  });

  useEffect(() => {
    if (!supabase) {
      setSnapshot({ session: null, user: null, loading: false });
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | undefined;

    restoreAuthSession(supabase, (nextSnapshot, event) => {
      if (!active) return;
      setSnapshot(nextSnapshot);

      const markerPresent = readPasswordRecoveryMarker(window.sessionStorage);
      const nextRecoveryStatus = resolvePasswordRecoveryStatus({
        event,
        session: nextSnapshot.session,
        intentPresent: hasPasswordRecoveryIntent(window.location),
        callbackErrorPresent: hasPasswordRecoveryCallbackError(window.location),
        markerPresent,
      });
      if (nextRecoveryStatus !== 'idle') {
        writePasswordRecoveryMarker(window.sessionStorage, nextRecoveryStatus === 'ready');
        setPasswordRecoveryStatus(nextRecoveryStatus);
      }
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
    passwordRecoveryStatus,
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
    async requestPasswordRecovery(email) {
      const client = requireSupabase();
      await requestPasswordRecovery(client, email, window.location.origin);
    },
    async updateRecoveredPassword(password) {
      const client = requireSupabase();
      await updateRecoveredPassword(client, password);
      writePasswordRecoveryMarker(window.sessionStorage, false);
      removeAuthCallbackArtifacts(window.location, window.history);
      setPasswordRecoveryStatus('updated');
    },
    async dismissPasswordRecovery() {
      const client = requireSupabase();
      if (passwordRecoveryStatus === 'ready'
        || (passwordRecoveryStatus === 'verifying' && snapshot.session)) {
        await signOutAuthSession(client, () => {
          setSnapshot({ session: null, user: null, loading: false });
        });
      }
      writePasswordRecoveryMarker(window.sessionStorage, false);
      removeAuthCallbackArtifacts(window.location, window.history);
      setPasswordRecoveryStatus('idle');
    },
    async signOut() {
      const client = requireSupabase();
      await signOutAuthSession(client, () => {
        setSnapshot({ session: null, user: null, loading: false });
      });
      writePasswordRecoveryMarker(window.sessionStorage, false);
      setPasswordRecoveryStatus('idle');
    },
  }), [passwordRecoveryStatus, snapshot]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}

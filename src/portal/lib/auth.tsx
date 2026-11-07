import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type AppRole, type Profile } from "./supabase";

interface Account {
  profile: Profile;
  role: AppRole;
}
interface AuthState {
  loading: boolean;
  session: Session | null;
  account: Account | null;
  loadError: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function loadAccount(userId: string): Promise<Account | null> {
  // The role is a column of profiles (users can read it but never write it).
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const profile = data as Profile;
  return { profile, role: profile.role };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    // Never call Supabase inside this callback; the effect below reacts to it.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setAccount(null);
        setLoadError(false);
        setLoading(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    void loadAccount(userId).then((next) => {
      if (cancelled) return;
      setAccount(next);
      setLoadError(next === null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const next = await loadAccount(userId);
    setAccount(next);
    setLoadError(next === null);
  }, [userId]);

  const signOut = useCallback(async () => {
    // Record the sign-out while the session is still valid, then end it.
    await supabase.rpc("log_auth_event", { p_event: "signed_out" });
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ loading, session, account, loadError, refresh, signOut }),
    [loading, session, account, loadError, refresh, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

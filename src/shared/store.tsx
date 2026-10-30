import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import type { Workspace } from "./types";
import { emptyWorkspace } from "./empty";
import { id } from "./domain";
import {
  diffWorkspace,
  type WorkspaceResponse,
  type WorkspaceUser,
} from "./access";
import { api, ApiError } from "./api";
import { uiLabel } from "./i18n";
import { SessionAccess } from "../application/SessionAccess";
import { BootScreen } from "../application/BootScreen";
import {
  applyPendingSync,
  clearPendingSync,
  pendingTargets,
  readPendingSync,
  writePendingSync,
  type PendingSync,
} from "./sync-queue";
type Store = {
  data: Workspace;
  update: (fn: (current: Workspace) => Workspace) => Promise<boolean>;
  toast: (message: string) => void;
  notice: string;
  storageError: string;
  user: WorkspaceUser | null;
  mode: "company";
  saving: boolean;
  /** Increments after every confirmed save or send; drives the saved glow. */
  savedCount: number;
  sync: {
    state: "synced" | "queued" | "syncing" | "conflict";
    pending: PendingSync | null;
    targets: { collection: string; id: string }[];
  };
  retrySync: () => Promise<boolean>;
  resolveSync: (choice: "server" | "local") => Promise<boolean>;
  openCompany: () => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  request: <T>(
    path: string,
    options?: { method?: string; body?: unknown },
  ) => Promise<T>;
  confirmAcceptance: (conversationId: string) => Promise<boolean>;
  confirmMessageSend: (
    conversationId: string,
    messageId: string,
  ) => Promise<boolean>;
};
const Context = createContext<Store | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Workspace>(() => emptyWorkspace(""));
  const current = useRef(data);
  const version = useRef(0);
  const csrf = useRef("");
  const [mode, setMode] = useState<"company">("company");
  const modeRef = useRef(mode);
  const [user, setUser] = useState<WorkspaceUser | null>(null);
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const markSaved = () => setSavedCount((count) => count + 1);
  const savingRef = useRef(false);
  const [syncState, setSyncState] = useState<
    "synced" | "queued" | "syncing" | "conflict"
  >("synced");
  const [pendingSync, setPendingSync] = useState<PendingSync | null>(null);
  const pendingRef = useRef<PendingSync | null>(null);
  const userRef = useRef<WorkspaceUser | null>(null);
  const [gate, setGate] = useState(false);
  // While a saved company session is restored, nothing else renders.
  // While a saved company session is restored, nothing else renders.
  const [booting, setBooting] = useState(true);
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const toast = useCallback((message: string) => {
    // Messages are shown in Spanish when the dictionary knows them.
    const text = uiLabel(message);
    setNotice(
      modeRef.current === "company"
        ? text
            .replaceAll("on this device", "to the company workspace")
            .replaceAll("locally", "in the workspace")
            .replaceAll("en este dispositivo", "en el espacio de empresa")
        : text,
    );
  }, []);
  const request: Store["request"] = useCallback(
    (path, options = {}) => api(path, { ...options, csrf: csrf.current }),
    [],
  );
  const receive = (response: WorkspaceResponse) => {
    current.current = response.workspace;
    version.current = response.revision;
    userRef.current = response.user;
    setData(response.workspace);
    setUser(response.user);
  };
  const showPending = (
    response: WorkspaceResponse,
    pending: PendingSync,
    state: "queued" | "conflict",
  ) => {
    current.current = applyPendingSync(response.workspace, pending);
    version.current = response.revision;
    userRef.current = response.user;
    pendingRef.current = pending;
    setData(current.current);
    setUser(response.user);
    setPendingSync(pending);
    setSyncState(state);
  };
  const forgetPending = async () => {
    clearPendingSync();
    pendingRef.current = null;
    setPendingSync(null);
    setSyncState("synced");
  };
  const refresh = async () => {
    if (pendingRef.current) {
      await retrySync();
      return;
    }
    try {
      receive(await request<WorkspaceResponse>("/workspace"));
      setStorageError("");
    } catch (err) {
      setStorageError((err as Error).message);
      if (err instanceof ApiError && err.status === 401) {
        await forgetPending();
        setGate(true);
        setInitialized(true);
      }
    }
  };
  const authenticated = async (_user: WorkspaceUser, token: string) => {
    csrf.current = token;
    const response = await request<WorkspaceResponse>("/workspace");
    const pending = await readPendingSync(response.user.id, token);
    if (pending)
      showPending(
        response,
        pending,
        response.revision === pending.baseRevision ? "queued" : "conflict",
      );
    else receive(response);
    modeRef.current = "company";
    setMode("company");
    setGate(false);
    setStorageError("");
  };
  // TEMPORARY: lets a dev build open an empty workspace while there is no
  // backend. Nothing is saved; remove together with the sign-in button.
  const enterWithoutBackend = () => {
    const temporary: WorkspaceUser = {
      id: "temporary-user",
      name: "Acceso temporal",
      email: "",
      role: "Administrator",
      isOwner: true,
      active: true,
      eventIds: [],
      sharedProposalIds: [],
    };
    current.current = emptyWorkspace("");
    userRef.current = temporary;
    setData(current.current);
    setUser(temporary);
    setGate(false);
  };
  const openCompany = async () => {
    setGate(true);
    setConnectionError("");
    try {
      const status = await api<{
        initialized: boolean;
        user: WorkspaceUser | null;
        csrf: string | null;
      }>("/session");
      setInitialized(status.initialized);
      if (status.user && status.csrf)
        await authenticated(status.user, status.csrf);
      else if (status.initialized) await forgetPending();
    } catch (error) {
      setInitialized(null);
      setConnectionError((error as Error).message);
    } finally {
      setBooting(false);
    }
  };
  useEffect(() => {
    // Earlier builds kept a demo workspace in this browser; remove it.
    try {
      localStorage.removeItem("kit.workspace.v1");
      localStorage.removeItem("kit.mode");
    } catch {
      /* Nothing to clean up when storage is unavailable. */
    }
    void openCompany();
  }, []);
  const signOut = async () => {
    if (pendingRef.current) {
      toast("Resolve or discard the pending company save before signing out.");
      return;
    }
    try {
      await request("/logout", { method: "POST", body: {} });
      csrf.current = "";
      userRef.current = null;
      setUser(null);
      current.current = emptyWorkspace("");
      setData(current.current);
      setStorageError("");
      setInitialized(true);
      setGate(true);
      toast("Signed out of the company workspace.");
    } catch (error) {
      setStorageError((error as Error).message);
    }
  };
  const update: Store["update"] = async (fn) => {
    if (savingRef.current) {
      toast(
        "A save is already in progress. Wait for it to finish before changing another record.",
      );
      return false;
    }
    if (pendingRef.current) {
      toast(
        "Resolve the pending company save before making another shared change.",
      );
      return false;
    }
    let next: Workspace | undefined;
    let changes: ReturnType<typeof diffWorkspace> = [];
    try {
      const before = current.current;
      next = fn(structuredClone(before));
      changes = diffWorkspace(before, next);
      if (!changes.length) return true;
      savingRef.current = true;
      setSaving(true);
      receive(
        await request<WorkspaceResponse>("/workspace", {
          method: "PATCH",
          body: { revision: version.current, changes },
        }),
      );
      setStorageError("");
      markSaved();
      return true;
    } catch (error) {
      if (
        next &&
        changes.length &&
        userRef.current &&
        error instanceof ApiError &&
        [0, 409].includes(error.status)
      ) {
        const pending: PendingSync = {
          id: id(),
          userId: userRef.current.id,
          baseRevision: version.current,
          changes,
          createdAt: new Date().toISOString(),
          attempts: 0,
          lastError: error.message,
        };
        try {
          await writePendingSync(userRef.current.id, csrf.current, pending);
          pendingRef.current = pending;
          setPendingSync(pending);
          setSyncState(error.status === 409 ? "conflict" : "queued");
          current.current = next;
          setData(next);
          setStorageError("");
          toast(
            error.status === 409
              ? "Your save is preserved for conflict review."
              : "Server unavailable. Your encrypted save is queued on this device.",
          );
          return true;
        } catch {
          setStorageError(
            "The server is unavailable and the encrypted local queue could not be written. Your draft remains open.",
          );
          return false;
        }
      }
      setStorageError((error as Error).message);
      toast("Changes were not saved. Review the error before trying again.");
      if (error instanceof ApiError && error.status === 401) {
        await forgetPending();
        setGate(true);
        setInitialized(true);
      }
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  async function retrySync() {
    const pending = pendingRef.current;
    if (!pending || savingRef.current) return !pending;
    savingRef.current = true;
    setSaving(true);
    setSyncState("syncing");
    try {
      const remote = await request<WorkspaceResponse>("/workspace");
      if (remote.revision !== pending.baseRevision) {
        showPending(remote, pending, "conflict");
        setStorageError(
          "Another session changed the company workspace. Review the pending records before choosing which version to keep.",
        );
        return false;
      }
      const saved = await request<WorkspaceResponse>("/workspace", {
        method: "PATCH",
        body: { revision: pending.baseRevision, changes: pending.changes },
      });
      await forgetPending();
      receive(saved);
      setStorageError("");
      markSaved();
      toast("Pending company changes synchronized.");
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await forgetPending();
        setGate(true);
        setInitialized(true);
        setStorageError("Your company access changed. Sign in again.");
        return false;
      }
      const attempted = {
        ...pending,
        attempts: pending.attempts + 1,
        lastError: (error as Error).message,
      };
      pendingRef.current = attempted;
      setPendingSync(attempted);
      setSyncState(
        error instanceof ApiError && error.status === 409
          ? "conflict"
          : "queued",
      );
      await writePendingSync(pending.userId, csrf.current, attempted);
      setStorageError((error as Error).message);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  async function resolveSync(choice: "server" | "local") {
    const pending = pendingRef.current;
    if (!pending || savingRef.current) return !pending;
    savingRef.current = true;
    setSaving(true);
    setSyncState("syncing");
    try {
      const remote = await request<WorkspaceResponse>("/workspace");
      if (choice === "server") {
        await forgetPending();
        receive(remote);
        setStorageError("");
        toast("Pending local changes discarded. Server records restored.");
        return true;
      }
      const saved = await request<WorkspaceResponse>("/workspace", {
        method: "PATCH",
        body: { revision: remote.revision, changes: pending.changes },
      });
      await forgetPending();
      receive(saved);
      setStorageError("");
      toast("Reviewed local changes applied to the latest server revision.");
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await forgetPending();
        setGate(true);
        setInitialized(true);
      } else setSyncState("conflict");
      setStorageError((error as Error).message);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const confirmAcceptance = async (conversationId: string) => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      receive(
        await request<WorkspaceResponse>(
          `/conversations/${encodeURIComponent(conversationId)}/accept`,
          { method: "POST", body: { revision: version.current } },
        ),
      );
      setStorageError("");
      markSaved();
      return true;
    } catch (error) {
      setStorageError((error as Error).message);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const confirmMessageSend = async (
    conversationId: string,
    messageId: string,
  ) => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      receive(
        await request<WorkspaceResponse>(
          `/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/send`,
          { method: "POST", body: { revision: version.current } },
        ),
      );
      setStorageError("");
      markSaved();
      toast("El canal confirmó el mensaje.");
      return true;
    } catch (error) {
      setStorageError((error as Error).message);
      await refresh();
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return (
    <Context.Provider
      value={{
        data,
        update,
        toast,
        notice,
        storageError,
        mode,
        user,
        saving,
        savedCount,
        sync: {
          state: syncState,
          pending: pendingSync,
          targets: pendingSync ? pendingTargets(pendingSync) : [],
        },
        retrySync,
        resolveSync,
        openCompany,
        signOut,
        refresh,
        request,
        confirmAcceptance,
        confirmMessageSend,
      }}
    >
      {booting ? (
        <BootScreen />
      ) : gate ? (
        <SessionAccess
          initialized={initialized}
          error={connectionError}
          retry={openCompany}
          authenticated={authenticated}
          enterWithoutBackend={
            import.meta.env.DEV ? enterWithoutBackend : undefined
          }
        />
      ) : (
        children
      )}
    </Context.Provider>
  );
}
export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("WorkspaceProvider is missing.");
  return context;
}
export function activity(title: string, detail: string, eventId?: string) {
  return { id: id(), title, detail, eventId, at: new Date().toISOString() };
}

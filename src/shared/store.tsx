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
import { createSeed } from "./seed";
import { acceptConversation, id } from "./domain";
import {
  diffWorkspace,
  type WorkspaceResponse,
  type WorkspaceUser,
} from "./access";
import { api, ApiError } from "./api";
import { SessionAccess } from "../application/SessionAccess";
import {
  applyPendingSync,
  clearPendingSync,
  pendingTargets,
  readPendingSync,
  writePendingSync,
  type PendingSync,
} from "./sync-queue";
const STORAGE_KEY = "kit.workspace.v1";
type Store = {
  data: Workspace;
  update: (fn: (current: Workspace) => Workspace) => Promise<boolean>;
  toast: (message: string) => void;
  notice: string;
  storageError: string;
  reset: () => void;
  user: WorkspaceUser | null;
  mode: "sample" | "company";
  saving: boolean;
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
function readSample(): Workspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (
        saved.schema === 1 &&
        [
          "events",
          "clients",
          "venues",
          "equipment",
          "proposals",
          "conversations",
          "tasks",
          "reservations",
          "layouts",
          "activity",
        ].every((k) => Array.isArray(saved[k])) &&
        saved.settings
      ) {
        saved.brandAssets ||= [];
        saved.creativeAssets ||= [];
        saved.packages ||= [];
        saved.maintenanceRecords ||= [];
        saved.operations ||= [];
        saved.automations ||= [];
        return saved;
      }
    }
  } catch {
    /* Sample data can be restored without touching company records. */
  }
  return createSeed();
}
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Workspace>(readSample);
  const current = useRef(data);
  const version = useRef(0);
  const csrf = useRef("");
  const [mode, setMode] = useState<"sample" | "company">("sample");
  const modeRef = useRef(mode);
  const [user, setUser] = useState<WorkspaceUser | null>(null);
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [syncState, setSyncState] = useState<
    "synced" | "queued" | "syncing" | "conflict"
  >("synced");
  const [pendingSync, setPendingSync] = useState<PendingSync | null>(null);
  const pendingRef = useRef<PendingSync | null>(null);
  const userRef = useRef<WorkspaceUser | null>(null);
  const [gate, setGate] = useState(false);
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const toast = useCallback(
    (message: string) =>
      setNotice(
        modeRef.current === "company"
          ? message
              .replaceAll("on this device", "to the company workspace")
              .replaceAll("locally", "in the workspace")
              .replaceAll("en este dispositivo", "en el espacio de empresa")
          : message,
      ),
    [],
  );
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
    if (modeRef.current === "sample") return;
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
    localStorage.setItem("kit.mode", "company");
    setGate(false);
    setStorageError("");
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
    }
  };
  useEffect(() => {
    if (localStorage.getItem("kit.mode") === "company") void openCompany();
  }, []);
  const sampleMode = () => {
    modeRef.current = "sample";
    setMode("sample");
    setUser(null);
    userRef.current = null;
    pendingRef.current = null;
    setPendingSync(null);
    setSyncState("synced");
    setGate(false);
    setStorageError("");
    current.current = readSample();
    setData(current.current);
    localStorage.setItem("kit.mode", "sample");
  };
  const signOut = async () => {
    if (pendingRef.current) {
      toast("Resolve or discard the pending company save before signing out.");
      return;
    }
    try {
      await request("/logout", { method: "POST", body: {} });
      csrf.current = "";
      sampleMode();
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
      if (modeRef.current === "sample") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        current.current = next;
        setData(next);
        setStorageError("");
        return true;
      }
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
    if (modeRef.current === "sample")
      return update((s) => acceptConversation(s, conversationId));
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
      if (modeRef.current === "sample") {
        const next = structuredClone(current.current);
        const conversation = next.conversations.find(
          (item) => item.id === conversationId,
        );
        const message = conversation?.messages.find(
          (item) => item.id === messageId,
        );
        if (!message || message.status !== "Draft") return false;
        const now = new Date().toISOString();
        Object.assign(message, {
          status: "Delivered" as const,
          channel: "Canal de demostración local",
          approvedAt: now,
          sentAt: now,
          providerMessageId: `showcase-${message.id}`,
        });
        const linkedProposal = message.proposalId
          ? next.proposals.find((item) => item.id === message.proposalId)
          : undefined;
        if (linkedProposal?.status === "Ready to send")
          linkedProposal.status = "Issued";
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        current.current = next;
        setData(next);
        toast(
          "Envío de demostración registrado. No se contactó a ningún cliente.",
        );
        return true;
      }
      receive(
        await request<WorkspaceResponse>(
          `/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/send`,
          { method: "POST", body: { revision: version.current } },
        ),
      );
      setStorageError("");
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
  const reset = () => {
    if (modeRef.current !== "sample") {
      toast("Sample reset is unavailable in the company workspace.");
      return;
    }
    void update(() => createSeed()).then((ok) => {
      if (ok) toast("Sample workspace restored.");
    });
  };
  return (
    <Context.Provider
      value={{
        data,
        update,
        toast,
        notice,
        storageError,
        reset,
        mode,
        user,
        saving,
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
      {gate ? (
        <SessionAccess
          initialized={initialized}
          error={connectionError}
          retry={openCompany}
          cancel={sampleMode}
          authenticated={authenticated}
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

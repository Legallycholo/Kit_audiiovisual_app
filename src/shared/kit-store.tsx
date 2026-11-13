import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWorkspace } from "./store";
import type { KitReference, KitStatus, KitThread } from "./kit";
type Summary = Omit<KitThread, "messages">;
interface KitStore {
  threads: Summary[];
  thread: KitThread | null;
  status: KitStatus;
  /** True once the company server reported whether AI is configured. */
  statusLoaded: boolean;
  draft: string;
  setDraft: (value: string) => void;
  refs: KitReference[];
  setRefs: (refs: KitReference[]) => void;
  error: string;
  busy: boolean;
  create: () => Promise<KitThread | undefined>;
  select: (id: string) => Promise<void>;
  /** Model chosen for the next messages ("" = the server default). */
  model: string;
  setModel: (id: string) => void;
  send: () => Promise<void>;
  stop: () => Promise<void>;
  /** Deletes a conversation (the open one when no id is given). */
  remove: (id?: string) => Promise<void>;
  /** Empties the open conversation but keeps it in the history. */
  restart: () => Promise<void>;
  update: (title: string, projectId: string | null) => Promise<void>;
}
const Context = createContext<KitStore | null>(null);
export function KitProvider({ children }: { children: ReactNode }) {
  const { mode, user } = useWorkspace();
  return <Session key={`${mode}:${user?.id || "sample"}`}>{children}</Session>;
}
function Session({ children }: { children: ReactNode }) {
  const { mode, user, request } = useWorkspace();
  const company = mode === "company";
  const key = `kit.chat.v1:${mode}:${user?.id || "sample"}`;
  const [local, setLocal] = useState<KitThread[]>(() => {
    if (company) return [];
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value)
        ? value
            .filter(
              (t) => typeof t.id === "string" && Array.isArray(t.messages),
            )
            .slice(0, 100)
        : [];
    } catch {
      return [];
    }
  });
  const [threads, setThreads] = useState<Summary[]>(local);
  const [thread, setThread] = useState<KitThread | null>(null);
  const current = useRef(thread);
  current.current = thread;
  const [active, setActive] = useState(() => {
    try {
      return localStorage.getItem(key + ":active") || "";
    } catch {
      return "";
    }
  });
  const activeRef = useRef(active);
  activeRef.current = active;
  const [status, setStatus] = useState<KitStatus>({
    configured: false,
    model: null,
    proposalConfigured: false,
    provider: company ? "Servidor de empresa" : "Modo de ejemplo",
    maxSources: 8,
  });
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModelState] = useState(() => {
    try {
      return localStorage.getItem("kit.chat.model") || "";
    } catch {
      return "";
    }
  });
  const setModel = (id: string) => {
    setModelState(id);
    try {
      localStorage.setItem("kit.chat.model", id);
    } catch {
      /* The choice just lasts for this tab. */
    }
  };
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [contexts, setContexts] = useState<Record<string, KitReference[]>>({});
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const draftKey = active || "new";
  const draft = drafts[draftKey] || "";
  const refs = contexts[draftKey] || [];
  const setDraft = (value: string) =>
    setDrafts((s) => ({ ...s, [draftKey]: value }));
  const setRefs = (value: KitReference[]) =>
    setContexts((s) => ({ ...s, [draftKey]: value.slice(0, 8) }));
  function accept(t: KitThread) {
    if (!mounted.current) return;
    setThreads((s) => [t, ...s.filter((x) => x.id !== t.id)]);
    if (activeRef.current === t.id) setThread(t);
    if (!company) setLocal((s) => [t, ...s.filter((x) => x.id !== t.id)]);
  }
  async function select(id: string) {
    setActive(id);
    activeRef.current = id;
    setThread(null);
    setError("");
    try {
      const t = company
        ? await request<KitThread>(`/kit/threads/${encodeURIComponent(id)}`)
        : local.find((t) => t.id === id);
      if (mounted.current && activeRef.current === id) setThread(t || null);
    } catch (e) {
      if (mounted.current) setError(String(e));
    }
  }
  useEffect(() => {
    try {
      localStorage.setItem(key + ":active", active);
    } catch {
      setError("No se pudo guardar la conversación activa.");
    }
  }, [active, key]);
  useEffect(() => {
    if (company) return;
    try {
      localStorage.setItem(key, JSON.stringify(local));
    } catch {
      setError(
        "No se pudo guardar el historial local. Exporta antes de cerrar.",
      );
    }
    setThreads(local);
  }, [local, company, key]);
  useEffect(() => {
    if (!company) {
      if (active) void select(active);
      return;
    }
    if (!user || user.role === "Client / Guest") return;
    let alive = true;
    void Promise.all([
      request<KitStatus>("/kit/status"),
      request<{ threads: Summary[] }>("/kit/threads"),
    ])
      .then(([status, result]) => {
        if (!alive) return;
        setStatus(status);
        setStatusLoaded(true);
        setThreads(result.threads);
        const id = result.threads.some((t) => t.id === activeRef.current)
          ? activeRef.current
          : result.threads[0]?.id;
        if (id) void select(id);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [company, user?.id]);
  useEffect(() => {
    if (!company || !active || !thread?.busy) return;
    let alive = true;
    const timer = setInterval(() => {
      void request<KitThread>(`/kit/threads/${encodeURIComponent(active)}`)
        .then((t) => {
          if (alive && activeRef.current === active) accept(t);
        })
        .catch((e) => {
          if (alive) {
            setError(String(e));
            clearInterval(timer);
          }
        });
    }, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [company, active, thread?.busy, request]);
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function create() {
    return run(async () => {
      if (threads.length >= 100) throw Error("Máximo 100 conversaciones.");
      const at = new Date().toISOString();
      const t = company
        ? await request<KitThread>("/kit/threads", { method: "POST", body: {} })
        : {
            id: crypto.randomUUID(),
            title: "Nueva conversación",
            projectId: null,
            createdAt: at,
            updatedAt: at,
            messages: [],
            busy: false,
          };
      if (!mounted.current) return t;
      setActive(t.id);
      activeRef.current = t.id;
      setThread(t);
      accept(t);
      return t;
    });
  }
  async function send() {
    const text = draft.trim();
    if (!text) return;
    const sendingRefs = refs;
    // Ignore a stored choice the server no longer offers.
    const chosenModel = status.models?.some((m) => m.id === model) ? model : "";
    let t = current.current;
    if (!t) {
      t = (await create()) || null;
    }
    if (!t) return;
    const target = t;
    await run(async () => {
      const messageId = crypto.randomUUID();
      let result: KitThread;
      if (company) {
        result = await request<KitThread>(
          `/kit/threads/${target.id}/messages`,
          {
            method: "POST",
            body: {
              requestId: messageId,
              text,
              refs: sendingRefs,
              ...(chosenModel ? { model: chosenModel } : {}),
            },
          },
        );
      } else {
        if (target.messages.length >= 100)
          throw Error("Máximo 100 mensajes. Crea otra conversación.");
        const at = new Date().toISOString();
        result = {
          ...target,
          title: target.messages.length ? target.title : text.slice(0, 80),
          updatedAt: at,
          messages: [
            ...target.messages,
            {
              id: messageId,
              role: "user",
              text,
              at,
              status: "completed",
              sources: [],
            },
            {
              id: crypto.randomUUID(),
              role: "assistant",
              text: "",
              at,
              status: "blocked",
              sources: [],
              error:
                "La IA no está conectada en modo de ejemplo. Abre el espacio de empresa para conversar con el proveedor configurado.",
            },
          ],
        };
      }
      accept(result);
      setDrafts((s) => ({ ...s, [draftKey]: "", [target.id]: "" }));
      setContexts((s) => ({ ...s, [target.id]: sendingRefs }));
    });
  }
  async function stop() {
    if (!thread || !company) return;
    const id = thread.id;
    await run(async () =>
      accept(
        await request<KitThread>(`/kit/threads/${id}/stop`, { method: "POST" }),
      ),
    );
  }
  async function restart() {
    if (!thread) return;
    const id = thread.id;
    await run(async () => {
      if (company)
        accept(
          await request<KitThread>(`/kit/threads/${id}/restart`, {
            method: "POST",
          }),
        );
      else
        accept({
          ...thread,
          messages: [],
          busy: false,
          updatedAt: new Date().toISOString(),
        });
    });
  }
  async function remove(targetId?: string) {
    const id = targetId ?? thread?.id;
    if (!id) return;
    await run(async () => {
      if (company) await request(`/kit/threads/${id}`, { method: "DELETE" });
      setLocal((s) => s.filter((t) => t.id !== id));
      setThreads((s) => s.filter((t) => t.id !== id));
      if (activeRef.current === id) {
        setThread(null);
        setActive("");
        activeRef.current = "";
      }
      setDrafts((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
      setContexts((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
    });
  }
  async function update(title: string, projectId: string | null) {
    if (!thread) return;
    const original = thread;
    await run(async () =>
      accept(
        company
          ? await request<KitThread>(`/kit/threads/${original.id}`, {
              method: "PATCH",
              body: { title, projectId },
            })
          : {
              ...original,
              title,
              projectId,
              updatedAt: new Date().toISOString(),
            },
      ),
    );
  }
  return (
    <Context.Provider
      value={{
        threads,
        thread,
        status,
        statusLoaded,
        draft,
        setDraft,
        refs,
        setRefs,
        error,
        busy,
        create,
        select,
        model,
        setModel,
        send,
        stop,
        remove,
        restart,
        update,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useKit() {
  const value = useContext(Context);
  if (!value) throw Error("KIT provider missing");
  return value;
}

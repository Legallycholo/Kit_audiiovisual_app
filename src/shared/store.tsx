import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Workspace } from "./types";
import { createSeed } from "./seed";
import { id } from "./domain";

const STORAGE_KEY = "kit.workspace.v1";
type Store = {
  data: Workspace;
  update: (fn: (current: Workspace) => Workspace) => void;
  toast: (message: string) => void;
  notice: string;
  storageError: string;
  reset: () => void;
};
const Context = createContext<Store | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [storageError, setStorageError] = useState("");
  const [data, setData] = useState<Workspace>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (
          saved.schema === 1 &&
          Array.isArray(saved.events) &&
          Array.isArray(saved.proposals)
        )
          return saved;
      }
    } catch {
      /* Recover with sample workspace; persistence errors remain visible on save. */
    }
    return createSeed();
  });
  const [notice, setNotice] = useState("");
  const toast = useCallback((message: string) => {
    setNotice(message);
  }, []);
  const update = useCallback((fn: (current: Workspace) => Workspace) => {
    setData((current) => {
      const next = fn(current);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setStorageError("");
      } catch {
        setStorageError(
          "Your browser could not save these changes. Keep this tab open and export a backup in Settings.",
        );
      }
      return next;
    });
  }, []);
  const reset = () => {
    update(() => createSeed());
    toast("Sample workspace restored.");
  };
  return (
    <Context.Provider
      value={{ data, update, toast, notice, storageError, reset }}
    >
      {children}
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

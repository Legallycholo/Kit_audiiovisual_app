import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "../../shared/store";
import type {
  DesignProject,
  DesignStatus,
  RoomImageUpload,
} from "../../shared/kit-design";

const POLL_MS = 2_500;

/**
 * KIT Design for one event, backed by the company server (/api/design).
 * While KIT Design is working the project is polled until the job finishes.
 */
export function useDesign(eventId: string) {
  const { request } = useWorkspace();
  const [project, setProject] = useState<DesignProject | null>(null);
  const [status, setStatus] = useState<DesignStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/design/events/${encodeURIComponent(eventId)}`;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const accept = useCallback((next: DesignProject) => {
    if (alive.current) setProject(next);
  }, []);
  const refreshStatus = useCallback(
    () =>
      request<DesignStatus>("/design/status")
        .then((s) => alive.current && setStatus(s))
        .catch(() => {}),
    [request],
  );

  useEffect(() => {
    setProject(null);
    setError("");
    request<DesignProject>(base)
      .then(accept)
      .catch((e) => alive.current && setError((e as Error).message));
    void refreshStatus();
  }, [base, request, accept, refreshStatus]);

  // Poll while a job runs; refresh the render allowance when it ends.
  const working = Boolean(project?.job);
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => {
      request<DesignProject>(base)
        .then((next) => {
          accept(next);
          if (!next.job) void refreshStatus();
        })
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [working, base, request, accept, refreshStatus]);

  /** Runs one server action; its error is shown and returned as false. */
  const act = useCallback(
    async (run: () => Promise<DesignProject>) => {
      setBusy(true);
      setError("");
      try {
        accept(await run());
        return true;
      } catch (e) {
        if (alive.current) setError((e as Error).message);
        return false;
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [accept],
  );

  return {
    project,
    status,
    error,
    busy,
    clearError: () => setError(""),
    /** Uploads one at a time: each request stays far below the 4.5 MB function limit. */
    upload: (images: RoomImageUpload[]) =>
      act(async () => {
        let last: DesignProject | null = null;
        for (const image of images)
          last = await request<DesignProject>(`${base}/images`, {
            method: "POST",
            body: image,
          });
        return last ?? (await request<DesignProject>(base));
      }),
    removeImage: (imageId: string) =>
      act(() =>
        request<DesignProject>(
          `${base}/images/${encodeURIComponent(imageId)}`,
          { method: "DELETE" },
        ),
      ),
    send: (text: string) =>
      act(() =>
        request<DesignProject>(`${base}/messages`, {
          method: "POST",
          body: { text },
        }),
      ),
    apply: () =>
      act(() => request<DesignProject>(`${base}/apply`, { method: "POST" })),
    discard: () =>
      act(() => request<DesignProject>(`${base}/discard`, { method: "POST" })),
    select: (versionId: string) =>
      act(() =>
        request<DesignProject>(`${base}/select`, {
          method: "POST",
          body: { versionId },
        }),
      ),
  };
}

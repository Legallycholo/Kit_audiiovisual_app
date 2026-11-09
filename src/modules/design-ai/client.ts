import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "../../shared/store";
import type {
  DesignProject,
  DesignStatus,
  DesignSummary,
  RoomImageUpload,
} from "../../shared/kit-design";

const POLL_MS = 2_500;

type Request = ReturnType<typeof useWorkspace>["request"];
const designPath = (id: string) => `/design/designs/${encodeURIComponent(id)}`;

/** Uploads one at a time: each request stays far below the 4.5 MB function limit. */
export async function uploadImages(
  request: Request,
  designId: string,
  images: RoomImageUpload[],
) {
  let last: DesignProject | null = null;
  for (const image of images)
    last = await request<DesignProject>(`${designPath(designId)}/images`, {
      method: "POST",
      body: image,
    });
  return last ?? (await request<DesignProject>(designPath(designId)));
}

/**
 * The designs ("chats") of one event, newest first, with create and delete.
 * `loaded` is false until the first answer so the page does not flash an empty state.
 */
export function useDesignHistory(eventId: string) {
  const { request } = useWorkspace();
  const [designs, setDesigns] = useState<DesignSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const refresh = useCallback(
    () =>
      request<{ designs: DesignSummary[] }>(
        `/design/events/${encodeURIComponent(eventId)}/designs`,
      )
        .then((r) => {
          if (!alive.current) return;
          setDesigns(r.designs);
          setLoaded(true);
        })
        .catch(() => alive.current && setLoaded(true)),
    [request, eventId],
  );
  useEffect(() => {
    setLoaded(false);
    void refresh();
  }, [refresh]);
  return {
    designs,
    loaded,
    refresh,
    /** "Nuevo diseño": an empty one already waiting is reused by the server. */
    create: async () => {
      const project = await request<DesignProject>(
        `/design/events/${encodeURIComponent(eventId)}/designs`,
        { method: "POST" },
      );
      await refresh();
      return project;
    },
    remove: async (designId: string) => {
      await request(designPath(designId), { method: "DELETE" });
      setDesigns((list) => list.filter((d) => d.id !== designId));
    },
  };
}

/**
 * One design, backed by the company server (/api/design). While KIT Design is
 * working the design is polled until the job finishes.
 */
export function useDesign(designId: string | null) {
  const { request } = useWorkspace();
  const [project, setProject] = useState<DesignProject | null>(null);
  const [status, setStatus] = useState<DesignStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
    if (!designId) return;
    request<DesignProject>(designPath(designId))
      .then(accept)
      .catch((e) => alive.current && setError((e as Error).message));
  }, [designId, request, accept]);
  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Poll while a job runs; refresh the allowances when it ends.
  const working = Boolean(project?.job);
  useEffect(() => {
    if (!working || !designId) return;
    const timer = setInterval(() => {
      request<DesignProject>(designPath(designId))
        .then((next) => {
          accept(next);
          if (!next.job) void refreshStatus();
        })
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [working, designId, request, accept, refreshStatus]);

  /** Runs one server action; its error is shown and returned as false. */
  const act = useCallback(
    async (run: (id: string) => Promise<DesignProject>) => {
      if (!designId) return false;
      setBusy(true);
      setError("");
      try {
        accept(await run(designId));
        return true;
      } catch (e) {
        if (alive.current) setError((e as Error).message);
        return false;
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [designId, accept],
  );

  return {
    project,
    status,
    error,
    busy,
    refreshStatus,
    clearError: () => setError(""),
    upload: (images: RoomImageUpload[]) =>
      act((id) => uploadImages(request, id, images)),
    removeImage: (imageId: string) =>
      act((id) =>
        request<DesignProject>(
          `${designPath(id)}/images/${encodeURIComponent(imageId)}`,
          { method: "DELETE" },
        ),
      ),
    send: (text: string) =>
      act((id) =>
        request<DesignProject>(`${designPath(id)}/messages`, {
          method: "POST",
          body: { text },
        }),
      ),
    createVideo: (renderId: string) =>
      act((id) =>
        request<DesignProject>(`${designPath(id)}/videos`, {
          method: "POST",
          body: { renderId },
        }),
      ),
    apply: () =>
      act((id) =>
        request<DesignProject>(`${designPath(id)}/apply`, { method: "POST" }),
      ),
    discard: () =>
      act((id) =>
        request<DesignProject>(`${designPath(id)}/discard`, { method: "POST" }),
      ),
    select: (versionId: string) =>
      act((id) =>
        request<DesignProject>(`${designPath(id)}/select`, {
          method: "POST",
          body: { versionId },
        }),
      ),
    restart: () =>
      act((id) =>
        request<DesignProject>(`${designPath(id)}/restart`, { method: "POST" }),
      ),
  };
}

import { randomUUID } from "node:crypto";
import type express from "express";
import { z } from "zod";
import { waitUntil } from "@vercel/functions";
import { canEditCollection, canSeeModule } from "../../src/shared/access";
import {
  MAX_ROOM_IMAGES,
  MIN_BRIEF_LENGTH,
  type DesignJob,
  type DesignProject,
  type DesignRender,
  type DesignSpec,
  type DesignStatus,
  type DesignVersion,
  type RoomImage,
} from "../../src/shared/kit-design";
import type { ProductionEvent, Workspace } from "../../src/shared/types";
import type { WorkspaceUser } from "../../src/shared/access";
import { HttpError, type Repository } from "../database";
import { ownsEvent } from "../permissions";
import { rateLimit, userOf } from "../security";
import { SAMPLE_NOTICE, sampleDesigner, type SpecDesigner } from "./designer";
import { fixtureRenderProvider, type RenderProvider } from "./render-provider";
import { databaseStorage, type DesignStorage } from "./storage";

export interface DesignConfig {
  /** Writes the spec. Default: the sample designer (no AI). */
  designer?: SpecDesigner;
  /** Paints the views. Default: the fixture (returns the photo unchanged). */
  renderer?: RenderProvider;
  /** Image bytes. Default: kit.design_files. */
  storage?: DesignStorage;
  /** Live renders allowed per calendar month (UTC), across the company. */
  monthlyRenderCap?: number;
}

type ProjectRow = {
  event_id: string;
  brief: string;
  current_version_id: string | null;
  pending_version_id: string | null;
  job: string | null;
  updated_at: string;
};
type ImageRow = {
  id: string;
  event_id: string;
  name: string;
  mime_type: RoomImage["mimeType"];
  width: number;
  height: number;
  file_path: string;
};
type VersionRow = {
  id: string;
  number: number;
  request: string;
  spec: string;
  created_at: string;
};
type RenderRow = {
  id: string;
  version_id: string;
  position: number;
  view_id: string;
  source_image_id: string;
  file_path: string;
  mime_type: string;
  provider: string;
};
type NewRender = Omit<RenderRow, "version_id"> & { bytes?: never };

const now = () => new Date().toISOString();
const monthStart = () => `${now().slice(0, 7)}-01T00:00:00.000Z`;
const extension = (mimeType: string) =>
  mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";

const uploadSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    dataUrl: z
      .string()
      .max(1_500_000)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
    width: z.number().int().positive().max(10_000),
    height: z.number().int().positive().max(10_000),
  })
  .strict()
  .refine(
    (value) => value.dataUrl.startsWith(`data:${value.mimeType};base64,`),
    "La imagen no coincide con su tipo.",
  );
const messageSchema = z
  .object({ text: z.string().trim().min(1).max(2000) })
  .strict();
const selectSchema = z
  .object({ versionId: z.string().min(1).max(100) })
  .strict();

/** Checks the file really is the image type it claims to be. */
function matchesType(bytes: Buffer, mimeType: string) {
  if (mimeType === "image/png")
    return bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return (
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  );
}

/**
 * KIT Design on the company server (plan: docs/kit_design_AI.md). One project
 * per event. The AI only proposes: a refinement becomes a pending version that
 * a person applies or discards, and nothing reaches a proposal from here.
 */
export class DesignAIService {
  readonly designer: SpecDesigner;
  readonly renderer: RenderProvider;
  readonly storage: DesignStorage;
  readonly cap: number;
  private jobs = new Map<
    string,
    { id: string; controller: AbortController; promise: Promise<void> }
  >();
  readonly ready: Promise<void>;

  constructor(
    readonly repo: Repository,
    config: DesignConfig = {},
    options: { resetBusyOnBoot?: boolean } = {},
  ) {
    this.designer = config.designer ?? sampleDesigner;
    this.renderer = config.renderer ?? fixtureRenderProvider;
    this.storage = config.storage ?? databaseStorage(repo);
    this.cap = Math.max(0, Math.floor(config.monthlyRenderCap ?? 100));
    // Same rule as KIT: a long-lived server starts with no jobs, so any left
    // "working" belong to a previous process. On serverless they age out instead.
    this.ready =
      (options.resetBusyOnBoot ?? true)
        ? this.interruptAll()
        : Promise.resolve();
    this.ready.catch(() => {});
  }

  /** Resolves when every background job on this instance has settled (tests, shutdown). */
  async idle() {
    while (this.jobs.size)
      await Promise.allSettled([...this.jobs.values()].map((j) => j.promise));
  }

  /* --------------------------------------------------------------------- */
  /* Reads                                                                 */
  /* --------------------------------------------------------------------- */

  private async row(eventId: string) {
    return (await this.repo.db
      .prepare("SELECT * FROM design_projects WHERE event_id=?")
      .get(eventId)) as ProjectRow | undefined;
  }

  private async ensureRow(eventId: string) {
    await this.repo.db
      .prepare(
        "INSERT INTO design_projects (event_id,brief,updated_at) VALUES (?,'',?) ON CONFLICT(event_id) DO NOTHING",
      )
      .run(eventId, now());
    return (await this.row(eventId))!;
  }

  private async images(eventId: string) {
    return (await this.repo.db
      .prepare("SELECT * FROM design_images WHERE event_id=? ORDER BY seq")
      .all(eventId)) as ImageRow[];
  }

  private async renders(versionId: string) {
    return (await this.repo.db
      .prepare(
        "SELECT * FROM design_renders WHERE version_id=? ORDER BY position",
      )
      .all(versionId)) as RenderRow[];
  }

  private async message(
    eventId: string,
    role: "user" | "assistant",
    text: string,
  ) {
    await this.repo.db
      .prepare(
        "INSERT INTO design_messages (id,event_id,role,text,created_at) VALUES (?,?,?,?,?)",
      )
      .run(randomUUID(), eventId, role, text, now());
  }

  /** Live renders made this month across the company. */
  async usage() {
    const row = (await this.repo.db
      .prepare(
        "SELECT COUNT(*) AS n FROM design_renders WHERE provider <> 'fixture' AND created_at >= ?",
      )
      .get(monthStart())) as { n: number | string };
    return Number(row.n);
  }

  async status(user: WorkspaceUser): Promise<DesignStatus> {
    return {
      designer: this.designer.label,
      renderer: this.renderer.name,
      usage: {
        month: now().slice(0, 7),
        renders: await this.usage(),
        cap: this.cap,
      },
      canEdit: canEditCollection(user, "layouts"),
    };
  }

  async project(eventId: string): Promise<DesignProject> {
    let row = await this.row(eventId);
    if (row) row = await this.reapStale(row);
    const base = `/api/design/events/${encodeURIComponent(eventId)}`;
    const images = (await this.images(eventId)).map((i): RoomImage => ({
      id: i.id,
      name: i.name,
      mimeType: i.mime_type,
      width: i.width,
      height: i.height,
      url: `${base}/images/${encodeURIComponent(i.id)}/file`,
    }));
    const versionRows = (await this.repo.db
      .prepare("SELECT * FROM design_versions WHERE event_id=? ORDER BY number")
      .all(eventId)) as VersionRow[];
    const renderRows = (await this.repo.db
      .prepare(
        "SELECT * FROM design_renders WHERE event_id=? ORDER BY position",
      )
      .all(eventId)) as RenderRow[];
    const versions = versionRows.map((v): DesignVersion => ({
      id: v.id,
      number: v.number,
      request: v.request,
      spec: JSON.parse(v.spec) as DesignSpec,
      createdAt: v.created_at,
      renders: renderRows
        .filter((r) => r.version_id === v.id)
        .map((r): DesignRender => ({
          id: r.id,
          viewId: r.view_id,
          sourceImageId: r.source_image_id,
          provider: r.provider,
          url: `${base}/renders/${encodeURIComponent(r.id)}/file`,
        })),
    }));
    const messages = (
      (await this.repo.db
        .prepare(
          "SELECT id,role,text,created_at FROM design_messages WHERE event_id=? ORDER BY seq",
        )
        .all(eventId)) as {
        id: string;
        role: "user" | "assistant";
        text: string;
        created_at: string;
      }[]
    ).map((m) => ({ id: m.id, role: m.role, text: m.text, at: m.created_at }));
    const pending = versions.find((v) => v.id === row?.pending_version_id);
    return {
      eventId,
      brief: row?.brief ?? "",
      images,
      versions: versions.filter((v) => v.id !== row?.pending_version_id),
      ...(row?.current_version_id
        ? { currentVersionId: row.current_version_id }
        : {}),
      ...(pending ? { pendingVersion: pending } : {}),
      messages,
      ...(row?.job ? { job: JSON.parse(row.job) as DesignJob } : {}),
    };
  }

  /* --------------------------------------------------------------------- */
  /* Jobs                                                                  */
  /* --------------------------------------------------------------------- */

  private async interruptAll() {
    const rows = (await this.repo.db
      .prepare("SELECT event_id FROM design_projects WHERE job IS NOT NULL")
      .all()) as { event_id: string }[];
    for (const { event_id } of rows) await this.interrupt(event_id);
  }

  private async interrupt(eventId: string) {
    await this.repo.transaction(async () => {
      await this.repo.db
        .prepare(
          "UPDATE design_projects SET job=NULL, updated_at=? WHERE event_id=?",
        )
        .run(now(), eventId);
      await this.message(
        eventId,
        "assistant",
        "El trabajo se interrumpió porque el servicio se detuvo. Puedes volver a pedirlo.",
      );
    });
  }

  /** A job older than any function can run, with no worker on this instance, was cut off. */
  private async reapStale(row: ProjectRow) {
    if (!row.job || this.jobs.has(row.event_id)) return row;
    const staleMs = Number(process.env.KIT_JOB_STALE_MS || 330_000);
    const job = JSON.parse(row.job) as DesignJob;
    if (Date.now() - Date.parse(job.startedAt) < staleMs) return row;
    await this.interrupt(row.event_id);
    return { ...row, job: null };
  }

  private start(
    user: WorkspaceUser,
    event: ProductionEvent,
    job: DesignJob,
    workspace: Workspace,
  ) {
    const controller = new AbortController();
    const written: string[] = [];
    const promise = (async () => {
      try {
        const result =
          job.kind === "create"
            ? await this.runCreate(
                event,
                job,
                workspace,
                written,
                controller.signal,
              )
            : await this.runRefine(
                event,
                job,
                workspace,
                written,
                controller.signal,
              );
        const number = await this.repo.transaction(async () => {
          const row = await this.row(event.id);
          if (!row?.job || (JSON.parse(row.job) as DesignJob).id !== job.id)
            throw new Error("job superseded");
          const last = (await this.repo.db
            .prepare(
              "SELECT MAX(number) AS n FROM design_versions WHERE event_id=?",
            )
            .get(event.id)) as { n: number | null };
          const number = Number(last.n ?? 0) + 1;
          const versionId = randomUUID();
          const at = now();
          await this.repo.db
            .prepare(
              "INSERT INTO design_versions (id,event_id,number,request,spec,created_by,created_at) VALUES (?,?,?,?,?,?,?)",
            )
            .run(
              versionId,
              event.id,
              number,
              job.request,
              JSON.stringify(result.spec),
              user.id,
              at,
            );
          for (const r of result.renders)
            await this.repo.db
              .prepare(
                "INSERT INTO design_renders (id,version_id,event_id,position,view_id,source_image_id,file_path,mime_type,provider,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
              )
              .run(
                r.id,
                versionId,
                event.id,
                r.position,
                r.view_id,
                r.source_image_id,
                r.file_path,
                r.mime_type,
                r.provider,
                at,
              );
          await this.repo.db
            .prepare(
              job.kind === "create"
                ? "UPDATE design_projects SET current_version_id=?, job=NULL, updated_at=? WHERE event_id=?"
                : "UPDATE design_projects SET pending_version_id=?, job=NULL, updated_at=? WHERE event_id=?",
            )
            .run(versionId, at, event.id);
          await this.message(
            event.id,
            "assistant",
            this.renderer.billable
              ? result.reply
              : `${result.reply} ${SAMPLE_NOTICE}`,
          );
          return number;
        });
        await this.repo.audit(
          user.id,
          job.kind === "create"
            ? "KIT Design created a design"
            : "KIT Design proposed a change",
          `Versión ${number} · ${result.renders.length} vistas · ${this.renderer.name}`,
          event.id,
        );
      } catch (error) {
        await this.storage.remove(written).catch(() => {});
        const reason =
          error instanceof HttpError
            ? error.message
            : "No se pudo completar el diseño. Puedes reintentar.";
        await this.repo
          .transaction(async () => {
            const row = await this.row(event.id);
            if (!row?.job || (JSON.parse(row.job) as DesignJob).id !== job.id)
              return;
            await this.repo.db
              .prepare(
                "UPDATE design_projects SET job=NULL, updated_at=? WHERE event_id=?",
              )
              .run(now(), event.id);
            await this.message(
              event.id,
              "assistant",
              `No pude completarlo: ${reason}`,
            );
          })
          .catch(() => {});
      } finally {
        if (this.jobs.get(event.id)?.id === job.id) this.jobs.delete(event.id);
      }
    })();
    this.jobs.set(event.id, { id: job.id, controller, promise });
    // On Vercel the function would freeze once the response is sent.
    if (process.env.VERCEL) {
      try {
        waitUntil(promise);
      } catch {
        /* Not inside a request context: the job runs on its own. */
      }
    }
  }

  private async load(path: string) {
    return this.storage.get(path);
  }

  private async saveRender(
    eventId: string,
    bytes: Buffer,
    mimeType: string,
    written: string[],
  ) {
    const id = randomUUID();
    const path = `${eventId}/renders/${id}.${extension(mimeType)}`;
    await this.storage.put(path, bytes, mimeType);
    written.push(path);
    return { id, path };
  }

  private async runCreate(
    event: ProductionEvent,
    job: DesignJob,
    workspace: Workspace,
    written: string[],
    signal: AbortSignal,
  ) {
    const rows = await this.images(event.id);
    const files = await Promise.all(rows.map((r) => this.load(r.file_path)));
    const { spec, reply } = await this.designer.create({
      brief: job.request,
      event: {
        name: event.name,
        type: event.type,
        attendees: event.attendees,
        date: event.date,
      },
      images: rows.map((r, i) => ({
        id: r.id,
        name: r.name,
        mimeType: r.mime_type,
        data: files[i].bytes.toString("base64"),
      })),
      catalog: workspace.equipment,
      signal,
    });
    const renders: NewRender[] = await Promise.all(
      spec.views.map(async (view, position) => {
        const index = rows.findIndex((r) => r.id === view.sourceImageId);
        if (index < 0)
          throw new HttpError(502, "Falta la imagen de una vista.");
        const out = await this.renderer.render({
          image: {
            bytes: files[index].bytes,
            mimeType: rows[index].mime_type,
            width: rows[index].width,
            height: rows[index].height,
          },
          prompt: view.prompt,
          signal,
        });
        const saved = await this.saveRender(
          event.id,
          out.bytes,
          out.mimeType,
          written,
        );
        return {
          id: saved.id,
          position,
          view_id: view.id,
          source_image_id: view.sourceImageId,
          file_path: saved.path,
          mime_type: out.mimeType,
          provider: this.renderer.name,
        };
      }),
    );
    return { spec, reply, renders };
  }

  private async runRefine(
    event: ProductionEvent,
    job: DesignJob,
    workspace: Workspace,
    written: string[],
    signal: AbortSignal,
  ) {
    const row = await this.row(event.id);
    const version = (await this.repo.db
      .prepare("SELECT * FROM design_versions WHERE id=?")
      .get(row?.current_version_id ?? "")) as VersionRow | undefined;
    if (!version)
      throw new HttpError(409, "No hay una versión actual que cambiar.");
    const current = await this.renders(version.id);
    const images = await this.images(event.id);
    const { spec, reply, editPrompt } = await this.designer.refine({
      request: job.request,
      spec: JSON.parse(version.spec) as DesignSpec,
      catalog: workspace.equipment,
      signal,
    });
    const renders: NewRender[] = await Promise.all(
      current.map(async (render) => {
        const source = images.find((i) => i.id === render.source_image_id);
        const file = await this.load(render.file_path);
        const out = await this.renderer.render({
          image: {
            bytes: file.bytes,
            mimeType: render.mime_type,
            width: source?.width ?? 1600,
            height: source?.height ?? 1200,
          },
          prompt: editPrompt,
          signal,
        });
        const saved = await this.saveRender(
          event.id,
          out.bytes,
          out.mimeType,
          written,
        );
        return {
          id: saved.id,
          position: render.position,
          view_id: render.view_id,
          source_image_id: render.source_image_id,
          file_path: saved.path,
          mime_type: out.mimeType,
          provider: this.renderer.name,
        };
      }),
    );
    return { spec, reply, renders };
  }

  /* --------------------------------------------------------------------- */
  /* Routes                                                                */
  /* --------------------------------------------------------------------- */

  private async access(res: express.Response, eventId: string, edit = false) {
    const user = userOf(res);
    if (!canSeeModule(user, "/design") || !ownsEvent(user, eventId))
      throw new HttpError(403, "No tienes acceso a este diseño.");
    if (edit && !canEditCollection(user, "layouts"))
      throw new HttpError(
        403,
        "Tu rol puede ver los diseños, pero no crearlos.",
      );
    const { workspace } = await this.repo.read();
    const event = workspace.events.find((e) => e.id === eventId);
    if (!event) throw new HttpError(404, "Evento no encontrado.");
    return { user, event, workspace };
  }

  mount(app: express.Express) {
    app.get("/api/design/status", async (_req, res) => {
      const user = userOf(res);
      if (!canSeeModule(user, "/design"))
        throw new HttpError(403, "No tienes acceso a Diseño.");
      res.json(await this.status(user));
    });

    app.get("/api/design/events/:eventId", async (req, res) => {
      await this.access(res, req.params.eventId);
      res.json(await this.project(req.params.eventId));
    });

    app.post("/api/design/events/:eventId/images", async (req, res) => {
      const { user, event } = await this.access(res, req.params.eventId, true);
      const input = uploadSchema.parse(req.body);
      const bytes = Buffer.from(input.dataUrl.split(",")[1], "base64");
      if (bytes.length > 1_100_000)
        throw new HttpError(413, "Cada imagen debe pesar 1 MB o menos.");
      if (!matchesType(bytes, input.mimeType))
        throw new HttpError(422, "El archivo no es una imagen válida.");
      const id = randomUUID();
      const path = `${event.id}/images/${id}.${extension(input.mimeType)}`;
      await this.repo.transaction(async () => {
        const row = await this.ensureRow(event.id);
        if (row.job)
          throw new HttpError(
            409,
            "KIT Design está trabajando en este diseño.",
          );
        if (row.current_version_id)
          throw new HttpError(
            409,
            "Las imágenes no se pueden cambiar después de crear el diseño.",
          );
        if ((await this.images(event.id)).length >= MAX_ROOM_IMAGES)
          throw new HttpError(
            409,
            `Solo se usan ${MAX_ROOM_IMAGES} imágenes por diseño.`,
          );
        await this.repo.db
          .prepare(
            "INSERT INTO design_images (id,event_id,name,mime_type,width,height,file_path,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
          )
          .run(
            id,
            event.id,
            input.name,
            input.mimeType,
            input.width,
            input.height,
            path,
            user.id,
            now(),
          );
      });
      try {
        await this.storage.put(path, bytes, input.mimeType);
      } catch {
        await this.repo.db
          .prepare("DELETE FROM design_images WHERE id=?")
          .run(id);
        throw new HttpError(502, "No se pudo guardar la imagen. Reintenta.");
      }
      res.status(201).json(await this.project(event.id));
    });

    app.delete(
      "/api/design/events/:eventId/images/:imageId",
      async (req, res) => {
        const { event } = await this.access(res, req.params.eventId, true);
        const path = await this.repo.transaction(async () => {
          const row = await this.ensureRow(event.id);
          if (row.job || row.current_version_id)
            throw new HttpError(
              409,
              "Las imágenes no se pueden cambiar después de crear el diseño.",
            );
          const image = (await this.images(event.id)).find(
            (i) => i.id === req.params.imageId,
          );
          if (!image) throw new HttpError(404, "Imagen no encontrada.");
          await this.repo.db
            .prepare("DELETE FROM design_images WHERE id=?")
            .run(image.id);
          return image.file_path;
        });
        await this.storage.remove([path]).catch(() => {});
        res.json(await this.project(event.id));
      },
    );

    const serveFile = async (
      res: express.Response,
      eventId: string,
      sql: string,
      id: string,
    ) => {
      await this.access(res, eventId);
      const row = (await this.repo.db.prepare(sql).get(id, eventId)) as
        { file_path: string } | undefined;
      if (!row) throw new HttpError(404, "Imagen no encontrada.");
      const file = await this.storage.get(row.file_path).catch(() => {
        throw new HttpError(404, "Imagen no encontrada.");
      });
      res
        .type(file.mimeType)
        .set("Cache-Control", "private, max-age=86400, immutable")
        .send(file.bytes);
    };
    app.get("/api/design/events/:eventId/images/:imageId/file", (req, res) =>
      serveFile(
        res,
        req.params.eventId,
        "SELECT file_path FROM design_images WHERE id=? AND event_id=?",
        req.params.imageId,
      ),
    );
    app.get("/api/design/events/:eventId/renders/:renderId/file", (req, res) =>
      serveFile(
        res,
        req.params.eventId,
        "SELECT file_path FROM design_renders WHERE id=? AND event_id=?",
        req.params.renderId,
      ),
    );

    // A message creates the first design, or proposes a change to the current one.
    app.post("/api/design/events/:eventId/messages", async (req, res) => {
      const { user, event, workspace } = await this.access(
        res,
        req.params.eventId,
        true,
      );
      const { text } = messageSchema.parse(req.body);
      await rateLimit(this.repo, `design:${user.id}`, 30);
      await rateLimit(this.repo, "design:company", 200);
      const job = await this.repo.transaction(async () => {
        const row = await this.reapStale(await this.ensureRow(event.id));
        if (row.job)
          throw new HttpError(
            409,
            "KIT Design ya está trabajando en este diseño.",
          );
        const images = await this.images(event.id);
        if (!images.length)
          throw new HttpError(
            409,
            "Primero sube al menos una imagen del salón.",
          );
        const first = !row.current_version_id;
        if (first && text.length < MIN_BRIEF_LENGTH)
          throw new HttpError(
            422,
            "Describe el evento con un poco más de detalle.",
          );
        if (row.pending_version_id)
          throw new HttpError(
            409,
            "Aplica o descarta el cambio pendiente antes de pedir otro.",
          );
        if (this.renderer.billable) {
          const needed = first
            ? images.length
            : (await this.renders(row.current_version_id!)).length;
          if ((await this.usage()) + needed > this.cap)
            throw new HttpError(
              429,
              `Se alcanzó el límite mensual de renders (${this.cap}). Pide a un administrador que lo amplíe.`,
            );
        }
        const job: DesignJob = {
          id: randomUUID(),
          kind: first ? "create" : "refine",
          request: text,
          startedAt: now(),
        };
        await this.repo.db
          .prepare(
            first
              ? "UPDATE design_projects SET job=?, brief=?, updated_at=? WHERE event_id=?"
              : "UPDATE design_projects SET job=?, updated_at=? WHERE event_id=?",
          )
          .run(
            ...(first
              ? [JSON.stringify(job), text, now(), event.id]
              : [JSON.stringify(job), now(), event.id]),
          );
        await this.message(event.id, "user", text);
        return job;
      });
      this.start(user, event, job, workspace);
      res.status(202).json(await this.project(event.id));
    });

    app.post("/api/design/events/:eventId/apply", async (req, res) => {
      const { user, event } = await this.access(res, req.params.eventId, true);
      const number = await this.repo.transaction(async () => {
        const row = await this.ensureRow(event.id);
        if (!row.pending_version_id)
          throw new HttpError(409, "No hay ningún cambio pendiente.");
        await this.repo.db
          .prepare(
            "UPDATE design_projects SET current_version_id=pending_version_id, pending_version_id=NULL, updated_at=? WHERE event_id=?",
          )
          .run(now(), event.id);
        const v = (await this.repo.db
          .prepare("SELECT number FROM design_versions WHERE id=?")
          .get(row.pending_version_id)) as { number: number };
        return v.number;
      });
      await this.repo.audit(
        user.id,
        "KIT Design change applied",
        `Versión ${number}`,
        event.id,
      );
      res.json(await this.project(event.id));
    });

    app.post("/api/design/events/:eventId/discard", async (req, res) => {
      const { event } = await this.access(res, req.params.eventId, true);
      const paths = await this.repo.transaction(async () => {
        const row = await this.ensureRow(event.id);
        if (!row.pending_version_id)
          throw new HttpError(409, "No hay ningún cambio pendiente.");
        const renders = await this.renders(row.pending_version_id);
        await this.repo.db
          .prepare(
            "UPDATE design_projects SET pending_version_id=NULL, updated_at=? WHERE event_id=?",
          )
          .run(now(), event.id);
        await this.repo.db
          .prepare("DELETE FROM design_versions WHERE id=?")
          .run(row.pending_version_id);
        return renders.map((r) => r.file_path);
      });
      await this.storage.remove(paths).catch(() => {});
      res.json(await this.project(event.id));
    });

    app.post("/api/design/events/:eventId/select", async (req, res) => {
      const { event } = await this.access(res, req.params.eventId, true);
      const { versionId } = selectSchema.parse(req.body);
      await this.repo.transaction(async () => {
        const row = await this.ensureRow(event.id);
        if (row.job || row.pending_version_id)
          throw new HttpError(
            409,
            "Aplica o descarta el cambio pendiente primero.",
          );
        const exists = await this.repo.db
          .prepare("SELECT id FROM design_versions WHERE id=? AND event_id=?")
          .get(versionId, event.id);
        if (!exists) throw new HttpError(404, "Versión no encontrada.");
        await this.repo.db
          .prepare(
            "UPDATE design_projects SET current_version_id=?, updated_at=? WHERE event_id=?",
          )
          .run(versionId, now(), event.id);
      });
      res.json(await this.project(event.id));
    });
  }
}

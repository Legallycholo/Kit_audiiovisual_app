import { randomUUID } from "node:crypto";
import type express from "express";
import { z } from "zod";
import { waitUntil } from "@vercel/functions";
import { canEditCollection, canSeeModule } from "../../src/shared/access";
import {
  MAX_ROOM_IMAGES,
  MIN_BRIEF_LENGTH,
  NEW_DESIGN_TITLE,
  designTitle,
  type DesignJob,
  type DesignProject,
  type DesignRender,
  type DesignSpec,
  type DesignStatus,
  type DesignSummary,
  type DesignVersion,
  type RoomImage,
} from "../../src/shared/kit-design";
import type { ProductionEvent, Workspace } from "../../src/shared/types";
import type { WorkspaceUser } from "../../src/shared/access";
import { HttpError, type Repository } from "../database";
import { ownsEvent } from "../permissions";
import { rateLimit, userOf } from "../security";
import { SAMPLE_NOTICE, sampleDesigner, type SpecDesigner } from "./designer";
import {
  fixtureRenderProvider,
  fixtureVideoProvider,
  videoPrompt,
  type RenderProvider,
  type VideoProvider,
} from "./render-provider";
import { databaseStorage, type DesignStorage } from "./storage";

export interface DesignConfig {
  /** Writes the spec. Default: the sample designer (no AI). */
  designer?: SpecDesigner;
  /** Paints the views. Default: the fixture (returns the photo unchanged). */
  renderer?: RenderProvider;
  /** Makes the 3D-looking fly-over videos. Default: a bundled sample clip. */
  videoRenderer?: VideoProvider;
  /** Image and video bytes. Default: kit.design_files. */
  storage?: DesignStorage;
  /** Live renders allowed per calendar month (UTC), across the company. */
  monthlyRenderCap?: number;
  /** Live videos allowed per calendar month (UTC), across the company. */
  monthlyVideoCap?: number;
}

type DesignRow = {
  id: string;
  event_id: string;
  title: string;
  brief: string;
  current_version_id: string | null;
  pending_version_id: string | null;
  job: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
type ImageRow = {
  id: string;
  design_id: string;
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
type VideoRow = {
  id: string;
  version_id: string;
  render_id: string;
  file_path: string;
  mime_type: string;
  provider: string;
};
type NewRender = Omit<RenderRow, "version_id">;

/** Most designs ("chats") one event can keep. */
const MAX_DESIGNS_PER_EVENT = 50;

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
const videoSchema = z.object({ renderId: z.string().min(1).max(100) }).strict();

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
 * KIT Design on the company server (plan: docs/kit_design_AI.md). An event keeps
 * many designs ("chats"); each has its own images, versions, videos and
 * conversation. The AI only proposes: a refinement becomes a pending version
 * that a person applies or discards, and nothing reaches a proposal from here.
 */
export class DesignAIService {
  readonly designer: SpecDesigner;
  readonly renderer: RenderProvider;
  readonly videoRenderer: VideoProvider;
  readonly storage: DesignStorage;
  readonly cap: number;
  readonly videoCap: number;
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
    this.videoRenderer = config.videoRenderer ?? fixtureVideoProvider;
    this.storage = config.storage ?? databaseStorage(repo);
    this.cap = Math.max(0, Math.floor(config.monthlyRenderCap ?? 100));
    this.videoCap = Math.max(0, Math.floor(config.monthlyVideoCap ?? 10));
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

  private async row(designId: string) {
    return (await this.repo.db
      .prepare("SELECT * FROM design_projects WHERE id=?")
      .get(designId)) as DesignRow | undefined;
  }

  private async images(designId: string) {
    return (await this.repo.db
      .prepare("SELECT * FROM design_images WHERE design_id=? ORDER BY seq")
      .all(designId)) as ImageRow[];
  }

  private async renders(versionId: string) {
    return (await this.repo.db
      .prepare(
        "SELECT * FROM design_renders WHERE version_id=? ORDER BY position",
      )
      .all(versionId)) as RenderRow[];
  }

  private async message(
    designId: string,
    eventId: string,
    role: "user" | "assistant",
    text: string,
  ) {
    await this.repo.db
      .prepare(
        "INSERT INTO design_messages (id,design_id,event_id,role,text,created_at) VALUES (?,?,?,?,?,?)",
      )
      .run(randomUUID(), designId, eventId, role, text, now());
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

  /** Live videos made this month across the company. */
  async videoUsage() {
    const row = (await this.repo.db
      .prepare(
        "SELECT COUNT(*) AS n FROM design_videos WHERE provider <> 'fixture' AND created_at >= ?",
      )
      .get(monthStart())) as { n: number | string };
    return Number(row.n);
  }

  async status(user: WorkspaceUser): Promise<DesignStatus> {
    const month = now().slice(0, 7);
    return {
      designer: this.designer.label,
      renderer: this.renderer.name,
      usage: { month, renders: await this.usage(), cap: this.cap },
      videoRenderer: this.videoRenderer.name,
      videoUsage: {
        month,
        videos: await this.videoUsage(),
        cap: this.videoCap,
      },
      canEdit: canEditCollection(user, "layouts"),
    };
  }

  /** An event's designs, newest first. */
  async list(eventId: string): Promise<DesignSummary[]> {
    const rows = (await this.repo.db
      .prepare(
        "SELECT id,title,updated_at,job FROM design_projects WHERE event_id=? ORDER BY updated_at DESC, created_at DESC",
      )
      .all(eventId)) as Pick<
      DesignRow,
      "id" | "title" | "updated_at" | "job"
    >[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title || NEW_DESIGN_TITLE,
      updatedAt: r.updated_at,
      working: r.job !== null,
    }));
  }

  async project(designId: string): Promise<DesignProject> {
    let row = await this.row(designId);
    if (!row) throw new HttpError(404, "Diseño no encontrado.");
    row = await this.reapStale(row);
    const base = `/api/design/designs/${encodeURIComponent(designId)}`;
    const images = (await this.images(designId)).map((i): RoomImage => ({
      id: i.id,
      name: i.name,
      mimeType: i.mime_type,
      width: i.width,
      height: i.height,
      url: `${base}/images/${encodeURIComponent(i.id)}/file`,
    }));
    const versionRows = (await this.repo.db
      .prepare(
        "SELECT * FROM design_versions WHERE design_id=? ORDER BY number",
      )
      .all(designId)) as VersionRow[];
    const renderRows = (await this.repo.db
      .prepare(
        "SELECT * FROM design_renders WHERE design_id=? ORDER BY position",
      )
      .all(designId)) as RenderRow[];
    const videoRows = (await this.repo.db
      .prepare(
        "SELECT * FROM design_videos WHERE design_id=? ORDER BY created_at",
      )
      .all(designId)) as VideoRow[];
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
          "SELECT id,role,text,created_at FROM design_messages WHERE design_id=? ORDER BY seq",
        )
        .all(designId)) as {
        id: string;
        role: "user" | "assistant";
        text: string;
        created_at: string;
      }[]
    ).map((m) => ({ id: m.id, role: m.role, text: m.text, at: m.created_at }));
    const pending = versions.find((v) => v.id === row!.pending_version_id);
    return {
      id: row.id,
      eventId: row.event_id,
      title: row.title || NEW_DESIGN_TITLE,
      brief: row.brief,
      images,
      versions: versions.filter((v) => v.id !== row!.pending_version_id),
      ...(row.current_version_id
        ? { currentVersionId: row.current_version_id }
        : {}),
      ...(pending ? { pendingVersion: pending } : {}),
      messages,
      videos: videoRows.map((v) => ({
        id: v.id,
        renderId: v.render_id,
        versionId: v.version_id,
        provider: v.provider,
        url: `${base}/videos/${encodeURIComponent(v.id)}/file`,
      })),
      ...(row.job ? { job: JSON.parse(row.job) as DesignJob } : {}),
    };
  }

  /* --------------------------------------------------------------------- */
  /* Jobs                                                                  */
  /* --------------------------------------------------------------------- */

  private async interruptAll() {
    const rows = (await this.repo.db
      .prepare("SELECT id FROM design_projects WHERE job IS NOT NULL")
      .all()) as { id: string }[];
    for (const { id } of rows) {
      const row = await this.row(id);
      if (row) await this.interrupt(row);
    }
  }

  private async interrupt(row: DesignRow) {
    await this.repo.transaction(async () => {
      await this.repo.db
        .prepare("UPDATE design_projects SET job=NULL, updated_at=? WHERE id=?")
        .run(now(), row.id);
      await this.message(
        row.id,
        row.event_id,
        "assistant",
        "El trabajo se interrumpió porque el servicio se detuvo. Puedes volver a pedirlo.",
      );
    });
  }

  /** A job older than any function can run, with no worker on this instance, was cut off. */
  private async reapStale(row: DesignRow) {
    if (!row.job || this.jobs.has(row.id)) return row;
    const staleMs = Number(process.env.KIT_JOB_STALE_MS || 330_000);
    const job = JSON.parse(row.job) as DesignJob;
    if (Date.now() - Date.parse(job.startedAt) < staleMs) return row;
    await this.interrupt(row);
    return { ...row, job: null };
  }

  /** True when another live video fits in this month's allowance. */
  private async videoAllowed() {
    return (
      !this.videoRenderer.billable || (await this.videoUsage()) < this.videoCap
    );
  }

  /**
   * Runs a job, then any job it chains (a new design is followed by the video of
   * its first view). The whole chain is one background promise, so on Vercel
   * `waitUntil` covers it.
   */
  private start(
    user: WorkspaceUser,
    row: DesignRow,
    event: ProductionEvent,
    first: DesignJob,
    workspace: Workspace,
  ) {
    const controller = new AbortController();
    const promise = (async () => {
      let job: DesignJob | undefined = first;
      while (job) {
        const entry = this.jobs.get(row.id);
        if (entry) entry.id = job.id;
        job = await this.runJob(
          user,
          row.id,
          event,
          job,
          workspace,
          controller.signal,
        );
      }
    })().finally(() => {
      if (this.jobs.get(row.id)?.controller === controller)
        this.jobs.delete(row.id);
    });
    this.jobs.set(row.id, { id: first.id, controller, promise });
    // On Vercel the function would freeze once the response is sent.
    if (process.env.VERCEL) {
      try {
        waitUntil(promise);
      } catch {
        /* Not inside a request context: the job runs on its own. */
      }
    }
  }

  /** Runs one job. Returns the next job when this one chains one, otherwise undefined. */
  private async runJob(
    user: WorkspaceUser,
    designId: string,
    event: ProductionEvent,
    job: DesignJob,
    workspace: Workspace,
    signal: AbortSignal,
  ): Promise<DesignJob | undefined> {
    const written: string[] = [];
    try {
      if (job.kind === "video") {
        await this.runVideo(user, designId, event, job, written, signal);
        return undefined;
      }
      const result =
        job.kind === "create"
          ? await this.runCreate(
              designId,
              event,
              job,
              workspace,
              written,
              signal,
            )
          : await this.runRefine(
              designId,
              event,
              job,
              workspace,
              written,
              signal,
            );
      // The first design is followed at once by the video of its first view.
      const first = result.renders[0];
      const wantsVideo =
        job.kind === "create" && first && (await this.videoAllowed());
      const next: DesignJob | undefined = wantsVideo
        ? {
            id: randomUUID(),
            kind: "video",
            request: "Video",
            renderId: first.id,
            startedAt: now(),
          }
        : undefined;
      const number = await this.repo.transaction(async () => {
        const row = await this.row(designId);
        if (!row?.job || (JSON.parse(row.job) as DesignJob).id !== job.id)
          throw new Error("job superseded");
        const last = (await this.repo.db
          .prepare(
            "SELECT MAX(number) AS n FROM design_versions WHERE design_id=?",
          )
          .get(designId)) as { n: number | null };
        const number = Number(last.n ?? 0) + 1;
        const versionId = randomUUID();
        const at = now();
        await this.repo.db
          .prepare(
            "INSERT INTO design_versions (id,design_id,event_id,number,request,spec,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)",
          )
          .run(
            versionId,
            designId,
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
              "INSERT INTO design_renders (id,version_id,design_id,event_id,position,view_id,source_image_id,file_path,mime_type,provider,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            )
            .run(
              r.id,
              versionId,
              designId,
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
              ? "UPDATE design_projects SET current_version_id=?, job=?, updated_at=? WHERE id=?"
              : "UPDATE design_projects SET pending_version_id=?, job=?, updated_at=? WHERE id=?",
          )
          .run(versionId, next ? JSON.stringify(next) : null, at, designId);
        await this.message(
          designId,
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
      return next;
    } catch (error) {
      await this.storage.remove(written).catch(() => {});
      const reason =
        error instanceof HttpError
          ? error.message
          : job.kind === "video"
            ? "No se pudo crear el video. Puedes reintentar."
            : "No se pudo completar el diseño. Puedes reintentar.";
      await this.repo
        .transaction(async () => {
          const row = await this.row(designId);
          if (!row?.job || (JSON.parse(row.job) as DesignJob).id !== job.id)
            return;
          await this.repo.db
            .prepare(
              "UPDATE design_projects SET job=NULL, updated_at=? WHERE id=?",
            )
            .run(now(), designId);
          await this.message(
            designId,
            event.id,
            "assistant",
            job.kind === "video"
              ? `No pude crear el video: ${reason} Puedes reintentarlo con «Crear video».`
              : `No pude completarlo: ${reason}`,
          );
        })
        .catch(() => {});
      return undefined;
    }
  }

  private async saveFile(
    designId: string,
    folder: "renders" | "videos",
    bytes: Buffer,
    mimeType: string,
    written: string[],
  ) {
    const id = randomUUID();
    const path = `${designId}/${folder}/${id}.${mimeType === "video/mp4" ? "mp4" : extension(mimeType)}`;
    await this.storage.put(path, bytes, mimeType);
    written.push(path);
    return { id, path };
  }

  private async runCreate(
    designId: string,
    event: ProductionEvent,
    job: DesignJob,
    workspace: Workspace,
    written: string[],
    signal: AbortSignal,
  ) {
    const rows = await this.images(designId);
    const files = await Promise.all(
      rows.map((r) => this.storage.get(r.file_path)),
    );
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
        const saved = await this.saveFile(
          designId,
          "renders",
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
    designId: string,
    event: ProductionEvent,
    job: DesignJob,
    workspace: Workspace,
    written: string[],
    signal: AbortSignal,
  ) {
    const row = await this.row(designId);
    const version = (await this.repo.db
      .prepare("SELECT * FROM design_versions WHERE id=?")
      .get(row?.current_version_id ?? "")) as VersionRow | undefined;
    if (!version)
      throw new HttpError(409, "No hay una versión actual que cambiar.");
    const current = await this.renders(version.id);
    const images = await this.images(designId);
    const { spec, reply, editPrompt } = await this.designer.refine({
      request: job.request,
      spec: JSON.parse(version.spec) as DesignSpec,
      catalog: workspace.equipment,
      signal,
    });
    const renders: NewRender[] = await Promise.all(
      current.map(async (render) => {
        const source = images.find((i) => i.id === render.source_image_id);
        const file = await this.storage.get(render.file_path);
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
        const saved = await this.saveFile(
          designId,
          "renders",
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

  /** Turns one render into a short camera-move video; only the camera moves. */
  private async runVideo(
    user: WorkspaceUser,
    designId: string,
    event: ProductionEvent,
    job: DesignJob,
    written: string[],
    signal: AbortSignal,
  ) {
    const render = (await this.repo.db
      .prepare("SELECT * FROM design_renders WHERE id=? AND design_id=?")
      .get(job.renderId ?? "", designId)) as RenderRow | undefined;
    if (!render) throw new HttpError(409, "La vista ya no existe.");
    const version = (await this.repo.db
      .prepare("SELECT spec FROM design_versions WHERE id=?")
      .get(render.version_id)) as { spec: string } | undefined;
    const mood = version
      ? (JSON.parse(version.spec) as DesignSpec).style.mood
      : "";
    const file = await this.storage.get(render.file_path);
    const out = await this.videoRenderer.video({
      image: { bytes: file.bytes, mimeType: render.mime_type },
      prompt: videoPrompt(mood),
      signal,
    });
    const saved = await this.saveFile(
      designId,
      "videos",
      out.bytes,
      out.mimeType,
      written,
    );
    await this.repo.transaction(async () => {
      const row = await this.row(designId);
      if (!row?.job || (JSON.parse(row.job) as DesignJob).id !== job.id)
        throw new Error("job superseded");
      const still = await this.repo.db
        .prepare("SELECT id FROM design_renders WHERE id=?")
        .get(render.id);
      if (!still) throw new HttpError(409, "La vista ya no existe.");
      const at = now();
      await this.repo.db
        .prepare(
          "INSERT INTO design_videos (id,design_id,event_id,version_id,render_id,file_path,mime_type,provider,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        )
        .run(
          saved.id,
          designId,
          event.id,
          render.version_id,
          render.id,
          saved.path,
          out.mimeType,
          this.videoRenderer.name,
          at,
        );
      await this.repo.db
        .prepare("UPDATE design_projects SET job=NULL, updated_at=? WHERE id=?")
        .run(at, designId);
      await this.message(
        designId,
        event.id,
        "assistant",
        this.videoRenderer.billable
          ? "El video está listo: una vuelta de cámara sobre tu diseño en 3D."
          : "El video de muestra está listo. Todavía no hay un motor de video conectado.",
      );
    });
    await this.repo.audit(
      user.id,
      "KIT Design created a video",
      `${this.videoRenderer.name}`,
      event.id,
    );
  }

  /** Paths of every stored file of a design, optionally only those made after the room images. */
  private async filePaths(designId: string, includeImages: boolean) {
    const tables = [
      "SELECT file_path FROM design_renders WHERE design_id=?",
      "SELECT file_path FROM design_videos WHERE design_id=?",
      ...(includeImages
        ? ["SELECT file_path FROM design_images WHERE design_id=?"]
        : []),
    ];
    const paths: string[] = [];
    for (const sql of tables)
      for (const r of (await this.repo.db.prepare(sql).all(designId)) as {
        file_path: string;
      }[])
        paths.push(r.file_path);
    return paths;
  }

  /* --------------------------------------------------------------------- */
  /* Routes                                                                */
  /* --------------------------------------------------------------------- */

  private async accessEvent(
    res: express.Response,
    eventId: string,
    edit = false,
  ) {
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

  private async access(res: express.Response, designId: string, edit = false) {
    const row = await this.row(designId);
    if (!row) {
      // Same answer for a design that does not exist and one the person cannot see.
      userOf(res);
      throw new HttpError(404, "Diseño no encontrado.");
    }
    const found = await this.accessEvent(res, row.event_id, edit);
    return { ...found, row };
  }

  mount(app: express.Express) {
    app.get("/api/design/status", async (_req, res) => {
      const user = userOf(res);
      if (!canSeeModule(user, "/design"))
        throw new HttpError(403, "No tienes acceso a Diseño.");
      res.json(await this.status(user));
    });

    /* ---- history: an event's designs ---- */
    app.get("/api/design/events/:eventId/designs", async (req, res) => {
      await this.accessEvent(res, req.params.eventId);
      res.json({ designs: await this.list(req.params.eventId) });
    });

    // "Nuevo diseño". An empty design already waiting is reused, so history
    // does not fill up with blank chats.
    app.post("/api/design/events/:eventId/designs", async (req, res) => {
      const { user, event } = await this.accessEvent(
        res,
        req.params.eventId,
        true,
      );
      const id = await this.repo.transaction(async () => {
        const empty = (await this.repo.db
          .prepare(
            `SELECT p.id FROM design_projects p WHERE p.event_id=? AND p.current_version_id IS NULL AND p.job IS NULL
               AND NOT EXISTS (SELECT 1 FROM design_images i WHERE i.design_id=p.id)
               AND NOT EXISTS (SELECT 1 FROM design_messages m WHERE m.design_id=p.id)
             ORDER BY p.created_at DESC LIMIT 1`,
          )
          .get(event.id)) as { id: string } | undefined;
        if (empty) return empty.id;
        const count = (await this.repo.db
          .prepare("SELECT COUNT(*) AS n FROM design_projects WHERE event_id=?")
          .get(event.id)) as { n: number | string };
        if (Number(count.n) >= MAX_DESIGNS_PER_EVENT)
          throw new HttpError(
            409,
            `Máximo ${MAX_DESIGNS_PER_EVENT} diseños por evento. Elimina uno para continuar.`,
          );
        const id = randomUUID();
        const at = now();
        await this.repo.db
          .prepare(
            "INSERT INTO design_projects (id,event_id,title,brief,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
          )
          .run(id, event.id, NEW_DESIGN_TITLE, "", user.id, at, at);
        return id;
      });
      res.status(201).json(await this.project(id));
    });

    /* ---- one design ---- */
    app.get("/api/design/designs/:designId", async (req, res) => {
      await this.access(res, req.params.designId);
      res.json(await this.project(req.params.designId));
    });

    app.delete("/api/design/designs/:designId", async (req, res) => {
      const { user, event, row } = await this.access(
        res,
        req.params.designId,
        true,
      );
      const paths = await this.repo.transaction(async () => {
        const fresh = await this.reapStale((await this.row(row.id))!);
        if (fresh.job)
          throw new HttpError(
            409,
            "KIT Design está trabajando en este diseño. Espera a que termine.",
          );
        const paths = await this.filePaths(row.id, true);
        for (const table of [
          "design_videos",
          "design_renders",
          "design_versions",
          "design_images",
          "design_messages",
        ])
          await this.repo.db
            .prepare(`DELETE FROM ${table} WHERE design_id=?`)
            .run(row.id);
        await this.repo.db
          .prepare("DELETE FROM design_projects WHERE id=?")
          .run(row.id);
        return paths;
      });
      await this.storage.remove(paths).catch(() => {});
      await this.repo.audit(
        user.id,
        "KIT Design deleted a design",
        row.title || NEW_DESIGN_TITLE,
        event.id,
      );
      res.json({ deleted: true });
    });

    // Reiniciar: clears versions, videos and conversation; the room images stay.
    app.post("/api/design/designs/:designId/restart", async (req, res) => {
      const { user, event, row } = await this.access(
        res,
        req.params.designId,
        true,
      );
      const paths = await this.repo.transaction(async () => {
        const fresh = await this.reapStale((await this.row(row.id))!);
        if (fresh.job)
          throw new HttpError(
            409,
            "KIT Design está trabajando en este diseño. Espera a que termine.",
          );
        const paths = await this.filePaths(row.id, false);
        for (const table of [
          "design_videos",
          "design_renders",
          "design_versions",
          "design_messages",
        ])
          await this.repo.db
            .prepare(`DELETE FROM ${table} WHERE design_id=?`)
            .run(row.id);
        await this.repo.db
          .prepare(
            "UPDATE design_projects SET title=?, brief='', current_version_id=NULL, pending_version_id=NULL, updated_at=? WHERE id=?",
          )
          .run(NEW_DESIGN_TITLE, now(), row.id);
        return paths;
      });
      await this.storage.remove(paths).catch(() => {});
      await this.repo.audit(
        user.id,
        "KIT Design restarted a design",
        row.title || NEW_DESIGN_TITLE,
        event.id,
      );
      res.json(await this.project(row.id));
    });

    app.post("/api/design/designs/:designId/images", async (req, res) => {
      const { user, event, row } = await this.access(
        res,
        req.params.designId,
        true,
      );
      const input = uploadSchema.parse(req.body);
      const bytes = Buffer.from(input.dataUrl.split(",")[1], "base64");
      if (bytes.length > 1_100_000)
        throw new HttpError(413, "Cada imagen debe pesar 1 MB o menos.");
      if (!matchesType(bytes, input.mimeType))
        throw new HttpError(422, "El archivo no es una imagen válida.");
      const id = randomUUID();
      const path = `${row.id}/images/${id}.${extension(input.mimeType)}`;
      await this.repo.transaction(async () => {
        const fresh = await this.reapStale((await this.row(row.id))!);
        if (fresh.job)
          throw new HttpError(
            409,
            "KIT Design está trabajando en este diseño.",
          );
        if (fresh.current_version_id)
          throw new HttpError(
            409,
            "Las imágenes no se pueden cambiar después de crear el diseño.",
          );
        if ((await this.images(row.id)).length >= MAX_ROOM_IMAGES)
          throw new HttpError(
            409,
            `Solo se usan ${MAX_ROOM_IMAGES} imágenes por diseño.`,
          );
        await this.repo.db
          .prepare(
            "INSERT INTO design_images (id,design_id,event_id,name,mime_type,width,height,file_path,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            id,
            row.id,
            event.id,
            input.name,
            input.mimeType,
            input.width,
            input.height,
            path,
            user.id,
            now(),
          );
        await this.repo.db
          .prepare("UPDATE design_projects SET updated_at=? WHERE id=?")
          .run(now(), row.id);
      });
      try {
        await this.storage.put(path, bytes, input.mimeType);
      } catch {
        await this.repo.db
          .prepare("DELETE FROM design_images WHERE id=?")
          .run(id);
        throw new HttpError(502, "No se pudo guardar la imagen. Reintenta.");
      }
      res.status(201).json(await this.project(row.id));
    });

    app.delete(
      "/api/design/designs/:designId/images/:imageId",
      async (req, res) => {
        const { row } = await this.access(res, req.params.designId, true);
        const path = await this.repo.transaction(async () => {
          const fresh = (await this.row(row.id))!;
          if (fresh.job || fresh.current_version_id)
            throw new HttpError(
              409,
              "Las imágenes no se pueden cambiar después de crear el diseño.",
            );
          const image = (await this.images(row.id)).find(
            (i) => i.id === req.params.imageId,
          );
          if (!image) throw new HttpError(404, "Imagen no encontrada.");
          await this.repo.db
            .prepare("DELETE FROM design_images WHERE id=?")
            .run(image.id);
          return image.file_path;
        });
        await this.storage.remove([path]).catch(() => {});
        res.json(await this.project(row.id));
      },
    );

    const serveFile = async (
      res: express.Response,
      designId: string,
      sql: string,
      id: string,
      redirect = false,
    ) => {
      await this.access(res, designId);
      const row = (await this.repo.db.prepare(sql).get(id, designId)) as
        { file_path: string; mime_type?: string } | undefined;
      if (!row) throw new HttpError(404, "Archivo no encontrado.");
      // Videos can exceed the 4.5 MB a Vercel function may return, so the
      // browser fetches them straight from the private bucket with a short-lived link.
      if (redirect && this.storage.signedUrl) {
        const url = await this.storage
          .signedUrl(row.file_path, 3600)
          .catch(() => {
            throw new HttpError(404, "Archivo no encontrado.");
          });
        res.set("Cache-Control", "private, no-store").redirect(302, url);
        return;
      }
      const file = await this.storage.get(row.file_path).catch(() => {
        throw new HttpError(404, "Archivo no encontrado.");
      });
      res
        .type(file.mimeType)
        .set("Cache-Control", "private, max-age=86400, immutable")
        .send(file.bytes);
    };
    app.get("/api/design/designs/:designId/images/:imageId/file", (req, res) =>
      serveFile(
        res,
        req.params.designId,
        "SELECT file_path FROM design_images WHERE id=? AND design_id=?",
        req.params.imageId,
      ),
    );
    app.get(
      "/api/design/designs/:designId/renders/:renderId/file",
      (req, res) =>
        serveFile(
          res,
          req.params.designId,
          "SELECT file_path FROM design_renders WHERE id=? AND design_id=?",
          req.params.renderId,
        ),
    );
    app.get("/api/design/designs/:designId/videos/:videoId/file", (req, res) =>
      serveFile(
        res,
        req.params.designId,
        "SELECT file_path FROM design_videos WHERE id=? AND design_id=?",
        req.params.videoId,
        true,
      ),
    );

    // A message creates the first design, or proposes a change to the current one.
    app.post("/api/design/designs/:designId/messages", async (req, res) => {
      const { user, event, workspace, row } = await this.access(
        res,
        req.params.designId,
        true,
      );
      const { text } = messageSchema.parse(req.body);
      await rateLimit(this.repo, `design:${user.id}`, 30);
      await rateLimit(this.repo, "design:company", 200);
      const job = await this.repo.transaction(async () => {
        const fresh = await this.reapStale((await this.row(row.id))!);
        if (fresh.job)
          throw new HttpError(
            409,
            "KIT Design ya está trabajando en este diseño.",
          );
        const images = await this.images(row.id);
        if (!images.length)
          throw new HttpError(
            409,
            "Primero sube al menos una imagen del salón.",
          );
        const first = !fresh.current_version_id;
        if (first && text.length < MIN_BRIEF_LENGTH)
          throw new HttpError(
            422,
            "Describe el evento con un poco más de detalle.",
          );
        if (fresh.pending_version_id)
          throw new HttpError(
            409,
            "Aplica o descarta el cambio pendiente antes de pedir otro.",
          );
        if (this.renderer.billable) {
          const needed = first
            ? images.length
            : (await this.renders(fresh.current_version_id!)).length;
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
              ? "UPDATE design_projects SET job=?, brief=?, title=?, updated_at=? WHERE id=?"
              : "UPDATE design_projects SET job=?, updated_at=? WHERE id=?",
          )
          .run(
            ...(first
              ? [JSON.stringify(job), text, designTitle(text), now(), row.id]
              : [JSON.stringify(job), now(), row.id]),
          );
        await this.message(row.id, event.id, "user", text);
        return job;
      });
      this.start(user, row, event, job, workspace);
      res.status(202).json(await this.project(row.id));
    });

    // "Crear video": a camera move over one render, so the plan reads as a 3D space.
    app.post("/api/design/designs/:designId/videos", async (req, res) => {
      const { user, event, workspace, row } = await this.access(
        res,
        req.params.designId,
        true,
      );
      const { renderId } = videoSchema.parse(req.body);
      await rateLimit(this.repo, `design:${user.id}`, 30);
      await rateLimit(this.repo, "design:company", 200);
      const job = await this.repo.transaction(async () => {
        const fresh = await this.reapStale((await this.row(row.id))!);
        if (fresh.job)
          throw new HttpError(
            409,
            "KIT Design ya está trabajando en este diseño.",
          );
        if (fresh.pending_version_id)
          throw new HttpError(
            409,
            "Aplica o descarta el cambio pendiente antes de crear un video.",
          );
        const render = (await this.repo.db
          .prepare(
            "SELECT r.*, v.number AS version_number FROM design_renders r JOIN design_versions v ON v.id=r.version_id WHERE r.id=? AND r.design_id=?",
          )
          .get(renderId, row.id)) as
          (RenderRow & { version_number: number }) | undefined;
        if (!render) throw new HttpError(404, "Vista no encontrada.");
        const existing = await this.repo.db
          .prepare("SELECT id FROM design_videos WHERE render_id=?")
          .get(renderId);
        if (existing) throw new HttpError(409, "Esta vista ya tiene un video.");
        if (!(await this.videoAllowed()))
          throw new HttpError(
            429,
            `Se alcanzó el límite mensual de videos (${this.videoCap}). Pide a un administrador que lo amplíe.`,
          );
        const job: DesignJob = {
          id: randomUUID(),
          kind: "video",
          request: "Video",
          renderId,
          startedAt: now(),
        };
        await this.repo.db
          .prepare("UPDATE design_projects SET job=?, updated_at=? WHERE id=?")
          .run(JSON.stringify(job), now(), row.id);
        await this.message(
          row.id,
          event.id,
          "user",
          `Crear un video de la vista ${render.position + 1} (versión ${render.version_number}).`,
        );
        return job;
      });
      this.start(user, row, event, job, workspace);
      res.status(202).json(await this.project(row.id));
    });

    app.post("/api/design/designs/:designId/apply", async (req, res) => {
      const { user, event, row } = await this.access(
        res,
        req.params.designId,
        true,
      );
      const number = await this.repo.transaction(async () => {
        const fresh = (await this.row(row.id))!;
        if (!fresh.pending_version_id)
          throw new HttpError(409, "No hay ningún cambio pendiente.");
        await this.repo.db
          .prepare(
            "UPDATE design_projects SET current_version_id=pending_version_id, pending_version_id=NULL, updated_at=? WHERE id=?",
          )
          .run(now(), row.id);
        const v = (await this.repo.db
          .prepare("SELECT number FROM design_versions WHERE id=?")
          .get(fresh.pending_version_id)) as { number: number };
        return v.number;
      });
      await this.repo.audit(
        user.id,
        "KIT Design change applied",
        `Versión ${number}`,
        event.id,
      );
      res.json(await this.project(row.id));
    });

    app.post("/api/design/designs/:designId/discard", async (req, res) => {
      const { row } = await this.access(res, req.params.designId, true);
      const paths = await this.repo.transaction(async () => {
        const fresh = (await this.row(row.id))!;
        if (!fresh.pending_version_id)
          throw new HttpError(409, "No hay ningún cambio pendiente.");
        const renders = await this.renders(fresh.pending_version_id);
        await this.repo.db
          .prepare(
            "UPDATE design_projects SET pending_version_id=NULL, updated_at=? WHERE id=?",
          )
          .run(now(), row.id);
        await this.repo.db
          .prepare("DELETE FROM design_versions WHERE id=?")
          .run(fresh.pending_version_id);
        return renders.map((r) => r.file_path);
      });
      await this.storage.remove(paths).catch(() => {});
      res.json(await this.project(row.id));
    });

    app.post("/api/design/designs/:designId/select", async (req, res) => {
      const { row } = await this.access(res, req.params.designId, true);
      const { versionId } = selectSchema.parse(req.body);
      await this.repo.transaction(async () => {
        const fresh = (await this.row(row.id))!;
        if (fresh.job || fresh.pending_version_id)
          throw new HttpError(
            409,
            "Aplica o descarta el cambio pendiente primero.",
          );
        const exists = await this.repo.db
          .prepare("SELECT id FROM design_versions WHERE id=? AND design_id=?")
          .get(versionId, row.id);
        if (!exists) throw new HttpError(404, "Versión no encontrada.");
        await this.repo.db
          .prepare(
            "UPDATE design_projects SET current_version_id=?, updated_at=? WHERE id=?",
          )
          .run(versionId, now(), row.id);
      });
      res.json(await this.project(row.id));
    });
  }
}

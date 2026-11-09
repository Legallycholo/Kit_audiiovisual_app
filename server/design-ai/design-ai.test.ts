import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { startCompany } from "../testing/harness";
import type {
  DesignProject,
  DesignStatus,
  DesignSummary,
} from "../../src/shared/kit-design";
import { HttpError } from "../database";
import { designFromEnv } from "../bootstrap";
import { aiDesigner, SAMPLE_NOTICE } from "./designer";
import { FIXTURE_VIDEO } from "./fixture-video";
import {
  closestAspectRatio,
  higgsfieldRenderProvider,
  higgsfieldVideoProvider,
  videoPrompt,
  type RenderProvider,
  type VideoProvider,
} from "./render-provider";
import { databaseStorage, supabaseStorage } from "./storage";
import type { DesignAIService, DesignConfig } from "./service";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const PNG = Buffer.from(PNG_BASE64, "base64");
const upload = (name = "salon.png") => ({
  name,
  mimeType: "image/png",
  dataUrl: `data:image/png;base64,${PNG_BASE64}`,
  width: 1600,
  height: 1200,
});
const BRIEF = "Boda para 120, escenario al fondo";

let company: Awaited<ReturnType<typeof startCompany>> | undefined;
afterEach(async () => {
  await company?.close();
  company = undefined;
});

async function start(design?: DesignConfig) {
  company = await startCompany(design ? { design } : {});
  const service = company.app.locals.designAI as DesignAIService;
  const { call, owner } = company;
  const url = company.url;
  const newDesign = async (eventId = "e2") =>
    (await call(`/design/events/${eventId}/designs`, "POST", {}, owner))
      .json as DesignProject;
  const get = async (id: string) =>
    (await call(`/design/designs/${id}`, "GET", undefined, owner))
      .json as DesignProject;
  /** A design with one uploaded image, ready for a message. */
  const ready = async (eventId = "e2") => {
    const created = await newDesign(eventId);
    const r = await call(
      `/design/designs/${created.id}/images`,
      "POST",
      upload(),
      owner,
    );
    expect(r.status).toBe(201);
    return created.id;
  };
  const say = (id: string, text: string) =>
    call(`/design/designs/${id}/messages`, "POST", { text }, owner);
  /** Raw GET (files are binary, which the JSON helper cannot read). */
  const raw = (path: string, cookie = owner.cookie, redirect?: "manual") =>
    fetch(`${url}${path}`, {
      headers: { Cookie: cookie, Origin: "http://localhost:5173" },
      ...(redirect ? { redirect } : {}),
    });
  return {
    company,
    service,
    call,
    owner,
    url,
    newDesign,
    get,
    ready,
    say,
    raw,
  };
}

describe("KIT Design API (fixtures)", () => {
  it("turns room images into a design with a video, then versions with Aplicar / Descartar", async () => {
    const { service, call, owner, newDesign, get, say, raw } = await start();
    const status = (await call("/design/status", "GET", undefined, owner))
      .json as DesignStatus;
    expect(status).toMatchObject({
      designer: null,
      renderer: "fixture",
      videoRenderer: "fixture",
      canEdit: true,
    });

    const created = await newDesign();
    expect(created).toMatchObject({ eventId: "e2", title: "Nuevo diseño" });
    const added = await call(
      `/design/designs/${created.id}/images`,
      "POST",
      upload(),
      owner,
    );
    expect(added.status).toBe(201);
    const image = (added.json as DesignProject).images[0];
    const file = await raw(image.url);
    expect(file.headers.get("content-type")).toContain("image/png");
    expect(Buffer.from(await file.arrayBuffer()).equals(PNG)).toBe(true);

    expect((await say(created.id, "Boda")).status).toBe(422);
    const started = await say(created.id, BRIEF);
    expect(started.status).toBe(202);
    expect((started.json as DesignProject).job?.kind).toBe("create");
    await service.idle();

    let p = await get(created.id);
    expect(p.job).toBeUndefined();
    expect(p.brief).toBe(BRIEF);
    expect(p.title).toBe(BRIEF);
    expect(p.versions.map((v) => v.number)).toEqual([1]);
    expect(p.currentVersionId).toBe(p.versions[0].id);
    expect(p.versions[0].renders).toEqual([
      expect.objectContaining({ provider: "fixture", sourceImageId: image.id }),
    ]);
    // The first design is followed by the video of its first view.
    expect(p.videos).toEqual([
      expect.objectContaining({
        renderId: p.versions[0].renders[0].id,
        versionId: p.versions[0].id,
        provider: "fixture",
      }),
    ]);
    const video = await raw(p.videos[0].url);
    expect(video.headers.get("content-type")).toContain("video/mp4");
    const bytes = Buffer.from(await video.arrayBuffer());
    expect(bytes.equals(FIXTURE_VIDEO)).toBe(true);
    expect(bytes.subarray(4, 8).toString("latin1")).toBe("ftyp");
    expect(p.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "assistant",
    ]);
    expect(p.messages[1].text).toContain(SAMPLE_NOTICE);
    expect(p.messages[2].text).toContain("video de muestra");

    // Images are fixed once a design exists.
    const lock = await call(
      `/design/designs/${created.id}/images`,
      "POST",
      upload(),
      owner,
    );
    expect(lock.status).toBe(409);

    // A refinement waits for a decision.
    await say(created.id, "Más luz cálida");
    await service.idle();
    p = await get(created.id);
    expect(p.pendingVersion?.number).toBe(2);
    expect(p.currentVersionId).toBe(p.versions[0].id);
    expect((await say(created.id, "Otro cambio")).status).toBe(409);
    expect(
      (
        await call(
          `/design/designs/${created.id}/select`,
          "POST",
          { versionId: p.versions[0].id },
          owner,
        )
      ).status,
    ).toBe(409);
    // No video while a change is pending.
    expect(
      (
        await call(
          `/design/designs/${created.id}/videos`,
          "POST",
          { renderId: p.pendingVersion!.renders[0].id },
          owner,
        )
      ).status,
    ).toBe(409);

    p = (await call(`/design/designs/${created.id}/discard`, "POST", {}, owner))
      .json;
    expect(p.pendingVersion).toBeUndefined();
    expect(p.versions).toHaveLength(1);

    await say(created.id, "Pantalla más grande");
    await service.idle();
    p = (await call(`/design/designs/${created.id}/apply`, "POST", {}, owner))
      .json;
    expect(p.versions.map((v) => v.number)).toEqual([1, 2]);
    expect(p.currentVersionId).toBe(p.versions[1].id);
    expect(
      (await call(`/design/designs/${created.id}/apply`, "POST", {}, owner))
        .status,
    ).toBe(409);

    // A refined version has no video until one is asked for; one per view.
    expect(p.videos).toHaveLength(1);
    const render2 = p.versions[1].renders[0].id;
    const asked = await call(
      `/design/designs/${created.id}/videos`,
      "POST",
      { renderId: render2 },
      owner,
    );
    expect(asked.status).toBe(202);
    expect((asked.json as DesignProject).job).toMatchObject({
      kind: "video",
      renderId: render2,
    });
    await service.idle();
    p = await get(created.id);
    expect(p.videos.map((v) => v.versionId)).toEqual([
      p.versions[0].id,
      p.versions[1].id,
    ]);
    expect(
      (
        await call(
          `/design/designs/${created.id}/videos`,
          "POST",
          { renderId: render2 },
          owner,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(
          `/design/designs/${created.id}/videos`,
          "POST",
          { renderId: "nope" },
          owner,
        )
      ).status,
    ).toBe(404);

    p = (
      await call(
        `/design/designs/${created.id}/select`,
        "POST",
        { versionId: p.versions[0].id },
        owner,
      )
    ).json;
    expect(p.currentVersionId).toBe(p.versions[0].id);
  }, 30_000);

  it("keeps a history of designs per event: new, reuse of an empty one, titles, delete and restart", async () => {
    const { company, service, call, owner, newDesign, get, ready, say, raw } =
      await start();
    const list = async (eventId = "e2") =>
      (await call(`/design/events/${eventId}/designs`, "GET", undefined, owner))
        .json.designs as DesignSummary[];
    expect(await list()).toEqual([]);

    // An empty design is reused instead of piling up blank chats.
    const first = await newDesign();
    expect((await newDesign()).id).toBe(first.id);
    expect(await list()).toHaveLength(1);

    const a = await ready();
    expect(a).toBe(first.id);
    await say(a, BRIEF);
    await service.idle();
    const b = await ready();
    expect(b).not.toBe(a);
    await say(b, "Cena de gala para 200 personas");
    await service.idle();
    // Another event has its own history.
    const other = await newDesign("e1");
    expect(other.id).not.toBe(a);
    expect((await list("e1")).map((d) => d.id)).toEqual([other.id]);

    const history = await list();
    expect(history.map((d) => d.title)).toEqual([
      "Cena de gala para 200 personas",
      BRIEF,
    ]);
    expect(history.every((d) => !d.working)).toBe(true);

    // Reiniciar clears versions, videos and conversation, and keeps the room images.
    const before = await get(a);
    expect(before.versions).toHaveLength(1);
    const files = async () =>
      (
        (await company.repo.db
          .prepare("SELECT path FROM design_files")
          .all()) as { path: string }[]
      ).map((f) => f.path);
    const filesBefore = await files();
    expect(filesBefore.filter((p) => p.startsWith(`${a}/`))).toHaveLength(3);
    const restarted = (
      await call(`/design/designs/${a}/restart`, "POST", {}, owner)
    ).json as DesignProject;
    expect(restarted).toMatchObject({
      title: "Nuevo diseño",
      brief: "",
      versions: [],
      videos: [],
      messages: [],
    });
    expect(restarted.currentVersionId).toBeUndefined();
    expect(restarted.images).toHaveLength(1);
    expect((await files()).filter((p) => p.startsWith(`${a}/`))).toEqual([
      expect.stringContaining("/images/"),
    ]);
    // It can be used again from the start.
    expect((await say(a, "Conferencia con 80 asistentes")).status).toBe(202);
    await service.idle();
    expect((await get(a)).versions).toHaveLength(1);

    // Delete removes the design, its rows and every stored file; others stay.
    expect(
      (await call(`/design/designs/${b}`, "DELETE", undefined, owner)).json,
    ).toEqual({ deleted: true });
    expect(
      (await call(`/design/designs/${b}`, "GET", undefined, owner)).status,
    ).toBe(404);
    expect((await files()).some((p) => p.startsWith(`${b}/`))).toBe(false);
    expect((await files()).some((p) => p.startsWith(`${a}/`))).toBe(true);
    expect((await list()).map((d) => d.id)).toEqual([a]);
    const gone = await raw(`/api/design/designs/${b}/images/x/file`);
    expect(gone.status).toBe(404);
    for (const table of [
      "design_images",
      "design_versions",
      "design_renders",
      "design_videos",
      "design_messages",
    ]) {
      const row = (await company.repo.db
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE design_id=?`)
        .get(b)) as { n: number | string };
      expect(Number(row.n)).toBe(0);
    }
  }, 30_000);

  it("will not delete, restart or add to a design while KIT Design is working on it", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow: RenderProvider = {
      name: "fixture",
      billable: false,
      render: async ({ image }) => {
        await gate;
        return { bytes: image.bytes, mimeType: image.mimeType };
      },
    };
    const { service, call, owner, get, ready, say } = await start({
      renderer: slow,
    });
    const id = await ready();
    const first = await say(id, BRIEF);
    expect(first.status).toBe(202);
    expect((await say(id, "Otra cosa más")).status).toBe(409);
    expect(
      (await call(`/design/designs/${id}/images`, "POST", upload(), owner))
        .status,
    ).toBe(409);
    expect(
      (await call(`/design/designs/${id}`, "DELETE", undefined, owner)).status,
    ).toBe(409);
    expect(
      (await call(`/design/designs/${id}/restart`, "POST", {}, owner)).status,
    ).toBe(409);
    const listed = (
      await call("/design/events/e2/designs", "GET", undefined, owner)
    ).json.designs as DesignSummary[];
    expect(listed[0].working).toBe(true);
    release();
    await service.idle();
    expect((await get(id)).versions).toHaveLength(1);
  });

  it("rejects fake image files, more than six images, and unknown designs", async () => {
    const { call, owner, newDesign } = await start();
    const { id } = await newDesign();
    const fake = {
      ...upload(),
      mimeType: "image/jpeg",
      dataUrl: `data:image/jpeg;base64,${PNG_BASE64}`,
    };
    const post = (body: unknown) =>
      call(`/design/designs/${id}/images`, "POST", body, owner);
    expect((await post(fake)).status).toBe(422);
    expect((await post({ ...upload(), mimeType: "image/jpeg" })).status).toBe(
      422,
    );
    for (let i = 0; i < 6; i++)
      expect((await post(upload(`s${i}.png`))).status).toBe(201);
    expect((await post(upload())).status).toBe(409);
    expect(
      (await call("/design/designs/missing", "GET", undefined, owner)).status,
    ).toBe(404);
    expect(
      (await call("/design/events/missing/designs", "GET", undefined, owner))
        .status,
    ).toBe(404);
  });

  it("needs at least one image before designing", async () => {
    const { newDesign, say } = await start();
    const { id } = await newDesign();
    expect((await say(id, "Boda para 120 invitados")).status).toBe(409);
  });

  it("enforces who can see and who can change designs", async () => {
    const { company, call, owner, ready, raw } = await start();
    const id = await ready();
    const sales = await company.account("Sales Manager");
    expect(
      (await call(`/design/designs/${id}`, "GET", undefined, sales)).status,
    ).toBe(403);
    expect(
      (await call("/design/events/e2/designs", "GET", undefined, sales)).status,
    ).toBe(403);
    expect((await call("/design/status", "GET", undefined, sales)).status).toBe(
      403,
    );

    const outsider = await company.account("Technician");
    expect(
      (await call(`/design/designs/${id}`, "GET", undefined, outsider)).status,
    ).toBe(403);
    const created = await call(
      "/users",
      "POST",
      {
        name: "Tech",
        email: "tech-e2@example.test",
        password: "only-for-automated-tests-123",
        role: "Technician",
        eventIds: ["e2"],
      },
      owner,
    );
    expect(created.status).toBe(201);
    const login = await call("/login", "POST", {
      email: "tech-e2@example.test",
      password: "only-for-automated-tests-123",
    });
    const tech = { cookie: login.cookie, csrf: login.json.csrf };
    const seen = await call(`/design/designs/${id}`, "GET", undefined, tech);
    expect(seen.status).toBe(200);
    const imageUrl = (seen.json as DesignProject).images[0].url;
    expect((await raw(imageUrl, tech.cookie)).status).toBe(200);
    expect((await raw(imageUrl, outsider.cookie)).status).toBe(403);
    // A technician can look, but not create, change, restart or delete.
    expect(
      (await call(`/design/designs/${id}/images`, "POST", upload(), tech))
        .status,
    ).toBe(403);
    expect(
      (
        await call(
          `/design/designs/${id}/messages`,
          "POST",
          { text: BRIEF },
          tech,
        )
      ).status,
    ).toBe(403);
    expect(
      (await call(`/design/designs/${id}/restart`, "POST", {}, tech)).status,
    ).toBe(403);
    expect(
      (await call(`/design/designs/${id}`, "DELETE", undefined, tech)).status,
    ).toBe(403);
    expect(
      (await call("/design/events/e2/designs", "POST", {}, tech)).status,
    ).toBe(403);
    expect(
      (
        (await call("/design/status", "GET", undefined, tech))
          .json as DesignStatus
      ).canEdit,
    ).toBe(false);
  });

  it("stops live renders at the monthly cap and counts only billable ones", async () => {
    const paid: RenderProvider = {
      name: "test-live",
      billable: true,
      render: async ({ image }) => ({
        bytes: image.bytes,
        mimeType: image.mimeType,
      }),
    };
    const { service, call, owner, newDesign, get, say } = await start({
      renderer: paid,
      monthlyRenderCap: 1,
    });
    const { id } = await newDesign();
    await call(`/design/designs/${id}/images`, "POST", upload("a.png"), owner);
    await call(`/design/designs/${id}/images`, "POST", upload("b.png"), owner);
    const over = await say(id, "Boda para 120 invitados");
    expect(over.status).toBe(429);
    expect(over.json.error).toContain("límite mensual de renders (1)");

    await call(
      `/design/designs/${id}/images/${(await get(id)).images[1].id}`,
      "DELETE",
      undefined,
      owner,
    );
    expect((await say(id, "Boda para 120 invitados")).status).toBe(202);
    await service.idle();
    const status = (await call("/design/status", "GET", undefined, owner))
      .json as DesignStatus;
    expect(status.usage).toMatchObject({ renders: 1, cap: 1 });
    expect((await get(id)).messages.at(-2)?.text).not.toContain(SAMPLE_NOTICE);
    expect((await say(id, "Más luz")).status).toBe(429);
  });

  it("limits live videos per month: the automatic one is skipped, a manual one is refused", async () => {
    const paidVideo: VideoProvider = {
      name: "test-video",
      billable: true,
      video: async () => ({ bytes: FIXTURE_VIDEO, mimeType: "video/mp4" }),
    };
    const { service, call, owner, ready, get, say } = await start({
      videoRenderer: paidVideo,
      monthlyVideoCap: 1,
    });
    const a = await ready();
    await say(a, BRIEF);
    await service.idle();
    expect((await get(a)).videos).toEqual([
      expect.objectContaining({ provider: "test-video" }),
    ]);
    expect((await get(a)).messages.at(-1)?.text).not.toContain("de muestra");
    const status = (await call("/design/status", "GET", undefined, owner))
      .json as DesignStatus;
    expect(status).toMatchObject({
      videoRenderer: "test-video",
      videoUsage: { videos: 1, cap: 1 },
    });

    // The next design still gets its image; its video is skipped at the cap.
    const b = await ready();
    await say(b, "Cena de gala para 200 personas");
    await service.idle();
    const second = await get(b);
    expect(second.versions).toHaveLength(1);
    expect(second.videos).toEqual([]);
    const manual = await call(
      `/design/designs/${b}/videos`,
      "POST",
      { renderId: second.versions[0].renders[0].id },
      owner,
    );
    expect(manual.status).toBe(429);
    expect(manual.json.error).toContain("límite mensual de videos (1)");
  }, 30_000);

  it("reports a failed video in the chat and keeps the design", async () => {
    const broken: VideoProvider = {
      name: "broken",
      billable: false,
      video: async () => {
        throw new HttpError(
          502,
          "El motor de imágenes no pudo generar el video.",
        );
      },
    };
    const { company, service, ready, get, say } = await start({
      videoRenderer: broken,
    });
    const id = await ready();
    await say(id, BRIEF);
    await service.idle();
    const p = await get(id);
    expect(p.job).toBeUndefined();
    expect(p.versions).toHaveLength(1);
    expect(p.videos).toEqual([]);
    expect(p.messages.at(-1)?.text).toBe(
      "No pude crear el video: El motor de imágenes no pudo generar el video. Puedes reintentarlo con «Crear video».",
    );
    const files = (await company.repo.db
      .prepare("SELECT path FROM design_files")
      .all()) as { path: string }[];
    expect(files.some((f) => f.path.includes("/videos/"))).toBe(false);
  });

  it("reports a failed render in the chat and leaves no version or stray files", async () => {
    const broken: RenderProvider = {
      name: "broken",
      billable: false,
      render: async () => {
        throw new HttpError(
          502,
          "El motor de imágenes no pudo generar la vista.",
        );
      },
    };
    const { company, service, ready, get, say } = await start({
      renderer: broken,
    });
    const id = await ready();
    await say(id, "Boda para 120 invitados");
    await service.idle();
    const p = await get(id);
    expect(p.job).toBeUndefined();
    expect(p.versions).toEqual([]);
    expect(p.messages.at(-1)?.text).toBe(
      "No pude completarlo: El motor de imágenes no pudo generar la vista.",
    );
    const files = await company.repo.db
      .prepare("SELECT path FROM design_files")
      .all();
    expect(files.map((f: { path: string }) => f.path)).toEqual([
      expect.stringContaining("/images/"),
    ]);
  });

  it("frees a job that was cut off (no worker, older than KIT_JOB_STALE_MS)", async () => {
    const { company, service, ready } = await start();
    const id = await ready();
    await company.repo.db
      .prepare("UPDATE design_projects SET job=? WHERE id=?")
      .run(
        JSON.stringify({
          id: "old",
          kind: "video",
          request: "Video",
          renderId: "x",
          startedAt: new Date(Date.now() - 3_600_000).toISOString(),
        }),
        id,
      );
    const p = await service.project(id);
    expect(p.job).toBeUndefined();
    expect(p.messages.at(-1)?.text).toContain("se interrumpió");
  });

  it("sends videos through a short-lived signed link when the storage offers one", async () => {
    const signed: string[] = [];
    const store = new Map<string, Buffer>();
    const storage = {
      name: "supabase" as const,
      async put(path: string, b: Buffer) {
        store.set(path, b);
      },
      async get(path: string) {
        return {
          bytes: store.get(path)!,
          mimeType: path.endsWith(".mp4") ? "video/mp4" : "image/png",
        };
      },
      async remove(paths: string[]) {
        paths.forEach((p) => store.delete(p));
      },
      async signedUrl(path: string, seconds: number) {
        signed.push(`${path}|${seconds}`);
        return `https://x.supabase.co/storage/v1/object/sign/kit-design/${path}?token=t`;
      },
    };
    const { service, get, ready, say, raw } = await start({ storage });
    const id = await ready();
    await say(id, BRIEF);
    await service.idle();
    const p = await get(id);
    const video = await raw(p.videos[0].url, undefined, "manual");
    expect(video.status).toBe(302);
    expect(video.headers.get("location")).toMatch(
      /^https:\/\/x\.supabase\.co\/storage\/v1\/object\/sign\/kit-design\/.+\/videos\/.+\.mp4\?token=t$/,
    );
    expect(video.headers.get("cache-control")).toContain("no-store");
    expect(signed[0]).toMatch(/\.mp4\|3600$/);
    // Images are still served by the server itself.
    const image = await raw(p.images[0].url, undefined, "manual");
    expect(image.status).toBe(200);
  }, 30_000);
});

describe("Higgsfield providers", () => {
  it("picks the accepted aspect ratio closest to the photo", () => {
    expect(closestAspectRatio(1600, 1200)).toBe("4:3");
    expect(closestAspectRatio(1920, 1080)).toBe("16:9");
    expect(closestAspectRatio(1000, 1000)).toBe("1:1");
    expect(closestAspectRatio(1080, 1920)).toBe("9:16");
  });

  type Final = Record<string, unknown>;
  function stub(
    submitPath: string,
    final: Final,
    opts: { submitStatus?: number; download?: Response } = {},
  ) {
    const calls: { url: string; init: RequestInit }[] = [];
    let polls = 0;
    const transport = (async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        });
      if (url.endsWith("/files/generate-upload-url"))
        return json({
          public_url: "https://cdn.higgsfield.test/in.png",
          upload_url: "https://storage.higgsfield.test/put",
          upload_headers: {
            "Content-Type": "image/png",
            "x-amz-tagging": "retention=temporary",
          },
        });
      if (url === "https://storage.higgsfield.test/put")
        return new Response(null, { status: 200 });
      if (url.endsWith(`/${submitPath}`))
        return opts.submitStatus
          ? json({ detail: "x" }, opts.submitStatus)
          : json({
              status: "queued",
              request_id: "req-1",
              status_url: "https://api.higgsfield.ai/requests/req-1/status",
            });
      if (url.endsWith("/requests/req-1/status"))
        return json(++polls < 2 ? { status: "in_progress" } : final);
      if (url === "https://cdn.higgsfield.test/out.png")
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/png" },
        });
      if (url === "https://cdn.higgsfield.test/out.mp4")
        return (
          opts.download ??
          new Response(FIXTURE_VIDEO, {
            headers: { "content-type": "video/mp4" },
          })
        );
      throw new Error(`unexpected ${url}`);
    }) as typeof fetch;
    return { calls, transport };
  }
  const input = {
    image: { bytes: PNG, mimeType: "image/png", width: 1600, height: 1200 },
    prompt: "Same room, wedding setup",
  };
  const quick = { wait: async () => {} };
  const VIDEO = "kling-video/v3.0/std/image-to-video";
  const still = { image: { bytes: PNG, mimeType: "image/png" }, prompt: "x" };

  it("edits the image: uploads, submits, polls and downloads", async () => {
    const { calls, transport } = stub("alibaba/qwen-image-3/edit", {
      status: "completed",
      images: [{ url: "https://cdn.higgsfield.test/out.png" }],
    });
    const provider = higgsfieldRenderProvider({
      key: "id:secret",
      transport,
      ...quick,
    });
    const out = await provider.render(input);
    expect([...out.bytes]).toEqual([1, 2, 3]);
    expect(out.mimeType).toBe("image/png");
    const [uploadUrl, put, submit] = calls;
    expect(
      (uploadUrl.init.headers as Record<string, string>).Authorization,
    ).toBe("Key id:secret");
    // Credentials never go to the presigned upload URL.
    expect(JSON.stringify(put.init.headers)).not.toContain("secret");
    expect((put.init.headers as Record<string, string>)["x-amz-tagging"]).toBe(
      "retention=temporary",
    );
    expect(JSON.parse(String(submit.init.body))).toMatchObject({
      prompt: "Same room, wedding setup",
      image_urls: ["https://cdn.higgsfield.test/in.png"],
      aspect_ratio: "4:3",
      resolution: "2k",
    });
    expect(
      (submit.init.headers as Record<string, string>)["Idempotency-Key"],
    ).toBeTruthy();
    expect(calls.filter((c) => c.url.endsWith("/status"))).toHaveLength(2);
    expect(provider).toMatchObject({ name: "higgsfield", billable: true });
  });

  it("explains rejected content and an empty balance in Spanish", async () => {
    const nsfw = stub("alibaba/qwen-image-3/edit", { status: "nsfw" });
    await expect(
      higgsfieldRenderProvider({
        key: "k:s",
        transport: nsfw.transport,
        ...quick,
      }).render(input),
    ).rejects.toThrow("rechazó el contenido");
    const broke = stub("alibaba/qwen-image-3/edit", {}, { submitStatus: 403 });
    await expect(
      higgsfieldRenderProvider({
        key: "k:s",
        transport: broke.transport,
        ...quick,
      }).render(input),
    ).rejects.toThrow("saldo suficiente");
  });

  it("makes the video from the render: image as first frame, camera move prompt, sound off", async () => {
    const { calls, transport } = stub(VIDEO, {
      status: "completed",
      video: { url: "https://cdn.higgsfield.test/out.mp4" },
    });
    const provider = higgsfieldVideoProvider({
      key: "id:secret",
      transport,
      seconds: 8,
      ...quick,
    });
    const out = await provider.video({
      image: { bytes: PNG, mimeType: "image/png" },
      prompt: videoPrompt("Gala dorada"),
    });
    expect(out.mimeType).toBe("video/mp4");
    expect(out.bytes.equals(FIXTURE_VIDEO)).toBe(true);
    const submit = calls.find((c) => c.url.endsWith(`/${VIDEO}`))!;
    const body = JSON.parse(String(submit.init.body));
    expect(body).toMatchObject({
      image_url: "https://cdn.higgsfield.test/in.png",
      duration: 8,
      sound: "off",
    });
    expect(body.prompt).toContain(
      "Keep every wall, table, chair, stage, screen and light exactly as shown",
    );
    expect(body.prompt).toContain("Mood: Gala dorada.");
    expect(provider).toMatchObject({ name: "higgsfield", billable: true });
  });

  it("keeps video length within what the model accepts, and rejects odd downloads", async () => {
    const done = {
      status: "completed",
      video: { url: "https://cdn.higgsfield.test/out.mp4" },
    };
    const long = stub(VIDEO, done);
    await higgsfieldVideoProvider({
      key: "k:s",
      transport: long.transport,
      seconds: 99,
      ...quick,
    }).video(still);
    const sent = JSON.parse(
      String(long.calls.find((c) => c.url.endsWith(VIDEO))!.init.body),
    );
    expect(sent.duration).toBe(15);

    const html = stub(VIDEO, done, {
      download: new Response("<html>", {
        headers: { "content-type": "text/html" },
      }),
    });
    await expect(
      higgsfieldVideoProvider({
        key: "k:s",
        transport: html.transport,
        ...quick,
      }).video(still),
    ).rejects.toThrow("archivo inesperado");
    const none = stub(VIDEO, { status: "completed" });
    await expect(
      higgsfieldVideoProvider({
        key: "k:s",
        transport: none.transport,
        ...quick,
      }).video(still),
    ).rejects.toThrow("no pudo generar el video");
  });
});

describe("Claude spec writer", () => {
  it("keeps only real catalog ids and gives every image a view", async () => {
    let request: any;
    const transport = (async (_url: string, init: RequestInit) => {
      request = JSON.parse(String(init.body));
      const answer = {
        spec: {
          room: {
            widthM: 20,
            depthM: null,
            heightM: 4,
            notes: "Ventanales al norte",
          },
          style: { mood: "Elegante", palette: ["dorado"], lighting: "Cálida" },
          items: [
            {
              equipmentId: "q1",
              label: "Bocina",
              quantity: 4,
              placement: "Laterales",
            },
            {
              equipmentId: "invented",
              label: "Pista de baile",
              quantity: 1,
              placement: "Centro",
            },
          ],
        },
        views: [
          { imageId: "img-1", prompt: "Same room, gala setup" },
          { imageId: "img-1", prompt: "duplicate" },
          { imageId: "not-an-image", prompt: "ignored" },
        ],
        reply: "Diseñé una gala elegante.",
      };
      return new Response(
        JSON.stringify({
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify(answer) }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const designer = aiDesigner(
      "anthropic",
      "key",
      "claude-opus-5-5",
      transport,
    );
    const result = await designer.create({
      brief: "Gala para 200",
      event: { name: "Gala", type: "Gala", attendees: 200, date: "2026-12-10" },
      images: [
        { id: "img-1", name: "a.jpg", mimeType: "image/jpeg", data: "AA==" },
        { id: "img-2", name: "b.jpg", mimeType: "image/jpeg", data: "AA==" },
      ],
      catalog: [
        {
          id: "q1",
          name: "Bocina",
          category: "Audio",
          sku: "",
          quantity: 10,
          maintenance: 0,
          rate: 1,
          description: "",
        },
      ],
    });
    expect(
      request.messages[0].content.filter((c: any) => c.type === "image"),
    ).toHaveLength(2);
    expect(request.system).toContain("isometric 3D cutaway");
    expect(result.reply).toBe("Diseñé una gala elegante.");
    expect(result.spec.room).toEqual({
      widthM: 20,
      heightM: 4,
      measured: "estimated",
      notes: "Ventanales al norte",
    });
    expect(result.spec.items[0].equipmentId).toBe("q1");
    expect(result.spec.items[1].equipmentId).toBeUndefined();
    expect(
      result.spec.views.map((v) => [v.sourceImageId, v.prompt.slice(0, 9)]),
    ).toEqual([
      ["img-1", "Same room"],
      ["img-2", "Keep the "],
    ]);
  });
});

describe("KIT Design configuration and storage", () => {
  it("uses live providers only when their keys are set", () => {
    const ai = {
      provider: "anthropic" as const,
      key: "k",
      planModel: "claude-opus-5-5",
    };
    const live = designFromEnv(
      {
        HIGGSFIELD_KEY_ID: "id",
        HIGGSFIELD_KEY_SECRET: "secret",
        SUPABASE_URL: "https://x.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret",
        KIT_DESIGN_MONTHLY_RENDER_CAP: "40",
        KIT_DESIGN_MONTHLY_VIDEO_CAP: "6",
      } as NodeJS.ProcessEnv,
      ai,
    );
    expect(live.designer?.label).toContain("claude-opus-5-5");
    expect(live.renderer?.name).toBe("higgsfield");
    expect(live.videoRenderer?.name).toBe("higgsfield");
    expect(live.storage?.name).toBe("supabase");
    expect(live.monthlyRenderCap).toBe(40);
    expect(live.monthlyVideoCap).toBe(6);
    expect(designFromEnv({} as NodeJS.ProcessEnv, null)).toEqual({
      designer: undefined,
      renderer: undefined,
      videoRenderer: undefined,
      storage: undefined,
      monthlyRenderCap: 100,
      monthlyVideoCap: 10,
    });
  });

  it("talks to the private Supabase bucket with the server key only", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const transport = (async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      if (url.includes("/object/sign/"))
        return new Response(
          JSON.stringify({
            signedURL: "/object/sign/kit-design/e2/videos/a.mp4?token=abc",
          }),
          { status: 200 },
        );
      return new Response(init.method ? "{}" : new Uint8Array([9]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    }) as typeof fetch;
    const storage = supabaseStorage(
      "https://x.supabase.co/",
      "sb_secret",
      "kit-design",
      transport,
    );
    await storage.put("e2/images/a b.jpg", Buffer.from([1]), "image/jpeg");
    const file = await storage.get("e2/images/a b.jpg");
    const link = await storage.signedUrl!("e2/videos/a.mp4", 3600);
    await storage.remove(["e2/images/a b.jpg"]);
    expect(calls.map((c) => `${c.init.method ?? "GET"} ${c.url}`)).toEqual([
      "POST https://x.supabase.co/storage/v1/object/kit-design/e2/images/a%20b.jpg",
      "GET https://x.supabase.co/storage/v1/object/authenticated/kit-design/e2/images/a%20b.jpg",
      "POST https://x.supabase.co/storage/v1/object/sign/kit-design/e2/videos/a.mp4",
      "DELETE https://x.supabase.co/storage/v1/object/kit-design",
    ]);
    expect((calls[0].init.headers as Record<string, string>)["x-upsert"]).toBe(
      "true",
    );
    expect(JSON.parse(String(calls[2].init.body))).toEqual({ expiresIn: 3600 });
    expect(link).toBe(
      "https://x.supabase.co/storage/v1/object/sign/kit-design/e2/videos/a.mp4?token=abc",
    );
    expect(JSON.parse(String(calls[3].init.body))).toEqual({
      prefixes: ["e2/images/a b.jpg"],
    });
    expect(file).toEqual({ bytes: Buffer.from([9]), mimeType: "image/jpeg" });
  });

  it("serves bytes itself when the storage cannot sign links", () => {
    expect(databaseStorage({} as never).signedUrl).toBeUndefined();
  });
});

describe("migration 14 (several designs per event, videos)", () => {
  const sql = (file: string) =>
    readFileSync(
      new URL(`../../supabase/migrations/${file}`, import.meta.url),
      "utf8",
    );

  it("upgrades a database made under migration 13 and can run again", async () => {
    const db = new PGlite();
    await db.waitReady;
    await db.exec(sql("20261107000012_kit_company_schema.sql"));
    await db.exec(sql("20261109000013_kit_design.sql"));
    // Data as migration 13 stored it: the event id is the design's key.
    await db.exec(`
      INSERT INTO kit.design_projects (event_id, brief, current_version_id, updated_at)
        VALUES ('e2', 'Boda para 120 con escenario al fondo y pantalla LED', 'v1', '2026-11-09T10:00:00.000Z');
      INSERT INTO kit.design_images (id, event_id, name, mime_type, width, height, file_path, created_by, created_at)
        VALUES ('i1', 'e2', 'a.png', 'image/png', 10, 10, 'e2/images/i1.png', 'u', '2026-11-09T10:00:00.000Z');
      INSERT INTO kit.design_versions (id, event_id, number, request, spec, created_by, created_at)
        VALUES ('v1', 'e2', 1, 'Boda', '{}', 'u', '2026-11-09T10:00:00.000Z');
      INSERT INTO kit.design_renders (id, version_id, event_id, position, view_id, source_image_id, file_path, mime_type, provider, created_at)
        VALUES ('r1', 'v1', 'e2', 0, 'w1', 'i1', 'e2/renders/r1.png', 'image/png', 'fixture', '2026-11-09T10:00:00.000Z');
      INSERT INTO kit.design_messages (id, event_id, role, text, created_at)
        VALUES ('m1', 'e2', 'user', 'Boda', '2026-11-09T10:00:00.000Z');
    `);
    const migration = sql("20261110000014_kit_design_chats_and_video.sql");
    await db.exec(migration);
    await db.exec(migration);
    const project = (
      await db.query("SELECT id, event_id, title FROM kit.design_projects")
    ).rows;
    expect(project).toEqual([
      {
        id: "e2",
        event_id: "e2",
        title: "Boda para 120 con escenario al fondo y pantalla LED",
      },
    ]);
    for (const table of [
      "design_images",
      "design_versions",
      "design_renders",
      "design_messages",
    ])
      expect(
        (await db.query(`SELECT design_id FROM kit.${table}`)).rows,
      ).toEqual([{ design_id: "e2" }]);
    // A second design on the same event is now possible, with its own version numbers.
    await db.exec(`
      INSERT INTO kit.design_projects (id, event_id, title, brief, created_at, updated_at)
        VALUES ('d2', 'e2', 'Otro', '', 'x', 'x');
      INSERT INTO kit.design_versions (id, design_id, event_id, number, request, spec, created_by, created_at)
        VALUES ('v2', 'd2', 'e2', 1, 'x', '{}', 'u', 'x');
    `);
    // A video belongs to a render and dies with its version.
    await db.exec(`
      INSERT INTO kit.design_videos (id, design_id, event_id, version_id, render_id, file_path, mime_type, provider, created_at)
        VALUES ('vd1', 'e2', 'e2', 'v1', 'r1', 'e2/videos/vd1.mp4', 'video/mp4', 'fixture', 'x');
      DELETE FROM kit.design_versions WHERE id = 'v1';
    `);
    expect((await db.query("SELECT id FROM kit.design_videos")).rows).toEqual(
      [],
    );
    await db.close();
  });
});

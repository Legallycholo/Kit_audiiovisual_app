import { afterEach, describe, expect, it } from "vitest";
import { startCompany } from "../testing/harness";
import type { DesignProject, DesignStatus } from "../../src/shared/kit-design";
import { HttpError } from "../database";
import { designFromEnv } from "../bootstrap";
import { aiDesigner, SAMPLE_NOTICE } from "./designer";
import {
  closestAspectRatio,
  higgsfieldRenderProvider,
  type RenderProvider,
} from "./render-provider";
import { supabaseStorage } from "./storage";
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

let company: Awaited<ReturnType<typeof startCompany>> | undefined;
afterEach(async () => {
  await company?.close();
  company = undefined;
});

async function start(design?: DesignConfig) {
  company = await startCompany(design ? { design } : {});
  const service = company.app.locals.designAI as DesignAIService;
  const call = company.call;
  const owner = company.owner;
  const project = async (eventId = "e2") =>
    (await call(`/design/events/${eventId}`, "GET", undefined, owner))
      .json as DesignProject;
  return { company, service, call, owner, project };
}

describe("KIT Design API (fixtures)", () => {
  it("turns room images into versions with Aplicar / Descartar, all stored on the server", async () => {
    const { service, call, owner, project } = await start();
    const status = (await call("/design/status", "GET", undefined, owner))
      .json as DesignStatus;
    expect(status).toMatchObject({
      designer: null,
      renderer: "fixture",
      canEdit: true,
    });

    const added = await call(
      "/design/events/e2/images",
      "POST",
      upload(),
      owner,
    );
    expect(added.status).toBe(201);
    const image = (added.json as DesignProject).images[0];
    const file = await fetchFile(image.url);
    expect(file.type).toBe("image/png");
    expect(file.bytes.equals(PNG)).toBe(true);

    const short = await call(
      "/design/events/e2/messages",
      "POST",
      { text: "Boda" },
      owner,
    );
    expect(short.status).toBe(422);

    const started = await call(
      "/design/events/e2/messages",
      "POST",
      { text: "Boda para 120, escenario al fondo" },
      owner,
    );
    expect(started.status).toBe(202);
    expect((started.json as DesignProject).job?.kind).toBe("create");
    await service.idle();

    let p = await project();
    expect(p.job).toBeUndefined();
    expect(p.brief).toBe("Boda para 120, escenario al fondo");
    expect(p.versions.map((v) => v.number)).toEqual([1]);
    expect(p.currentVersionId).toBe(p.versions[0].id);
    expect(p.versions[0].renders).toEqual([
      expect.objectContaining({ provider: "fixture", sourceImageId: image.id }),
    ]);
    expect(p.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(p.messages[1].text).toContain(SAMPLE_NOTICE);
    expect(p.versions[0].spec.items.length).toBeGreaterThan(0);

    // Images are fixed once a design exists.
    expect(
      (await call("/design/events/e2/images", "POST", upload(), owner)).status,
    ).toBe(409);
    expect(
      (
        await call(
          `/design/events/e2/images/${image.id}`,
          "DELETE",
          undefined,
          owner,
        )
      ).status,
    ).toBe(409);

    // A refinement waits for a decision.
    await call(
      "/design/events/e2/messages",
      "POST",
      { text: "Más luz cálida" },
      owner,
    );
    await service.idle();
    p = await project();
    expect(p.pendingVersion?.number).toBe(2);
    expect(p.currentVersionId).toBe(p.versions[0].id);
    expect(
      (
        await call(
          "/design/events/e2/messages",
          "POST",
          { text: "Otro cambio" },
          owner,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(
          "/design/events/e2/select",
          "POST",
          { versionId: p.versions[0].id },
          owner,
        )
      ).status,
    ).toBe(409);

    p = (await call("/design/events/e2/discard", "POST", undefined, owner))
      .json;
    expect(p.pendingVersion).toBeUndefined();
    expect(p.versions).toHaveLength(1);

    await call(
      "/design/events/e2/messages",
      "POST",
      { text: "Pantalla más grande" },
      owner,
    );
    await service.idle();
    p = (await call("/design/events/e2/apply", "POST", undefined, owner)).json;
    expect(p.pendingVersion).toBeUndefined();
    expect(p.versions.map((v) => v.number)).toEqual([1, 2]);
    expect(p.currentVersionId).toBe(p.versions[1].id);
    expect(
      (await call("/design/events/e2/apply", "POST", undefined, owner)).status,
    ).toBe(409);

    p = (
      await call(
        "/design/events/e2/select",
        "POST",
        { versionId: p.versions[0].id },
        owner,
      )
    ).json;
    expect(p.currentVersionId).toBe(p.versions[0].id);

    // Every project is per event.
    expect((await project("e1")).images).toEqual([]);

    async function fetchFile(url: string) {
      const response = await fetch(`${company!.url}${url}`, {
        headers: { Cookie: owner.cookie, Origin: "http://localhost:5173" },
      });
      return {
        type: response.headers.get("content-type")?.split(";")[0],
        bytes: Buffer.from(await response.arrayBuffer()),
      };
    }
  }, 20_000); // ~25 sequential requests; the 5 s default is too tight when the whole suite runs in parallel.

  it("rejects files that are not the image they claim to be, and more than six", async () => {
    const { call, owner } = await start();
    const fake = {
      ...upload(),
      mimeType: "image/jpeg",
      dataUrl: `data:image/jpeg;base64,${PNG_BASE64}`,
    };
    expect(
      (await call("/design/events/e2/images", "POST", fake, owner)).status,
    ).toBe(422);
    const mismatch = { ...upload(), mimeType: "image/jpeg" };
    expect(
      (await call("/design/events/e2/images", "POST", mismatch, owner)).status,
    ).toBe(422);
    for (let i = 0; i < 6; i++)
      expect(
        (
          await call(
            "/design/events/e2/images",
            "POST",
            upload(`s${i}.png`),
            owner,
          )
        ).status,
      ).toBe(201);
    expect(
      (await call("/design/events/e2/images", "POST", upload(), owner)).status,
    ).toBe(409);
    expect(
      (await call("/design/events/missing", "GET", undefined, owner)).status,
    ).toBe(404);
  });

  it("refuses a second request while KIT Design is still working", async () => {
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
    const { service, call, owner } = await start({ renderer: slow });
    await call("/design/events/e2/images", "POST", upload(), owner);
    const first = await call(
      "/design/events/e2/messages",
      "POST",
      { text: "Boda para 120 invitados" },
      owner,
    );
    expect(first.status).toBe(202);
    const busy = await call(
      "/design/events/e2/messages",
      "POST",
      { text: "Otra cosa más" },
      owner,
    );
    expect(busy.status).toBe(409);
    expect(
      (await call("/design/events/e2/images", "POST", upload(), owner)).status,
    ).toBe(409);
    release();
    await service.idle();
    expect((await service.project("e2")).versions).toHaveLength(1);
  });

  it("needs at least one image before designing", async () => {
    const { call, owner } = await start();
    const response = await call(
      "/design/events/e2/messages",
      "POST",
      { text: "Boda para 120 invitados" },
      owner,
    );
    expect(response.status).toBe(409);
  });

  it("enforces who can see and who can create designs", async () => {
    const { company, call, owner } = await start();
    await call("/design/events/e2/images", "POST", upload(), owner);
    const sales = await company.account("Sales Manager");
    expect(
      (await call("/design/events/e2", "GET", undefined, sales)).status,
    ).toBe(403);
    expect((await call("/design/status", "GET", undefined, sales)).status).toBe(
      403,
    );

    // A technician without the event cannot see it; with it, can look but not create.
    const outsider = await company.account("Technician");
    expect(
      (await call("/design/events/e2", "GET", undefined, outsider)).status,
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
    const seen = await call("/design/events/e2", "GET", undefined, tech);
    expect(seen.status).toBe(200);
    const imageUrl = (seen.json as DesignProject).images[0].url;
    const fileStatus = async (session: { cookie: string }) =>
      (
        await fetch(`${company.url}${imageUrl}`, {
          headers: { Cookie: session.cookie, Origin: "http://localhost:5173" },
        })
      ).status;
    expect(await fileStatus(tech)).toBe(200);
    expect(await fileStatus(outsider)).toBe(403);
    expect(
      (await call("/design/events/e2/images", "POST", upload(), tech)).status,
    ).toBe(403);
    expect(
      (
        await call(
          "/design/events/e2/messages",
          "POST",
          { text: "Boda para 120 invitados" },
          tech,
        )
      ).status,
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
    const { service, call, owner } = await start({
      renderer: paid,
      monthlyRenderCap: 1,
    });
    await call("/design/events/e2/images", "POST", upload("a.png"), owner);
    await call("/design/events/e2/images", "POST", upload("b.png"), owner);
    const over = await call(
      "/design/events/e2/messages",
      "POST",
      { text: "Boda para 120 invitados" },
      owner,
    );
    expect(over.status).toBe(429);
    expect(over.json.error).toContain("límite mensual de renders (1)");

    await call(
      `/design/events/e2/images/${(await service.project("e2")).images[1].id}`,
      "DELETE",
      undefined,
      owner,
    );
    const ok = await call(
      "/design/events/e2/messages",
      "POST",
      { text: "Boda para 120 invitados" },
      owner,
    );
    expect(ok.status).toBe(202);
    await service.idle();
    const status = (await call("/design/status", "GET", undefined, owner))
      .json as DesignStatus;
    expect(status.usage).toMatchObject({ renders: 1, cap: 1 });
    const p = await service.project("e2");
    expect(p.messages.at(-1)?.text).not.toContain(SAMPLE_NOTICE);
    // The refinement would need one more render: over the cap.
    expect(
      (
        await call(
          "/design/events/e2/messages",
          "POST",
          { text: "Más luz" },
          owner,
        )
      ).status,
    ).toBe(429);
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
    const { company, service, call, owner } = await start({ renderer: broken });
    await call("/design/events/e2/images", "POST", upload(), owner);
    await call(
      "/design/events/e2/messages",
      "POST",
      { text: "Boda para 120 invitados" },
      owner,
    );
    await service.idle();
    const p = await service.project("e2");
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
    const { company, service, call, owner } = await start();
    await call("/design/events/e2/images", "POST", upload(), owner);
    await company.repo.db
      .prepare("UPDATE design_projects SET job=? WHERE event_id='e2'")
      .run(
        JSON.stringify({
          id: "old",
          kind: "create",
          request: "x",
          startedAt: new Date(Date.now() - 3_600_000).toISOString(),
        }),
      );
    const p = await service.project("e2");
    expect(p.job).toBeUndefined();
    expect(p.messages.at(-1)?.text).toContain("se interrumpió");
  });
});

describe("Higgsfield render provider", () => {
  it("picks the accepted aspect ratio closest to the photo", () => {
    expect(closestAspectRatio(1600, 1200)).toBe("4:3");
    expect(closestAspectRatio(1920, 1080)).toBe("16:9");
    expect(closestAspectRatio(1000, 1000)).toBe("1:1");
    expect(closestAspectRatio(1080, 1920)).toBe("9:16");
  });

  function stub(
    final: Record<string, unknown>,
    opts: { submitStatus?: number } = {},
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
      if (url.endsWith("/alibaba/qwen-image-3/edit"))
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
      throw new Error(`unexpected ${url}`);
    }) as typeof fetch;
    return { calls, transport };
  }
  const input = {
    image: { bytes: PNG, mimeType: "image/png", width: 1600, height: 1200 },
    prompt: "Same room, wedding setup",
  };

  it("uploads, submits an image edit, polls and downloads the result", async () => {
    const { calls, transport } = stub({
      status: "completed",
      images: [{ url: "https://cdn.higgsfield.test/out.png" }],
    });
    const provider = higgsfieldRenderProvider({
      key: "id:secret",
      transport,
      wait: async () => {},
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
    const body = JSON.parse(String(submit.init.body));
    expect(body).toMatchObject({
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
    const nsfw = stub({ status: "nsfw" });
    await expect(
      higgsfieldRenderProvider({
        key: "k:s",
        transport: nsfw.transport,
        wait: async () => {},
      }).render(input),
    ).rejects.toThrow("rechazó el contenido");
    const broke = stub({}, { submitStatus: 403 });
    await expect(
      higgsfieldRenderProvider({
        key: "k:s",
        transport: broke.transport,
        wait: async () => {},
      }).render(input),
    ).rejects.toThrow("saldo suficiente");
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
      } as NodeJS.ProcessEnv,
      ai,
    );
    expect(live.designer?.label).toContain("claude-opus-5-5");
    expect(live.renderer?.name).toBe("higgsfield");
    expect(live.storage?.name).toBe("supabase");
    expect(live.monthlyRenderCap).toBe(40);
    const offline = designFromEnv({} as NodeJS.ProcessEnv, null);
    expect(offline).toEqual({
      designer: undefined,
      renderer: undefined,
      storage: undefined,
      monthlyRenderCap: 100,
    });
  });

  it("talks to the private Supabase bucket with the server key only", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const transport = (async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
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
    await storage.remove(["e2/images/a b.jpg"]);
    expect(calls.map((c) => `${c.init.method ?? "GET"} ${c.url}`)).toEqual([
      "POST https://x.supabase.co/storage/v1/object/kit-design/e2/images/a%20b.jpg",
      "GET https://x.supabase.co/storage/v1/object/authenticated/kit-design/e2/images/a%20b.jpg",
      "DELETE https://x.supabase.co/storage/v1/object/kit-design",
    ]);
    expect((calls[0].init.headers as Record<string, string>)["x-upsert"]).toBe(
      "true",
    );
    expect(JSON.parse(String(calls[2].init.body))).toEqual({
      prefixes: ["e2/images/a b.jpg"],
    });
    expect(file).toEqual({ bytes: Buffer.from([9]), mimeType: "image/jpeg" });
  });
});

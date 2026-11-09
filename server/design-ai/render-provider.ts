import { randomUUID } from "node:crypto";
import { HttpError } from "../database";
import { FIXTURE_VIDEO } from "./fixture-video";

export interface RenderInput {
  /** The room photo (first render) or the current render (refinements). */
  image: { bytes: Buffer; mimeType: string; width: number; height: number };
  prompt: string;
  signal?: AbortSignal;
}
export interface RenderOutput {
  bytes: Buffer;
  mimeType: string;
}

/** Paints one view. Every implementation must keep the room recognisably the same. */
export interface RenderProvider {
  /** Stored on each render; "fixture" marks sample images in the UI. */
  readonly name: string;
  /** True when each render costs money and counts against the monthly cap. */
  readonly billable: boolean;
  render(input: RenderInput): Promise<RenderOutput>;
}

/**
 * Sample provider for local development and tests: returns the input image
 * unchanged. The UI labels these renders "MUESTRA", so they cannot pass for
 * real ones.
 */
export const fixtureRenderProvider: RenderProvider = {
  name: "fixture",
  billable: false,
  async render({ image }) {
    return { bytes: image.bytes, mimeType: image.mimeType };
  },
};

/** Aspect ratios Qwen Image 3 Edit accepts. */
const RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "7:9",
  "9:7",
  "9:16",
  "16:9",
  "21:9",
];

/** The accepted aspect ratio closest to width:height, so the room is not stretched. */
export function closestAspectRatio(width: number, height: number) {
  const target = Math.log(width / height);
  return RATIOS.reduce((best, ratio) => {
    const [w, h] = ratio.split(":").map(Number);
    const [bw, bh] = best.split(":").map(Number);
    return Math.abs(Math.log(w / h) - target) <
      Math.abs(Math.log(bw / bh) - target)
      ? ratio
      : best;
  });
}

export interface VideoInput {
  /** The 3D-looking render to bring to life. */
  image: { bytes: Buffer; mimeType: string };
  prompt: string;
  signal?: AbortSignal;
}
export interface VideoOutput {
  bytes: Buffer;
  mimeType: "video/mp4";
}

/** Turns one render into a short video with a camera move. The scene itself must not change. */
export interface VideoProvider {
  /** Stored on each video; "fixture" marks sample videos in the UI. */
  readonly name: string;
  /** True when each video costs money and counts against the monthly video cap. */
  readonly billable: boolean;
  video(input: VideoInput): Promise<VideoOutput>;
}

/** Sample provider for local development and tests: a short bundled clip. */
export const fixtureVideoProvider: VideoProvider = {
  name: "fixture",
  billable: false,
  async video() {
    return { bytes: FIXTURE_VIDEO, mimeType: "video/mp4" };
  },
};

/**
 * The instruction that makes a flat plan read as a 3D space: only the camera
 * moves. Built here (not by the model) so it stays the same for every video.
 */
export function videoPrompt(mood = "") {
  return (
    "Smooth cinematic aerial camera move: a slow orbit with a gentle push-in around this 3D rendering of an event layout, " +
    "so the space reads clearly in three dimensions. Keep every wall, table, chair, stage, screen and light exactly as shown. " +
    "No new objects, no people appearing, no text, no cuts, steady lighting." +
    (mood.trim() ? ` Mood: ${mood.trim().slice(0, 200)}.` : "")
  );
}

export interface HiggsfieldOptions {
  /** "KEY_ID:KEY_SECRET", sent as `Authorization: Key …`. */
  key: string;
  /** Model path; defaults to Qwen Image 3 Edit (keeps the room, edits its contents). */
  model?: string;
  resolution?: "1k" | "2k";
  transport?: typeof fetch;
  /** Waits between status polls; injectable so tests do not sleep. */
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Gives up after this long (ms). */
  timeoutMs?: number;
}

const defaultWait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });

const API = "https://api.higgsfield.ai";
const TERMINAL = ["completed", "failed", "nsfw", "canceled"];

/**
 * The Higgsfield request flow shared by images and videos
 * (https://docs.higgsfield.ai): upload the input to a Higgsfield signed URL
 * (our own storage stays private), submit with an idempotency key, poll the
 * status, then download the result before Higgsfield deletes it.
 */
function higgsfieldClient(options: {
  key: string;
  transport?: typeof fetch;
  wait?: HiggsfieldOptions["wait"];
  timeoutMs: number;
  what: "imagen" | "video";
}) {
  const send = options.transport ?? fetch;
  const wait = options.wait ?? defaultWait;
  const auth = { Authorization: `Key ${options.key}` };

  async function call(
    url: string,
    init: RequestInit & { signal?: AbortSignal },
  ): Promise<any> {
    let response: Response;
    try {
      response = await send(url, { ...init, redirect: "error" });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") throw error;
      throw new HttpError(503, "No se pudo contactar el motor de imágenes.");
    }
    if (!response.ok) {
      const message =
        response.status === 401
          ? "La clave del motor de imágenes no es válida."
          : response.status === 403
            ? "El motor de imágenes no tiene saldo suficiente."
            : response.status === 429
              ? "El motor de imágenes está ocupado. Intenta en unos minutos."
              : response.status === 400 || response.status === 422
                ? "El motor de imágenes rechazó la imagen o la instrucción."
                : `El motor de imágenes no pudo generar ${options.what === "video" ? "el video" : "la vista"}.`;
      throw new HttpError(response.status === 429 ? 429 : 502, message);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }

  return {
    signal(external?: AbortSignal) {
      const timeout = AbortSignal.timeout(options.timeoutMs);
      return external ? AbortSignal.any([external, timeout]) : timeout;
    },
    /** Uploads the input image and returns its public URL. */
    async upload(
      image: { bytes: Buffer; mimeType: string },
      signal: AbortSignal,
    ) {
      const upload = await call(`${API}/files/generate-upload-url`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ content_type: image.mimeType }),
        signal,
      });
      if (!upload.upload_url || !upload.public_url)
        throw new HttpError(502, "El motor de imágenes no aceptó la subida.");
      // Credentials are never sent to the presigned URL.
      const put = await send(upload.upload_url, {
        method: "PUT",
        headers: upload.upload_headers ?? { "Content-Type": image.mimeType },
        body: new Uint8Array(image.bytes),
        signal,
      }).catch(() => null);
      if (!put?.ok)
        throw new HttpError(
          502,
          "No se pudo subir la imagen al motor de imágenes.",
        );
      return upload.public_url as string;
    },
    /** Submits a job and polls (2 s rising to 10 s, with jitter) until it finishes. */
    async run(path: string, body: unknown, signal: AbortSignal) {
      const submitted = await call(`${API}/${path}`, {
        method: "POST",
        headers: {
          ...auth,
          "Content-Type": "application/json",
          "Idempotency-Key": randomUUID(),
        },
        body: JSON.stringify(body),
        signal,
      });
      const statusUrl: string =
        submitted.status_url ||
        `${API}/requests/${encodeURIComponent(submitted.request_id)}/status`;
      if (!statusUrl.startsWith(`${API}/`))
        throw new HttpError(502, "Respuesta inesperada del motor de imágenes.");
      let delay = 2_000;
      let result: any = submitted;
      while (!TERMINAL.includes(result.status)) {
        await wait(delay + Math.floor(Math.random() * 500), signal);
        delay = Math.min(10_000, Math.round(delay * 1.5));
        result = await call(statusUrl, { headers: auth, signal });
      }
      if (result.status === "nsfw")
        throw new HttpError(422, "El motor de imágenes rechazó el contenido.");
      if (result.status !== "completed")
        throw new HttpError(
          502,
          `El motor de imágenes no pudo generar ${options.what === "video" ? "el video" : "la vista"}.`,
        );
      return result;
    },
    /** Downloads a result now: Higgsfield keeps files only for a limited time. */
    async download(url: string, signal: AbortSignal) {
      const file = await send(url, { signal }).catch(() => null);
      if (!file?.ok)
        throw new HttpError(
          502,
          `No se pudo descargar ${options.what === "video" ? "el video" : "la vista"} generad${options.what === "video" ? "o" : "a"}.`,
        );
      return {
        bytes: Buffer.from(await file.arrayBuffer()),
        type: file.headers.get("content-type")?.split(";")[0] ?? "",
      };
    },
  };
}

/** Higgsfield image editing (default: Qwen Image 3 Edit). */
export function higgsfieldRenderProvider(
  options: HiggsfieldOptions,
): RenderProvider {
  const client = higgsfieldClient({
    ...options,
    timeoutMs: options.timeoutMs ?? 240_000,
    what: "imagen",
  });
  const model = options.model ?? "alibaba/qwen-image-3/edit";
  return {
    name: "higgsfield",
    billable: true,
    async render({ image, prompt, signal }) {
      const abort = client.signal(signal);
      const imageUrl = await client.upload(image, abort);
      const result = await client.run(
        model,
        {
          prompt,
          image_urls: [imageUrl],
          resolution: options.resolution ?? "2k",
          aspect_ratio: closestAspectRatio(image.width, image.height),
          negative_prompt:
            "different room, changed architecture, distorted walls, extra windows, text, watermark",
        },
        abort,
      );
      if (!result.images?.[0]?.url)
        throw new HttpError(
          502,
          "El motor de imágenes no pudo generar la vista.",
        );
      const file = await client.download(result.images[0].url, abort);
      const mimeType = file.type || "image/png";
      if (!/^image\/(png|jpeg|webp)$/.test(mimeType))
        throw new HttpError(
          502,
          "El motor de imágenes devolvió un archivo inesperado.",
        );
      return { bytes: file.bytes, mimeType };
    },
  };
}

export interface HiggsfieldVideoOptions {
  key: string;
  /** Default: Kling 3.0 Standard image-to-video, which uses the image as the first frame. */
  model?: string;
  /** Video length in seconds (Kling accepts 3 to 15). Longer costs more. */
  seconds?: number;
  transport?: typeof fetch;
  wait?: HiggsfieldOptions["wait"];
  timeoutMs?: number;
}

/** The largest video the private bucket accepts. */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** Higgsfield image-to-video (default: Kling 3.0 Standard). */
export function higgsfieldVideoProvider(
  options: HiggsfieldVideoOptions,
): VideoProvider {
  const client = higgsfieldClient({
    ...options,
    // Vercel functions stop at 300 s; give up a little before.
    timeoutMs: options.timeoutMs ?? 270_000,
    what: "video",
  });
  const model = options.model ?? "kling-video/v3.0/std/image-to-video";
  const seconds = Math.min(15, Math.max(3, Math.round(options.seconds ?? 5)));
  return {
    name: "higgsfield",
    billable: true,
    async video({ image, prompt, signal }) {
      const abort = client.signal(signal);
      const imageUrl = await client.upload(image, abort);
      const result = await client.run(
        model,
        { prompt, image_url: imageUrl, duration: seconds, sound: "off" },
        abort,
      );
      if (!result.video?.url)
        throw new HttpError(
          502,
          "El motor de imágenes no pudo generar el video.",
        );
      const file = await client.download(result.video.url, abort);
      if (file.bytes.length > MAX_VIDEO_BYTES)
        throw new HttpError(502, "El video generado es demasiado grande.");
      if (
        file.type &&
        !/^(video\/mp4|application\/octet-stream)$/.test(file.type)
      )
        throw new HttpError(
          502,
          "El motor de imágenes devolvió un archivo inesperado.",
        );
      return { bytes: file.bytes, mimeType: "video/mp4" };
    },
  };
}

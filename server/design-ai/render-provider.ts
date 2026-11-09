import { randomUUID } from "node:crypto";
import { HttpError } from "../database";

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

/**
 * Higgsfield (https://docs.higgsfield.ai): upload the source image to a
 * Higgsfield signed upload URL (our own storage stays private), submit an
 * image edit, poll the request status, then download the result.
 */
export function higgsfieldRenderProvider(
  options: HiggsfieldOptions,
): RenderProvider {
  const api = "https://api.higgsfield.ai";
  const send = options.transport ?? fetch;
  const wait = options.wait ?? defaultWait;
  const model = options.model ?? "alibaba/qwen-image-3/edit";
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
                : "El motor de imágenes no pudo generar la vista.";
      throw new HttpError(response.status === 429 ? 429 : 502, message);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }

  return {
    name: "higgsfield",
    billable: true,
    async render({ image, prompt, signal }) {
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 240_000);
      const abort = signal ? AbortSignal.any([signal, timeout]) : timeout;
      // 1. Upload the source image to a short-lived Higgsfield URL.
      const upload = await call(`${api}/files/generate-upload-url`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ content_type: image.mimeType }),
        signal: abort,
      });
      if (!upload.upload_url || !upload.public_url)
        throw new HttpError(502, "El motor de imágenes no aceptó la subida.");
      // Credentials are never sent to the presigned URL.
      const put = await send(upload.upload_url, {
        method: "PUT",
        headers: upload.upload_headers ?? { "Content-Type": image.mimeType },
        body: new Uint8Array(image.bytes),
        signal: abort,
      }).catch(() => null);
      if (!put?.ok)
        throw new HttpError(
          502,
          "No se pudo subir la imagen al motor de imágenes.",
        );
      // 2. Submit the edit.
      const submitted = await call(`${api}/${model}`, {
        method: "POST",
        headers: {
          ...auth,
          "Content-Type": "application/json",
          "Idempotency-Key": randomUUID(),
        },
        body: JSON.stringify({
          prompt,
          image_urls: [upload.public_url],
          resolution: options.resolution ?? "2k",
          aspect_ratio: closestAspectRatio(image.width, image.height),
          negative_prompt:
            "different room, changed architecture, distorted walls, extra windows, text, watermark",
        }),
        signal: abort,
      });
      const statusUrl: string =
        submitted.status_url ||
        `${api}/requests/${encodeURIComponent(submitted.request_id)}/status`;
      if (!statusUrl.startsWith(`${api}/`))
        throw new HttpError(502, "Respuesta inesperada del motor de imágenes.");
      // 3. Poll: 2 s, rising to 10 s, with jitter.
      let delay = 2_000;
      let result: any = submitted;
      while (
        !["completed", "failed", "nsfw", "canceled"].includes(result.status)
      ) {
        await wait(delay + Math.floor(Math.random() * 500), abort);
        delay = Math.min(10_000, Math.round(delay * 1.5));
        result = await call(statusUrl, { headers: auth, signal: abort });
      }
      if (result.status === "nsfw")
        throw new HttpError(422, "El motor de imágenes rechazó el contenido.");
      if (result.status !== "completed" || !result.images?.[0]?.url)
        throw new HttpError(
          502,
          "El motor de imágenes no pudo generar la vista.",
        );
      // 4. Download now: Higgsfield keeps results only for a limited time.
      const file = await send(result.images[0].url, { signal: abort }).catch(
        () => null,
      );
      if (!file?.ok)
        throw new HttpError(502, "No se pudo descargar la vista generada.");
      const mimeType =
        file.headers.get("content-type")?.split(";")[0] || "image/png";
      if (!/^image\/(png|jpeg|webp)$/.test(mimeType))
        throw new HttpError(
          502,
          "El motor de imágenes devolvió un archivo inesperado.",
        );
      return { bytes: Buffer.from(await file.arrayBuffer()), mimeType };
    },
  };
}

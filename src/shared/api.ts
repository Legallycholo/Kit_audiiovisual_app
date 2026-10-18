import { uiLabel } from "./i18n";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; csrf?: string } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method || "GET",
      credentials: "same-origin",
      headers: {
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(options.csrf ? { "X-CSRF-Token": options.csrf } : {}),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(
      0,
      uiLabel(
        "The company server is unavailable. Your draft has not been saved.",
      ),
    );
  }
  let result: any;
  try {
    result = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      uiLabel(
        "The company server is unavailable. Start the server and try again.",
      ),
    );
  }
  if (!response.ok)
    // Server messages are shown in Spanish when the dictionary knows them.
    throw new ApiError(
      response.status,
      uiLabel(result.error || "The request failed."),
    );
  return result as T;
}

import { HttpError } from "../database";

export const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function forbid(condition: boolean, message: string) {
  if (condition) throw new HttpError(403, message);
}
export function invalid(condition: boolean, message: string) {
  if (condition) throw new HttpError(422, message);
}

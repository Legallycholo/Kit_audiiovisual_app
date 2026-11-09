import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  fitWithin,
  isRoomImageType,
  pickEncoding,
} from "./prepare-image";

describe("room image preparation", () => {
  it("scales the longest side down and keeps the aspect ratio", () => {
    expect(fitWithin(4000, 2000, 2400)).toEqual({ width: 2400, height: 1200 });
    expect(fitWithin(1500, 3000, 1800)).toEqual({ width: 900, height: 1800 });
  });

  it("never enlarges a small image", () => {
    expect(fitWithin(800, 600, 2400)).toEqual({ width: 800, height: 600 });
  });

  it("stops at the first encoding that fits", async () => {
    const tried: string[] = [];
    const result = await pickEncoding(
      [2400, 1800],
      [0.85, 0.7],
      async (side, quality) => {
        tried.push(`${side}@${quality}`);
        return {
          size:
            side === 1800 && quality === 0.85
              ? MAX_IMAGE_BYTES
              : MAX_IMAGE_BYTES + 1,
          side,
        };
      },
    );
    expect(result.side).toBe(1800);
    expect(tried).toEqual(["2400@0.85", "2400@0.7", "1800@0.85"]);
  });

  it("fails when no encoding fits", async () => {
    await expect(
      pickEncoding([1400], [0.55], async () => ({ size: MAX_IMAGE_BYTES + 1 })),
    ).rejects.toThrow("No se pudo reducir la imagen a 1 MB.");
  });

  it("accepts only PNG, JPEG and WebP", () => {
    expect(isRoomImageType("image/jpeg")).toBe(true);
    expect(isRoomImageType("image/heic")).toBe(false);
    expect(isRoomImageType("application/pdf")).toBe(false);
  });
});

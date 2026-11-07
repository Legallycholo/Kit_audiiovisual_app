import { describe, expect, it } from "vitest";
import { toPositional } from "./translate";

describe("toPositional", () => {
  it("numbers each placeholder in order", () => {
    expect(toPositional("SELECT * FROM t WHERE a=? AND b=? LIMIT ?")).toBe(
      "SELECT * FROM t WHERE a=$1 AND b=$2 LIMIT $3",
    );
  });
  it("leaves question marks inside string literals and quoted identifiers alone", () => {
    expect(
      toPositional(
        `SELECT '?' AS q, "weird?col" FROM t WHERE a=? AND b LIKE 'x?%'`,
      ),
    ).toBe(`SELECT '?' AS q, "weird?col" FROM t WHERE a=$1 AND b LIKE 'x?%'`);
  });
  it("handles escaped quotes inside a literal", () => {
    expect(toPositional("SELECT 'it''s ?' , ?")).toBe("SELECT 'it''s ?' , $1");
  });
  it("keeps statements without placeholders unchanged", () => {
    expect(toPositional("SELECT 1")).toBe("SELECT 1");
  });
  it("numbers a long IN list", () => {
    const marks = Array.from({ length: 12 }, () => "?").join(",");
    expect(toPositional(`IN (${marks})`)).toBe(
      `IN (${Array.from({ length: 12 }, (_, i) => `$${i + 1}`).join(",")})`,
    );
  });
});

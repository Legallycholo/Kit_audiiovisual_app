import { describe, expect, it } from "vitest";
import { quoteTotals } from "./domain";
import type { QuoteLine } from "./types";

const line = (rate: number, quantity = 1, days = 1): QuoteLine => ({
  id: `l-${rate}-${quantity}-${days}`,
  description: "Equipo",
  rate,
  quantity,
  days,
});

describe("proposal money math edge cases", () => {
  it("totals an empty proposal to zero", () => {
    expect(quoteTotals([], 0, 0)).toEqual({
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0,
    });
  });

  it("treats zero quantity or zero days as no charge", () => {
    expect(quoteTotals([line(85, 0, 2), line(45, 3, 0)], 10, 11.5).total).toBe(
      0,
    );
  });

  it("a full discount leaves nothing to tax", () => {
    expect(quoteTotals([line(250, 2, 3)], 100, 11.5)).toEqual({
      subtotal: 1500,
      discount: 1500,
      tax: 0,
      total: 0,
    });
  });

  it("rounds the discount and then taxes the discounted amount", () => {
    // 100.01 subtotal; 50% discount = 50.005 -> 50.01; tax 10% of 50.00 = 5.00.
    expect(quoteTotals([line(100.01)], 50, 10)).toEqual({
      subtotal: 100.01,
      discount: 50.01,
      tax: 5,
      total: 55,
    });
  });

  it("accepts the 0 and 100 percentage bounds but nothing outside them", () => {
    expect(() => quoteTotals([line(10)], 0, 100)).not.toThrow();
    expect(() => quoteTotals([line(10)], 100.01, 0)).toThrow(
      "Discount and tax must be between 0 and 100.",
    );
    expect(() => quoteTotals([line(10)], 0, -0.01)).toThrow(
      "Discount and tax must be between 0 and 100.",
    );
  });

  it("keeps cent-precision rates exact across many lines", () => {
    const lines = Array.from({ length: 100 }, () => line(0.1, 3, 1));
    expect(quoteTotals(lines, 0, 0).subtotal).toBe(30);
  });

  // Known issue (see docs/CLEANUP_LOG.md): line extensions are rounded with
  // Math.round on a floating-point product, so some half-cent amounts round
  // down. The schema allows sub-cent rates. Fixing this changes totals and
  // needs a business decision; flip `it.fails` to `it` once fixed.
  it.fails("rounds a half-cent line extension up", () => {
    expect(quoteTotals([line(1.005)], 0, 0).subtotal).toBe(1.01);
  });
});

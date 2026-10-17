import { describe, expect, it } from "vitest";
import { createSeed } from "./seed";
import {
  CSV_IMPORT_LIMIT,
  clientsToCsv,
  equipmentToCsv,
  parseCsv,
  planClientImport,
  planEquipmentImport,
  toCsv,
} from "./csv";

let counter = 0;
const newId = () => `new-${++counter}`;

describe("CSV parsing and writing", () => {
  it("parses quotes, escaped quotes, CRLF, a BOM and blank lines", () => {
    expect(
      parseCsv('﻿a,b\r\n"x, y","say ""hola"""\r\n\r\n"multi\nline",z\n'),
    ).toEqual([
      ["a", "b"],
      ["x, y", 'say "hola"'],
      ["multi\nline", "z"],
    ]);
  });

  it("detects semicolon-delimited spreadsheets", () => {
    expect(parseCsv("nombre;tarifa\nBocina;85.5")).toEqual([
      ["nombre", "tarifa"],
      ["Bocina", "85.5"],
    ]);
  });

  it("rejects an unterminated quote", () => {
    expect(() => parseCsv('a\n"open')).toThrow("comillas sin cerrar");
  });

  it("neutralizes formula cells and round-trips through the parser", () => {
    const csv = toCsv([
      ["name", "note"],
      ['=HYPERLINK("x")', "Línea, con coma"],
      ["-5", 7],
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(parseCsv(csv)).toEqual([
      ["name", "note"],
      ['\'=HYPERLINK("x")', "Línea, con coma"],
      ["'-5", "7"],
    ]);
  });
});

describe("equipment import", () => {
  const seed = createSeed();

  it("round-trips the exported catalog without changes", () => {
    const plan = planEquipmentImport(
      equipmentToCsv(seed.equipment),
      seed.equipment,
      newId,
    );
    expect(plan).toMatchObject({ created: [], updated: [], errors: [] });
    expect(plan.unchanged).toBe(seed.equipment.length);
  });

  it("updates by SKU, keeps record identity and creates new items", () => {
    const [first] = seed.equipment;
    const csv = [
      "SKU,Name,Category,Quantity,Rate",
      `${first.sku.toLowerCase()},${first.name},${first.category},${first.quantity + 2},"$1,250.50"`,
      "NEW-01,Consola digital,Audio,3,120",
    ].join("\n");
    const plan = planEquipmentImport(csv, seed.equipment, newId);
    expect(plan.errors).toEqual([]);
    expect(plan.updated).toEqual([
      { ...first, quantity: first.quantity + 2, rate: 1250.5 },
    ]);
    expect(plan.created).toEqual([
      expect.objectContaining({
        sku: "NEW-01",
        name: "Consola digital",
        quantity: 3,
        maintenance: 0,
        rate: 120,
        description: "",
      }),
    ]);
  });

  it("reports row-level problems with spreadsheet row numbers", () => {
    const csv = [
      "sku,nombre,categoría,cantidad,mantenimiento,tarifa",
      "A-1,Bocina,Audio,2.5,0,10",
      "A-2,Luz,,4,5,10",
      "A-3,Cable,Audio,4,0,-1",
      "A-3,Cable,Audio,4,0,1",
      ",Sin SKU,Audio,1,0,1",
    ].join("\n");
    const plan = planEquipmentImport(csv, [], newId);
    expect(plan.errors.map((e) => e.row)).toEqual([2, 3, 4, 5, 6]);
    expect(plan.errors[0].message).toContain("número entero");
    expect(plan.errors[1].message).toContain("falta la categoría");
    expect(plan.errors[1].message).toContain("no puede superar la cantidad");
    expect(plan.errors[2].message).toContain("tarifa");
    expect(plan.errors[3].message).toContain("SKU repetido");
  });

  it("refuses to lower maintenance below open repair records", () => {
    const item = seed.equipment.find((q) => q.id === "q1")!;
    const csv = `sku,name,category,quantity,maintenance,rate\n${item.sku},${item.name},${item.category},${item.quantity},0,${item.rate}`;
    const plan = planEquipmentImport(csv, seed.equipment, newId, (id) =>
      id === "q1" ? 2 : 0,
    );
    expect(plan.errors[0].message).toContain("reparación abiertos");
  });

  it("rejects unknown or missing columns and oversized files", () => {
    expect(
      planEquipmentImport("sku,name,colour\n", [], newId).errors.map(
        (e) => e.message,
      ),
    ).toEqual([
      'Columna desconocida: "colour".',
      'Falta la columna obligatoria "categoria".',
      'Falta la columna obligatoria "cantidad".',
      'Falta la columna obligatoria "tarifa".',
    ]);
    const rows = Array.from(
      { length: CSV_IMPORT_LIMIT + 1 },
      (_, i) => `S${i},N,C,1,1`,
    );
    expect(
      planEquipmentImport(
        ["sku,name,category,quantity,rate", ...rows].join("\n"),
        [],
        newId,
      ).errors[0].message,
    ).toContain(`${CSV_IMPORT_LIMIT}`);
  });
});

describe("client import", () => {
  const seed = createSeed();

  it("round-trips the exported directory without changes", () => {
    const plan = planClientImport(
      clientsToCsv(seed.clients),
      seed.clients,
      newId,
    );
    expect(plan).toMatchObject({ created: [], updated: [], errors: [] });
    expect(plan.unchanged).toBe(seed.clients.length);
  });

  it("matches by email, otherwise by name, and fills defaults for new clients", () => {
    const [first] = seed.clients;
    const csv = [
      "nombre,contacto,correo,teléfono",
      `${first.name},Nueva persona,${first.email.toUpperCase()},${first.phone}`,
      "Hotel Nuevo,Ana Ortiz,,787-555-0199",
    ].join("\n");
    const plan = planClientImport(csv, seed.clients, newId);
    expect(plan.errors).toEqual([]);
    expect(plan.updated).toEqual([{ ...first, contact: "Nueva persona" }]);
    expect(plan.created).toEqual([
      expect.objectContaining({
        name: "Hotel Nuevo",
        contact: "Ana Ortiz",
        email: "",
        phone: "787-555-0199",
        industry: "Corporate",
        initials: "HN",
        color: "sage",
        notes: "",
      }),
    ]);
  });

  it("reports invalid emails, missing contacts and duplicates", () => {
    const csv = [
      "name,contact,email",
      "Uno,Persona,no-es-correo",
      "Dos,,dos@example.com",
      "Tres,Persona,tres@example.com",
      "Tres bis,Persona,TRES@example.com",
    ].join("\n");
    const plan = planClientImport(csv, [], newId);
    expect(plan.errors.map((e) => e.row)).toEqual([2, 3, 5]);
    expect(plan.errors[0].message).toContain("correo no es válido");
    expect(plan.errors[1].message).toContain("contacto principal");
    expect(plan.errors[2].message).toContain("repetido");
  });
});

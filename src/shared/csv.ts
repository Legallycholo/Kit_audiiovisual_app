import { initials } from "./domain";
import type { Client, Equipment } from "./types";

// One PATCH accepts at most 200 record changes (server/schema.ts changeSchema).
export const CSV_IMPORT_LIMIT = 200;

/** Parses RFC 4180 CSV. Detects a semicolon delimiter (common in Spanish-locale spreadsheets). */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.slice(0, source.search(/\r?\n|$/));
  const delimiter =
    firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("El archivo tiene comillas sin cerrar.");
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => value.trim() !== ""));
}

/** Serializes rows for spreadsheets: CRLF, UTF-8 BOM, and neutralized formula cells. */
export function toCsv(rows: (string | number)[][]): string {
  const escape = (value: string | number) => {
    let text = String(value);
    // Prevent spreadsheet formula execution from exported text cells.
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text))
      text = `'${text}`;
    return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `﻿${rows.map((row) => row.map(escape).join(",")).join("\r\n")}\r\n`;
}

export interface ImportPlan<T> {
  created: T[];
  updated: T[];
  unchanged: number;
  errors: { row: number; message: string }[];
}

const normalize = (header: string) =>
  header.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function readTable(
  text: string,
  aliases: Record<string, string[]>,
  required: string[],
) {
  const errors: ImportPlan<unknown>["errors"] = [];
  let rows: string[][];
  try {
    rows = parseCsv(text);
  } catch (error) {
    return {
      records: [],
      errors: [{ row: 1, message: (error as Error).message }],
    };
  }
  if (!rows.length)
    return {
      records: [],
      errors: [{ row: 1, message: "El archivo está vacío." }],
    };
  const columns = rows[0].map((header) => {
    const key = normalize(header);
    return Object.entries(aliases).find(([, names]) =>
      names.includes(key),
    )?.[0];
  });
  rows[0].forEach((header, index) => {
    if (!columns[index])
      errors.push({
        row: 1,
        message: `Columna desconocida: "${header.trim()}".`,
      });
  });
  for (const field of required)
    if (!columns.includes(field))
      errors.push({
        row: 1,
        message: `Falta la columna obligatoria "${aliases[field][1] ?? field}".`,
      });
  const records = rows.slice(1).map((cells, index) => {
    const record: Record<string, string> = {};
    columns.forEach((field, column) => {
      // Undo the export's formula guard ('=..., '+..., '-..., '@...).
      if (field)
        record[field] = (cells[column] ?? "")
          .trim()
          .replace(/^'(?=[=+\-@])/, "");
    });
    return {
      row: index + 2,
      record,
      present: new Set(columns.filter(Boolean) as string[]),
    };
  });
  if (records.length > CSV_IMPORT_LIMIT)
    errors.push({
      row: 1,
      message: `Importa como máximo ${CSV_IMPORT_LIMIT} registros por archivo.`,
    });
  return { records, errors };
}

function parseNumber(value: string) {
  let cleaned = value.replace(/[$\s]/g, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(cleaned))
    cleaned = cleaned.replace(/,/g, "");
  return cleaned === "" ? NaN : Number(cleaned);
}

const equipmentAliases: Record<string, string[]> = {
  sku: ["sku", "sku"],
  name: ["name", "nombre"],
  category: ["category", "categoria"],
  quantity: ["quantity", "cantidad"],
  maintenance: ["maintenance", "mantenimiento"],
  rate: ["rate", "tarifa"],
  description: ["description", "descripcion"],
};

export function equipmentToCsv(equipment: Equipment[]) {
  return toCsv([
    [
      "sku",
      "nombre",
      "categoría",
      "cantidad",
      "mantenimiento",
      "tarifa",
      "descripción",
    ],
    ...equipment.map((q) => [
      q.sku,
      q.name,
      q.category,
      q.quantity,
      q.maintenance,
      q.rate,
      q.description,
    ]),
  ]);
}

export function planEquipmentImport(
  text: string,
  existing: Equipment[],
  newId: () => string,
  openMaintenance: (equipmentId: string) => number = () => 0,
): ImportPlan<Equipment> {
  const plan: ImportPlan<Equipment> = {
    created: [],
    updated: [],
    unchanged: 0,
    errors: [],
  };
  const table = readTable(text, equipmentAliases, [
    "sku",
    "name",
    "category",
    "quantity",
    "rate",
  ]);
  plan.errors.push(...table.errors);
  if (plan.errors.length) return plan;
  const bySku = new Map(existing.map((q) => [q.sku.toLowerCase(), q]));
  const seen = new Set<string>();
  for (const { row, record, present } of table.records) {
    const fail = (message: string) => plan.errors.push({ row, message });
    const sku = record.sku;
    if (!sku) {
      fail("Falta el SKU.");
      continue;
    }
    if (seen.has(sku.toLowerCase())) {
      fail(`SKU repetido en el archivo: ${sku}.`);
      continue;
    }
    seen.add(sku.toLowerCase());
    const current = bySku.get(sku.toLowerCase());
    const quantity = parseNumber(record.quantity);
    const rate = parseNumber(record.rate);
    const maintenance = present.has("maintenance")
      ? record.maintenance === ""
        ? 0
        : parseNumber(record.maintenance)
      : (current?.maintenance ?? 0);
    const next: Equipment = {
      id: current?.id ?? newId(),
      sku: current?.sku ?? sku,
      name: record.name,
      category: record.category,
      quantity,
      maintenance,
      rate,
      description: present.has("description")
        ? record.description
        : (current?.description ?? ""),
    };
    const problems: string[] = [];
    if (!next.name) problems.push("falta el nombre");
    if (next.name.length > 200)
      problems.push("el nombre supera 200 caracteres");
    if (!next.category) problems.push("falta la categoría");
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1_000_000)
      problems.push("la cantidad debe ser un número entero de 0 o más");
    if (!Number.isInteger(maintenance) || maintenance < 0)
      problems.push("mantenimiento debe ser un número entero de 0 o más");
    else if (maintenance > quantity)
      problems.push("mantenimiento no puede superar la cantidad");
    else if (current && maintenance < openMaintenance(current.id))
      problems.push(
        "mantenimiento es menor que los registros de reparación abiertos",
      );
    if (!Number.isFinite(rate) || rate < 0 || rate > 100_000_000)
      problems.push("la tarifa debe ser un número de 0 o más");
    if (problems.length) {
      fail(`${sku}: ${problems.join("; ")}.`);
      continue;
    }
    if (!current) plan.created.push(next);
    else if (
      JSON.stringify(current) === JSON.stringify({ ...current, ...next })
    )
      plan.unchanged++;
    else plan.updated.push(next);
  }
  return plan;
}

const clientAliases: Record<string, string[]> = {
  name: ["name", "nombre"],
  contact: ["contact", "contacto"],
  email: ["email", "correo", "correo electronico"],
  phone: ["phone", "telefono"],
  industry: ["industry", "industria", "sector"],
  notes: ["notes", "notas"],
};

export function clientsToCsv(clients: Client[]) {
  return toCsv([
    ["nombre", "contacto", "correo", "teléfono", "industria", "notas"],
    ...clients.map((c) => [
      c.name,
      c.contact,
      c.email,
      c.phone,
      c.industry,
      c.notes,
    ]),
  ]);
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function planClientImport(
  text: string,
  existing: Client[],
  newId: () => string,
): ImportPlan<Client> {
  const plan: ImportPlan<Client> = {
    created: [],
    updated: [],
    unchanged: 0,
    errors: [],
  };
  const table = readTable(text, clientAliases, ["name", "contact"]);
  plan.errors.push(...table.errors);
  if (plan.errors.length) return plan;
  const seen = new Set<string>();
  for (const { row, record, present } of table.records) {
    const fail = (message: string) => plan.errors.push({ row, message });
    const email = (record.email ?? "").toLowerCase();
    const key = email || `name:${record.name.toLowerCase()}`;
    if (seen.has(key)) {
      fail(`Cliente repetido en el archivo: ${record.name || email}.`);
      continue;
    }
    seen.add(key);
    // Match by email when present, otherwise by name.
    const current = existing.find((c) =>
      email
        ? c.email.toLowerCase() === email
        : c.name.toLowerCase() === record.name.toLowerCase(),
    );
    const keep = (field: "phone" | "industry" | "notes", fallback: string) =>
      present.has(field) ? record[field] : (current?.[field] ?? fallback);
    const next: Client = {
      id: current?.id ?? newId(),
      name: record.name,
      contact: record.contact,
      email: present.has("email") ? email : (current?.email ?? ""),
      phone: keep("phone", ""),
      industry: keep("industry", "") || current?.industry || "Corporate",
      initials:
        current?.name === record.name
          ? current.initials
          : initials(record.name),
      color: current?.color ?? "sage",
      notes: keep("notes", ""),
    };
    const problems: string[] = [];
    if (!next.name) problems.push("falta el nombre");
    if (next.name.length > 200)
      problems.push("el nombre supera 200 caracteres");
    if (!next.contact) problems.push("falta el contacto principal");
    if (next.contact.length > 200)
      problems.push("el contacto supera 200 caracteres");
    if (next.email && !emailPattern.test(next.email))
      problems.push("el correo no es válido");
    if (next.phone.length > 60)
      problems.push("el teléfono supera 60 caracteres");
    if (next.industry.length > 200)
      problems.push("la industria supera 200 caracteres");
    if (problems.length) {
      fail(`${record.name || `Fila ${row}`}: ${problems.join("; ")}.`);
      continue;
    }
    if (!current) plan.created.push(next);
    else if (
      JSON.stringify(current) === JSON.stringify({ ...current, ...next })
    )
      plan.unchanged++;
    else plan.updated.push(next);
  }
  return plan;
}

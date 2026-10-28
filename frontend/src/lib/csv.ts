import { MONTHS } from "./format";

/** Parse CSV robuste (guillemets, retours ligne dans les champs). */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const delim = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).slice(0, 5).join("\n");
  const counts = [",", ";", "\t"].map((d) => [d, firstLines.split(d).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][0];
}

export function toCsv(rows: (string | number)[][], delim = ";"): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = String(v ?? "");
          return /[";\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(delim),
    )
    .join("\n");
}

/** "1 529,46€", "-12.50", "−3,2 €" -> nombre */
export function parseAmount(raw: string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/[€$¥\s\u00a0\u202f]/g, "").replace("−", "-");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const MONTH_MAP: Record<string, number> = {};
MONTHS.forEach((m, i) => {
  MONTH_MAP[m.replace(".", "").toLowerCase()] = i + 1;
});
Object.assign(MONTH_MAP, { janvier: 1, fevr: 2, février: 2, fevrier: 2, avril: 4, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12, dec: 12, sep: 9 });

/** Accepte YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, "1 janv. 2026" */
export function parseDate(raw: string): string | null {
  const s = String(raw ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\s+([a-zéû.]+)\s+(\d{4})/i);
  if (m) {
    const mon = MONTH_MAP[m[2].replace(".", "").toLowerCase()];
    if (mon) return `${m[3]}-${String(mon).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

export function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

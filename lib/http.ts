export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HttpError extends Error {
  constructor(public status: number, public body: string, url: string) {
    super(`HTTP ${status} em ${url}: ${body.slice(0, 200)}`);
  }
}

/** fetch com timeout e 1 nova tentativa em 429/5xx. */
export async function http(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        const wait = Number(res.headers.get("retry-after")) * 1000 || 3000;
        await sleep(Math.min(wait, 30000));
        continue;
      }
      if (!res.ok) throw new HttpError(res.status, await res.text().catch(() => ""), url);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Falha após novas tentativas: ${url}`);
}

export async function httpJson<T = any>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await http(url, { ...init, headers: { accept: "application/json", ...(init.headers || {}) } });
  return (await res.json()) as T;
}

/** Converte "R$ 1.234,56", "1234.56", 1234.56 em número. */
export function parsePrice(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d,.-]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    // o separador que aparece por último é o decimal
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  } else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) {
    s = s.replace(/\./g, ""); // "1.234" = mil e duzentos
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

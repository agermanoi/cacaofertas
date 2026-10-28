/**
 * Sessão do /admin: senha única (ADMIN_PASSWORD) e cookie assinado com HMAC-SHA256.
 * Usa só Web Crypto, então roda tanto no middleware (edge) quanto no servidor (Node).
 *
 * Env:
 *   ADMIN_PASSWORD        senha do painel (obrigatória; sem ela o /admin fica fechado)
 *   ADMIN_SESSION_SECRET  chave de assinatura do cookie (recomendado; trocar derruba todas as sessões)
 */

export const ADMIN_COOKIE = "admin_session";
export const SESSION_DAYS = 7;

const enc = new TextEncoder();

function secret(): string | null {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return null;
  return process.env.ADMIN_SESSION_SECRET || `${pass}::sessao-admin`;
}

async function hmac(data: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparação em tempo constante (evita descobrir a senha pelo tempo de resposta). */
export function safeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function checkPassword(input: string): boolean {
  const pass = process.env.ADMIN_PASSWORD;
  return Boolean(pass) && safeEqual(input, pass!);
}

/** Token "expiraEm.assinatura". */
export async function createSession(): Promise<string> {
  const key = secret();
  if (!key) throw new Error("ADMIN_PASSWORD não configurada");
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  return `${exp}.${await hmac(`admin:${exp}`, key)}`;
}

export async function verifySession(token: string | undefined | null): Promise<boolean> {
  const key = secret();
  if (!key || !token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now()) return false;
  return safeEqual(sig, await hmac(`admin:${exp}`, key));
}

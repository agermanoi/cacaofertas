/** Endereço público do site, sem barra no final. Usado em sitemap, robots, links canônicos e OAuth. */
export function siteUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  if (process.env.VERCEL_ENV === "production") return "https://cacaofertas.com.br";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.NODE_ENV === "production" ? "https://cacaofertas.com.br" : "http://localhost:3000";
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Arquivo de verificação do TikTok na raiz (https://SITE/tiktokXXXX.txt) → servido pela rota /tiktok/
  async rewrites() {
    return [{ source: "/:file(tiktok[A-Za-z0-9_-]+\\.txt)", destination: "/tiktok/:file" }];
  },
  // Cabeçalhos de segurança em todas as páginas
  async headers() {
    const base = [
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    ];
    return [
      // site: não pode ser aberto dentro de iframe de outro domínio
      {
        source: "/((?!ads/).*)",
        headers: [
          ...base,
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
      // anúncios da casa (/ads/…): precisam abrir dentro do iframe do Google Ad Manager
      {
        source: "/ads/:path*",
        headers: [...base, { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'" }],
      },
    ];
  },
  // As imagens de compartilhamento leem fontes e a marca do disco
  outputFileTracingIncludes: {
    "/**": ["./assets/fonts/**", "./public/brand/**"],
  },
};

export default nextConfig;

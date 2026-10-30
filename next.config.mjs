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
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
    ];
  },
  // As imagens de compartilhamento leem fontes e a marca do disco
  outputFileTracingIncludes: {
    "/**": ["./assets/fonts/**", "./public/brand/**"],
  },
};

export default nextConfig;

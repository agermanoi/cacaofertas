/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // As imagens de compartilhamento leem fontes e a marca do disco
  outputFileTracingIncludes: {
    "/**": ["./assets/fonts/**", "./public/brand/**"],
  },
};

export default nextConfig;

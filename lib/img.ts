/**
 * Fotos de produto em tamanho certo: as lojas entregam a foto grande (o Mercado Livre manda ~1200 px
 * em JPG), mas a lista mostra 56 px e a página do produto ~400 px. Passamos pelo otimizador de imagens
 * da Vercel (/_next/image), que reduz, converte para WebP e guarda em cache.
 *
 * Só para os domínios liberados em next.config.mjs (images.remotePatterns); os outros seguem como estão.
 * As larguras precisam estar em images.imageSizes/deviceSizes.
 */
import { IMAGE_HOSTS } from "./img-hosts.mjs";

const okHost = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && IMAGE_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
};

/** URL da foto reduzida para a largura pedida (em px reais, já contando telas 2x). */
export function imgUrl(url: string, w: number, q = 70): string {
  if (!okHost(url)) return url;
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=${q}`;
}

/** src + srcSet (1x e 2x) para uma foto exibida com `css` px de largura. */
export function imgProps(url: string, css: number): { src: string; srcSet?: string } {
  if (!okHost(url)) return { src: url };
  const one = pick(css);
  const two = pick(css * 2);
  return { src: imgUrl(url, two), srcSet: one === two ? undefined : `${imgUrl(url, one)} 1x, ${imgUrl(url, two)} 2x` };
}

// larguras configuradas em next.config.mjs (imageSizes + deviceSizes)
const WIDTHS = [64, 96, 128, 160, 256, 320, 384, 480, 640, 828, 1080];
function pick(w: number): number {
  return WIDTHS.find((x) => x >= w) ?? WIDTHS[WIDTHS.length - 1];
}

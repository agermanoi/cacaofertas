import { isChannelInvite } from "./telegram";

/**
 * Texto pronto para colar no canal do WhatsApp (não há API oficial para postar em canal:
 * o admin copia o texto e a arte). Formatação do WhatsApp: *negrito*.
 */
export function whatsappText(fbCaption: string): string {
  const lines = fbCaption
    .split("\n")
    .filter((l) => !/^(#\S+\s*)+$/.test(l.trim()) && !isChannelInvite(l))
    .map((l) => l.replace(/utm_source=facebook/g, "utm_source=whatsapp"));
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (lines[1] && lines[1].trim()) lines[1] = `*${lines[1].trim()}*`;
  return lines.join("\n");
}

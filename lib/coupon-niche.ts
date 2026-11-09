/**
 * Cupons "do nicho": lojas e assuntos dos produtos do Caça Ofertas (eletrônicos, informática,
 * games, eletrodomésticos e eletroportáteis). Só esses viram post nas redes e aparecem primeiro em /cupons.
 */
const NICHE_STORES =
  /amazon|mercado ?livre|magalu|magazine ?luiza|kabum|casas ?bahia|ponto( frio)?|extra\b|carrefour|americanas|submarino|shoptime|fast ?shop|samsung|apple|xiaomi|motorola|lenovo|dell|acer|asus|\blg\b|philco|positivo|multilaser|terabyte|pichau|girafa|nespresso|dolce gusto|electrolux|brastemp|consul|mondial|\barno\b|oster|britania|wap\b|jbl|logitech|hyperx|nintendo|playstation|xbox|shopee/i;
const NICHE_WORDS =
  /eletr[oô]nic|celular|smartphone|notebook|computador|inform[aá]tica|monitor|\btv\b|smart ?tv|televis|games?\b|console|fone|headset|caixa de som|smartwatch|eletrodom|eletroport|air ?fryer|cafeteira|aspirador|geladeira|lavadora|micro-?ondas/i;

export function isNicheCoupon(c: { store: string; title?: string | null; category?: string | null }): boolean {
  return NICHE_STORES.test(c.store) || NICHE_WORDS.test(`${c.title || ""} ${c.category || ""}`);
}

import { fmt } from "./money";

/**
 * The WhatsApp cobro (PRODUCT_SPEC §6.7): friendly, with the amount, how to pay and a link to the
 * detail, so the debtor can check before paying.
 */
export function cobroMessage(input: {
  debtorName: string;
  tripName: string;
  amount: number;
  currency: string;
  handle?: string;
  detailUrl: string;
}): string {
  const first = input.debtorName.trim().split(/\s+/)[0] || input.debtorName;
  const handle = input.handle?.trim();
  return [
    `Hola ${first}, de *${input.tripName}* te toca pasarme ${fmt(input.amount, input.currency)}.`,
    handle ? `Mi llave: ${handle}` : null,
    `Detalle: ${input.detailUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

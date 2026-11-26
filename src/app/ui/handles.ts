export const HANDLE_LABEL: Record<string, string> = {
  breb: "Llave Bre-B",
  nequi: "Nequi",
  daviplata: "Daviplata",
  bank: "Cuenta bancaria",
  paypal: "PayPal",
  otro: "Otro",
};

/** "Llave Bre-B @mateo · Nequi 300 123 4567" for messages. */
export const handlesLine = (handles: ReadonlyArray<{ kind: string; value: string }>) =>
  handles.map((h) => `${HANDLE_LABEL[h.kind] ?? h.kind} ${h.value}`).join(" · ");

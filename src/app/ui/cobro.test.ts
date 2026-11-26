import { describe, expect, it } from "vitest";
import { cobroMessage, whatsappUrl } from "./cobro";

describe("cobroMessage", () => {
  const base = { debtorName: "Juli Restrepo", tripName: "Cartagena", amount: 641000, currency: "COP", detailUrl: "https://x/t/1/cuentas" };

  it("greets by first name and states the amount, handle and detail link", () => {
    expect(cobroMessage({ ...base, handle: " @mateo " })).toBe(
      "Hola Juli, de *Cartagena* te toca pasarme $641.000.\nMi llave: @mateo\nDetalle: https://x/t/1/cuentas",
    );
  });

  it("leaves the handle line out when there is none", () => {
    expect(cobroMessage({ ...base, handle: "  " })).not.toContain("llave");
  });

  it("encodes the message for wa.me", () => {
    expect(whatsappUrl("a b\n*c*")).toBe("https://wa.me/?text=a%20b%0A*c*");
  });
});

/** An unguessable URL-safe token (192 bits) from the platform's CSPRNG. */
export function randomToken(bytes = 24): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Buffer.from(buf).toString("base64url");
}

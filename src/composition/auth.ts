import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { Principal } from "@/contexts/trip-membership/domain/trip";
import { authClient } from "@/platform/supabase/clients";
import { PrincipalId } from "@/shared-kernel/ids";
import { DEMO_PRINCIPAL } from "./demo-seed";
import { backend, getContainer } from "./server";

/**
 * Who is calling. A Supabase user is a principal: anonymous users are guests (a seat opened
 * from a personal link on this device), users with an email are accounts.
 */
export async function currentPrincipal(): Promise<Principal | null> {
  // Request-time by nature (cookies, token expiry against the clock): never part of a prerender.
  await connection();
  if (backend() === "memory") return { id: DEMO_PRINCIPAL, kind: "user" };
  const supabase = await authClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: PrincipalId(claims.sub), kind: claims.is_anonymous ? "guest" : "user" };
}

/** For screens: no session → the sign-in screen. */
export async function requirePrincipal(next?: string): Promise<Principal> {
  const principal = await currentPrincipal();
  if (!principal) redirect(next ? `/entrar?next=${encodeURIComponent(next)}` : "/entrar");
  return principal;
}

/** For actions that must not hit a wall (create a trip, open a personal link): a guest session if needed. */
export async function ensurePrincipal(): Promise<Principal> {
  const existing = await currentPrincipal();
  if (existing) return existing;
  const supabase = await authClient();
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) throw new Error(`Guest sign-in failed: ${error?.message ?? "no user"}`);
  return { id: PrincipalId(data.user.id), kind: "guest" };
}

export type AuthResult = { ok: true; done?: boolean } | { ok: false; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Step 1 of "Entrar" / "Guarda tu acceso": email a 6-digit code.
 * A guest keeps their principal: the email is attached to it instead of creating a new user.
 */
export async function sendEmailCode(email: string): Promise<AuthResult> {
  if (!EMAIL.test(email)) return { ok: false, message: "Revisa el correo" };
  const principal = await currentPrincipal();
  const supabase = await authClient();
  if (principal?.kind === "guest") {
    const { data, error } = await supabase.auth.updateUser({ email });
    if (!error && data.user && !data.user.is_anonymous) {
      // Projects with email confirmations off attach the email at once, without a code.
      await upgradeGuest(principal.id);
      return { ok: true, done: true };
    }
    if (!error) return { ok: true };
    return authError(error);
  }
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (!error) return { ok: true };
  return authError(error);
}

async function upgradeGuest(principalId: Principal["id"]) {
  const upgraded = await (await getContainer()).membership.guestSavedAccess(principalId);
  if (!upgraded.ok) throw upgraded.error;
}

function authError(error: { code?: string; status?: number }): AuthResult {
  if (error.code === "email_exists") return { ok: false, message: "Ese correo ya tiene cuenta. Entra con él desde otro dispositivo." };
  if (error.status === 429) return { ok: false, message: "Espera un momento antes de pedir otro código" };
  return { ok: false, message: "No pudimos enviar el código" };
}

/** Step 2: check the code. For a guest this turns their seats into account seats. */
export async function verifyEmailCode(email: string, code: string): Promise<AuthResult> {
  const principal = await currentPrincipal();
  const guest = principal?.kind === "guest" ? principal : null;
  const supabase = await authClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: code.replace(/\D/g, ""),
    type: guest ? "email_change" : "email",
  });
  if (error) return { ok: false, message: "Ese código no sirve. Revisa o pide otro." };
  if (guest) await upgradeGuest(guest.id);
  return { ok: true };
}

export async function signOut() {
  const supabase = await authClient();
  await supabase.auth.signOut();
}

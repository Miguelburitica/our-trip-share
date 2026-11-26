"use server";

import { redirect } from "next/navigation";
import { sendEmailCode, verifyEmailCode, type AuthResult } from "@/composition/auth";
import { safeNext } from "@/app/ui/copy";

export async function sendCodeAction(email: string, next: string): Promise<AuthResult> {
  const result = await sendEmailCode(String(email).trim().toLowerCase());
  if (result.ok && result.done) redirect(safeNext(next));
  return result;
}

export async function verifyCodeAction(email: string, code: string, next: string): Promise<AuthResult> {
  const result = await verifyEmailCode(String(email).trim().toLowerCase(), String(code));
  if (!result.ok) return result;
  redirect(safeNext(next));
}

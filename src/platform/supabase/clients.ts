import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import type { Db } from "./db";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}: copy .env.example to .env.local (values from \`npx supabase status\`)`);
  return value;
}

export const supabaseUrl = () => env("NEXT_PUBLIC_SUPABASE_URL");
export const publishableKey = () => env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

let service: Db | undefined;

/** Service-role client for repositories. Bypasses RLS: only the server holds this key. */
export function serviceClient(): Db {
  service ??= createClient<Database>(supabaseUrl(), env("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return service;
}

/** Per-request client bound to the visitor's auth cookies. Used for auth only, never for data. */
export async function authClient() {
  const store = await cookies();
  return createServerClient<Database>(supabaseUrl(), publishableKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Components can't set cookies; the proxy refreshes the session instead.
        }
      },
    },
  });
}

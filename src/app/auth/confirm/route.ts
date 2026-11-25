import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { safeNextPath } from "@/lib/auth/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Destino de los enlaces de los correos de Supabase Auth (confirmación de
 * cuenta y recuperación de contraseña). Las plantillas (supabase/templates)
 * apuntan aquí con `token_hash` y `type`; se verifica en el servidor y se
 * crea la sesión con cookies HttpOnly.
 */
const querySchema = z.object({
  token_hash: z.string().min(8).max(512),
  type: z.enum(["email", "signup", "recovery", "email_change", "invite"] satisfies EmailOtpType[]),
  next: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);
  const fail = NextResponse.redirect(new URL("/login?error=enlace", request.url));

  if (!parsed.success) return fail;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type: parsed.data.type, token_hash: parsed.data.token_hash });
  if (error) return fail;

  const fallback = parsed.data.type === "recovery" ? "/nueva-contrasena" : "/diario?aviso=cuenta-confirmada";
  return NextResponse.redirect(new URL(safeNextPath(parsed.data.next, fallback), request.url));
}

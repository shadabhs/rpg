import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/login", "/auth"];

/**
 * Refreshes the Supabase session on every request and gates everything
 * except /login and /auth/* behind it. Held back from the earlier auth
 * commit on purpose — flipping this on before the login flow was proven
 * end-to-end would have broken the live Phase 0 demo behind a login wall
 * nobody could get through. Now that /login genuinely reaches Supabase,
 * this is safe to add.
 *
 * Named `proxy.ts` / `proxy()`, not `middleware.ts` / `middleware()` — Next
 * 16 renamed the convention. A leftover `middleware.ts` is silently ignored
 * (no error, no warning) in a fully migrated Next.js version, which would
 * mean this entire auth gate stops running with nothing telling you it did.
 */
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not remove this — supabase.auth.getUser() is what actually refreshes
  // the session token. A cached/stale check here silently logs people out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|icon.*\\.svg).*)",
  ],
};

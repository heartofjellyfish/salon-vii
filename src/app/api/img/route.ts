import { NextResponse } from "next/server";

// Same-origin image proxy for Sanity CDN assets.
//
// Sanity's image CDN gates browser cross-origin requests by the project's CORS
// allowlist, so loading cdn.sanity.io images as WebGL textures (crossOrigin)
// from a Vercel domain that isn't allowlisted gets a 403 — which fails the
// texture load and (previews change URL every deploy) is whack-a-mole to fix in
// Sanity. Fetching server-side carries no browser Origin, so the CDN returns the
// image; we then stream it from our own origin, where no CORS check applies.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const src = new URL(req.url).searchParams.get("u");
  if (!src || !src.startsWith("https://cdn.sanity.io/")) {
    return NextResponse.json({ error: "invalid source" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(src);
  } catch {
    return NextResponse.json({ error: "upstream fetch failed" }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "upstream error" }, { status: upstream.status || 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") || "image/jpeg",
      "cache-control": "public, max-age=86400, immutable",
    },
  });
}

import { NextResponse } from "next/server";
import { VAN_GOGH_EXHIBITION } from "@/lib/fallback-data";
import { sanityClient, urlFor } from "@/lib/sanity";

export async function GET() {
  try {
    // Try Sanity first
    const exhibition = await sanityClient.fetch(`*[_type == "exhibition"][0]{
      _id, title, subtitle, curatorNote, wallColor, mode,
      "artworks": artworks[]->{
        _id, title, titleCN, artist, year, image, narrative,
        guidedCommentary, frameStyle, position
      }
    }`);

    if (exhibition?.artworks?.length > 0) {
      // Build Sanity CDN image URLs via the configured client (projectId/dataset
      // fall back to the hardcoded values, so this works even when the
      // NEXT_PUBLIC_SANITY_* env vars aren't set on the host). Resize to a
      // sane width so huge uploads don't blow up the WebGL texture.
      const artworks = exhibition.artworks.map((a: any) => ({
        ...a,
        imageUrl: a.image?.asset
          ? `/api/img?u=${encodeURIComponent(urlFor(a.image).width(2048).auto("format").url())}`
          : null,
      }));
      return NextResponse.json({ ...exhibition, artworks });
    }
  } catch (e) {
    console.warn("Sanity fetch failed, using fallback data", e);
  }

  // Fallback to hardcoded Van Gogh data
  return NextResponse.json(VAN_GOGH_EXHIBITION);
}

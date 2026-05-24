import { NextResponse } from "next/server";
import { VAN_GOGH_EXHIBITION } from "@/lib/fallback-data";
import { sanityClient } from "@/lib/sanity";

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
      // Add image URLs from Sanity CDN
      const artworks = exhibition.artworks.map((a: any) => ({
        ...a,
        imageUrl: a.image?.asset
          ? `https://cdn.sanity.io/images/${process.env.NEXT_PUBLIC_SANITY_PROJECT_ID}/${process.env.NEXT_PUBLIC_SANITY_DATASET}/${a.image.asset._ref.replace('image-', '').replace('-jpg', '.jpg').replace('-png', '.png')}`
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

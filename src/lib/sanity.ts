import { createClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';

export const sanityClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '7dt4ydmn',
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  apiVersion: '2024-01-01',
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
});

const builder = imageUrlBuilder(sanityClient);

export function urlFor(source: any) {
  return builder.image(source);
}

// Types
export interface ArtworkPosition {
  x: number;
  y: number;
  z: number;
  rotation: number;
  wall: 'north' | 'south' | 'east' | 'west';
  order: number;
}

export interface GuidedCommentary {
  zoomTarget: string;
  commentary: string;
}

export interface Artwork {
  _id: string;
  title: string;
  titleCN: string;
  artist: string;
  year: number;
  image: any;
  narrative: string;
  guidedCommentary?: GuidedCommentary;
  frameStyle: 'baroque_gold' | 'raw_wood' | 'copper_slim';
  position: ArtworkPosition;
  imageUrl?: string;
}

export interface Exhibition {
  _id: string;
  title: string;
  subtitle: string;
  curatorNote: any;
  wallColor: string;
  backgroundMusic?: any;
  mode: 'guided' | 'unguided';
  artworks: Artwork[];
}

export async function fetchExhibition(slug?: string): Promise<Exhibition | null> {
  const query = `*[_type == "exhibition"][0]{
    _id,
    title,
    subtitle,
    curatorNote,
    wallColor,
    "backgroundMusicUrl": backgroundMusic.asset->url,
    mode,
    "artworks": artworks[]->{
      _id,
      title,
      titleCN,
      artist,
      year,
      image,
      narrative,
      guidedCommentary,
      frameStyle,
      position
    }
  }`;
  return sanityClient.fetch(query);
}

export async function fetchArtworks(): Promise<Artwork[]> {
  const query = `*[_type == "artwork"] | order(position.order asc){
    _id,
    title,
    titleCN,
    artist,
    year,
    image,
    narrative,
    guidedCommentary,
    frameStyle,
    position
  }`;
  return sanityClient.fetch(query);
}

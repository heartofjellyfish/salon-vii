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

export interface FillLight {
  intensity: number;
  distance: number;
  height: number;
  front: number;
  color: string;
}

export type PropType = 'plant' | 'furniture' | 'lamp' | 'decor';

// A reusable 3D asset uploaded to Sanity.
export interface Prop {
  _id: string;
  name: string;
  propType: PropType;
  modelUrl?: string; // resolved from model.asset->url
  thumbnailUrl?: string;
  normalize?: boolean;
  targetSize?: number;
  defaultScale?: number;
  fillLight?: FillLight;
}

// A prop placed into an exhibition with a per-exhibition transform.
export interface PlacedProp {
  prop: Prop;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: number;
}

export interface Exhibition {
  _id: string;
  title: string;
  subtitle: string;
  curatorNote: any;
  wallColor: string;
  backgroundMusic?: any;
  backgroundMusicUrl?: string; // resolved file URL from the API (backgroundMusic.asset->url)
  mode: 'guided' | 'unguided';
  artworks: Artwork[];
  roomProps?: PlacedProp[];
}

// GROQ projection that resolves a placed prop's nested asset URLs.
const PLACED_PROP_PROJECTION = `
  x, y, z, rotationY, scale,
  "prop": prop->{
    _id, name, propType, normalize, targetSize, defaultScale, fillLight,
    "modelUrl": model.asset->url,
    "thumbnailUrl": thumbnail.asset->url
  }
`;

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
    },
    "roomProps": roomProps[]{ ${PLACED_PROP_PROJECTION} }
  }`;
  return sanityClient.fetch(query);
}

// All reusable props, for the editor's object library.
export async function fetchProps(): Promise<Prop[]> {
  const query = `*[_type == "prop"] | order(name asc){
    _id, name, propType, normalize, targetSize, defaultScale, fillLight,
    "modelUrl": model.asset->url,
    "thumbnailUrl": thumbnail.asset->url
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

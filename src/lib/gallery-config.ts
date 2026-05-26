
export const W = 12, H = 4, D = 8;
export const HALF_W = W / 2;
export const BACK_Z = -6;   // north wall
export const FRONT_Z = 2;    // south wall
export const PAINTING_Y = 1.55; // museum "centre line" — hung at standing eye level
export const NORTH_X = [-3.5, 0, 3.5];
export const EW_Z = [-4, -1.5, 1];

export function getPaintingTransform(position: { wall: string; order: number }) {
  const { wall, order } = position;
  switch (wall) {
    case 'north': return { position: [NORTH_X[order] ?? 0, PAINTING_Y, BACK_Z + 0.01] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] };
    case 'south': return { position: [0, PAINTING_Y, FRONT_Z - 0.01] as [number, number, number], rotation: [0, Math.PI, 0] as [number, number, number] };
    case 'east': return { position: [HALF_W - 0.01, PAINTING_Y, EW_Z[order] ?? 0] as [number, number, number], rotation: [0, -Math.PI / 2, 0] as [number, number, number] };
    case 'west': return { position: [-HALF_W + 0.01, PAINTING_Y, EW_Z[order] ?? 0] as [number, number, number], rotation: [0, Math.PI / 2, 0] as [number, number, number] };
    default: return { position: [0, PAINTING_Y, BACK_Z + 0.01] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] };
  }
}

export function getFacingDir(wall: string): [number, number, number] {
  switch (wall) {
    case 'north': return [0, 0, 1];
    case 'south': return [0, 0, -1];
    case 'east': return [-1, 0, 0];
    case 'west': return [1, 0, 0];
    default: return [0, 0, 1];
  }
}

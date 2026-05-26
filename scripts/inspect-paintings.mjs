import { createClient } from "@sanity/client";

const client = createClient({
  projectId: "7dt4ydmn",
  dataset: "production",
  apiVersion: "2024-01-01",
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
});

const artworks = await client.fetch(
  `*[_type=="artwork"]{_id, title, titleCN, "fn": image.asset->originalFilename, "assetId": image.asset->_id} | order(_createdAt asc)`
);
const assets = await client.fetch(
  `*[_type=="sanity.imageAsset"]{_id, originalFilename, "ext": extension} | order(_createdAt asc)`
);
const exhibitions = await client.fetch(
  `*[_type=="exhibition"]{_id, title, "artworkCount": count(artworks)}`
);

console.log("=== ARTWORK DOCS (" + artworks.length + ") ===");
console.log(JSON.stringify(artworks, null, 2));
console.log("\n=== IMAGE ASSETS (" + assets.length + ") ===");
console.log(JSON.stringify(assets, null, 2));
console.log("\n=== EXHIBITIONS (" + exhibitions.length + ") ===");
console.log(JSON.stringify(exhibitions, null, 2));

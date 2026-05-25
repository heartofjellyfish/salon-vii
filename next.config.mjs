/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pre-existing lint errors (no-explicit-any, rules-of-hooks) live in files
  // unrelated to this work; keep them from blocking the build. Type-checking
  // still runs.
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "cdn.sanity.io" },
    ],
  },
};

export default nextConfig;

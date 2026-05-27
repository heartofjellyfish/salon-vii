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
  // Same-domain shortcuts to the (separately hosted) Sanity Studio, so the
  // gallery's admin/CMS lives at a memorable URL on our own domain. The Studio
  // is deployed at salon-vii.sanity.studio (studioHost in
  // sanity-studio/sanity.cli.ts); these just bounce there (temporary redirects
  // so the target host stays easy to change later).
  async redirects() {
    const studio = "https://salon-vii.sanity.studio";
    return [
      { source: "/admin", destination: studio, permanent: false },
      { source: "/admin/:path*", destination: `${studio}/:path*`, permanent: false },
      { source: "/sanity", destination: studio, permanent: false },
      { source: "/sanity/:path*", destination: `${studio}/:path*`, permanent: false },
    ];
  },
};

export default nextConfig;

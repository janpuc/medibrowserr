/** @type {import('next').NextConfig} */

// Standalone server bundle for the slim Docker image.
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Ensure libsql's native binaries are traced into the standalone output
  // (native modules are otherwise sometimes missed by file-tracing).
  outputFileTracingIncludes: {
    "/**/*": ["./node_modules/@libsql/**/*", "./node_modules/libsql/**/*"],
  },
  // libsql ships optional native bits; keep it external to the server bundle.
  serverExternalPackages: ["@libsql/client", "libsql"],
  images: {
    // Doctor photos come from znanylekarz/docplanner CDNs at display size
    // already; skip server-side re-optimization (and the sharp dependency).
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "**.docplanner.com" },
      { protocol: "https", hostname: "**.znanylekarz.pl" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          // X-Frame-Options / HSTS deliberately omitted (homelab iframe
          // embedding + plain HTTP behind a TLS proxy).
        ],
      },
    ];
  },
};

export default nextConfig;

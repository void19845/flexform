import type { NextConfig } from "next";

/**
 * En-têtes de sécurité communs (repris de l'ancien vercel.json). La Content-Security-Policy,
 * qui a besoin d'un nonce différent à chaque requête, est posée par src/proxy.ts.
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/admin",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
      {
        source: "/staff",
        headers: [
          { key: "X-Robots-Tag", value: "noindex" },
          { key: "Permissions-Policy", value: "camera=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;

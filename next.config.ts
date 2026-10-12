import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Génération des PDF (CV adapté, lettre) côté serveur : le paquet est chargé tel quel par Node.
  serverExternalPackages: ["@react-pdf/renderer"],
  partialPrefetching: true,
  experimental: {
    serverActions: {
      // Le CV en PDF passe par une Server Action : on laisse de la marge.
      bodySizeLimit: "6mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

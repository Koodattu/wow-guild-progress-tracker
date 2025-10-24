import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "render.worldofwarcraft.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.blizzard.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;

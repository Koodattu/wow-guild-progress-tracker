import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "3001",
        pathname: "/icons/**",
      },
      {
        protocol: "http",
        hostname: "backend",
        port: "3001",
        pathname: "/icons/**",
      },
      {
        protocol: "https",
        hostname: "**",
        pathname: "/icons/**",
      },
    ],
  },
};

export default nextConfig;

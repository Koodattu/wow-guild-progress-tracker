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
    // Disable image optimization for development to avoid issues with localhost images
    unoptimized: process.env.NODE_ENV === "development",
  },
};

export default nextConfig;

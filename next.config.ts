import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: process.env.NODE_ENV === "production" ? "/dcu-completionist-watchlist" : "",
  assetPrefix: process.env.NODE_ENV === "production" ? "/dcu-completionist-watchlist/" : "",
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The box image (Dockerfile) runs the standalone server: node server.js,
  // with only the dependencies the server actually imports. Vercel ignores it.
  output: "standalone",
};

export default nextConfig;

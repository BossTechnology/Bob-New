import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The box image (Dockerfile) runs the standalone server: node server.js,
  // with only the dependencies the server actually imports. Vercel ignores it.
  output: "standalone",
  // No "X-Powered-By: Next.js" on any answer (ASVS V14.3.3).
  poweredByHeader: false,
};

export default nextConfig;

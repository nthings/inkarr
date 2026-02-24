import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  output: "standalone",
  
  // Enable request logging in production
  logging: {
    incomingRequests: true,
  },
  
  // Instrumentation hook is automatically enabled when instrumentation.ts exists
  // The scheduler will start automatically on server startup
};

export default nextConfig;

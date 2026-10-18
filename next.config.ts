import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/campaign/new.",
        destination: "/campaign/new",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

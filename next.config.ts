import type { NextConfig } from "next";

const supabaseImageHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : undefined;
  } catch {
    return undefined;
  }
})();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseImageHost
      ? [
          {
            protocol: 'https',
            hostname: supabaseImageHost,
            pathname: '/storage/v1/object/public/**',
          },
          {
            protocol: 'https',
            hostname: supabaseImageHost,
            pathname: '/storage/v1/object/sign/**',
          },
        ]
      : [],
  },
};

export default nextConfig;

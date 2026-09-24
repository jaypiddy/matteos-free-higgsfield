import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module and must not be bundled.
  serverExternalPackages: ["better-sqlite3"],
  sassOptions: {
    // Carbon's own Sass trips deprecation warnings in current Sass releases.
    // They are Carbon's to fix; silencing them keeps our own warnings visible.
    quietDeps: true,
  },
};

export default nextConfig;

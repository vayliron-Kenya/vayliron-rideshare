import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native addon; it must not be bundled by the server compiler.
  serverExternalPackages: ["better-sqlite3"],
  // The door tool became the driver app, and the client reporting page became
  // the client control panel. Old links keep working.
  async redirects() {
    return [
      { source: "/driver", destination: "/drive", permanent: false },
      { source: "/driver/:tripId", destination: "/drive/:tripId", permanent: false },
      { source: "/admin", destination: "/company", permanent: false },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js's App Router doesn't route dot-prefixed folders, so the OAuth
  // discovery documents claude.ai's MCP client fetches (RFC 8414 / RFC 9728)
  // live at plain routes under /api/mcp and get exposed at the well-known
  // paths via rewrite instead.
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/mcp/well-known/oauth-authorization-server",
      },
      {
        source: "/.well-known/oauth-authorization-server/api/mcp",
        destination: "/api/mcp/well-known/oauth-authorization-server",
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/mcp/well-known/oauth-protected-resource",
      },
      {
        source: "/.well-known/oauth-protected-resource/api/mcp",
        destination: "/api/mcp/well-known/oauth-protected-resource",
      },
    ];
  },
};

export default nextConfig;

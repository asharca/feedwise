import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * Every non-internal IPv4 address of this machine, so a phone on the same
 * network can hit the dev server without Next's cross-origin dev warning —
 * and without hand-editing this file every time the LAN IP changes.
 */
function lanHosts(): string[] {
  const hosts: string[] = [];
  for (const ifaceList of Object.values(networkInterfaces())) {
    for (const iface of ifaceList ?? []) {
      if (iface.family === "IPv4" && !iface.internal) hosts.push(iface.address);
    }
  }
  return hosts;
}

const nextConfig: NextConfig = {
  allowedDevOrigins: lanHosts(),
};

export default nextConfig;

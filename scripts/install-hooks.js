#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

try {
  require.resolve("lefthook");
} catch {
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  ["./node_modules/lefthook/bin/index.js", "install", "-f"],
  { stdio: "inherit" }
);
process.exit(result.status ?? 0);

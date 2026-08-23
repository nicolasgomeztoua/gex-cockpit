import { defineConfig } from "vitest/config";

// Deliberately separate from vite.config.ts: that config roots itself at
// src/client for the app build, while the tests span client and server.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

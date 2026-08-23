import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const BACKEND_PORT = Number(process.env.PORT ?? 4321);
const BACKEND = `http://127.0.0.1:${BACKEND_PORT}`;

export default defineConfig({
  // The client is a self-contained root: index.html, styles.css and app.tsx all
  // live here. Keeping the Vite root inside src/client also means `envDir`
  // defaults to src/client, so the repo-root `.env.local` (GEXBOT_API_KEY) is
  // never even read by Vite — a server secret cannot reach the bundle.
  root: "src/client",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.VITE_PORT ?? 5173),
    strictPort: true,
    proxy: {
      // /api/stream is SSE: the proxy must pipe chunks straight through and
      // never time out an idle (heartbeat-only) connection.
      "^/api(?:/|$)": {
        target: BACKEND,
        changeOrigin: false,
        ws: false,
        timeout: 0,
        proxyTimeout: 0,
        configure: proxy => {
          proxy.on("proxyReq", proxyReq => {
            // no compression → nothing can buffer an event-stream mid-frame
            proxyReq.setHeader("accept-encoding", "identity");
          });
        },
      },
    },
  },
});

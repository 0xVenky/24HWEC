import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite WS proxy: the dev server upgrades /lts-ws/ to wss://livetiming.azurewebsites.net/
// and rewrites Origin so the upstream server accepts the handshake.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/lts-ws": {
        target: "wss://livetiming.azurewebsites.net",
        ws: true,
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/lts-ws/, ""),
        headers: {
          Origin: "https://livetiming.azurewebsites.net",
        },
      },
    },
  },
});

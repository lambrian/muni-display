import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/muni": {
        target: "https://webservices.umoiq.com/api/pub/v1/agencies/sfmta-cis",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/muni/, ""),
      },
    },
  },
});

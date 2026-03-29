import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "muni-display";
const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true";

export default defineConfig({
  base: isGitHubPagesBuild ? `/${repositoryName}/` : "/",
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

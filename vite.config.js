import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "muni-display";
  const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true";
  const transitApiToken = env.MUNI_511_API_TOKEN;

  return {
    base: isGitHubPagesBuild ? `/${repositoryName}/` : "/",
    plugins: [react()],
    server: transitApiToken
      ? {
          proxy: {
            "/api/muni": {
              target: "https://api.511.org",
              changeOrigin: true,
              rewrite: (path) => {
                const match = path.match(/^\/api\/muni\/stopcodes\/(\d+)\/predictions$/);
                const stopCode = match?.[1] ?? "";
                return `/transit/StopMonitoring?api_key=${transitApiToken}&agency=SF&stopcode=${stopCode}&format=json`;
              },
            },
          },
        }
      : undefined,
  };
});

# Muni Display

A React + Vite split-flap board that shows live San Francisco Muni Metro ETAs by stop number.

## Local Development

```bash
npm install
npm run dev
```

The app uses the local Vite proxy during development, so no extra setup is needed for live ETA requests.

## GitHub Pages

This repo is configured to deploy to GitHub Pages from the `main` branch with a GitHub Actions workflow.

### One Required Production Setting

GitHub Pages is static hosting, and the live Muni API does not send browser CORS headers. That means the production site needs a proxy URL that the browser can call directly.

Set a repository variable named `VITE_MUNI_API_BASE` in GitHub:

```text
https://your-proxy.example.com/api/muni
```

The frontend will build requests like:

```text
${VITE_MUNI_API_BASE}/stopcodes/17360/predictions?key=...
```

### Publish Steps

1. In GitHub, open `Settings` -> `Pages`.
2. Set `Source` to `GitHub Actions`.
3. In `Settings` -> `Secrets and variables` -> `Actions`, add repository variable `VITE_MUNI_API_BASE`.
4. Push to `main`.

The workflow in `.github/workflows/deploy.yml` will build and publish the site to:

```text
https://lambrian.github.io/muni-display/
```

## Notes

- Local development uses `/api/muni` through the Vite dev server proxy.
- GitHub Pages builds automatically use the repository base path (`/muni-display/`).
- If `VITE_MUNI_API_BASE` is missing in GitHub Actions, the deploy workflow fails intentionally so the published site does not ship with broken live data.

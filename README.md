# Muni Display

A React + Vite split-flap board that shows live San Francisco Muni Metro ETAs by stop number.

## Local Development

```bash
npm install
npm run dev
```

For live 511 data during local development, create `.env.local`:

```text
MUNI_511_API_TOKEN=your-511-token
```

That token is read only by the Vite dev server proxy, not shipped to the browser bundle.

## GitHub Pages

This repo is configured to deploy to GitHub Pages from the `main` branch with a GitHub Actions workflow.

### One Required Production Setting

GitHub Pages is static hosting, and the 511 transit API does not send browser CORS headers. That means the production site needs a proxy URL that the browser can call directly.

Set a repository variable named `VITE_MUNI_API_BASE` in GitHub:

```text
https://your-vercel-proxy.vercel.app/api/muni
```

The frontend will build requests like:

```text
${VITE_MUNI_API_BASE}/stopcodes/17360/predictions
```

### Publish Steps

1. In GitHub, open `Settings` -> `Pages`.
2. Set `Source` to `GitHub Actions`.
3. Deploy the separate proxy app in `vercel-proxy/`.
4. In `Settings` -> `Secrets and variables` -> `Actions`, add repository variable `VITE_MUNI_API_BASE`.
5. Push to `main`.

## Vercel Proxy

This repo includes a separate Vercel-ready proxy app in [vercel-proxy/README.md](/Users/brianlam/Documents/transit-flipboard/vercel-proxy/README.md).

It:

- keeps the 511 token server-side
- adds browser CORS headers
- forwards `GET /api/muni/stopcodes/:stopCode/predictions` to 511 `StopMonitoring`

Set the Vercel environment variable:

```text
API_511_TOKEN=your-511-token
```

The workflow in `.github/workflows/deploy.yml` will build and publish the site to:

```text
https://lambrian.github.io/muni-display/
```

## Notes

- Local development can use `/api/muni` through the Vite dev server proxy when `MUNI_511_API_TOKEN` is set.
- GitHub Pages builds automatically use the repository base path (`/muni-display/`).
- If `VITE_MUNI_API_BASE` is missing in GitHub Actions, the deploy workflow fails intentionally so the published site does not ship with broken live data.

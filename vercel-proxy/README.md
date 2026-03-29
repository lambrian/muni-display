# Vercel Proxy

Deploy this directory as a separate Vercel project.

## Purpose

This proxy keeps the 511 transit token server-side and adds browser CORS headers for the GitHub Pages frontend.

It exposes:

```text
GET /api/muni/stopcodes/:stopCode/predictions
```

and forwards that request to:

```text
https://api.511.org/transit/StopMonitoring?agency=SF&stopcode=:stopCode&format=json
```

## Vercel Setup

1. Create a new Vercel project from this repo.
2. Set the root directory to `vercel-proxy`.
3. Add environment variable `API_511_TOKEN`.
4. Leave build and output settings empty.
5. Deploy.

After deploy, use the resulting base URL in the frontend as:

```text
VITE_MUNI_API_BASE=https://your-project.vercel.app/api/muni
```

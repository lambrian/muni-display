const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function applyCorsHeaders(response) {
  Object.entries(CORS_HEADERS).forEach(([name, value]) => {
    response.setHeader(name, value);
  });
}

export default async function handler(request, response) {
  applyCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.API_511_TOKEN;
  const stopCode = String(request.query.stopcode ?? "").replace(/\D/g, "");

  if (!token) {
    response.status(500).json({ error: "Missing API_511_TOKEN" });
    return;
  }

  if (!stopCode) {
    response.status(400).json({ error: "A numeric stop code is required" });
    return;
  }

  const upstreamUrl = new URL("https://api.511.org/transit/StopMonitoring");
  upstreamUrl.searchParams.set("api_key", token);
  upstreamUrl.searchParams.set("agency", "SF");
  upstreamUrl.searchParams.set("stopcode", stopCode);
  upstreamUrl.searchParams.set("format", "json");

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: { Accept: "application/json" },
    });
    const body = await upstreamResponse.text();

    response.setHeader(
      "Content-Type",
      upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8",
    );
    response.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=45");
    response.status(upstreamResponse.status).send(body);
  } catch (error) {
    response.status(502).json({
      error: "Unable to reach the 511 transit API",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

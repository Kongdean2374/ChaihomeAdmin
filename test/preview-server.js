const PUBLIC_ROOT = new URL("../public/", import.meta.url);
const PORT = Number(Deno.env.get("PORT") || 8787);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

function extension(path) {
  const match = path.match(/\.[a-z0-9]+$/i);
  return match?.[0].toLowerCase() || "";
}

async function fileResponse(relativePath) {
  try {
    const bytes = await Deno.readFile(new URL(relativePath, PUBLIC_ROOT));
    return new Response(bytes, { headers: { "Content-Type": contentTypes[extension(relativePath)] || "application/octet-stream" } });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  }
}

Deno.serve({ port: PORT, hostname: "127.0.0.1" }, async (request) => {
  const url = new URL(request.url);
  const path = decodeURIComponent(url.pathname);
  if (path.includes("..")) return new Response("Forbidden", { status: 403 });
  if (path === "/api/public/content") {
    const response = await fileResponse("data/default-content.json");
    const data = await response.json();
    return Response.json({ ok: true, data });
  }
  if (path === "/") return await fileResponse("index.html");
  const asset = await fileResponse(path.slice(1));
  if (asset) return asset;
  if (!extension(path)) return await fileResponse("index.html");
  return new Response("Not found", { status: 404 });
});

console.log(`Preview: http://127.0.0.1:${PORT}`);

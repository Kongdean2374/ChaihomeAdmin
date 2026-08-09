const CONTENT_KEY = "content:v1";
const MAX_BODY_BYTES = 100_000;
const WRITE_LIMIT = 24;
const WRITE_WINDOW_MS = 60_000;
const RATE_BUCKETS = new Map();

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests";

class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export default {
  async fetch(request, env) {
    try {
      return await routeRequest(request, env);
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(request, env, error);
      console.error("Unhandled request error", error);
      return errorResponse(request, env, new ApiError(500, "INTERNAL_ERROR", "伺服器暫時無法處理要求。"));
    }
  },
};

async function routeRequest(request, env) {
  const url = new URL(request.url);
  if (url.protocol === "http:") {
    url.protocol = "https:";
    return new Response(null, {
      status: 308,
      headers: { Location: url.toString(), "Cache-Control": "public, max-age=86400" },
    });
  }
  const path = normalizePath(url.pathname);

  if (request.method === "OPTIONS" && path.startsWith("/api/")) return corsPreflight(request, env);
  if (path.startsWith("/api/public/")) return handlePublicApi(request, env, path);
  if (path.startsWith("/api/admin/")) return handleAdminApi(request, env, path);
  if (path === "/sitemap.xml") return sitemapResponse(request, env);

  if (!env.ASSETS?.fetch) throw new ApiError(503, "ASSETS_UNAVAILABLE", "網站靜態資源尚未完成設定。");
  const assetResponse = await env.ASSETS.fetch(request);
  const contentType = assetResponse.headers.get("Content-Type") || "";

  if (request.method === "GET" && contentType.includes("text/html")) {
    const content = await getContent(env, request.url);
    const metadata = findMetadata(path, content, env);
    const html = injectMetadata(await assetResponse.text(), metadata);
    const headers = new Headers(assetResponse.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", path === "/" ? "public, max-age=0, must-revalidate" : "public, max-age=30, s-maxage=60");
    applySecurityHeaders(headers, true);
    return new Response(html, { status: assetResponse.status, headers });
  }

  return securedResponse(assetResponse);
}

async function handlePublicApi(request, env, path) {
  if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "此端點只接受 GET。" );
  const content = await getContent(env, request.url);
  let data;

  if (path.startsWith("/api/public/delete-list/")) {
    const collection = decodeURIComponent(path.split("/").filter(Boolean)[3] || "");
    if (!["news", "maintenance", "changelog"].includes(collection)) {
      throw new ApiError(404, "NOT_FOUND", "找不到指定的內容類型。" );
    }
    const dateKey = collection === "changelog" ? "date" : "publishedAt";
    const lines = sortedItems(content[collection], dateKey).map((item) => `${item.title}|||${item.slug}`);
    return textResponse(request, env, lines.join("\n"), { "Cache-Control": "no-store" });
  }

  if (path === "/api/public/content") data = content;
  else if (path === "/api/public/settings") data = content.settings;
  else if (path === "/api/public/ticker") data = content.ticker;
  else if (path.startsWith("/api/public/delete-options/")) {
    const collection = decodeURIComponent(path.split("/").filter(Boolean)[3] || "");
    if (!["news", "maintenance", "changelog"].includes(collection)) {
      throw new ApiError(404, "NOT_FOUND", "找不到指定的內容類型。" );
    }
    const dateKey = collection === "changelog" ? "date" : "publishedAt";
    data = sortedItems(content[collection], dateKey).map((item) => `${item.title}\n${item.slug}`);
  } else {
    const parts = path.split("/").filter(Boolean);
    const collection = parts[2];
    const slug = parts[3] ? decodeURIComponent(parts[3]) : "";
    if (!["news", "maintenance", "changelog"].includes(collection)) throw new ApiError(404, "NOT_FOUND", "找不到指定的公開內容。" );
    if (!slug) data = sortedItems(content[collection], collection === "changelog" ? "date" : "publishedAt");
    else {
      data = content[collection].find((item) => item.slug === slug || item.id === slug);
      if (!data) throw new ApiError(404, "NOT_FOUND", "找不到指定的內容。" );
    }
  }

  return jsonResponse(request, env, { ok: true, data }, 200, { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300" });
}

async function handleAdminApi(request, env, path) {
  await requireAuthorization(request, env);
  const method = request.method;
  const parts = path.split("/").filter(Boolean);
  const resource = parts[2];
  const identifier = parts[3] ? decodeURIComponent(parts[3]) : undefined;

  if (method !== "GET") enforceRateLimit(request);

  if (resource === "snapshot" && method === "GET") {
    return jsonResponse(request, env, { ok: true, data: await getContent(env, request.url) });
  }

  if (resource === "settings") {
    if (method === "GET") {
      const content = await getContent(env, request.url);
      return jsonResponse(request, env, { ok: true, data: content.settings });
    }
    if (["PUT", "PATCH"].includes(method)) {
      const body = await readJson(request);
      const result = await updateSettings(env, request.url, body);
      return jsonResponse(request, env, { ok: true, data: result });
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Settings 支援 GET、PUT 與 PATCH。" );
  }

  if (["ticker", "announcement"].includes(resource)) {
    if (method === "GET") {
      const content = await getContent(env, request.url);
      return jsonResponse(request, env, { ok: true, data: content.ticker });
    }
    if (["PUT", "PATCH"].includes(method)) {
      const body = await readJson(request);
      const result = await updateTicker(env, request.url, body);
      return jsonResponse(request, env, { ok: true, data: result });
    }
    if (method === "DELETE") {
      const result = await updateTicker(env, request.url, { enabled: false });
      return jsonResponse(request, env, { ok: true, data: result });
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Ticker 支援 GET、PUT、PATCH 與 DELETE。" );
  }

  if (resource === "delete-options") {
    if (method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "刪除選項只接受 GET。" );
    if (!["news", "maintenance", "changelog"].includes(identifier)) {
      throw new ApiError(404, "NOT_FOUND", "找不到指定的內容類型。" );
    }
    const content = await getContent(env, request.url);
    const dateKey = identifier === "changelog" ? "date" : "publishedAt";
    const data = sortedItems(content[identifier], dateKey).map((item) => `${item.title}\n${item.slug}`);
    return jsonResponse(request, env, { ok: true, data });
  }

  if (!["news", "maintenance", "changelog"].includes(resource)) throw new ApiError(404, "NOT_FOUND", "找不到指定的管理端點。" );

  if (method === "GET") {
    const content = await getContent(env, request.url);
    const items = content[resource];
    const data = identifier ? items.find((item) => item.id === identifier || item.slug === identifier) : sortedItems(items, resource === "changelog" ? "date" : "publishedAt");
    if (identifier && !data) throw new ApiError(404, "NOT_FOUND", "找不到指定內容。" );
    return jsonResponse(request, env, { ok: true, data });
  }

  if (method === "POST" && !identifier) {
    const body = await readJson(request);
    const result = await createEntry(env, request.url, resource, body);
    return jsonResponse(request, env, { ok: true, data: result }, 201);
  }

  if (["PUT", "PATCH"].includes(method) && identifier) {
    const body = await readJson(request);
    const result = await updateEntry(env, request.url, resource, identifier, body);
    return jsonResponse(request, env, { ok: true, data: result });
  }

  if (method === "DELETE" && identifier) {
    const deleted = await deleteEntry(env, request.url, resource, identifier);
    return jsonResponse(request, env, {
      ok: true,
      data: { deleted: true, id: deleted.id, slug: deleted.slug, title: deleted.title },
    });
  }

  throw new ApiError(405, "METHOD_NOT_ALLOWED", "不支援此 HTTP Method 或路徑格式。" );
}

async function updateSettings(env, requestUrl, input) {
  const allowed = {
    serverName: [2, 60], brandName: [2, 30], tagline: [2, 80], subtitle: [2, 100],
    javaAddress: [3, 253], bedrockAddress: [3, 253], serverVersion: [1, 30],
    javaSupportedVersions: [1, 60], javaRecommendedVersions: [1, 60], bedrockRecommendedVersion: [1, 60],
    pluginSurvivalIntro: [5, 300], vanillaSurvivalIntro: [5, 300], joinIntro: [5, 300],
  };
  const patch = {};
  for (const [key, limits] of Object.entries(allowed)) {
    if (key in input) patch[key] = requiredString(input[key], key, ...limits);
  }
  if ("bedrockPort" in input) patch.bedrockPort = integerInRange(input.bedrockPort, "bedrockPort", 1, 65535);
  if (!Object.keys(patch).length) throw new ApiError(422, "VALIDATION_ERROR", "沒有可更新的設定欄位。" );

  const content = await getContent(env, requestUrl);
  content.settings = { ...content.settings, ...patch };
  await saveContent(env, content);
  return content.settings;
}

async function updateTicker(env, requestUrl, input) {
  if (typeof input.enabled !== "boolean") throw validationError("enabled", "enabled 必須是 true 或 false。" );
  const content = await getContent(env, requestUrl);

  if (!input.enabled) {
    content.ticker = { enabled: false, type: "news", slug: "", summary: "" };
  } else {
    const type = enumValue(input.type, "type", ["news", "maintenance"]);
    const slug = requiredString(input.slug, "slug", 1, 120);
    const linked = content[type].find((item) => item.slug === slug || item.id === slug);
    if (!linked) throw validationError("slug", "找不到要設為跑馬燈的文章。" );
    content.ticker = {
      enabled: true,
      type,
      slug: linked.slug,
      summary: optionalString(input.summary, "summary", 160) || linked.summary || linked.title,
    };
  }

  await saveContent(env, content);
  return content.ticker;
}

async function createEntry(env, requestUrl, collection, input) {
  const content = await getContent(env, requestUrl);
  const item = validateEntry(collection, input, null, content[collection]);
  content[collection].push(item);

  if (input.setAsTicker === true && collection !== "changelog") {
    content.ticker = {
      enabled: true,
      type: collection,
      slug: item.slug,
      summary: optionalString(input.tickerSummary, "tickerSummary", 160) || item.summary || item.title,
    };
  }

  await saveContent(env, content);
  return item;
}

async function updateEntry(env, requestUrl, collection, identifier, input) {
  const content = await getContent(env, requestUrl);
  const index = content[collection].findIndex((item) => item.id === identifier || item.slug === identifier);
  if (index < 0) throw new ApiError(404, "NOT_FOUND", "找不到要更新的內容。" );
  const previous = content[collection][index];
  const item = validateEntry(collection, { ...previous, ...input }, previous, content[collection]);
  content[collection][index] = item;

  if (content.ticker?.enabled && content.ticker.type === collection && content.ticker.slug === previous.slug) {
    content.ticker.slug = item.slug;
    if (!("summary" in input) && !("tickerSummary" in input)) content.ticker.summary ||= item.summary || item.title;
  }
  if (input.setAsTicker === true && collection !== "changelog") {
    content.ticker = { enabled: true, type: collection, slug: item.slug, summary: optionalString(input.tickerSummary, "tickerSummary", 160) || item.summary || item.title };
  }

  await saveContent(env, content);
  return item;
}

async function deleteEntry(env, requestUrl, collection, identifier) {
  const content = await getContent(env, requestUrl);
  const index = content[collection].findIndex((item) => item.id === identifier || item.slug === identifier);
  if (index < 0) throw new ApiError(404, "NOT_FOUND", "找不到要刪除的內容。" );
  const [deleted] = content[collection].splice(index, 1);
  if (content.ticker?.enabled && content.ticker.type === collection && content.ticker.slug === deleted.slug) {
    content.ticker = { enabled: false, type: "news", slug: "", summary: "" };
  }
  await saveContent(env, content);
  return deleted;
}

function validateEntry(collection, input, previous, existing) {
  const now = new Date().toISOString();
  const baseId = previous?.id || `${collection}-${crypto.randomUUID()}`;

  if (collection === "changelog") {
    const date = dateOnly(input.date, "date");
    const rawSlug = optionalString(input.slug, "slug", 120) || `${date}-${optionalString(input.version, "version", 30) || "update"}`;
    return {
      id: baseId,
      slug: uniqueSlug(slugify(rawSlug), existing, previous?.id),
      date,
      version: optionalString(input.version, "version", 30),
      title: optionalString(input.title, "title", 120) || "伺服器更新",
      added: stringArray(input.added, "added"),
      improved: stringArray(input.improved, "improved"),
      adjusted: stringArray(input.adjusted, "adjusted"),
      fixed: stringArray(input.fixed, "fixed"),
      removed: stringArray(input.removed, "removed"),
      technical: stringArray(input.technical, "technical"),
      publishedAt: previous?.publishedAt || now,
      updatedAt: now,
    };
  }

  const title = requiredString(input.title, "title", 2, 120);
  const rawSlug = optionalString(input.slug, "slug", 120) || title;
  const common = {
    id: baseId,
    slug: uniqueSlug(slugify(rawSlug), existing, previous?.id),
    title,
    publishedAt: validDate(input.publishedAt || previous?.publishedAt || now, "publishedAt"),
    summary: requiredString(input.summary, "summary", 5, 240),
    content: requiredString(input.content, "content", 10, 50_000),
    updatedAt: now,
  };

  if (collection === "news") return { ...common, category: requiredString(input.category || "最新消息", "category", 2, 40) };

  const startAt = input.startAt ? validDate(input.startAt, "startAt") : "";
  const endAt = input.endAt ? validDate(input.endAt, "endAt") : "";
  if (startAt && endAt && new Date(endAt) < new Date(startAt)) throw validationError("endAt", "預計結束時間不可早於開始時間。" );
  return {
    ...common,
    startAt,
    endAt,
    reason: optionalString(input.reason, "reason", 1000),
    items: stringArray(input.items, "items"),
    impact: optionalString(input.impact, "impact", 1000),
    requiresRelogin: typeof input.requiresRelogin === "boolean" ? input.requiresRelogin : null,
    result: optionalString(input.result, "result", 3000),
  };
}

async function getContent(env, requestUrl) {
  let stored = null;
  if (env.CONTENT?.get) stored = await env.CONTENT.get(CONTENT_KEY, "json");
  if (stored) return normalizeContent(stored);
  if (!env.ASSETS?.fetch) throw new ApiError(503, "CONTENT_UNAVAILABLE", "內容儲存空間尚未完成設定。" );
  const fallbackUrl = new URL("/data/default-content.json", requestUrl);
  const fallback = await env.ASSETS.fetch(fallbackUrl);
  if (!fallback.ok) throw new ApiError(503, "CONTENT_UNAVAILABLE", "無法載入初始網站內容。" );
  return normalizeContent(await fallback.json());
}

function normalizeContent(content) {
  return {
    schemaVersion: 1,
    settings: content.settings || {},
    ticker: content.ticker || { enabled: false, type: "news", slug: "", summary: "" },
    news: Array.isArray(content.news) ? content.news : [],
    maintenance: Array.isArray(content.maintenance) ? content.maintenance : [],
    changelog: Array.isArray(content.changelog) ? content.changelog : [],
    updatedAt: content.updatedAt || new Date().toISOString(),
  };
}

async function saveContent(env, content) {
  if (!env.CONTENT?.put) throw new ApiError(503, "KV_UNAVAILABLE", "Cloudflare KV 尚未完成綁定。" );
  content.updatedAt = new Date().toISOString();
  await env.CONTENT.put(CONTENT_KEY, JSON.stringify(content));
}

async function readJson(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type 必須是 application/json。" );
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BODY_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "JSON 內容超過 100 KB 限制。" );
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "JSON 內容超過 100 KB 限制。" );
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON object required");
    return parsed;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "JSON 格式不正確，最外層必須是物件。" );
  }
}

async function requireAuthorization(request, env) {
  if (!env.ADMIN_TOKEN || typeof env.ADMIN_TOKEN !== "string") throw new ApiError(503, "ADMIN_NOT_CONFIGURED", "管理 Token 尚未設定。" );
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new ApiError(401, "UNAUTHORIZED", "缺少有效的 Bearer Token。" );
  const supplied = authorization.slice(7);
  if (!(await secureEqual(supplied, env.ADMIN_TOKEN))) throw new ApiError(401, "UNAUTHORIZED", "Bearer Token 無效。" );
}

async function secureEqual(left, right) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) difference |= (a[index % a.length] || 0) ^ (b[index % b.length] || 0);
  return difference === 0;
}

function enforceRateLimit(request) {
  const now = Date.now();
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
  const current = RATE_BUCKETS.get(ip);
  if (!current || now - current.startedAt >= WRITE_WINDOW_MS) RATE_BUCKETS.set(ip, { startedAt: now, count: 1 });
  else {
    current.count += 1;
    if (current.count > WRITE_LIMIT) throw new ApiError(429, "RATE_LIMITED", "寫入要求過於頻繁，請稍候一分鐘再試。" );
  }
  if (RATE_BUCKETS.size > 500) {
    for (const [key, bucket] of RATE_BUCKETS) if (now - bucket.startedAt > WRITE_WINDOW_MS * 2) RATE_BUCKETS.delete(key);
  }
}

function corsPreflight(request, env) {
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin, env)) throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "此來源不允許跨網域存取。" );
  const headers = new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });
  applySecurityHeaders(headers);
  return new Response(null, { status: 204, headers });
}

function isAllowedOrigin(origin, env) {
  if (!origin) return true;
  const allowed = [env.SITE_ORIGIN, "http://localhost:8787", "http://127.0.0.1:8787"].filter(Boolean);
  return allowed.includes(origin);
}

function jsonResponse(request, env, payload, status = 200, extraHeaders = {}) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", ...extraHeaders });
  const origin = request.headers.get("Origin");
  if (origin && isAllowedOrigin(origin, env)) { headers.set("Access-Control-Allow-Origin", origin); headers.set("Vary", "Origin"); }
  applySecurityHeaders(headers);
  return new Response(JSON.stringify(payload), { status, headers });
}

function textResponse(request, env, body, extraHeaders = {}) {
  const headers = new Headers({ "Content-Type": "text/plain; charset=utf-8", ...extraHeaders });
  const origin = request.headers.get("Origin");
  if (origin && isAllowedOrigin(origin, env)) { headers.set("Access-Control-Allow-Origin", origin); headers.set("Vary", "Origin"); }
  applySecurityHeaders(headers);
  return new Response(body, { status: 200, headers });
}

function errorResponse(request, env, error) {
  const body = { ok: false, error: { code: error.code, message: error.message } };
  if (error.fields) body.error.fields = error.fields;
  return jsonResponse(request, env, body, error.status || 500, error.status === 401 ? { "WWW-Authenticate": "Bearer" } : {});
}

function securedResponse(response) {
  const headers = new Headers(response.headers);
  applySecurityHeaders(headers, (headers.get("Content-Type") || "").includes("text/html"));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function applySecurityHeaders(headers, html = false) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (html) headers.set("Content-Security-Policy", CSP);
}

async function sitemapResponse(request, env) {
  if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Sitemap 只接受 GET。" );
  const content = await getContent(env, request.url);
  const origin = env.SITE_ORIGIN || new URL(request.url).origin;
  const staticPaths = ["/", "/server", "/news", "/maintenance", "/changelog", "/join", "/contact"];
  const dynamic = [
    ...content.news.map((item) => ({ path: `/news/${encodeURIComponent(item.slug)}`, modified: item.updatedAt || item.publishedAt })),
    ...content.maintenance.map((item) => ({ path: `/maintenance/${encodeURIComponent(item.slug)}`, modified: item.updatedAt || item.publishedAt })),
  ];
  const urls = [
    ...staticPaths.map((path) => ({ path, modified: content.updatedAt })),
    ...dynamic,
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((item) => `  <url><loc>${escapeXml(origin + item.path)}</loc>${item.modified ? `<lastmod>${escapeXml(String(item.modified).slice(0, 10))}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>`;
  const headers = new Headers({ "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" });
  applySecurityHeaders(headers);
  return new Response(xml, { headers });
}

function findMetadata(path, content, env) {
  const origin = env.SITE_ORIGIN || "https://play.chaihome.cc";
  const pages = {
    "/": ["柴柴生存伺服器｜一個入口，兩種生存", "Java × Bedrock 跨平台遊玩，在插件生存與原味生存之間自由切換。"],
    "/server": ["伺服器介紹｜柴柴生存伺服器", "完整了解兩種生存的功能差異、獨立進度、跨平台支援與 /switch 切換方式。"],
    "/news": ["最新消息｜柴柴生存伺服器", "查看柴柴生存伺服器的最新消息與重要通知。"],
    "/maintenance": ["維護公告｜柴柴生存伺服器", "查看預定維護、影響範圍與完成結果。"],
    "/changelog": ["更新紀錄｜柴柴生存伺服器", "永久保存新功能、改善、調整與修復紀錄。"],
    "/join": ["加入遊戲｜柴柴生存伺服器", `Java ${content.settings.javaAddress}；Bedrock ${content.settings.bedrockAddress}:${content.settings.bedrockPort}。`],
    "/contact": ["聯絡我們｜柴柴生存伺服器", "查看建議聯絡方式、Discord 伺服器與電子郵件。"],
  };
  let [title, description] = pages[path] || ["柴柴生存伺服器", "一個入口，兩種生存。"];
  let type = "website";
  const match = path.match(/^\/(news|maintenance)\/([^/]+)$/);
  if (match) {
    const item = content[match[1]].find((entry) => entry.slug === decodeURIComponent(match[2]));
    if (item) { title = `${item.title}｜柴柴生存伺服器`; description = item.summary; type = "article"; }
  }
  return { title, description, canonical: origin + path, type };
}

function injectMetadata(html, metadata) {
  return html
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtmlText(metadata.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${escapeHtmlText(metadata.description)}">`)
    .replace(/<meta property="og:title" content="[^"]*">/i, `<meta property="og:title" content="${escapeHtmlText(metadata.title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/i, `<meta property="og:description" content="${escapeHtmlText(metadata.description)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/i, `<meta property="og:url" content="${escapeHtmlText(metadata.canonical)}">`)
    .replace(/<meta property="og:type" content="[^"]*">/i, `<meta property="og:type" content="${escapeHtmlText(metadata.type)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="${escapeHtmlText(metadata.canonical)}">`);
}

function normalizePath(path) { return path !== "/" ? path.replace(/\/+$/, "") : path; }
function sortedItems(items, field) { return [...items].sort((a, b) => String(b[field] || "").localeCompare(String(a[field] || ""))); }
function escapeXml(value) { return String(value).replace(/[<>&'"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character]); }
function escapeHtmlText(value) { return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]); }

function requiredString(value, field, minimum, maximum) {
  if (typeof value !== "string") throw validationError(field, `${field} 必須是文字。` );
  const result = value.trim();
  if (result.length < minimum || result.length > maximum) throw validationError(field, `${field} 長度必須介於 ${minimum} 到 ${maximum} 個字元。` );
  return result;
}

function optionalString(value, field, maximum) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw validationError(field, `${field} 必須是文字。` );
  const result = value.trim();
  if (result.length > maximum) throw validationError(field, `${field} 不可超過 ${maximum} 個字元。` );
  return result;
}

function integerInRange(value, field, minimum, maximum) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < minimum || result > maximum) throw validationError(field, `${field} 必須是 ${minimum} 到 ${maximum} 的整數。` );
  return result;
}

function enumValue(value, field, options) {
  if (!options.includes(value)) throw validationError(field, `${field} 必須是 ${options.join("、")} 其中之一。` );
  return value;
}

function validDate(value, field) {
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) throw validationError(field, `${field} 必須是有效的 ISO 8601 日期時間。` );
  return value;
}

function dateOnly(value, field) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) throw validationError(field, `${field} 必須使用 YYYY-MM-DD 格式。` );
  return value;
}

function stringArray(value, field) {
  if (value === undefined || value === null || value === "") return [];
  const array = typeof value === "string" ? value.split(/\r?\n/).map((item) => item.replace(/^[•*\-]\s*/, "")).filter(Boolean) : value;
  if (!Array.isArray(array) || array.length > 100) throw validationError(field, `${field} 必須是最多 100 項的文字陣列，或以換行分隔的文字。` );
  return array.map((item, index) => requiredString(item, `${field}[${index}]`, 1, 500));
}

function slugify(value) {
  const result = String(value).normalize("NFKC").toLowerCase().trim().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 100);
  return result || `item-${Date.now()}`;
}

function uniqueSlug(base, existing, currentId) {
  const used = new Set(existing.filter((item) => item.id !== currentId).map((item) => item.slug));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function validationError(field, message) {
  return new ApiError(422, "VALIDATION_ERROR", "輸入資料驗證失敗。", { [field]: message });
}

import worker from "../src/worker.js";

const ROOT = new URL("../", import.meta.url);

function assert(condition, message = "Assertion failed") {
  if (!condition) throw new Error(message);
}

function assertEquals(actual, expected, message = "Values are not equal") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}\nActual: ${JSON.stringify(actual)}\nExpected: ${JSON.stringify(expected)}`);
  }
}

class MemoryKV {
  constructor() { this.values = new Map(); }
  get(key, type) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }
  put(key, value) { this.values.set(key, value); }
}

async function makeEnv() {
  const defaultContent = await Deno.readTextFile(new URL("public/data/default-content.json", ROOT));
  const index = await Deno.readTextFile(new URL("public/index.html", ROOT));
  return {
    ADMIN_TOKEN: "test-token-that-is-long-and-random",
    SITE_ORIGIN: "https://play.chaihome.cc",
    CONTENT: new MemoryKV(),
    ASSETS: {
      fetch(input) {
        const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
        if (url.pathname === "/data/default-content.json") {
          return new Response(defaultContent, { headers: { "Content-Type": "application/json" } });
        }
        return new Response(index, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      },
    },
  };
}

function adminRequest(path, method = "GET", body, token = "test-token-that-is-long-and-random") {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json", "CF-Connecting-IP": "203.0.113.10" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return new Request(`https://play.chaihome.cc${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

Deno.test("public content falls back to bundled initial data", async () => {
  const env = await makeEnv();
  const response = await worker.fetch(new Request("https://play.chaihome.cc/api/public/content"), env);
  const payload = await response.json();
  assertEquals(response.status, 200);
  assert(payload.ok);
  assertEquals(payload.data.settings.javaAddress, "chaihome.cc");
  assertEquals(payload.data.settings.bedrockPort, 55550);
});

Deno.test("news sorting compares actual instants across timezone formats", async () => {
  const env = await makeEnv();
  const content = JSON.parse(await Deno.readTextFile(new URL("public/data/default-content.json", ROOT)));
  content.news.push({
    id: "news-timezone-test",
    slug: "timezone-test",
    title: "較新的公告",
    publishedAt: "2026-08-09T03:49:34.753Z",
    updatedAt: "2026-08-09T03:49:34.753Z",
    category: "伺服器公告",
    summary: "這篇公告的實際時間較新。",
    content: "即使時間使用 Z 格式，也必須排在較舊的 +08:00 公告前面。",
  });
  await env.CONTENT.put("content:v1", JSON.stringify(content));

  const response = await worker.fetch(new Request("https://play.chaihome.cc/api/public/news"), env);
  const payload = await response.json();
  assertEquals(payload.data[0].slug, "timezone-test");
  assertEquals(payload.data[1].slug, "official-site-launch");
});
Deno.test("admin endpoints reject missing and incorrect bearer tokens", async () => {
  const env = await makeEnv();
  const missing = await worker.fetch(new Request("https://play.chaihome.cc/api/admin/settings"), env);
  assertEquals(missing.status, 401);
  const incorrect = await worker.fetch(adminRequest("/api/admin/settings", "GET", undefined, "wrong"), env);
  assertEquals(incorrect.status, 401);
});

Deno.test("news can be published and selected as ticker without deployment", async () => {
  const env = await makeEnv();
  const request = adminRequest("/api/admin/news", "POST", {
    title: "插件生存功能更新",
    summary: "連鎖挖礦與 HUD 已完成調整。",
    category: "功能更新",
    content: "本次更新完成。\n\n• 改善 HUD 顯示\n• 調整連鎖挖礦判定",
    setAsTicker: true,
    tickerSummary: "插件生存功能更新已完成",
  });
  const response = await worker.fetch(request, env);
  const payload = await response.json();
  assertEquals(response.status, 201);
  assert(payload.ok);
  assert(payload.data.slug.length > 0);

  const publicResponse = await worker.fetch(new Request("https://play.chaihome.cc/api/public/content"), env);
  const publicPayload = await publicResponse.json();
  assert(publicPayload.data.news.some((item) => item.title === "插件生存功能更新"));
  assertEquals(publicPayload.data.ticker.slug, payload.data.slug);
});

Deno.test("deleting an existing entry returns metadata and disables its ticker", async () => {
  const env = await makeEnv();
  const createdResponse = await worker.fetch(adminRequest("/api/admin/news", "POST", {
    title: "待刪除測試消息",
    summary: "這是一則稍後會由管理捷徑刪除的測試消息。",
    category: "站務公告",
    content: "用來驗證刪除 API 與跑馬燈連結清理。",
    setAsTicker: true,
  }), env);
  const created = await createdResponse.json();
  assertEquals(createdResponse.status, 201);

  const deletedResponse = await worker.fetch(adminRequest(`/api/admin/news/${created.data.slug}`, "DELETE"), env);
  const deleted = await deletedResponse.json();
  assertEquals(deletedResponse.status, 200);
  assertEquals(deleted.data.deleted, true);
  assertEquals(deleted.data.title, "待刪除測試消息");
  assertEquals(deleted.data.slug, created.data.slug);

  const publicResponse = await worker.fetch(new Request("https://play.chaihome.cc/api/public/content"), env);
  const publicContent = await publicResponse.json();
  assert(!publicContent.data.news.some((item) => item.slug === created.data.slug));
  assertEquals(publicContent.data.ticker.enabled, false);

  const repeatedDelete = await worker.fetch(adminRequest(`/api/admin/news/${created.data.slug}`, "DELETE"), env);
  assertEquals(repeatedDelete.status, 404);
});

Deno.test("public shortcut delete list returns plain text without dictionary conversion", async () => {
  const env = await makeEnv();
  const response = await worker.fetch(new Request("https://play.chaihome.cc/api/public/delete-list/news"), env);
  const body = await response.text();
  assertEquals(response.status, 200);
  assert(response.headers.get("Content-Type")?.startsWith("text/plain"));
  assertEquals(body, "柴柴生存伺服器官方網站正式上線|||official-site-launch");
});

Deno.test("public shortcut delete options expose only selectable title and slug lines", async () => {
  const env = await makeEnv();
  const response = await worker.fetch(new Request("https://play.chaihome.cc/api/public/delete-options/news"), env);
  const payload = await response.json();
  assertEquals(response.status, 200);
  assert(payload.ok);
  assertEquals(payload.data, ["柴柴生存伺服器官方網站正式上線\nofficial-site-launch"]);
});

Deno.test("shortcut delete options return selectable title and slug lines", async () => {
  const env = await makeEnv();
  const response = await worker.fetch(adminRequest("/api/admin/delete-options/news"), env);
  const payload = await response.json();
  assertEquals(response.status, 200);
  assert(payload.ok);
  assert(Array.isArray(payload.data));
  assert(payload.data.includes("柴柴生存伺服器官方網站正式上線\nofficial-site-launch"));
});

Deno.test("write endpoints require JSON content type", async () => {
  const env = await makeEnv();
  const request = new Request("https://play.chaihome.cc/api/admin/news", {
    method: "POST",
    headers: { Authorization: "Bearer test-token-that-is-long-and-random", "Content-Type": "text/plain", "CF-Connecting-IP": "203.0.113.11" },
    body: "not json",
  });
  const response = await worker.fetch(request, env);
  const payload = await response.json();
  assertEquals(response.status, 415);
  assertEquals(payload.error.code, "UNSUPPORTED_MEDIA_TYPE");
});

Deno.test("maintenance end time cannot precede start time", async () => {
  const env = await makeEnv();
  const response = await worker.fetch(adminRequest("/api/admin/maintenance", "POST", {
    title: "測試維護",
    summary: "這是一段足夠長的維護測試摘要。",
    content: "這是一段足夠長的完整維護公告內容。",
    startAt: "2026-08-09T23:00:00+08:00",
    endAt: "2026-08-09T22:00:00+08:00",
  }), env);
  const payload = await response.json();
  assertEquals(response.status, 422);
  assertEquals(payload.error.code, "VALIDATION_ERROR");
  assert("endAt" in payload.error.fields);
});

Deno.test("settings validate Bedrock port range", async () => {
  const env = await makeEnv();
  const response = await worker.fetch(adminRequest("/api/admin/settings", "PATCH", { bedrockPort: 70000 }), env);
  assertEquals(response.status, 422);
});

Deno.test("article navigation returns route-specific SEO metadata", async () => {
  const env = await makeEnv();
  const response = await worker.fetch(new Request("https://play.chaihome.cc/news/official-site-launch"), env);
  const html = await response.text();
  assertEquals(response.status, 200);
  assert(html.includes("<title>柴柴生存伺服器官方網站正式上線｜柴柴生存伺服器</title>"));
  assert(html.includes('property="og:type" content="article"'));
  assertEquals(response.headers.get("X-Frame-Options"), "DENY");
  assert(response.headers.get("Content-Security-Policy")?.includes("object-src 'none'"));
});

Deno.test("sitemap contains article URLs", async () => {
  const env = await makeEnv();
  const response = await worker.fetch(new Request("https://play.chaihome.cc/sitemap.xml"), env);
  const xml = await response.text();
  assertEquals(response.status, 200);
  assert(xml.includes("https://play.chaihome.cc/news/official-site-launch"));
  assert(xml.includes("https://play.chaihome.cc/join"));
  assert(xml.includes("https://play.chaihome.cc/contact"));
});

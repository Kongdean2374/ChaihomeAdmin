import { writeFile } from "node:fs/promises";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9223";
const targetUrl = process.argv[2] ?? "https://play.chaihome.cc";
const outputPath = process.argv[3] ?? "mobile-viewport-qa.png";

async function waitForBrowser() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${endpoint}/json/version`);
      if (response.ok) return;
    } catch {
      // Edge is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the browser debugging endpoint.");
}

await waitForBrowser();
const target = await fetch(`${endpoint}/json/new?${encodeURIComponent("about:blank")}`, {
  method: "PUT",
}).then((response) => response.json());

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const events = new Map();
let requestId = 0;

socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
    return;
  }
  const handlers = events.get(message.method) ?? [];
  handlers.splice(0).forEach((resolve) => resolve(message.params));
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  requestId += 1;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
}

function once(method) {
  return new Promise((resolve) => {
    const handlers = events.get(method) ?? [];
    handlers.push(resolve);
    events.set(method, handlers);
  });
}

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
  screenWidth: 390,
  screenHeight: 844,
});
await send("Emulation.setTouchEmulationEnabled", { enabled: true });

const loaded = once("Page.loadEventFired");
await send("Page.navigate", { url: targetUrl });
await loaded;
await send("Runtime.evaluate", {
  expression: "document.fonts.ready.then(() => new Promise(resolve => setTimeout(resolve, 1500)))",
  awaitPromise: true,
});

if (process.argv.includes("--open-menu")) {
  await send("Runtime.evaluate", { expression: "document.querySelector('[data-menu-toggle]')?.click()" });
  await new Promise((resolve) => setTimeout(resolve, 500));
}

const layout = await send("Runtime.evaluate", {
  expression: `JSON.stringify((() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        display: getComputedStyle(element).display,
      };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      header: box('.site-header'),
      menu: box('[data-menu-toggle]'),
      title: box('.hero-title'),
      actions: box('.hero-actions'),
      facts: box('.hero-facts'),
      hero: box('.hero'),
    };
  })())`,
  returnByValue: true,
});

const screenshot = await send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: false,
  fromSurface: true,
});
await writeFile(outputPath, Buffer.from(screenshot.data, "base64"));
console.log(layout.result.value);
await send("Browser.close");

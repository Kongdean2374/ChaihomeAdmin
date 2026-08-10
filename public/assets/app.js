const app = document.querySelector("[data-app]");
const loading = document.querySelector("[data-loading]");
const toast = document.querySelector("[data-toast]");
const header = document.querySelector("[data-header]");
const menu = document.querySelector("[data-menu]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const announcement = document.querySelector("[data-announcement]");
const announcementLink = document.querySelector("[data-announcement-link]");
const announcementText = document.querySelector("[data-announcement-text]");

const COPY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>`;
const ARROW_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>`;
const ICON_PATHS = Object.freeze({
  server: '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/>',
  java: '<path d="M8 3c0 2 2 2 2 4M12 2c0 2 2 2 2 4"/><path d="M5 9h12v4a6 6 0 0 1-12 0Z"/><path d="M17 10h1a3 3 0 0 1 0 6h-2"/>',
  bedrock: '<path d="m12 2 4 2.3v4.6l-4 2.3-4-2.3V4.3Z"/><path d="m5.5 12 4 2.3v4.6l-4 2.3-4-2.3v-4.6Z"/><path d="m18.5 12 4 2.3v4.6l-4 2.3-4-2.3v-4.6Z"/>',
  pickaxe: '<path d="m14 4-10 10M7 11l6 6"/><path d="M12 4h7l2 2-6 3Z"/>',
  devices: '<rect x="3" y="4" width="13" height="10" rx="2"/><path d="M8 20h3M9.5 14v6"/><rect x="17" y="8" width="4" height="9" rx="1"/>',
  version: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  profile: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2.5"/><path d="M5.5 17c.8-2.2 2-3 3.5-3s2.7.8 3.5 3M15 9h3M15 13h3"/>',
  community: '<path d="M7 7c3.2-1.2 6.8-1.2 10 0l2 8c.4 1.5-1.3 2.7-2.5 1.8L14.5 15h-5l-2 1.8C6.3 17.7 4.6 16.5 5 15Z"/><path d="M9 11h.01M15 11h.01"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  news: '<path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2Z"/><path d="M18 8h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-1M8 8h7M8 12h7M8 16h4"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L20 16.4a2.1 2.1 0 0 1-3 3l-7.7-7.7"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  shield: '<path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6Z"/><path d="m9 12 2 2 4-4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.3 2.2c-.9.4-1.1 1-1.1 1.8M12 17h.01"/>'
});

function icon(name, extraClass = "") {
  const paths = ICON_PATHS[name] || ICON_PATHS.help;
  return `<svg class="ui-icon ${extraClass}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
}


let content = null;
let toastTimer;
let revealObserver;

const htmlEscapeMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => htmlEscapeMap[character]);
const escapeAttr = escapeHtml;

function formatDate(value, withTime = false) {
  if (!value) return "未指定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date);
}

function sorted(items = [], field = "publishedAt") {
  return [...items].sort((a, b) => compareDatesDescending(a[field], b[field]));
}

function compareDatesDescending(a, b) {
  const aTime = Date.parse(String(a || ""));
  const bTime = Date.parse(String(b || ""));
  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime;
  return String(b || "").localeCompare(String(a || ""));
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

async function copyText(value, button) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }

  if (button) {
    const original = button.innerHTML;
    button.textContent = "已複製";
    setTimeout(() => { button.innerHTML = original; }, 1500);
  }
  showToast("已複製");
}

async function loadContent() {
  try {
    const response = await fetch("/api/public/content", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const payload = await response.json();
    if (!payload.ok || !payload.data) throw new Error("公開內容 API 格式不正確");
    return payload.data;
  } catch (error) {
    console.info("使用內建內容資料。", error);
    const response = await fetch("/data/default-content.json");
    if (!response.ok) throw new Error("無法載入網站內容");
    const payload = await response.json();
    if (!payload.ok || !payload.data) throw new Error("公開內容 API 格式不正確");
    return payload.data;
  }
}

function normalizePath(pathname) {
  const decoded = decodeURIComponent(pathname).replace(/\/{2,}/g, "/");
  return decoded !== "/" ? decoded.replace(/\/$/, "") : decoded;
}

function updateMeta(title, description, path = location.pathname, type = "website") {
  const fullTitle = title === "柴柴生存伺服器" ? `${title}｜熟悉的生存，多一點便利` : `${title}｜柴柴生存伺服器`;
  document.title = fullTitle;
  const url = new URL(path, location.origin).href;
  const fields = [
    ["meta[name='description']", "content", description],
    ["meta[property='og:title']", "content", fullTitle],
    ["meta[property='og:description']", "content", description],
    ["meta[property='og:url']", "content", url],
    ["meta[property='og:type']", "content", type],
    ["link[rel='canonical']", "href", url],
  ];
  fields.forEach(([selector, attribute, value]) => document.querySelector(selector)?.setAttribute(attribute, value));
}

function pageHero(eyebrow, title, description) {
  return `<section class="page-hero"><div class="shell reveal"><span class="eyebrow">${escapeHtml(eyebrow)}</span><h1 class="display-title">${escapeHtml(title)}</h1><p class="section-copy">${escapeHtml(description)}</p></div></section>`;
}

function copyField(label, value, buttonLabel = "複製") {
  return `<div class="connection-label"><span>${escapeHtml(label)}</span><div class="copy-field"><code>${escapeHtml(value)}</code><button class="copy-button" type="button" data-copy="${escapeAttr(value)}">${COPY_ICON}<span>${escapeHtml(buttonLabel)}</span></button></div></div>`;
}

function listMarkup(items) {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function homeTemplate() {
  const settings = content.settings;
  const combined = [
    ...sorted(content.news).map((item) => ({ ...item, type: "news" })),
    ...sorted(content.maintenance).map((item) => ({ ...item, type: "maintenance" })),
  ].sort((a, b) => compareDatesDescending(a.publishedAt, b.publishedAt)).slice(0, 3);

  const cards = combined.length
    ? combined.map(newsCard).join("")
    : emptyState("目前沒有新消息", "有重要資訊時，我們會在這裡告訴你。", true);

  return `
    <section class="hero">
      <div class="hero-shell shell">
        <div class="hero-copy reveal">
          <span class="eyebrow">Minecraft Survival Server</span>
          <h1 class="hero-title">${escapeHtml(settings.serverName)}<span class="soft">${escapeHtml(settings.tagline)}</span></h1>
          <p class="hero-subtitle">${escapeHtml(settings.subtitle)}。熟悉的 Minecraft 生存，多一點便利與保護。</p>
          <div class="hero-actions">
            <a class="button button-primary" href="/join" data-link>立即加入 ${ARROW_ICON}</a>
            <a class="button button-secondary" href="/server" data-link>了解伺服器</a>
          </div>
          <div class="hero-facts"><span><i></i>Java ${escapeHtml(settings.javaSupportedVersions)}</span><span><i></i>Bedrock 最新版</span><span><i></i>長期生存・自由發展</span></div>
        </div>
        <aside class="hero-dashboard reveal" aria-label="伺服器連線摘要">
          <div class="dashboard-top"><span class="dashboard-status"><i></i>Ready to join</span><span class="dashboard-version">v${escapeHtml(settings.serverVersion)}</span></div>
          <div class="dashboard-brand"><span class="dashboard-mark">${icon("server")}</span><div><small>${escapeHtml(settings.serverName)}</small><strong>${escapeHtml(settings.tagline)}</strong></div></div>
          <div class="dashboard-editions">
            <div class="dashboard-edition">${icon("java")}<div><span>Java Edition</span><strong>${escapeHtml(settings.javaAddress)}</strong></div></div>
            <div class="dashboard-edition bedrock">${icon("bedrock")}<div><span>Bedrock Edition</span><strong>${escapeHtml(settings.bedrockAddress)}</strong></div></div>
          </div>
          <div class="dashboard-bottom">${icon("shield")}<span>便利功能不改變 Minecraft 生存核心</span></div>
        </aside>
      </div>
    </section>

    <section class="home-section shell" id="survival">
      <div class="section-heading reveal"><div><span class="eyebrow">Survival, Refined</span><h2 class="section-title">熟悉的生存，<br>更順手的體驗。</h2><p class="section-copy">自己採集、建造、探索與發展，搭配適量便利功能，減少重複操作與意外損失。</p></div></div>
      <div class="survival-grid single-mode">
        <article class="survival-card single reveal"><div><div class="mode-card-top"><span class="survival-icon">${icon("pickaxe")}</span><span class="mode-number">SURVIVAL</span></div><h3>柴柴生存</h3><p>${escapeHtml(settings.pluginSurvivalIntro)}</p></div><ul class="feature-chips"><li>連鎖挖礦</li><li>連鎖砍樹</li><li>防噴保護</li><li>防爆保護</li><li>一人睡覺</li><li>HUD 資訊</li><li>延遲與 TPS</li><li>AFK 保護</li><li>地毯複製機</li><li>TNT 複製機</li></ul></article>
      </div>
    </section>

    <section class="home-section compact shell">
      <div class="platform-panel reveal"><div class="platform-copy"><span class="eyebrow">Cross Platform</span><h2 class="section-title">Java × Bedrock</h2><p class="section-copy">無論你習慣電腦上的 Java Edition，還是手機、平板與主機上的 Bedrock Edition，都能一起加入柴柴生存伺服器。</p><a class="text-link" href="/join" data-link>查看連線方式 <span aria-hidden="true">→</span></a></div><div class="platform-pair"><div class="platform-card"><span class="edition-monogram">${icon("java")}</span><strong>Java Edition</strong><span>${escapeHtml(settings.javaRecommendedVersions)} 建議</span></div><div class="platform-card"><span class="edition-monogram">${icon("bedrock")}</span><strong>Bedrock Edition</strong><span>${escapeHtml(settings.bedrockRecommendedVersion)}建議</span></div></div></div>
    </section>

    <section class="home-section shell">
      <div class="section-heading reveal"><div><span class="eyebrow">Latest Updates</span><h2 class="section-title">最近發生的事</h2></div><a class="text-link" href="/news" data-link>查看所有消息 <span aria-hidden="true">→</span></a></div>
      <div class="latest-grid">${cards}</div>
    </section>`;
}

function newsCard(item) {
  const isMaintenance = item.type === "maintenance";
  const href = `/${isMaintenance ? "maintenance" : "news"}/${encodeURIComponent(item.slug)}`;
  return `<a class="news-card reveal" href="${href}" data-link><div><div class="article-meta"><span class="tag ${isMaintenance ? "tag-maintenance" : ""}">${icon(isMaintenance ? "wrench" : "news", "tag-icon")}${escapeHtml(isMaintenance ? "維護" : item.category || "最新消息")}</span><time class="date" datetime="${escapeAttr(item.publishedAt)}">${formatDate(item.publishedAt)}</time></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p></div><span class="card-foot">閱讀完整內容 <span aria-hidden="true">→</span></span></a>`;
}

function serverTemplate() {
  const settings = content.settings;
  return `${pageHero("About the Server", "Minecraft 生存，加入適量便利。", "這裡不是 RPG、模組包或高度魔改伺服器。從採集、建造到探索與發展，核心始終是熟悉的 Minecraft 生存。")}
    <section class="page-content shell">
      <div class="server-overview-grid">
        <article class="overview-card reveal"><div class="overview-top"><span class="overview-icon">${icon("pickaxe")}</span><span>Survival</span></div><strong>Minecraft<br>核心生存</strong></article>
        <article class="overview-card reveal"><div class="overview-top"><span class="overview-icon">${icon("devices")}</span><span>Cross-play</span></div><strong>Java × Bedrock<br>跨平台加入</strong></article>
        <article class="overview-card reveal"><div class="overview-top"><span class="overview-icon">${icon("shield")}</span><span>Protection</span></div><strong>遊玩保護<br>降低意外損失</strong></article>
        <article class="overview-card reveal"><div class="overview-top"><span class="overview-icon">${icon("version")}</span><span>Version</span></div><strong>目前版本<br>${escapeHtml(settings.serverVersion)}</strong></article>
      </div>

      <div class="intro-grid single-mode">
        <article class="intro-card reveal"><span class="tag">${icon("pickaxe", "tag-icon")}Minecraft 生存 + 適量便利</span><h2>柴柴生存</h2><p>${escapeHtml(settings.pluginSurvivalIntro)} 你仍然需要自己取得資源、建立基地、探索世界並一步步發展；插件只負責讓操作更順手、遊玩成果更有保障。</p><ul class="feature-list">${listMarkup(["連鎖挖礦與連鎖砍樹，減少大量採集時的重複操作", "防噴保護與防爆保護，降低死亡與爆炸造成的意外損失", "一位玩家睡覺即可跳過夜晚，適合多人伺服器節奏", "支援地毯複製機與 TNT 複製機", "HUD、延遲、TPS 與伺服器資訊顯示", "AFK 保護與伺服器必要管理功能", "加入不破壞主要生存體驗的趣味插件", "Java 與 Bedrock 玩家可以一起遊玩"])}</ul></article>
      </div>

      <section class="detail-section" aria-labelledby="principles-title">
        <div class="section-heading reveal"><div><span class="eyebrow">Core Experience</span><h2 class="section-title" id="principles-title">生存核心不變</h2><p class="section-copy">便利功能改善的是操作與保護，不會把伺服器變成 RPG、模組服或跳過發展過程的玩法。</p></div></div>
        <div class="principle-grid">
          <article class="principle-card reveal"><span>01</span><h3>自己發展</h3><p>資源、裝備、建築與探索成果仍需由玩家親自累積，保留完整的生存成就感。</p></article>
          <article class="principle-card reveal"><span>02</span><h3>適量便利</h3><p>連鎖採集、一人睡覺與資訊顯示讓日常操作更順暢，不取代生存本身。</p></article>
          <article class="principle-card reveal"><span>03</span><h3>安心遊玩</h3><p>防噴、防爆與 AFK 保護減少非預期損失，同時保留伺服器穩定所需的管理功能。</p></article>
        </div>
      </section>

      <div class="independent-note reveal"><span class="note-mark">${icon("shield")}</span><div><strong>專注長期生存體驗</strong><p>這是一個適合持續採集、建造與發展的生存環境。你可以依照自己的節奏遊玩，享受多人世界中的合作、探索與創造。</p></div></div>

      <section class="detail-section" aria-labelledby="crossplay-title">
        <div class="section-heading reveal"><div><span class="eyebrow">Cross Platform</span><h2 class="section-title" id="crossplay-title">Java 與 Bedrock 都能加入</h2><p class="section-copy">電腦、手機、平板與支援的遊戲主機玩家，都能使用對應版本的連線資訊加入伺服器。</p></div></div>
        <div class="edition-strip">
          <article class="edition-detail reveal"><div><span class="edition-detail-icon">${icon("java")}</span><span class="tag">Java Edition</span><h3>Java 版</h3><p>支援 ${escapeHtml(settings.javaSupportedVersions)}，建議使用 ${escapeHtml(settings.javaRecommendedVersions)}。</p></div><div class="edition-address"><code>${escapeHtml(settings.javaAddress)}</code><button class="copy-button" type="button" data-copy="${escapeAttr(settings.javaAddress)}">${COPY_ICON}<span>複製 IP</span></button></div></article>
          <article class="edition-detail bedrock reveal"><div><span class="edition-detail-icon">${icon("bedrock")}</span><span class="tag">Bedrock Edition</span><h3>基岩版</h3><p>建議使用${escapeHtml(settings.bedrockRecommendedVersion)}，連線 Port 為 ${escapeHtml(settings.bedrockPort)}。</p></div><div class="edition-address"><code>${escapeHtml(settings.bedrockAddress)}</code><button class="copy-button" type="button" data-copy="${escapeAttr(settings.bedrockAddress)}">${COPY_ICON}<span>複製 IP</span></button></div></article>
        </div>
      </section>

      <div class="independent-note contact-note reveal"><span class="note-mark">${icon("help")}</span><div><strong>還有問題或需要聯絡管理者？</strong><p>如果你遇到連線、版本或玩法問題，可以到聯絡頁查看建議聯絡方式與 Discord 入口。</p><a class="button button-secondary" href="/contact" data-link>查看聯絡方式 ${ARROW_ICON}</a></div></div>
    </section>`;
}

function newsListTemplate() {
  const items = sorted(content.news);
  const list = items.length ? items.map((item) => listCard(item, "news")).join("") : emptyState("還沒有最新消息", "新消息發布後會出現在這裡。");
  return `${pageHero("News", "最新消息", "伺服器消息、玩法資訊與重要通知都會永久保留在這裡。")}
    <section class="page-content shell"><div class="content-list">${list}</div></section>`;
}

function maintenanceListTemplate() {
  const items = sorted(content.maintenance);
  const list = items.length ? items.map((item) => listCard(item, "maintenance")).join("") : emptyState("目前沒有維護公告", "預定維護與完成結果會集中顯示在這裡。");
  return `${pageHero("Maintenance", "維護公告", "維護時間、原因、影響範圍與完成結果，都會在這裡清楚說明。")}
    <section class="page-content shell"><div class="content-list">${list}</div></section>`;
}

function listCard(item, type) {
  const maintenance = type === "maintenance";
  return `<a class="list-card reveal" href="/${type}/${encodeURIComponent(item.slug)}" data-link><time class="date" datetime="${escapeAttr(item.publishedAt)}">${formatDate(item.publishedAt, maintenance)}</time><div class="list-card-main"><span class="tag ${maintenance ? "tag-maintenance" : ""}">${icon(maintenance ? "wrench" : "news", "tag-icon")}${escapeHtml(maintenance ? "維護" : item.category || "最新消息")}</span><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.summary)}</p></div><span class="list-arrow" aria-hidden="true">→</span></a>`;
}

function emptyState(title, description, spansGrid = false) {
  return `<div class="empty-state reveal${spansGrid ? " span-grid" : ""}"><span class="empty-state-mark">${icon("news")}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></div>`;
}

function articleTemplate(item, type) {
  const maintenance = type === "maintenance";
  const listLabel = maintenance ? "維護公告" : "最新消息";
  const factMarkup = maintenance ? maintenanceFacts(item) : "";
  return `<article class="article-shell reveal">
    <a class="back-link" href="/${type}" data-link><span aria-hidden="true">←</span> 返回${listLabel}</a>
    <header class="article-head"><div class="article-meta"><span class="tag ${maintenance ? "tag-maintenance" : ""}">${icon(maintenance ? "wrench" : "news", "tag-icon")}${escapeHtml(maintenance ? "維護" : item.category || "最新消息")}</span><time class="date" datetime="${escapeAttr(item.publishedAt)}">發布於 ${formatDate(item.publishedAt, maintenance)}</time></div><h1 class="article-title">${escapeHtml(item.title)}</h1><p class="article-summary">${escapeHtml(item.summary)}</p>${factMarkup}</header>
    <div class="article-body">${renderRichText(item.content || item.reason || "")}</div>${maintenance ? maintenanceDetails(item) : ""}
    <footer class="share-row"><a class="button button-secondary button-small" href="/${type}" data-link>← 返回${listLabel}</a><button class="button button-secondary button-small" type="button" data-share>分享這篇文章</button></footer>
  </article>`;
}

function maintenanceFacts(item) {
  const facts = [
    ["預計開始", item.startAt ? formatDate(item.startAt, true) : "未指定"],
    ["預計結束", item.endAt ? formatDate(item.endAt, true) : "未指定"],
    ["玩家影響", item.impact || "請以文章說明為準"],
    ["是否需重新登入", item.requiresRelogin === true ? "需要" : item.requiresRelogin === false ? "不需要" : "請以文章說明為準"],
  ];
  return `<div class="maintenance-facts">${facts.map(([label, value]) => `<div class="fact-box"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>`;
}

function maintenanceDetails(item) {
  const sections = [];
  if (item.reason) sections.push(`<section><h2>維護原因</h2>${renderRichText(item.reason)}</section>`);
  if (Array.isArray(item.items) && item.items.length) sections.push(`<section><h2>維護項目</h2><ul>${listMarkup(item.items)}</ul></section>`);
  if (item.impact) sections.push(`<section><h2>玩家影響</h2>${renderRichText(item.impact)}</section>`);
  if (item.result) sections.push(`<section class="maintenance-result"><h2>維護結果</h2>${renderRichText(item.result)}</section>`);
  return sections.length ? `<div class="article-body maintenance-details">${sections.join("")}</div>` : "";
}

function renderRichText(value) {
  const blocks = String(value).replace(/\r/g, "").trim().split(/\n{2,}/).filter(Boolean);
  if (!blocks.length) return "<p>目前沒有更多內容。</p>";
  return blocks.map((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length && lines.every((line) => /^[•*\-]\s*/.test(line))) {
      return `<ul>${lines.map((line) => `<li>${escapeHtml(line.replace(/^[•*\-]\s*/, ""))}</li>`).join("")}</ul>`;
    }
    return `<p>${lines.map(escapeHtml).join("<br>")}</p>`;
  }).join("");
}

function changelogTemplate() {
  const items = sorted(content.changelog, "date");
  const timeline = items.length ? `<div class="timeline">${items.map(changelogEntry).join("")}</div>` : emptyState("還沒有更新紀錄", "新的伺服器變更會持續保留在這裡。");
  return `${pageHero("Changelog", "更新紀錄", "從新功能到問題修復，每一次調整都有跡可循。")}
    <section class="page-content shell">${timeline}</section>`;
}

function changelogEntry(item) {
  const groups = [
    ["新增", "added", "added"], ["改善", "improved", "improved"], ["調整", "adjusted", "adjusted"],
    ["修復", "fixed", "fixed"], ["移除", "removed", "removed"], ["技術性變更", "technical", "technical"],
  ];
  const markup = groups.filter(([, key]) => Array.isArray(item[key]) && item[key].length).map(([label, key, className]) => `<section class="change-group ${className}"><h3>${label}</h3><ul>${listMarkup(item[key])}</ul></section>`).join("");
  return `<article class="timeline-entry reveal"><div class="timeline-date"><strong>${formatDate(`${item.date}T00:00:00+08:00`)}</strong>${item.version ? `<span class="tag">v${escapeHtml(item.version)}</span>` : ""}</div><div class="timeline-card"><h2>${escapeHtml(item.title || "伺服器更新")}</h2>${markup || "<p class=\"section-copy\">本次更新沒有分類項目。</p>"}</div></article>`;
}

function joinTemplate() {
  const settings = content.settings;
  return `${pageHero("Join the Server", "選擇你的版本，開始生存。", settings.joinIntro)}
    <section class="page-content shell">
      <div class="join-selector">
        <article class="join-card reveal"><div class="join-card-heading"><span class="join-edition-icon">${icon("java")}</span><div><span class="tag">Java Edition</span><h2>Java 版</h2><p class="edition-note">Minecraft 電腦版玩家</p></div></div><div class="connection-fields">${copyField("伺服器位址", settings.javaAddress, "複製 IP")}<div class="version-grid"><div class="version-item"><span>支援版本</span><strong>${escapeHtml(settings.javaSupportedVersions)}</strong></div><div class="version-item"><span>建議版本</span><strong>${escapeHtml(settings.javaRecommendedVersions)}</strong></div></div></div></article>
        <article class="join-card bedrock reveal"><div class="join-card-heading"><span class="join-edition-icon">${icon("bedrock")}</span><div><span class="tag">Bedrock Edition</span><h2>基岩版</h2><p class="edition-note">手機、平板、Windows 與遊戲主機玩家</p></div></div><div class="connection-fields">${copyField("伺服器位址", settings.bedrockAddress, "複製 IP")}${copyField("Port", settings.bedrockPort, "複製 Port")}<div class="version-grid"><div class="version-item"><span>建議版本</span><strong>${escapeHtml(settings.bedrockRecommendedVersion)}</strong></div><div class="version-item"><span>連接埠</span><strong>${escapeHtml(settings.bedrockPort)}</strong></div></div></div></article>
      </div>
      <div class="section-heading spaced-heading reveal"><div><span class="eyebrow">Three Steps</span><h2 class="section-title">很快就能加入</h2></div></div>
      <div class="join-steps"><article class="step-card reveal"><span class="step-number">01</span><h3>新增伺服器</h3><p>在 Minecraft 多人遊戲頁面選擇新增伺服器。</p></article><article class="step-card reveal"><span class="step-number">02</span><h3>貼上連線資訊</h3><p>複製上方對應版本的 IP；Bedrock 版也要填入 Port。</p></article><article class="step-card reveal"><span class="step-number">03</span><h3>開始生存</h3><p>完成連線後即可開始採集、建造、探索，依照自己的節奏發展。</p></article></div>
    </section>`;
}

function contactTemplate() {
  return `${pageHero("Contact", "需要幫忙？從這裡找到我。", "伺服器問題、加入協助或其他聯繫，建議先使用個人自介頁中的聯絡方式；也可以加入 Discord 與玩家交流。")}
    <section class="page-content shell">
      <div class="contact-grid">
        <article class="contact-card contact-primary reveal"><div><span class="tag">建議聯絡方式</span><span class="contact-icon">${icon("profile")}</span><h2>個人自介與聯絡入口</h2><p>我的自我介紹頁整理了目前較常使用的聯絡方式。若希望較快收到回覆，建議優先從這裡找到我。</p></div><a class="button button-primary" href="https://me.chaihome.cc" target="_blank" rel="noreferrer">前往 me.chaihome.cc ${ARROW_ICON}</a></article>
        <article class="contact-card reveal"><div><span class="tag">Community</span><span class="contact-icon">${icon("community")}</span><h2>Discord 伺服器</h2><p>加入 Discord 與玩家交流，也可留意社群內的伺服器消息與相關討論。</p></div><a class="button button-secondary" href="https://discord.gg/prW39Wa58n" target="_blank" rel="noreferrer">加入 Discord ${ARROW_ICON}</a></article>
        <article class="contact-card reveal"><div><span class="tag">Email</span><span class="contact-icon">${icon("mail")}</span><h2>郵件聯繫</h2><p><a class="inline-contact-link" href="mailto:kongdean430@gmail.com">kongdean430@gmail.com</a></p><p class="contact-warning">郵件不常查看，回覆時間可能較久；若事情需要較快處理，請優先使用自介頁中的聯絡方式。</p></div><a class="button button-secondary" href="mailto:kongdean430@gmail.com?subject=%E6%9F%B4%E6%9F%B4%E7%94%9F%E5%AD%98%E4%BC%BA%E6%9C%8D%E5%99%A8%E8%81%AF%E7%B5%A1">撰寫郵件</a></article>
      </div>

      <div class="contact-guide reveal">
        <div><span class="eyebrow">Before Contacting</span><h2>回報問題時，附上這些資訊會更好處理</h2></div>
        <ul class="contact-checklist"><li>你使用 Java 還是 Bedrock Edition</li><li>Minecraft 版本與發生問題的時間</li><li>當時所在區域與正在進行的操作</li><li>畫面上的錯誤訊息，必要時附上截圖</li></ul>
      </div>
    </section>`;
}
function notFoundTemplate() {
  return `<section class="error-page"><span class="error-code">404</span><h1>這裡沒有生成任何方塊</h1><p>你前往的頁面不存在，可能已被移動或網址輸入錯誤。</p><a class="button button-primary" href="/" data-link>回到首頁</a></section>`;
}

function renderRoute({ focus = false } = {}) {
  const path = normalizePath(location.pathname);
  const [root, slug] = path.split("/").filter(Boolean);
  let template;
  let title;
  let description;
  let articleType = "website";

  if (path === "/") {
    template = homeTemplate(); title = "柴柴生存伺服器"; description = "Java × Bedrock 跨平台遊玩，保留 Minecraft 生存核心並加入適量便利功能。";
  } else if (path === "/server") {
    template = serverTemplate(); title = "伺服器介紹"; description = "了解柴柴生存伺服器的便利功能、遊玩保護、跨平台支援與完整生存體驗。";
  } else if (path === "/news") {
    template = newsListTemplate(); title = "最新消息"; description = "查看柴柴生存伺服器的最新消息與重要通知。";
  } else if (root === "news" && slug) {
    const item = content.news.find((entry) => entry.slug === slug);
    if (item) { template = articleTemplate(item, "news"); title = item.title; description = item.summary; articleType = "article"; }
  } else if (path === "/maintenance") {
    template = maintenanceListTemplate(); title = "維護公告"; description = "查看柴柴生存伺服器的預定維護、影響範圍與完成結果。";
  } else if (root === "maintenance" && slug) {
    const item = content.maintenance.find((entry) => entry.slug === slug);
    if (item) { template = articleTemplate(item, "maintenance"); title = item.title; description = item.summary; articleType = "article"; }
  } else if (path === "/changelog") {
    template = changelogTemplate(); title = "更新紀錄"; description = "永久保存柴柴生存伺服器的新功能、改善、調整與修復紀錄。";
  } else if (path === "/join") {
    template = joinTemplate(); title = "加入遊戲"; description = `Java 伺服器 ${content.settings.javaAddress}；Bedrock 伺服器 ${content.settings.bedrockAddress}:${content.settings.bedrockPort}。`;
  } else if (path === "/contact") {
    template = contactTemplate(); title = "聯絡我們"; description = "查看柴柴生存伺服器的建議聯絡方式、Discord 伺服器與電子郵件。";
  }

  if (!template) { template = notFoundTemplate(); title = "找不到頁面"; description = "你前往的頁面不存在。"; }
  app.innerHTML = template;
  updateMeta(title, description, path, articleType);
  updateNavigation(path);
  activateReveal();
  closeMenu();
  if (focus) {
    globalThis.scrollTo({ top: 0, behavior: "instant" });
    document.querySelector("#main-content")?.focus({ preventScroll: true });
  }
}

function updateNavigation(path) {
  document.querySelectorAll(".nav-links a").forEach((link) => {
    const href = link.getAttribute("href");
    const isCurrent = href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
    if (isCurrent) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
}

function activateReveal() {
  revealObserver?.disconnect();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach((element) => element.classList.add("is-visible"));
    return;
  }
  revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
    });
  }, { threshold: .08, rootMargin: "0px 0px -35px" });
  document.querySelectorAll(".reveal").forEach((element) => {
    if (element.getBoundingClientRect().top < globalThis.innerHeight * .92) element.classList.add("is-visible");
    else revealObserver.observe(element);
  });
  setTimeout(() => document.querySelectorAll(".reveal:not(.is-visible)").forEach((element) => element.classList.add("is-visible")), 1200);
}

function updateAnnouncement() {
  const ticker = content.ticker || {};
  if (!ticker.enabled || !ticker.summary) { announcement.hidden = true; return; }
  const type = ticker.type === "maintenance" ? "maintenance" : "news";
  announcementText.textContent = ticker.summary;
  announcementLink.href = ticker.slug ? `/${type}/${encodeURIComponent(ticker.slug)}` : `/${type}`;
  announcement.hidden = false;
  requestAnimationFrame(() => {
    const viewport = announcement.querySelector(".announcement-viewport");
    announcement.classList.toggle("is-overflowing", announcementText.scrollWidth > viewport.clientWidth + 12);
  });
}

function closeMenu() {
  menu.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "開啟選單");
}

document.addEventListener("click", async (event) => {
  const copyButton = event.target.closest("[data-copy]");
  if (copyButton) { await copyText(copyButton.dataset.copy, copyButton); return; }

  const shareButton = event.target.closest("[data-share]");
  if (shareButton) {
    if (navigator.share) {
      try { await navigator.share({ title: document.title, url: location.href }); } catch { /* 使用者取消分享 */ }
    } else await copyText(location.href, shareButton);
    return;
  }

  const link = event.target.closest("a[data-link]");
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin) return;
  event.preventDefault();
  history.pushState({}, "", url.pathname + url.search + url.hash);
  renderRoute({ focus: true });
});

menuToggle.addEventListener("click", () => {
  const expanded = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!expanded));
  menuToggle.setAttribute("aria-label", expanded ? "開啟選單" : "關閉選單");
  menu.classList.toggle("is-open", !expanded);
});

addEventListener("popstate", () => renderRoute({ focus: true }));
addEventListener("scroll", () => header.classList.toggle("is-scrolled", scrollY > 8), { passive: true });
addEventListener("resize", () => updateAnnouncement(), { passive: true });
document.querySelector("[data-year]").textContent = String(new Date().getFullYear());

try {
  content = await loadContent();
  content.news ||= [];
  content.maintenance ||= [];
  content.changelog ||= [];
  updateAnnouncement();
  renderRoute();
  app.hidden = false;
  loading.hidden = true;
} catch (error) {
  console.error(error);
  app.innerHTML = `<section class="error-page"><span class="error-code">!</span><h1>內容暫時無法載入</h1><p>請稍後重新整理頁面。如果問題持續發生，可能正在進行網站維護。</p><button class="button button-primary" type="button" data-reload>重新整理</button></section>`;
  app.hidden = false;
  loading.hidden = true;
}

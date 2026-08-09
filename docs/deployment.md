# Cloudflare 部署指南

本專案使用 Cloudflare Worker + Static Assets + KV。正式網域只會使用 `play.chaihome.cc`，不會建立或改動 `chaihome.cc` 根網域的網站路由，因此 Java Edition 仍可繼續使用 `chaihome.cc` 連線。

## 1. 準備環境

安裝 Node.js 20 以上後，在專案目錄執行：

```powershell
cd C:\chaihome-website
npm install
npx wrangler login
npx wrangler whoami
```

`wrangler login` 會開啟瀏覽器要求登入 Cloudflare。帳號必須能管理 `chaihome.cc` Zone、Workers 與 KV。

## 2. 建立 KV

```powershell
npx wrangler kv namespace create CONTENT
```

成功後會顯示一個 namespace ID。開啟 `wrangler.toml`，把：

```toml
id = "REPLACE_WITH_KV_NAMESPACE_ID"
```

替換為實際 ID。`binding = "CONTENT"` 不要改名，因為 Worker 程式使用 `env.CONTENT`。

KV 一開始可以是空的。網站會先使用 `public/data/default-content.json`；第一次透過管理 API 寫入時，完整內容會自動寫進 KV。

## 3. 設定管理 Token

請在密碼管理器產生至少 32 個隨機字元，建議 48～64 個。不要在聊天室、命令參數或 Git 檔案中留下 Token。

執行：

```powershell
npx wrangler secret put ADMIN_TOKEN
```

Wrangler 顯示輸入提示後再貼上 Token。這個值會存入 Cloudflare Worker Secret，不會寫進 Repository。

## 4. 測試與部署

```powershell
npm test
npx wrangler deploy
```

`wrangler.toml` 已設定：

```toml
[[routes]]
pattern = "play.chaihome.cc"
custom_domain = true
```

部署時 Cloudflare 會替 Worker 建立 `play.chaihome.cc` Custom Domain、DNS 記錄與憑證。這項設定只影響 `play.chaihome.cc`。

如果 Cloudflare 提示 `play.chaihome.cc` 已有 A、AAAA 或 CNAME：

1. Cloudflare Dashboard → `chaihome.cc` → DNS → Records。
2. 確認該筆記錄的名稱恰好是 `play`，不要刪除根網域 `@`、`chaihome.cc` 或 Minecraft 使用中的其他記錄。
3. 移除舊的 `play` 記錄。
4. 再執行 `npx wrangler deploy`。

也可以在 Dashboard 進入 Workers & Pages → `chaihome-website` → Settings → Domains & Routes → Add → Custom Domain，輸入 `play.chaihome.cc`。

## 5. 部署後驗證

依序開啟：

- `https://play.chaihome.cc/`
- `https://play.chaihome.cc/news`
- `https://play.chaihome.cc/api/public/content`
- `https://play.chaihome.cc/sitemap.xml`

驗證管理 API（`YOUR_TOKEN` 只在自己的終端機替換）：

```powershell
$headers = @{ Authorization = "Bearer YOUR_TOKEN"; Accept = "application/json" }
Invoke-RestMethod -Uri "https://play.chaihome.cc/api/admin/settings" -Headers $headers
```

## 6. 日後更新

- 更新公告、維護、Changelog、版本、IP、Port、介紹或跑馬燈：使用 iPhone 捷徑或管理 API，不需部署。
- 修改 HTML、CSS、JavaScript、Worker 驗證或 API 功能：重新執行 `npx wrangler deploy`。
- 新增動態圖片：屆時再建立 R2；目前不用付出額外服務與管理成本。

## 回復與備份

管理快照：

```powershell
$headers = @{ Authorization = "Bearer YOUR_TOKEN"; Accept = "application/json" }
Invoke-RestMethod -Uri "https://play.chaihome.cc/api/admin/snapshot" -Headers $headers | ConvertTo-Json -Depth 20
```

建議每次大量修改前先保存快照。一般文章不會因發布新文章而被覆蓋；只有持有 Token 並明確呼叫 DELETE 才能刪除。

## 官方參考

- [Cloudflare Workers Static Assets SPA](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- [Cloudflare Workers KV](https://developers.cloudflare.com/kv/get-started/)
- [Cloudflare Worker Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)


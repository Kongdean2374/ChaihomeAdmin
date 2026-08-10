# 柴柴生存伺服器官方網站

柴柴生存伺服器的官方介紹、最新消息、維護公告與更新紀錄網站。

## iPhone 管理 App

`ios/ChaihomeAdmin` 是專用 SwiftUI 管理 App。它以功能選單切換動態表單，可發布最新消息、維護公告與更新紀錄，修改伺服器設定、管理跑馬燈，以及從即時清單永久刪除既有內容。

GitHub Actions 會在 iOS App 或工作流程變更時自動產生 `ChaihomeAdmin-unsigned.ipa`。下載與自行簽名方式請參閱 [`docs/ios-app-github-actions.md`](docs/ios-app-github-actions.md)。管理 Token 只會由使用者輸入並保存在 iPhone Keychain，不包含在原始碼或 IPA 內。

## 架構

```text
play.chaihome.cc
        │
        ▼
Cloudflare Worker
  ├─ Static Assets：HTML / CSS / JavaScript
  ├─ 公開 API：讀取網站內容
  ├─ 管理 API：Bearer Token 驗證後寫入
  └─ SEO：依文章路徑輸出對應 Metadata
        │
        ▼
Cloudflare KV（CONTENT binding）
```

本專案採 Cloudflare Workers Static Assets，而不是另外拆成 Pages + API Worker。這樣 `play.chaihome.cc` 只有一個部署與同源 API，能避免跨網域設定，也能讓 Worker 在文章網址回傳正確的 SEO Metadata。一般內容全部放在 KV，更新公告、版本與 IP 不會重新部署網站程式碼。

目前不使用 R2；日後真的需要動態圖片管理時再加入。

## 主要頁面

- `/`：首頁、最新公告跑馬燈、生存特色、跨平台資訊與最近消息
- `/server`：柴柴生存玩法、便利功能與跨平台支援介紹
- `/news`、`/news/:slug`：最新消息與文章
- `/maintenance`、`/maintenance/:slug`：維護公告與文章
- `/changelog`：更新紀錄 Timeline
- `/join`：Java / Bedrock 連線方式與一鍵複製

## 開發

需要 Node.js 20 以上與 Deno（測試用）。

```bash
npm install
npm run dev
npm test
```

沒有 Worker 的純靜態預覽也能運作；前端會在公開 API 不存在時讀取 `public/data/default-content.json`。

## 文件

- [部署 Cloudflare](docs/deployment.md)
- [管理 API](docs/api.md)
- [iPhone 捷徑完整設定](docs/iphone-shortcuts.md)

## 安全注意事項

- 管理 Token 只能透過 `wrangler secret put ADMIN_TOKEN` 存入 Cloudflare Secret。
- 不要把 Token 放進 `.dev.vars` 以外的版控檔案，也不要把含 Token 的捷徑公開分享。
- 前端會將所有管理內容當純文字輸出，不執行文章內的 HTML。
- 管理寫入具備 Content-Type、輸入長度、日期、Port、JSON 大小與基本頻率檢查。


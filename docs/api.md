# 管理 API

Base URL：`https://play.chaihome.cc`

所有管理請求都必須包含：

```http
Authorization: Bearer YOUR_ADMIN_TOKEN
Accept: application/json
```

POST、PUT、PATCH 另外必須包含：

```http
Content-Type: application/json
```

成功格式：

```json
{ "ok": true, "data": {} }
```

錯誤格式：

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "輸入資料驗證失敗。",
    "fields": { "title": "title 長度必須介於 2 到 120 個字元。" }
  }
}
```

## 公開讀取

- `GET /api/public/content`：網站完整公開內容
- `GET /api/public/settings`
- `GET /api/public/ticker`
- `GET /api/public/news`
- `GET /api/public/news/:slug`
- `GET /api/public/maintenance`
- `GET /api/public/maintenance/:slug`
- `GET /api/public/changelog`

## 管理讀取

- `GET /api/admin/snapshot`：完整備份
- `GET /api/admin/settings`
- `GET /api/admin/ticker`
- `GET /api/admin/news`
- `GET /api/admin/news/:id-or-slug`
- `GET /api/admin/maintenance`
- `GET /api/admin/changelog`

## 發布最新消息

`POST /api/admin/news`

```json
{
  "title": "插件生存功能更新",
  "summary": "連鎖挖礦與 HUD 完成調整。",
  "category": "功能更新",
  "content": "本次更新內容如下：\n\n• 改善 HUD 顯示\n• 調整連鎖挖礦判定",
  "publishedAt": "2026-08-09T20:30:00+08:00",
  "setAsTicker": true,
  "tickerSummary": "插件生存功能更新已完成"
}
```

`slug` 可省略，系統會從標題產生不重複網址。`publishedAt` 可省略，系統會使用收到請求的時間。

更新：`PATCH /api/admin/news/:id-or-slug`。刪除：`DELETE /api/admin/news/:id-or-slug`。

## 發布維護公告

`POST /api/admin/maintenance`

```json
{
  "title": "伺服器升級維護",
  "summary": "為提升穩定性，伺服器將暫時關閉維護。",
  "content": "維護原因與內容：\n\n• Paper 核心更新\n• 插件更新\n• Java / Bedrock 相容性調整",
  "startAt": "2026-08-09T22:00:00+08:00",
  "endAt": "2026-08-09T23:00:00+08:00",
  "reason": "提升伺服器穩定性並完成版本升級",
  "items": ["Paper 核心更新", "插件更新", "Bug 修復"],
  "impact": "維護期間無法登入；在線玩家會先收到關服通知。",
  "requiresRelogin": true,
  "result": "",
  "setAsTicker": true,
  "tickerSummary": "8/9 22:00 伺服器將暫時關閉進行升級維護"
}
```

更新維護完成結果：

`PATCH /api/admin/maintenance/:id-or-slug`

```json
{
  "result": "維護已完成，所有伺服器已重新開放。",
  "content": "維護已完成。\n\n• Paper 核心更新完成\n• Bedrock 相容性調整完成"
}
```

## 新增更新紀錄

`POST /api/admin/changelog`

```json
{
  "date": "2026-08-09",
  "version": "26.2",
  "title": "伺服器穩定性更新",
  "added": ["新增伺服器資訊顯示"],
  "improved": ["提升 Bedrock 相容性"],
  "adjusted": [],
  "fixed": ["修復 HUD 偶爾顯示異常"],
  "removed": [],
  "technical": ["更新 Paper 核心"]
}
```

陣列欄位也接受換行分隔字串，方便 iPhone 捷徑直接送出多行文字。

## 修改設定

`PATCH /api/admin/settings`

只送要修改的欄位：

```json
{
  "serverVersion": "26.3",
  "javaRecommendedVersions": "1.21.11 ～ 26.3"
}
```

可修改欄位：`serverName`、`brandName`、`tagline`、`subtitle`、`javaAddress`、`bedrockAddress`、`bedrockPort`、`serverVersion`、`javaSupportedVersions`、`javaRecommendedVersions`、`bedrockRecommendedVersion`、`pluginSurvivalIntro`、`joinIntro`。

## 跑馬燈

將現有文章設為跑馬燈：`PUT /api/admin/ticker`

```json
{
  "enabled": true,
  "type": "maintenance",
  "slug": "伺服器升級維護",
  "summary": "8/9 22:00 伺服器將暫時關閉進行升級維護"
}
```

`slug` 也接受文章 `id`。停用跑馬燈可呼叫 `DELETE /api/admin/ticker`，或 PUT：

```json
{ "enabled": false }
```

## 限制

- 單次 JSON Body 最多 100 KB。
- 文章內容最多 50,000 字元。
- 同一來源每分鐘最多 24 次管理寫入（Worker isolate 內的基本保護）。
- CORS 只允許正式網站與本機開發來源；iPhone 捷徑不會送出瀏覽器 Origin，因此不受 CORS 影響，但仍必須有 Token。


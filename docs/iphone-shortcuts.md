# iPhone 捷徑：柴柴官網管理

這份文件使用 iOS「捷徑」App 內建動作，不需要第三方 App。建立完成後，可以發布、查看與刪除最新消息、維護公告、更新紀錄，修改連線設定與控制跑馬燈。

> 管理 Token 等同網站內容管理密碼。不要截圖、傳訊息或公開分享含 Token 的捷徑。若 Token 外洩，立即重新執行 `wrangler secret put ADMIN_TOKEN` 換新值。

## 共用設定

先新增一個捷徑，名稱設為「柴柴官網管理」。在最上方依序加入：

1. 「文字」動作，內容填 `https://play.chaihome.cc`。
2. 點這個「文字」動作的輸出變數，重新命名為 `API_BASE`。
3. 再加入一個「文字」動作，內容貼上部署時設定的 `ADMIN_TOKEN`。
4. 將第二個輸出變數重新命名為 `ADMIN_TOKEN`。
5. 加入「從選單中選擇」動作，提示文字填「柴柴官網管理」。
6. 建立選項：發布最新消息、發布維護公告、新增更新紀錄、修改伺服器設定、設定跑馬燈、取消跑馬燈、查看目前設定、刪除既有內容。

以下每段動作都放進對應的選單分支。

## 共用 HTTP 設定

每次看到「取得 URL 內容」時，點「顯示更多」，照以下規則設定：

- Method：依各流程指定的 POST、PATCH、PUT、DELETE 或 GET。
- Headers：
  - `Authorization` → `Bearer ` 後面插入 `ADMIN_TOKEN` 魔術變數。Bearer 與 Token 中間一定要有一個空格。
  - `Accept` → `application/json`
  - POST、PATCH、PUT 再加 `Content-Type` → `application/json`
- Request Body：POST、PATCH、PUT 選 `JSON`。

### 共用成功／錯誤處理

每個「取得 URL 內容」後都加：

1. 「從輸入取得字典」。
2. 「取得字典值」，Key 填 `ok`。
3. 「如果」取得的值「是」`1`（捷徑常把 JSON true 顯示成 1）：顯示通知「發布成功」或對應成功文字。
4. 「否則」：
   - 對原始回傳字典取得 `error`。
   - 再從 `error` 取得 `message`。
   - 顯示提示「失敗：」加上 message。
5. 結束「如果」。

若想看特定欄位驗證錯誤，可從 `error` 再取得 `fields`，並用「快速查看」顯示。

## 流程一：發布最新消息

在「發布最新消息」分支加入：

1. 「詢問輸入」，提示「消息標題」，輸入類型選文字；把結果改名 `標題`。
2. 「詢問輸入」，提示「簡短摘要（首頁列表用）」，輸入類型選文字；改名 `摘要`。
3. 「從選單中選擇」，提示「分類」，選項建立：`伺服器公告`、`功能更新`、`活動消息`、`站務公告`；輸出改名 `分類`。
4. 「詢問輸入」，提示「完整內容（可換行；項目可用 • 開頭）」，輸入類型選文字，開啟「允許多行」；改名 `內容`。
5. 「從選單中選擇」，提示「設為首頁跑馬燈？」，選項：`是`、`否`。
6. 在「是」分支：
   - 「詢問輸入」，提示「跑馬燈簡短文字」，預設答案插入 `摘要`；改名 `跑馬燈摘要`。
   - 「數字」動作填 `1`，改名 `設為跑馬燈`。
7. 在「否」分支：「數字」動作填 `0`，改名 `設為跑馬燈`；再加入空白「文字」動作，改名 `跑馬燈摘要`。
8. 在分支結束後加入「URL」，內容為 `API_BASE` 魔術變數加 `/api/admin/news`。
9. 加入「取得 URL 內容」：
   - Method：`POST`
   - Headers：Authorization、Accept、Content-Type，依共用設定填寫。
   - Request Body：`JSON`
   - 新增欄位 `title`（文字）→ `標題`
   - `summary`（文字）→ `摘要`
   - `category`（文字）→ `分類`
   - `content`（文字）→ `內容`
   - `setAsTicker`（布林值）→ `設為跑馬燈`
   - `tickerSummary`（文字）→ `跑馬燈摘要`
10. 加入共用成功／錯誤處理，成功通知填「最新消息已發布」。

`setAsTicker` 必須使用 JSON 的「布林值」true / false，不要使用文字「是／否」。若你的 iOS 版本無法把變數指定成布林值，請將「是」「否」拆成兩個「取得 URL 內容」動作，分別固定填入 Boolean `true` 或 `false`。

## 流程二：發布維護公告

1. 「詢問輸入」→「維護標題」，改名 `維護標題`。
2. 「詢問輸入」→「簡短摘要」，改名 `維護摘要`。
3. 「詢問輸入」，輸入類型選「日期與時間」，提示「預計開始時間」；改名 `開始日期`。
4. 「格式化日期」，日期選 `開始日期`，格式選「自訂」，格式字串填 `yyyy-MM-dd'T'HH:mm:ssXXX`；改名 `開始ISO`。
5. 「詢問輸入」，輸入類型選「日期與時間」，提示「預計結束時間」；改名 `結束日期`。
6. 再用「格式化日期」與相同自訂格式，輸出改名 `結束ISO`。
7. 「詢問輸入」→「維護原因」，允許多行；改名 `原因`。
8. 「詢問輸入」→「維護項目（每行一項）」，允許多行；改名 `維護項目`。
9. 「詢問輸入」→「玩家可能受到的影響」，允許多行；改名 `玩家影響`。
10. 「從選單中選擇」→「完成後是否需要重新登入？」，選項 `需要`、`不需要`；各分支分別產生 Boolean true / false，改名 `需要重登`。
11. 「詢問輸入」→「完整公告內容」，允許多行；改名 `完整內容`。
12. 「詢問輸入」→「跑馬燈摘要」，預設答案填例如「今晚 22:00 伺服器將暫時關閉進行維護」；改名 `跑馬燈摘要`。
13. 「URL」內容：`API_BASE` + `/api/admin/maintenance`。
14. 「取得 URL 內容」：
    - Method：`POST`
    - Headers：共用的三個 Header。
    - Body：JSON，欄位如下：
      - `title` → `維護標題`
      - `summary` → `維護摘要`
      - `content` → `完整內容`
      - `startAt` → `開始ISO`
      - `endAt` → `結束ISO`
      - `reason` → `原因`
      - `items` → `維護項目`（直接送多行文字，API 會轉為陣列）
      - `impact` → `玩家影響`
      - `requiresRelogin` → `需要重登`
      - `setAsTicker` → Boolean `true`
      - `tickerSummary` → `跑馬燈摘要`
15. 加入共用成功／錯誤處理，成功通知「維護公告已發布」。

維護完成後要補結果，可先使用「查看目前設定」流程中的 snapshot 找到文章 `slug`，再 PATCH `/api/admin/maintenance/文章slug`，JSON 放 `result` 與更新後的 `content`。

## 流程三：新增更新紀錄

1. 「詢問輸入」，輸入類型選日期，提示「更新日期」，預設「目前日期」；改名 `更新日期`。
2. 「格式化日期」→ 自訂 `yyyy-MM-dd`；改名 `日期文字`。
3. 「詢問輸入」→「版本號（可留空）」，改名 `版本號`。
4. 「詢問輸入」→「更新標題」，預設「伺服器更新」；改名 `更新標題`。
5. 依序建立六個允許多行的「詢問輸入」：
   - 「新增（每行一項，可留空）」→ `新增`
   - 「改善（每行一項，可留空）」→ `改善`
   - 「調整（每行一項，可留空）」→ `調整`
   - 「修復（每行一項，可留空）」→ `修復`
   - 「移除（每行一項，可留空）」→ `移除`
   - 「技術性變更（每行一項，可留空）」→ `技術變更`
6. 「URL」內容：`API_BASE` + `/api/admin/changelog`。
7. 「取得 URL 內容」：
   - Method：`POST`
   - Headers：共用的三個 Header。
   - Body：JSON。
   - `date` → `日期文字`
   - `version` → `版本號`
   - `title` → `更新標題`
   - `added` → `新增`
   - `improved` → `改善`
   - `adjusted` → `調整`
   - `fixed` → `修復`
   - `removed` → `移除`
   - `technical` → `技術變更`
8. 共用成功／錯誤處理，成功通知「更新紀錄已發布」。

## 流程四：修改伺服器設定

1. 「從選單中選擇」，選項：伺服器版本、Java IP、Java 支援版本、Java 建議版本、Bedrock IP、Bedrock Port、Bedrock 建議版本、首頁標語、插件生存簡介、原味生存簡介。
2. 每個分支都用「詢問輸入」取得新值。
3. 每個分支建立一個「字典」，只放該欄位：
   - 伺服器版本 → `serverVersion`
   - Java IP → `javaAddress`
   - Java 支援版本 → `javaSupportedVersions`
   - Java 建議版本 → `javaRecommendedVersions`
   - Bedrock IP → `bedrockAddress`
   - Bedrock Port → `bedrockPort`，值類型選數字
   - Bedrock 建議版本 → `bedrockRecommendedVersion`
   - 首頁標語 → `tagline`
   - 插件生存簡介 → `pluginSurvivalIntro`
   - 原味生存簡介 → `vanillaSurvivalIntro`
4. 把各分支字典輸出都命名為 `設定變更`。
5. 分支結束後，URL 設為 `API_BASE` + `/api/admin/settings`。
6. 「取得 URL 內容」Method 選 `PATCH`，三個共用 Header，Request Body 選 JSON。若捷徑允許直接把字典設為 JSON Body，就插入 `設定變更`；否則在每個選單分支各自放一個 PATCH，JSON 只放該欄位。
7. 成功通知「網站設定已更新」。

## 流程五：設定跑馬燈

最方便的方式是發布消息或維護時直接開啟 `setAsTicker`。要把既有文章設為跑馬燈：

1. 「從選單中選擇」→ `最新消息` 或 `維護公告`；輸出改名 `文章類型`，實際值分別使用 `news`、`maintenance`。
2. 「詢問輸入」→「文章 slug（文章網址最後一段）」，改名 `文章Slug`。
3. 「詢問輸入」→「跑馬燈簡短文字」，改名 `跑馬燈文字`。
4. URL：`API_BASE` + `/api/admin/ticker`。
5. 「取得 URL 內容」：
   - Method：`PUT`
   - Headers：共用三個 Header。
   - JSON：`enabled` = true、`type` = `文章類型`、`slug` = `文章Slug`、`summary` = `跑馬燈文字`。
6. 成功通知「跑馬燈已更新」。

## 流程六：取消跑馬燈

1. URL：`API_BASE` + `/api/admin/ticker`。
2. 「取得 URL 內容」：Method 選 `DELETE`。
3. Headers 只需 Authorization 與 Accept；DELETE 不需要 JSON Body。
4. 成功通知「跑馬燈已取消」。

## 流程七：查看目前設定

1. URL：`API_BASE` + `/api/admin/snapshot`。
2. 「取得 URL 內容」：Method 選 `GET`，Headers 加 Authorization 與 Accept。
3. 「從輸入取得字典」→ 取得 Key `data`。
4. 如果只想看連線設定，再取得 Key `settings` 後使用「快速查看」。
5. 如果要找文章 slug，從 `data` 取得 `news` 或 `maintenance`，用「從列表中選擇」選文章，再取得 `slug`。

## 流程八：刪除既有內容

這個流程會先向網站取得最新清單，不必手動輸入文章 slug。刪除是永久操作，因此務必保留第 14 步的二次確認。

1. 在「刪除既有內容」分支加入「從選單中選擇」，提示填「要刪除哪一類內容？」並建立：`最新消息`、`維護公告`、`更新紀錄`。
2. 在三個選項中分別加入「文字」動作：最新消息填 `news`、維護公告填 `maintenance`、更新紀錄填 `changelog`。
3. 將三個「文字」動作的輸出都重新命名為 `內容類型`。
4. 在選單分支結束後加入「URL」，依序放入 `API_BASE`、文字 `/api/admin/`、魔術變數 `內容類型`。最後應類似 `https://play.chaihome.cc/api/admin/news`。
5. 加入「取得 URL 內容」：Method 選 `GET`；Headers 加 Authorization 與 Accept，不需要 Request Body。
6. 對回傳結果加入「從輸入取得字典」，再用「取得字典值」取得 Key `data`，重新命名為 `既有內容`。
7. 加入「計數」，對 `既有內容` 計算「項目」。若結果是 `0`，顯示提示「目前沒有可刪除的內容」，接著使用「停止此捷徑」。
8. 在「重複每個項目」之前加入一個空白「字典」，改名 `文章對照`；再加入空白「列表」，改名 `顯示清單`。
9. 加入「重複每個項目」，輸入選 `既有內容`。在重複區塊內：
   - 從「重複項目」取得字典值 `title`，改名 `文章標題`。
   - 從「重複項目」取得字典值 `slug`，改名 `文章Slug`。
   - 加入「文字」，第一行插入 `文章標題`，第二行填 `識別：` 後插入 `文章Slug`；改名 `顯示名稱`。
   - 使用「加入變數」，把 `顯示名稱` 加到 `顯示清單`。
   - 使用「設定字典值」，在 `文章對照` 中把 Key 設為 `顯示名稱`、Value 設為 `文章Slug`；將輸出的新字典再次設為變數 `文章對照`。
10. 重複結束後加入「從列表中選擇」，列表選 `顯示清單`，提示填「選擇要永久刪除的內容」，關閉「選取多個」；輸出改名 `選取項目`。
11. 使用「取得字典值」，字典選 `文章對照`，Key 插入 `選取項目`；輸出改名 `刪除Slug`。
12. 加入「文字」，內容依序放入 `API_BASE`、`/api/admin/`、`內容類型`、`/`、`刪除Slug`；再接一個「URL」動作，輸出改名 `刪除URL`。
13. 加入「顯示提示」，標題填「確定永久刪除？」；訊息插入 `選取項目`，並開啟「顯示取消按鈕」。按下取消時捷徑會停止，不會送出刪除請求。
14. 在提示後加入「取得 URL 內容」：
   - URL：`刪除URL`
   - Method：`DELETE`
   - Headers：Authorization 與 Accept
   - 不加入 Content-Type，也不要設定 Request Body
15. 對回傳結果套用「共用成功／錯誤處理」。成功時從回傳字典依序取得 `data`、`title`，顯示通知「已刪除：」加上該標題。

若刪除的是目前正在跑馬燈顯示的最新消息或維護公告，網站會自動關閉該跑馬燈，避免首頁連到已不存在的文章。網站內建的初始文章也能用同一流程刪除。

## 實際 HTTP 範例

捷徑送出的請求應該等同：

```http
POST /api/admin/news HTTP/1.1
Host: play.chaihome.cc
Authorization: Bearer YOUR_ADMIN_TOKEN
Accept: application/json
Content-Type: application/json

{
  "title": "測試消息",
  "summary": "這是一則測試摘要",
  "category": "站務公告",
  "content": "這是完整內容。",
  "setAsTicker": false,
  "tickerSummary": ""
}
```

## 測試建議

第一次使用時先發布標題含「測試」的消息，確認：

1. 捷徑顯示成功。
2. `https://play.chaihome.cc/news` 出現文章。
3. 點入文章後 URL 可分享、標題與內容正確。
4. 若設為跑馬燈，首頁頂部可點擊並前往同一篇文章。
5. 確認後可用管理 API 的 DELETE 刪除測試文章；不要在捷徑公開分享前留下 Token。


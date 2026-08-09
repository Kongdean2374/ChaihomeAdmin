# 柴柴官網管理 iOS App

這是一個原生 SwiftUI 管理 App。它直接使用 `https://play.chaihome.cc/api/admin/*`，不會把 `ADMIN_TOKEN` 寫入程式碼、GitHub 或 IPA。

## App 功能

- 發布最新消息並選擇分類
- 發布完整維護公告
- 新增 Changelog
- 修改 Java／Bedrock 位址、Port、版本與介紹
- 指定或取消首頁跑馬燈
- 從最新消息、維護公告、更新紀錄中選擇並刪除
- 所有危險刪除都有二次確認
- 管理 Token 儲存在 iPhone Keychain

App 採單一動態表單：在最上方的「功能」下拉選單選擇操作後，下方欄位立即切換，不需要穿梭多個複雜頁面。

## GitHub Actions 產生 IPA

Workflow：`.github/workflows/ios-unsigned-ipa.yml`

它會：

1. 使用 GitHub 的 `macos-15` runner。
2. 安裝 XcodeGen 並從 `project.yml` 生成 Xcode project。
3. 使用 `CODE_SIGNING_ALLOWED=NO` 建置 Release app。
4. 將 `.app` 放進標準 `Payload/` 目錄並封裝為 `ChaihomeAdmin-unsigned.ipa`。
5. 只上傳 IPA 作為 Actions artifact。

這個流程不需要 Apple 憑證、Provisioning Profile 或 GitHub Secrets。

## 下載 IPA

1. 開啟 GitHub Repository。
2. 點「Actions」。
3. 選「Build iOS Unsigned IPA」。
4. 打開最新且有綠色勾勾的執行紀錄。
5. 在頁面最下方 Artifacts 下載 `ChaihomeAdmin-unsigned-IPA`。
6. GitHub 下載的是 artifact ZIP；解壓縮後會得到 `ChaihomeAdmin-unsigned.ipa`。

## 安裝提醒

unsigned IPA 尚未經 Apple 簽名，無法直接點擊安裝。請用你自己的簽名工具、憑證或 Apple ID 重新簽名後安裝。程式的 Bundle ID 預設為 `cc.chaihome.admin`；若你的簽名設定需要其他 Bundle ID，修改 `ios/ChaihomeAdmin/project.yml` 的 `PRODUCT_BUNDLE_IDENTIFIER` 後重新觸發 Actions。

## 第一次開啟

1. 開啟「柴柴官網管理」。
2. 貼上 Cloudflare Worker 的 `ADMIN_TOKEN`，只貼 Token 本身，不加 `Bearer`。
3. 點「驗證並儲存」。
4. 驗證成功後，Token 會保存在這台 iPhone 的 Keychain。

若 Token 外洩，請執行 `wrangler secret put ADMIN_TOKEN` 更換，然後在 App 右上角登出並輸入新 Token。

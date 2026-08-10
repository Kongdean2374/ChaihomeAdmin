import SwiftUI

struct SettingsForm: View {
    @EnvironmentObject private var model: AppModel
    @State private var draft = ServerSettings.empty

    var body: some View {
        Section("品牌與首頁") {
            TextField("伺服器名稱", text: $draft.serverName)
            TextField("導覽列品牌名稱", text: $draft.brandName)
            TextField("主要標語", text: $draft.tagline)
            TextField("副標題", text: $draft.subtitle)
            TextField("加入頁簡介", text: $draft.joinIntro, axis: .vertical)
                .lineLimit(2...5)
        }

        Section("Java Edition") {
            TextField("Java IP", text: $draft.javaAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            TextField("伺服器版本", text: $draft.serverVersion)
            TextField("支援版本", text: $draft.javaSupportedVersions)
            TextField("建議版本", text: $draft.javaRecommendedVersions)
        }

        Section("Bedrock Edition") {
            TextField("Bedrock IP", text: $draft.bedrockAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            TextField("Port", value: $draft.bedrockPort, format: .number)
                .keyboardType(.numberPad)
            TextField("建議版本", text: $draft.bedrockRecommendedVersion)
        }

        Section("玩法介紹") {
            MultilineInput(title: "生存玩法簡介", hint: "伺服器生存玩法的定位與特色", text: $draft.pluginSurvivalIntro)
        }

        Section {
            PrimaryActionButton(
                title: "儲存所有設定",
                symbol: "checkmark.circle.fill",
                disabled: !isValid || model.isBusy
            ) {
                Task { _ = await model.updateSettings(draft) }
            }
        } footer: {
            Text("只會更新網站內容資料，不會重新部署 Cloudflare Worker。")
        }
        .onAppear { draft = model.settings }
    }

    private var isValid: Bool {
        !draft.serverName.trimmed.isEmpty &&
            !draft.javaAddress.trimmed.isEmpty &&
            !draft.bedrockAddress.trimmed.isEmpty &&
            (1...65_535).contains(draft.bedrockPort)
    }
}

struct DiscordSettingsForm: View {
    @EnvironmentObject private var model: AppModel
    @State private var draft = DiscordWebhookSettings.empty

    var body: some View {
        Section {
            Label {
                Text("發布網站內容成功後，App 會把通知同步送到對應的 Discord 頻道。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } icon: {
                Image(systemName: "bubble.left.and.bubble.right.fill")
                    .foregroundStyle(Color.chaiSand)
            }
        }

        Section("三種通知連結") {
            webhookField(
                title: "最新消息 Webhook",
                description: "發布一般公告與最新消息時使用",
                text: $draft.newsURL
            )
            webhookField(
                title: "維護公告 Webhook",
                description: "發布維護時間、原因與影響時使用",
                text: $draft.maintenanceURL
            )
            webhookField(
                title: "更新紀錄 Webhook",
                description: "新增 Changelog 時使用",
                text: $draft.changelogURL
            )
        }

        Section {
            PrimaryActionButton(
                title: "儲存 Discord 設定",
                symbol: "lock.shield.fill",
                disabled: model.isBusy
            ) {
                model.saveDiscordSettings(draft)
            }
        } footer: {
            Text("欄位留空就不發送該類通知。Webhook 含有頻道發送權限，只會儲存在這台 iPhone 的 Keychain。")
        }
        .onAppear { draft = model.webhookSettings }
    }

    private func webhookField(
        title: String,
        description: String,
        text: Binding<String>
    ) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title)
                .font(.subheadline.weight(.semibold))
            SecureField("https://discord.com/api/webhooks/…", text: text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
            Text(description)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 3)
    }
}
struct TickerForm: View {
    @EnvironmentObject private var model: AppModel
    @State private var selectedID = ""
    @State private var summary = ""

    var body: some View {
        if let ticker = model.snapshot?.ticker {
            Section("目前狀態") {
                LabeledContent("跑馬燈", value: ticker.enabled ? "啟用中" : "未啟用")
                if ticker.enabled {
                    LabeledContent("文章", value: ticker.slug)
                    Text(ticker.summary)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }

        Section("選擇公告") {
            if choices.isEmpty {
                ContentUnavailableView(
                    "沒有可用公告",
                    systemImage: "megaphone",
                    description: Text("請先發布最新消息或維護公告。")
                )
            } else {
                Picker("文章", selection: $selectedID) {
                    ForEach(choices) { choice in
                        VStack(alignment: .leading) {
                            Text(choice.title)
                            Text(choice.type.title).font(.caption)
                        }
                        .tag(choice.id)
                    }
                }
                .pickerStyle(.menu)

                TextField("跑馬燈摘要（留空使用文章摘要）", text: $summary, axis: .vertical)
                    .lineLimit(2...4)
            }
        }

        Section {
            PrimaryActionButton(
                title: "設為首頁跑馬燈",
                symbol: "megaphone.fill",
                disabled: selectedChoice == nil || model.isBusy
            ) {
                guard let choice = selectedChoice else { return }
                Task {
                    if await model.updateTicker(type: choice.type, slug: choice.slug, summary: summary.trimmed) {
                        summary = ""
                    }
                }
            }

            Button("取消目前跑馬燈", role: .destructive) {
                Task { _ = await model.disableTicker() }
            }
            .disabled(model.snapshot?.ticker.enabled != true || model.isBusy)
        }
        .onAppear { ensureSelection() }
    }

    private var choices: [ContentChoice] {
        let news = model.snapshot?.news.map {
            ContentChoice(type: .news, slug: $0.slug, title: $0.title, detail: $0.category)
        } ?? []
        let maintenance = model.snapshot?.maintenance.map {
            ContentChoice(type: .maintenance, slug: $0.slug, title: $0.title, detail: "維護公告")
        } ?? []
        return news + maintenance
    }

    private var selectedChoice: ContentChoice? {
        choices.first { $0.id == selectedID }
    }

    private func ensureSelection() {
        if selectedChoice == nil { selectedID = choices.first?.id ?? "" }
    }
}

struct DeleteContentForm: View {
    @EnvironmentObject private var model: AppModel
    @State private var kind: ContentKind = .news
    @State private var selectedID = ""
    @State private var showConfirmation = false

    var body: some View {
        Section("選擇內容") {
            Picker("類型", selection: $kind) {
                ForEach(ContentKind.allCases) { item in
                    Text(item.title).tag(item)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: kind) { _, _ in ensureSelection(force: true) }

            if choices.isEmpty {
                ContentUnavailableView(
                    "沒有可刪除內容",
                    systemImage: "tray",
                    description: Text("這個分類目前是空的。")
                )
            } else {
                Picker("項目", selection: $selectedID) {
                    ForEach(choices) { choice in
                        Text(choice.title).tag(choice.id)
                    }
                }
                .pickerStyle(.menu)

                if let choice = selectedChoice {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(choice.title).font(.headline)
                        Text(choice.detail).font(.caption).foregroundStyle(.secondary)
                        Text(choice.slug).font(.caption.monospaced()).foregroundStyle(.tertiary)
                    }
                }
            }
        }

        Section {
            PrimaryActionButton(
                title: "永久刪除所選內容",
                symbol: "trash.fill",
                disabled: selectedChoice == nil || model.isBusy,
                tint: .red
            ) {
                showConfirmation = true
            }
        } footer: {
            Text("刪除無法復原。若內容正在跑馬燈顯示，網站會自動取消跑馬燈。")
        }
        .onAppear { ensureSelection(force: false) }
        .confirmationDialog(
            "確定永久刪除？",
            isPresented: $showConfirmation,
            titleVisibility: .visible
        ) {
            Button("永久刪除", role: .destructive) {
                guard let choice = selectedChoice else { return }
                Task {
                    if await model.delete(type: choice.type, slug: choice.slug) {
                        ensureSelection(force: true)
                    }
                }
            }
            Button("取消", role: .cancel) {}
        } message: {
            Text(selectedChoice?.title ?? "")
        }
    }

    private var choices: [ContentChoice] {
        guard let snapshot = model.snapshot else { return [] }
        switch kind {
        case .news:
            return snapshot.news.map {
                ContentChoice(type: .news, slug: $0.slug, title: $0.title, detail: $0.publishedAt)
            }
        case .maintenance:
            return snapshot.maintenance.map {
                ContentChoice(type: .maintenance, slug: $0.slug, title: $0.title, detail: $0.startAt)
            }
        case .changelog:
            return snapshot.changelog.map {
                ContentChoice(type: .changelog, slug: $0.slug, title: $0.title, detail: $0.date)
            }
        }
    }

    private var selectedChoice: ContentChoice? {
        choices.first { $0.id == selectedID }
    }

    private func ensureSelection(force: Bool) {
        if force || selectedChoice == nil { selectedID = choices.first?.id ?? "" }
    }
}

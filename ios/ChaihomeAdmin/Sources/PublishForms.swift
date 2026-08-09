import SwiftUI

struct NewsForm: View {
    @EnvironmentObject private var model: AppModel
    @State private var title = ""
    @State private var summary = ""
    @State private var category = "伺服器公告"
    @State private var content = ""
    @State private var setAsTicker = false
    @State private var tickerSummary = ""

    private let categories = ["伺服器公告", "功能更新", "活動消息", "站務公告"]

    var body: some View {
        Section("文章資料") {
            TextField("標題", text: $title)
            TextField("首頁列表使用的簡短摘要", text: $summary, axis: .vertical)
                .lineLimit(2...4)
            Picker("分類", selection: $category) {
                ForEach(categories, id: \.self) { Text($0).tag($0) }
            }
            .pickerStyle(.menu)
        }

        Section("完整內容") {
            MultilineInput(
                title: "文章內文",
                hint: "支援換行；項目可用 • 開頭",
                text: $content,
                minimumHeight: 150
            )
        }

        Section("首頁跑馬燈") {
            Toggle("發布後設為跑馬燈", isOn: $setAsTicker)
            if setAsTicker {
                TextField("跑馬燈簡短文字（留空使用摘要）", text: $tickerSummary, axis: .vertical)
                    .lineLimit(2...3)
            }
        }

        Section {
            PrimaryActionButton(
                title: "發布最新消息",
                symbol: "paperplane.fill",
                disabled: !isValid || model.isBusy
            ) {
                let request = NewsCreateRequest(
                    title: title.trimmed,
                    summary: summary.trimmed,
                    category: category,
                    content: content.trimmed,
                    setAsTicker: setAsTicker,
                    tickerSummary: tickerSummary.trimmed
                )
                Task {
                    if await model.publishNews(request) { reset() }
                }
            }
        } footer: {
            Text("發布成功後會立即出現在官網，不需要重新部署。")
        }
    }

    private var isValid: Bool {
        title.trimmed.count >= 2 && summary.trimmed.count >= 5 && content.trimmed.count >= 10
    }

    private func reset() {
        title = ""
        summary = ""
        content = ""
        tickerSummary = ""
        setAsTicker = false
    }
}

struct MaintenanceForm: View {
    @EnvironmentObject private var model: AppModel
    @State private var title = ""
    @State private var summary = ""
    @State private var startAt = Date()
    @State private var endAt = Date().addingTimeInterval(3600)
    @State private var reason = ""
    @State private var items = ""
    @State private var impact = ""
    @State private var content = ""
    @State private var requiresRelogin = true
    @State private var setAsTicker = true
    @State private var tickerSummary = ""

    var body: some View {
        Section("維護資訊") {
            TextField("維護公告標題", text: $title)
            TextField("簡短摘要", text: $summary, axis: .vertical)
                .lineLimit(2...4)
            DatePicker("開始時間", selection: $startAt)
            DatePicker("預計結束", selection: $endAt, in: startAt...)
            Toggle("完成後需要重新登入", isOn: $requiresRelogin)
        }

        Section("原因與影響") {
            MultilineInput(title: "維護原因", hint: "為什麼需要進行這次維護？", text: $reason)
            MultilineInput(title: "玩家影響", hint: "例如：維護期間無法登入。", text: $impact)
        }

        Section("維護內容") {
            MultilineInput(
                title: "維護項目",
                hint: "每行一項，例如：Paper 核心更新",
                text: $items
            )
            MultilineInput(
                title: "完整公告內容",
                hint: "提供玩家需要知道的完整資訊",
                text: $content,
                minimumHeight: 150
            )
        }

        Section("首頁跑馬燈") {
            Toggle("設為首頁重要公告", isOn: $setAsTicker)
            if setAsTicker {
                TextField("跑馬燈摘要（留空使用公告摘要）", text: $tickerSummary, axis: .vertical)
                    .lineLimit(2...3)
            }
        }

        Section {
            PrimaryActionButton(
                title: "發布維護公告",
                symbol: "wrench.and.screwdriver.fill",
                disabled: !isValid || model.isBusy
            ) {
                let request = MaintenanceCreateRequest(
                    title: title.trimmed,
                    summary: summary.trimmed,
                    content: content.trimmed,
                    startAt: AppFormatters.apiDateTime(startAt),
                    endAt: AppFormatters.apiDateTime(endAt),
                    reason: reason.trimmed,
                    items: AppFormatters.listItems(items),
                    impact: impact.trimmed,
                    requiresRelogin: requiresRelogin,
                    result: "",
                    setAsTicker: setAsTicker,
                    tickerSummary: tickerSummary.trimmed
                )
                Task {
                    if await model.publishMaintenance(request) { reset() }
                }
            }
        }
    }

    private var isValid: Bool {
        title.trimmed.count >= 2 && summary.trimmed.count >= 5 && content.trimmed.count >= 10 && endAt >= startAt
    }

    private func reset() {
        title = ""
        summary = ""
        reason = ""
        items = ""
        impact = ""
        content = ""
        tickerSummary = ""
        startAt = Date()
        endAt = Date().addingTimeInterval(3600)
    }
}

struct ChangelogForm: View {
    @EnvironmentObject private var model: AppModel
    @State private var date = Date()
    @State private var version = ""
    @State private var title = ""
    @State private var added = ""
    @State private var improved = ""
    @State private var adjusted = ""
    @State private var fixed = ""
    @State private var removed = ""
    @State private var technical = ""
    @State private var showOtherTypes = false

    var body: some View {
        Section("紀錄資料") {
            DatePicker("日期", selection: $date, displayedComponents: .date)
            TextField("版本號（可留空）", text: $version)
            TextField("更新標題", text: $title)
        }

        Section("主要變更") {
            MultilineInput(title: "新增", hint: "每行一項", text: $added)
            MultilineInput(title: "改善", hint: "每行一項", text: $improved)
            MultilineInput(title: "修復", hint: "每行一項", text: $fixed)
        }

        Section {
            DisclosureGroup("其他變更類型", isExpanded: $showOtherTypes) {
                MultilineInput(title: "調整", hint: "每行一項", text: $adjusted)
                MultilineInput(title: "移除", hint: "每行一項", text: $removed)
                MultilineInput(title: "技術性變更", hint: "每行一項", text: $technical)
            }
        }

        Section {
            PrimaryActionButton(
                title: "新增更新紀錄",
                symbol: "clock.badge.checkmark",
                disabled: !isValid || model.isBusy
            ) {
                let request = ChangelogCreateRequest(
                    date: AppFormatters.dateOnly(date),
                    version: version.trimmed,
                    title: title.trimmed,
                    added: AppFormatters.listItems(added),
                    improved: AppFormatters.listItems(improved),
                    adjusted: AppFormatters.listItems(adjusted),
                    fixed: AppFormatters.listItems(fixed),
                    removed: AppFormatters.listItems(removed),
                    technical: AppFormatters.listItems(technical)
                )
                Task {
                    if await model.publishChangelog(request) { reset() }
                }
            }
        }
    }

    private var isValid: Bool {
        let hasChanges = [added, improved, adjusted, fixed, removed, technical].contains { !$0.trimmed.isEmpty }
        return title.trimmed.count >= 2 && hasChanges
    }

    private func reset() {
        version = ""
        title = ""
        added = ""
        improved = ""
        adjusted = ""
        fixed = ""
        removed = ""
        technical = ""
        showOtherTypes = false
        date = Date()
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}

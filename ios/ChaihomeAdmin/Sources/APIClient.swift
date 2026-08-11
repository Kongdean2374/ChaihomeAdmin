import Foundation
import Combine
import Security

enum APIClientError: LocalizedError {
    case invalidURL
    case invalidResponse
    case missingToken
    case server(code: String, message: String)
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            "API 網址格式錯誤。"
        case .invalidResponse:
            "網站沒有回傳有效的 HTTP 回應。"
        case .missingToken:
            "尚未設定管理 Token。"
        case let .server(_, message):
            message
        case let .decoding(message):
            "無法解析網站回應：\(message)"
        }
    }
}

struct APIClient {
    private let baseURL = URL(string: "https://play.chaihome.cc")!
    private let token: String
    private let session: URLSession

    init(token: String, session: URLSession = .shared) {
        self.token = token.trimmingCharacters(in: .whitespacesAndNewlines)
        self.session = session
    }

    func get<Value: Decodable>(_ path: String) async throws -> Value {
        try await perform(path: path, method: "GET", body: nil)
    }

    func send<Value: Decodable, Body: Encodable>(
        _ path: String,
        method: String = "POST",
        body: Body
    ) async throws -> Value {
        let encoder = JSONEncoder()
        return try await perform(path: path, method: method, body: encoder.encode(body))
    }

    func delete<Value: Decodable>(_ path: String) async throws -> Value {
        try await perform(path: path, method: "DELETE", body: nil)
    }

    private func perform<Value: Decodable>(
        path: String,
        method: String,
        body: Data?
    ) async throws -> Value {
        guard !token.isEmpty else { throw APIClientError.missingToken }
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw APIClientError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }

        let decoder = JSONDecoder()
        guard (200..<300).contains(http.statusCode) else {
            if let envelope = try? decoder.decode(APIErrorEnvelope.self, from: data) {
                throw APIClientError.server(code: envelope.error.code, message: envelope.error.message)
            }
            throw APIClientError.server(code: "HTTP_\(http.statusCode)", message: "網站回傳 HTTP \(http.statusCode)。")
        }

        do {
            return try decoder.decode(APIEnvelope<Value>.self, from: data).data
        } catch {
            throw APIClientError.decoding(error.localizedDescription)
        }
    }
}

enum KeychainStore {
    private static let service = "cc.chaihome.admin"
    private static let account = "admin-token"

    static func saveToken(_ token: String) throws {
        let data = Data(token.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]

        let status: OSStatus
        if SecItemCopyMatching(query as CFDictionary, nil) == errSecSuccess {
            status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        } else {
            var addQuery = query
            attributes.forEach { addQuery[$0.key] = $0.value }
            status = SecItemAdd(addQuery as CFDictionary, nil)
        }

        guard status == errSecSuccess else {
            throw APIClientError.server(code: "KEYCHAIN_SAVE_FAILED", message: "無法將 Token 儲存到 iPhone Keychain。")
        }
    }

    static func loadToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func deleteToken() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var snapshot: Snapshot?
    @Published private(set) var isConfigured = false
    @Published private(set) var isBusy = false
    @Published private(set) var webhookSettings = DiscordWebhookStore.load()
    @Published var presentedAlert: AppAlert?

    private var token = ""

    var settings: ServerSettings { snapshot?.settings ?? .empty }

    func restoreSession() async {
        guard let stored = KeychainStore.loadToken(), !stored.isEmpty else { return }
        token = stored
        await loadSnapshot(markConfigured: true, showSuccess: false)
    }

    func connect(token candidate: String) async {
        let cleaned = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else {
            presentedAlert = AppAlert(title: "缺少 Token", message: "請輸入 Cloudflare Worker 的 ADMIN_TOKEN。")
            return
        }

        token = cleaned
        isBusy = true
        defer { isBusy = false }
        do {
            let fresh: Snapshot = try await APIClient(token: token).get("/api/admin/snapshot")
            try KeychainStore.saveToken(token)
            snapshot = fresh
            isConfigured = true
        } catch {
            token = ""
            presentedAlert = AppAlert(title: "連線失敗", message: error.localizedDescription)
        }
    }

    func refresh(showSuccess: Bool = false) async {
        await loadSnapshot(markConfigured: true, showSuccess: showSuccess)
    }

    func logout() {
        KeychainStore.deleteToken()
        token = ""
        snapshot = nil
        isConfigured = false
    }

    func publishNews(_ request: NewsCreateRequest) async -> Bool {
        var created: NewsEntry?
        let published = await mutate(success: "最新消息已發布") { client in
            created = try await client.send("/api/admin/news", body: request)
        }
        guard published else { return false }
        let slug = created?.slug.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? ""
        await sendDiscordIfConfigured(
            kind: .news,
            title: request.title,
            description: "\(request.summary)\n\n\(request.content)",
            articlePath: "/news/\(slug)",
            color: 0x8CAA73,
            websiteSuccess: "最新消息已發布"
        )
        return true
    }

    func publishMaintenance(_ request: MaintenanceCreateRequest) async -> Bool {
        var created: MaintenanceEntry?
        let published = await mutate(success: "維護公告已發布") { client in
            created = try await client.send("/api/admin/maintenance", body: request)
        }
        guard published else { return false }
        let slug = created?.slug.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? ""
        let items = request.items.map { "• \($0)" }.joined(separator: "\n")
        let startAt = AppFormatters.taipeiDateTime(request.startAt)
        let endAt = AppFormatters.taipeiDateTime(request.endAt)
        let description = """
        \(request.summary)

        開始：\(startAt)（台北時間 UTC+8）
        預計結束：\(endAt)（台北時間 UTC+8）
        原因：\(request.reason)
        玩家影響：\(request.impact)

        維護項目：
        \(items)

        \(request.content)
        """
        await sendDiscordIfConfigured(
            kind: .maintenance,
            title: request.title,
            description: description,
            articlePath: "/maintenance/\(slug)",
            color: 0xD29F5F,
            websiteSuccess: "維護公告已發布"
        )
        return true
    }

    func publishChangelog(_ request: ChangelogCreateRequest) async -> Bool {
        let published = await mutate(success: "更新紀錄已新增") { client in
            let _: ChangelogEntry = try await client.send("/api/admin/changelog", body: request)
        }
        guard published else { return false }
        let sections = [
            discordSection("新增", request.added),
            discordSection("改善", request.improved),
            discordSection("調整", request.adjusted),
            discordSection("修復", request.fixed),
            discordSection("移除", request.removed),
            discordSection("技術性變更", request.technical),
        ].filter { !$0.isEmpty }.joined(separator: "\n\n")
        let version = request.version.isEmpty ? "" : "｜版本 \(request.version)"
        await sendDiscordIfConfigured(
            kind: .changelog,
            title: request.title,
            description: "日期：\(request.date)\(version)\n\n\(sections)",
            articlePath: "/changelog",
            color: 0xA990D8,
            websiteSuccess: "更新紀錄已新增"
        )
        return true
    }

    func saveDiscordSettings(_ settings: DiscordWebhookSettings) {
        let cleaned = DiscordWebhookSettings(
            newsURL: settings.newsURL.trimmed,
            maintenanceURL: settings.maintenanceURL.trimmed,
            changelogURL: settings.changelogURL.trimmed
        )
        let values = [cleaned.newsURL, cleaned.maintenanceURL, cleaned.changelogURL]
        guard values.allSatisfy({ DiscordWebhookClient.validate($0) }) else {
            presentedAlert = AppAlert(title: "網址格式不正確", message: DiscordWebhookError.invalidURL.localizedDescription)
            return
        }
        do {
            try DiscordWebhookStore.save(cleaned)
            webhookSettings = cleaned
            presentedAlert = AppAlert(title: "已儲存", message: "三種 Discord Webhook 設定已安全存入這台 iPhone。")
        } catch {
            presentedAlert = AppAlert(title: "儲存失敗", message: error.localizedDescription)
        }
    }

    func updateSettings(_ request: ServerSettings) async -> Bool {
        await mutate(success: "伺服器設定已更新") { client in
            let _: ServerSettings = try await client.send("/api/admin/settings", method: "PATCH", body: request)
        }
    }

    func updateTicker(type: ContentKind, slug: String, summary: String) async -> Bool {
        let request = TickerUpdateRequest(enabled: true, type: type.rawValue, slug: slug, summary: summary)
        return await mutate(success: "首頁跑馬燈已更新") { client in
            let _: Ticker = try await client.send("/api/admin/ticker", method: "PUT", body: request)
        }
    }

    func disableTicker() async -> Bool {
        await mutate(success: "首頁跑馬燈已取消") { client in
            let _: Ticker = try await client.delete("/api/admin/ticker")
        }
    }

    func delete(type: ContentKind, slug: String) async -> Bool {
        await mutate(success: "內容已永久刪除") { client in
            let encoded = slug.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? slug
            let _: MutationResult = try await client.delete("/api/admin/\(type.rawValue)/\(encoded)")
        }
    }

    private func sendDiscordIfConfigured(
        kind: ContentKind,
        title: String,
        description: String,
        articlePath: String,
        color: Int,
        websiteSuccess: String
    ) async {
        let webhookURL = webhookSettings.url(for: kind).trimmed
        guard !webhookURL.isEmpty else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            try await DiscordWebhookClient().send(
                webhookURL: webhookURL,
                title: title,
                description: description,
                articleURL: "https://play.chaihome.cc\(articlePath)",
                color: color
            )
            presentedAlert = AppAlert(title: "完成", message: "\(websiteSuccess)，Discord 通知也已送出。")
        } catch {
            presentedAlert = AppAlert(
                title: "網站已更新，Discord 未送出",
                message: "網站內容已成功儲存，但 Discord 通知失敗：\(error.localizedDescription)"
            )
        }
    }

    private func discordSection(_ title: String, _ items: [String]) -> String {
        guard !items.isEmpty else { return "" }
        return "**\(title)**\n" + items.map { "• \($0)" }.joined(separator: "\n")
    }
    private func loadSnapshot(markConfigured: Bool, showSuccess: Bool) async {
        guard !token.isEmpty else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            snapshot = try await APIClient(token: token).get("/api/admin/snapshot")
            if markConfigured { isConfigured = true }
            if showSuccess {
                presentedAlert = AppAlert(title: "已重新整理", message: "網站內容已同步到最新狀態。")
            }
        } catch {
            presentedAlert = AppAlert(title: "讀取失敗", message: error.localizedDescription)
        }
    }

    private func mutate(
        success: String,
        operation: (APIClient) async throws -> Void
    ) async -> Bool {
        guard !token.isEmpty else {
            presentedAlert = AppAlert(title: "尚未登入", message: "請先設定管理 Token。")
            return false
        }

        isBusy = true
        defer { isBusy = false }
        do {
            let client = APIClient(token: token)
            try await operation(client)
            snapshot = try await client.get("/api/admin/snapshot")
            presentedAlert = AppAlert(title: "完成", message: success)
            return true
        } catch {
            presentedAlert = AppAlert(title: "操作失敗", message: error.localizedDescription)
            return false
        }
    }
}

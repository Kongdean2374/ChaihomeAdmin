import Foundation
import Security

enum DiscordWebhookError: LocalizedError {
    case invalidURL
    case requestFailed(Int)
    case keychain

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            "Webhook URL 格式不正確，請貼上 Discord 頻道整合頁面產生的完整網址。"
        case let .requestFailed(status):
            "Discord Webhook 回傳 HTTP \(status)，請確認網址仍有效且有發送權限。"
        case .keychain:
            "無法將 Discord Webhook 儲存到 iPhone Keychain。"
        }
    }
}

struct DiscordWebhookClient {
    static func validate(_ rawURL: String) -> Bool {
        let value = rawURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.isEmpty { return true }
        guard let url = URL(string: value),
              url.scheme?.lowercased() == "https",
              let host = url.host?.lowercased(),
              isDiscordHost(host),
              url.path.contains("/api/webhooks/")
        else { return false }
        return true
    }

    func send(
        webhookURL: String,
        title: String,
        description: String,
        articleURL: String,
        color: Int
    ) async throws {
        let cleaned = webhookURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard Self.validate(cleaned),
              var components = URLComponents(string: cleaned),
              !cleaned.isEmpty
        else { throw DiscordWebhookError.invalidURL }

        var queryItems = components.queryItems ?? []
        queryItems.removeAll { $0.name == "wait" }
        queryItems.append(URLQueryItem(name: "wait", value: "true"))
        components.queryItems = queryItems
        guard let url = components.url else { throw DiscordWebhookError.invalidURL }

        let payload = DiscordWebhookPayload(
            username: "柴柴生存伺服器",
            embeds: [
                DiscordEmbed(
                    title: String(title.prefix(250)),
                    description: String(description.prefix(3_900)),
                    url: articleURL,
                    color: color,
                    timestamp: ISO8601DateFormatter().string(from: Date()),
                    footer: DiscordFooter(text: "play.chaihome.cc")
                )
            ],
            allowed_mentions: DiscordAllowedMentions(parse: [])
        )

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.httpBody = try JSONEncoder().encode(payload)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse,
              (200..<300).contains(http.statusCode)
        else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw DiscordWebhookError.requestFailed(status)
        }
    }

    private static func isDiscordHost(_ host: String) -> Bool {
        host == "discord.com" || host.hasSuffix(".discord.com") ||
            host == "discordapp.com" || host.hasSuffix(".discordapp.com")
    }
}

private struct DiscordWebhookPayload: Encodable {
    let username: String
    let embeds: [DiscordEmbed]
    let allowed_mentions: DiscordAllowedMentions
}

private struct DiscordEmbed: Encodable {
    let title: String
    let description: String
    let url: String
    let color: Int
    let timestamp: String
    let footer: DiscordFooter
}

private struct DiscordFooter: Encodable {
    let text: String
}

private struct DiscordAllowedMentions: Encodable {
    let parse: [String]
}

enum DiscordWebhookStore {
    private static let service = "cc.chaihome.admin"
    private static let account = "discord-webhook-settings"

    static func save(_ settings: DiscordWebhookSettings) throws {
        let data = try JSONEncoder().encode(settings)
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
        guard status == errSecSuccess else { throw DiscordWebhookError.keychain }
    }

    static func load() -> DiscordWebhookSettings {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let settings = try? JSONDecoder().decode(DiscordWebhookSettings.self, from: data)
        else { return .empty }
        return settings
    }
}
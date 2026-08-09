import Foundation

enum AdminFunction: String, CaseIterable, Identifiable {
    case news
    case maintenance
    case changelog
    case settings
    case ticker
    case delete

    var id: String { rawValue }

    var title: String {
        switch self {
        case .news: "發布最新消息"
        case .maintenance: "發布維護公告"
        case .changelog: "新增更新紀錄"
        case .settings: "修改伺服器設定"
        case .ticker: "管理首頁跑馬燈"
        case .delete: "刪除既有內容"
        }
    }

    var subtitle: String {
        switch self {
        case .news: "發布一般公告、功能更新或活動消息"
        case .maintenance: "填寫時間、原因、影響與維護項目"
        case .changelog: "保存新增、改善、調整與修復紀錄"
        case .settings: "修改版本、Java／Bedrock 位址與介紹"
        case .ticker: "指定或取消首頁最上方的重要公告"
        case .delete: "從即時清單選擇內容並二次確認刪除"
        }
    }

    var symbol: String {
        switch self {
        case .news: "newspaper"
        case .maintenance: "wrench.and.screwdriver"
        case .changelog: "clock.arrow.circlepath"
        case .settings: "slider.horizontal.3"
        case .ticker: "megaphone"
        case .delete: "trash"
        }
    }
}

enum ContentKind: String, CaseIterable, Identifiable {
    case news
    case maintenance
    case changelog

    var id: String { rawValue }

    var title: String {
        switch self {
        case .news: "最新消息"
        case .maintenance: "維護公告"
        case .changelog: "更新紀錄"
        }
    }
}

struct AppAlert: Identifiable {
    let id = UUID()
    let title: String
    let message: String
}

struct APIEnvelope<Value: Decodable>: Decodable {
    let ok: Bool
    let data: Value
}

struct APIErrorEnvelope: Decodable {
    struct ErrorBody: Decodable {
        let code: String
        let message: String
        let fields: [String: String]?
    }

    let ok: Bool
    let error: ErrorBody
}

struct ServerSettings: Codable, Equatable {
    var serverName: String
    var brandName: String
    var tagline: String
    var subtitle: String
    var javaAddress: String
    var bedrockAddress: String
    var bedrockPort: Int
    var serverVersion: String
    var javaSupportedVersions: String
    var javaRecommendedVersions: String
    var bedrockRecommendedVersion: String
    var pluginSurvivalIntro: String
    var vanillaSurvivalIntro: String
    var joinIntro: String

    static let empty = ServerSettings(
        serverName: "",
        brandName: "",
        tagline: "",
        subtitle: "",
        javaAddress: "",
        bedrockAddress: "",
        bedrockPort: 19132,
        serverVersion: "",
        javaSupportedVersions: "",
        javaRecommendedVersions: "",
        bedrockRecommendedVersion: "",
        pluginSurvivalIntro: "",
        vanillaSurvivalIntro: "",
        joinIntro: ""
    )
}

struct Ticker: Codable, Equatable {
    var enabled: Bool
    var type: String
    var slug: String
    var summary: String
}

struct NewsEntry: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let title: String
    let summary: String
    let category: String
    let content: String
    let publishedAt: String
    let updatedAt: String?
}

struct MaintenanceEntry: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let title: String
    let summary: String
    let content: String
    let publishedAt: String
    let updatedAt: String?
    let startAt: String
    let endAt: String
    let reason: String
    let items: [String]
    let impact: String
    let requiresRelogin: Bool?
    let result: String
}

struct ChangelogEntry: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let date: String
    let version: String
    let title: String
    let added: [String]
    let improved: [String]
    let adjusted: [String]
    let fixed: [String]
    let removed: [String]
    let technical: [String]
    let updatedAt: String?
}

struct Snapshot: Codable {
    let schemaVersion: Int
    let settings: ServerSettings
    let ticker: Ticker
    let news: [NewsEntry]
    let maintenance: [MaintenanceEntry]
    let changelog: [ChangelogEntry]
    let updatedAt: String
}

struct MutationResult: Codable {
    let deleted: Bool?
    let id: String?
    let slug: String?
    let title: String?
}

struct ContentChoice: Identifiable, Hashable {
    let type: ContentKind
    let slug: String
    let title: String
    let detail: String

    var id: String { "\(type.rawValue):\(slug)" }
}

struct NewsCreateRequest: Encodable {
    let title: String
    let summary: String
    let category: String
    let content: String
    let setAsTicker: Bool
    let tickerSummary: String
}

struct MaintenanceCreateRequest: Encodable {
    let title: String
    let summary: String
    let content: String
    let startAt: String
    let endAt: String
    let reason: String
    let items: [String]
    let impact: String
    let requiresRelogin: Bool
    let result: String
    let setAsTicker: Bool
    let tickerSummary: String
}

struct ChangelogCreateRequest: Encodable {
    let date: String
    let version: String
    let title: String
    let added: [String]
    let improved: [String]
    let adjusted: [String]
    let fixed: [String]
    let removed: [String]
    let technical: [String]
}

struct TickerUpdateRequest: Encodable {
    let enabled: Bool
    let type: String
    let slug: String
    let summary: String
}

enum AppFormatters {
    static func apiDateTime(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }

    static func dateOnly(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    static func listItems(_ text: String) -> [String] {
        text
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }
}

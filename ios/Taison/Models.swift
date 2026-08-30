import Foundation

/// Ті самі категорії, що й у вебзастосунку — щоб дані потім зійшлися.
enum Category: String, CaseIterable, Codable, Identifiable {
    case groceries, dining, auto, transport, electronics, housing
    case health, clothing, fun, subs, travel, education, gifts, other

    var id: String { rawValue }

    var title: String {
        switch self {
        case .groceries:   return "Продукти"
        case .dining:      return "Кафе та ресторани"
        case .auto:        return "Авто та паливо"
        case .transport:   return "Транспорт"
        case .electronics: return "Техніка"
        case .housing:     return "Житло та комунальні"
        case .health:      return "Здоров'я"
        case .clothing:    return "Одяг"
        case .fun:         return "Розваги"
        case .subs:        return "Підписки"
        case .travel:      return "Подорожі"
        case .education:   return "Освіта"
        case .gifts:       return "Подарунки"
        case .other:       return "Інше"
        }
    }

    var icon: String {
        switch self {
        case .groceries:   return "🛒"
        case .dining:      return "🍽️"
        case .auto:        return "🚗"
        case .transport:   return "🚆"
        case .electronics: return "💻"
        case .housing:     return "🏠"
        case .health:      return "💊"
        case .clothing:    return "👕"
        case .fun:         return "🎬"
        case .subs:        return "🔁"
        case .travel:      return "✈️"
        case .education:   return "📚"
        case .gifts:       return "🎁"
        case .other:       return "📦"
        }
    }
}

struct Expense: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var amountCents: Int
    var merchant: String
    var note: String
    var category: Category
    var date: Date
    /// Скан ще не звірено людиною — показуємо позначку і не даємо забути.
    var needsReview: Bool
    /// Ім'я PDF у теці Documents застосунку, якщо витрата прийшла зі сканера.
    var pdfFileName: String?

    init(
        id: UUID = UUID(),
        amountCents: Int = 0,
        merchant: String = "",
        note: String = "",
        category: Category = .other,
        date: Date = Date(),
        needsReview: Bool = false,
        pdfFileName: String? = nil
    ) {
        self.id = id
        self.amountCents = amountCents
        self.merchant = merchant
        self.note = note
        self.category = category
        self.date = date
        self.needsReview = needsReview
        self.pdfFileName = pdfFileName
    }
}

/// Те, що повертає модель після розбору чека.
struct ParsedReceipt: Codable {
    var documentKind: String
    var merchant: String
    var purchasedOn: String
    var totalCents: Int
    var currency: String
    var categorySlug: String
    var confidence: String
    var summary: String

    enum CodingKeys: String, CodingKey {
        case documentKind = "document_kind"
        case merchant
        case purchasedOn = "purchased_on"
        case totalCents = "total_cents"
        case currency
        case categorySlug = "category_slug"
        case confidence
        case summary
    }

    var category: Category { Category(rawValue: categorySlug) ?? .other }

    var date: Date {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        return f.date(from: purchasedOn) ?? Date()
    }
}

// MARK: - Форматування

enum Money {
    static func format(_ cents: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "EUR"
        formatter.locale = Locale(identifier: "uk_UA")
        return formatter.string(from: NSNumber(value: Double(cents) / 100)) ?? "—"
    }

    /// «12,34» або «12.34» → 1234 центи.
    static func cents(from text: String) -> Int? {
        let cleaned = text.replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: ",", with: ".")
        guard let value = Double(cleaned), value.isFinite else { return nil }
        return Int((value * 100).rounded())
    }

    static func input(_ cents: Int) -> String {
        String(format: "%.2f", Double(cents) / 100)
    }
}

enum Dates {
    static func short(_ date: Date) -> String {
        date.formatted(.dateTime.day().month(.abbreviated).locale(Locale(identifier: "uk_UA")))
    }

    static func monthTitle(_ date: Date) -> String {
        date.formatted(.dateTime.month(.wide).year().locale(Locale(identifier: "uk_UA")))
    }
}

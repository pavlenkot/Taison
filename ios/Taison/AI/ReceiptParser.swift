import Foundation

/// Спільний контракт для обох рушіїв — так само, як у вебзастосунку.
/// Додати третій постачальника означає написати один новий тип, що
/// відповідає цьому протоколу; решта коду не змінюється.
protocol ReceiptParser {
    func parse(jpeg: Data) async throws -> ParsedReceipt
}

enum AIProvider: String, CaseIterable, Identifiable {
    case gemini, claude

    var id: String { rawValue }

    var title: String {
        switch self {
        case .gemini: return "Gemini"
        case .claude: return "Claude"
        }
    }

    var keyLabel: String {
        switch self {
        case .gemini: return "Ключ Google AI Studio"
        case .claude: return "Ключ Anthropic"
        }
    }
}

enum ParserError: LocalizedError {
    case missingKey
    case badResponse(String)
    case emptyResult

    var errorDescription: String? {
        switch self {
        case .missingKey:
            return "Не вказано ключ API. Відкрийте налаштування."
        case .badResponse(let detail):
            return "Рушій відповів помилкою: \(detail)"
        case .emptyResult:
            return "Рушій повернув порожню відповідь"
        }
    }
}

enum ReceiptPrompt {
    static let system = """
    Ти — рушій розбору чеків для особистого фінансового застосунку.
    Поверни рівно ті поля, що описані схемою.

    total_cents — підсумкова сума до сплати в сотих частках валюти, цілим числом.
    12,34 € → 1234. Бери рядок «Разом», «Сума», «Total», «Summe», «Zu zahlen».
    Ніколи не бери проміжні підсумки, суму ПДВ або решту. Не видно — 0.

    purchased_on — дата з чека у форматі YYYY-MM-DD. Європейські чеки друкують
    день першим: 03.05.2026 → 2026-05-03. Не видно — порожній рядок.

    merchant — назва магазину без форми власності (без GmbH, ТОВ).

    currency — код ISO 4217. Символ € означає EUR. Не видно — EUR.

    category_slug — рівно одне значення зі списку схеми:
    groceries — супермаркет, продукти, пекарня
    dining — кафе, ресторан, бар, фастфуд, кава
    auto — паливо, СТО, запчастини, мийка, стоянка
    transport — квитки, потяг, автобус, метро, таксі
    electronics — техніка, комп'ютери, телефони
    housing — оренда, комунальні, інтернет, меблі, госптовари
    health — аптека, лікар, аналізи, оптика, спортзал
    clothing — одяг, взуття, аксесуари
    fun — кіно, концерти, ігри, книги, хобі
    subs — цифрові підписки
    travel — готель, авіаквитки, оренда авто
    education — курси, навчальні матеріали
    gifts — подарунки, квіти, благодійність
    other — якщо жодна не підходить

    Якщо це не чек, а документ: document_kind = "document",
    а в summary — один стислий рядок українською, що це за документ.

    confidence: high — усе прочитано впевнено; medium — щось припущено;
    low — знімок нечіткий.

    Нічого не вигадуй. Порожнє поле краще за здогад.
    """

    static let user = "Розбери цей чек і поверни структуровані дані згідно зі схемою."

    static let categorySlugs = Category.allCases.map(\.rawValue)

    /// JSON Schema під конкретний рушій: Gemini чекає типи OpenAPI у верхньому
    /// регістрі й не приймає additionalProperties, Anthropic — навпаки.
    static func jsonSchema(for provider: AIProvider) -> [String: Any] {
        let uppercase = provider == .gemini

        func field(_ kind: String, allowed: [String]? = nil) -> [String: Any] {
            var out: [String: Any] = ["type": uppercase ? kind.uppercased() : kind]
            if let allowed { out["enum"] = allowed }
            return out
        }

        let properties: [String: Any] = [
            "document_kind": field("string", allowed: ["receipt", "document"]),
            "merchant": field("string"),
            "purchased_on": field("string"),
            "total_cents": field("integer"),
            "currency": field("string"),
            "category_slug": field("string", allowed: categorySlugs),
            "confidence": field("string", allowed: ["high", "medium", "low"]),
            "summary": field("string"),
        ]

        let required: [String] = [
            "document_kind", "merchant", "purchased_on", "total_cents",
            "currency", "category_slug", "confidence", "summary",
        ]

        var schema: [String: Any] = [
            "type": uppercase ? "OBJECT" : "object",
            "properties": properties,
            "required": required,
        ]

        if provider == .claude {
            schema["additionalProperties"] = false
        }
        return schema
    }
}

enum ParserFactory {
    static func make(provider: AIProvider, key: String) -> ReceiptParser {
        switch provider {
        case .gemini: return GeminiParser(apiKey: key)
        case .claude: return ClaudeParser(apiKey: key)
        }
    }
}

import Foundation

/// Сховище скелета: звичайний JSON у теці Documents.
/// Свідомо без SwiftData та CloudKit — у пробному проєкті важливо, щоб він
/// відкрився й запустився без жодних налаштувань. Синхронізацію між
/// пристроями додамо тоді, коли вирішимо, що нативний шлях — наш.
@MainActor
final class ExpenseStore: ObservableObject {
    @Published private(set) var expenses: [Expense] = []

    private let fileURL: URL

    init() {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        fileURL = documents.appendingPathComponent("expenses.json")
        load()
    }

    // MARK: - Читання

    var needsReviewCount: Int {
        expenses.filter(\.needsReview).count
    }

    var currentMonthTotal: Int {
        let calendar = Calendar.current
        return expenses
            .filter { !$0.needsReview && calendar.isDate($0.date, equalTo: Date(), toGranularity: .month) }
            .reduce(0) { $0 + $1.amountCents }
    }

    /// Витрати, згруповані за днем, найновіші згори.
    var grouped: [(day: Date, items: [Expense])] {
        let calendar = Calendar.current
        let buckets = Dictionary(grouping: expenses) { calendar.startOfDay(for: $0.date) }
        return buckets
            .map { (day: $0.key, items: $0.value.sorted { $0.date > $1.date }) }
            .sorted { $0.day > $1.day }
    }

    // MARK: - Зміни

    func add(_ expense: Expense) {
        expenses.append(expense)
        save()
    }

    func update(_ expense: Expense) {
        guard let index = expenses.firstIndex(where: { $0.id == expense.id }) else { return }
        expenses[index] = expense
        save()
    }

    func delete(_ expense: Expense) {
        if let name = expense.pdfFileName {
            try? FileManager.default.removeItem(at: Self.pdfURL(for: name))
        }
        expenses.removeAll { $0.id == expense.id }
        save()
    }

    // MARK: - Файли

    static func pdfURL(for name: String) -> URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(name)
    }

    // MARK: - Збереження

    private func load() {
        guard let data = try? Data(contentsOf: fileURL) else { return }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        expenses = (try? decoder.decode([Expense].self, from: data)) ?? []
    }

    private func save() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(expenses) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}

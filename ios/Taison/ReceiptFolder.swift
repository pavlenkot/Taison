import Foundation

/// Запис PDF у теку iCloud Drive, яку користувач обрав один раз.
///
/// Це відповідь на питання «чи може нативний застосунок сам класти файли
/// в iCloud». Може — але не в будь-яку теку мовчки: користувач один раз
/// вибирає її системним діалогом, а застосунок зберігає закладку з правами
/// доступу і далі пише туди сам, без запитань.
@MainActor
final class ReceiptFolder: ObservableObject {
    private static let bookmarkKey = "receiptsFolderBookmark"

    @Published private(set) var folderName: String?

    init() {
        folderName = resolve()?.lastPathComponent
    }

    var isConfigured: Bool { folderName != nil }

    /// Викликати з .fileImporter після вибору теки.
    func remember(_ url: URL) throws {
        guard url.startAccessingSecurityScopedResource() else {
            throw FolderError.accessDenied
        }
        defer { url.stopAccessingSecurityScopedResource() }

        let bookmark = try url.bookmarkData()
        UserDefaults.standard.set(bookmark, forKey: Self.bookmarkKey)
        folderName = url.lastPathComponent
    }

    func forget() {
        UserDefaults.standard.removeObject(forKey: Self.bookmarkKey)
        folderName = nil
    }

    /// Кладе PDF у вибрану теку. Повертає false, якщо теку ще не обрано.
    @discardableResult
    func save(_ pdf: Data, named name: String) throws -> Bool {
        guard let folder = resolve() else { return false }

        guard folder.startAccessingSecurityScopedResource() else {
            throw FolderError.accessDenied
        }
        defer { folder.stopAccessingSecurityScopedResource() }

        try pdf.write(to: folder.appendingPathComponent(name), options: .atomic)
        return true
    }

    private func resolve() -> URL? {
        guard let data = UserDefaults.standard.data(forKey: Self.bookmarkKey) else { return nil }

        var isStale = false
        guard let url = try? URL(resolvingBookmarkData: data, bookmarkDataIsStale: &isStale) else {
            return nil
        }

        // Закладка застаріла — тека переїхала або була перестворена.
        // Оновлюємо її на місці, поки доступ ще діє.
        if isStale, url.startAccessingSecurityScopedResource() {
            defer { url.stopAccessingSecurityScopedResource() }
            if let fresh = try? url.bookmarkData() {
                UserDefaults.standard.set(fresh, forKey: Self.bookmarkKey)
            }
        }

        return url
    }

    enum FolderError: LocalizedError {
        case accessDenied

        var errorDescription: String? {
            switch self {
            case .accessDenied:
                return "Немає доступу до теки. Оберіть її ще раз у налаштуваннях."
            }
        }
    }
}

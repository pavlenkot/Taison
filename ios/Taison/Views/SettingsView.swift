import SwiftUI
import UniformTypeIdentifiers

@MainActor
struct SettingsView: View {
    @EnvironmentObject private var folder: ReceiptFolder
    @Environment(\.dismiss) private var dismiss

    @AppStorage("aiProvider") private var providerRaw = AIProvider.gemini.rawValue
    @AppStorage("geminiKey") private var geminiKey = ""
    @AppStorage("claudeKey") private var claudeKey = ""

    @State private var showFolderPicker = false
    @State private var folderError: String?

    private var provider: AIProvider {
        AIProvider(rawValue: providerRaw) ?? .gemini
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Рушій розпізнавання") {
                    Picker("Рушій", selection: $providerRaw) {
                        ForEach(AIProvider.allCases) { option in
                            Text(option.title).tag(option.rawValue)
                        }
                    }
                    .pickerStyle(.segmented)

                    if provider == .gemini {
                        SecureField(provider.keyLabel, text: $geminiKey)
                    } else {
                        SecureField(provider.keyLabel, text: $claudeKey)
                    }
                } footer: {
                    Text(
                        "Без ключа сканер усе одно працює: PDF зберігається, "
                        + "а суму та категорію вписуєте самі."
                    )
                }

                Section("Тека для чеків в iCloud") {
                    if let name = folder.folderName {
                        LabeledContent("Обрано", value: name)
                        Button("Обрати іншу") { showFolderPicker = true }
                        Button("Прибрати", role: .destructive) { folder.forget() }
                    } else {
                        Button("Обрати теку") { showFolderPicker = true }
                    }
                } footer: {
                    Text(
                        "Оберіть теку один раз — застосунок запам'ятає доступ і далі "
                        + "складатиме туди PDF сам, без запитань. Це і є та сама "
                        + "автоматична вивантаження в iCloud Drive."
                    )
                }
            }
            .navigationTitle("Налаштування")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Готово") { dismiss() }
                }
            }
            .fileImporter(
                isPresented: $showFolderPicker,
                allowedContentTypes: [.folder]
            ) { result in
                switch result {
                case .success(let url):
                    do {
                        try folder.remember(url)
                    } catch {
                        folderError = error.localizedDescription
                    }
                case .failure(let error):
                    folderError = error.localizedDescription
                }
            }
            .alert(
                "Не вдалося",
                isPresented: Binding(
                    get: { folderError != nil },
                    set: { if !$0 { folderError = nil } }
                )
            ) {
                Button("Зрозуміло", role: .cancel) { folderError = nil }
            } message: {
                Text(folderError ?? "")
            }
        }
    }
}

import SwiftUI

@MainActor
struct ContentView: View {
    @EnvironmentObject private var store: ExpenseStore
    @EnvironmentObject private var folder: ReceiptFolder

    @AppStorage("aiProvider") private var providerRaw = AIProvider.gemini.rawValue
    @AppStorage("geminiKey") private var geminiKey = ""
    @AppStorage("claudeKey") private var claudeKey = ""

    @State private var showScanner = false
    @State private var showSettings = false
    @State private var editing: Expense?
    @State private var status: Status = .idle
    @State private var errorMessage: String?

    private enum Status: Equatable {
        case idle, recognising
    }

    private var provider: AIProvider {
        AIProvider(rawValue: providerRaw) ?? .gemini
    }

    private var apiKey: String {
        provider == .gemini ? geminiKey : claudeKey
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    summary
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }

                if store.expenses.isEmpty {
                    Section {
                        ContentUnavailableView(
                            "Ще немає витрат",
                            systemImage: "doc.text.viewfinder",
                            description: Text("Відскануйте перший чек — решту заповнить AI")
                        )
                    }
                }

                ForEach(store.grouped, id: \.day) { group in
                    Section(Dates.short(group.day)) {
                        ForEach(group.items) { expense in
                            Button {
                                editing = expense
                            } label: {
                                ExpenseRow(expense: expense)
                            }
                            .buttonStyle(.plain)
                            .swipeActions {
                                Button(role: .destructive) {
                                    store.delete(expense)
                                } label: {
                                    Label("Видалити", systemImage: "trash")
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Taison")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                }
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        editing = Expense(needsReview: false)
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                scanButton
            }
            .sheet(isPresented: $showScanner) {
                DocumentScanner(
                    onFinish: { pages in
                        showScanner = false
                        Task { await handleScan(pages) }
                    },
                    onCancel: { showScanner = false }
                )
                .ignoresSafeArea()
            }
            .sheet(item: $editing) { expense in
                ExpenseEditView(expense: expense)
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
            }
            .alert(
                "Не вдалося",
                isPresented: Binding(
                    get: { errorMessage != nil },
                    set: { if !$0 { errorMessage = nil } }
                )
            ) {
                Button("Зрозуміло", role: .cancel) { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    // MARK: - Частини екрана

    private var summary: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(Dates.monthTitle(Date()))
                .font(.caption)
                .foregroundStyle(.secondary)

            Text(Money.format(store.currentMonthTotal))
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .monospacedDigit()
                .contentTransition(.numericText())

            if store.needsReviewCount > 0 {
                Label(
                    "\(store.needsReviewCount) на перевірці",
                    systemImage: "exclamationmark.triangle.fill"
                )
                .font(.caption)
                .foregroundStyle(.orange)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 8)
    }

    private var scanButton: some View {
        Button {
            showScanner = true
        } label: {
            HStack {
                if status == .recognising {
                    ProgressView().tint(.white)
                    Text("Розпізнаю…")
                } else {
                    Image(systemName: "doc.text.viewfinder")
                    Text("Сканувати чек")
                }
            }
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 16))
            .foregroundStyle(.white)
        }
        .disabled(status == .recognising)
        .padding(.horizontal)
        .padding(.bottom, 8)
        .background(.bar)
    }

    // MARK: - Обробка скану

    private func handleScan(_ pages: [UIImage]) async {
        guard let first = pages.first else { return }

        status = .recognising
        defer { status = .idle }

        // 1. PDF — у теку застосунку і, якщо обрано, в теку iCloud Drive
        let pdf = PDFBuilder.makePDF(from: pages)
        let fileName = "chek-\(ISO8601DateFormatter().string(from: Date())).pdf"
        try? pdf.write(to: ExpenseStore.pdfURL(for: fileName), options: .atomic)

        do {
            try folder.save(pdf, named: fileName)
        } catch {
            errorMessage = error.localizedDescription
        }

        // 2. Розбір моделлю. Без ключа просто відкриваємо порожню картку —
        //    скан не пропадає, суму можна вписати руками.
        var draft = Expense(needsReview: true, pdfFileName: fileName)

        if !apiKey.isEmpty, let jpeg = PDFBuilder.jpegForAI(first) {
            do {
                let parser = ParserFactory.make(provider: provider, key: apiKey)
                let parsed = try await parser.parse(jpeg: jpeg)

                draft.merchant = parsed.merchant
                draft.amountCents = parsed.totalCents
                draft.category = parsed.category
                draft.date = parsed.date
                draft.note = parsed.documentKind == "document" ? parsed.summary : ""
            } catch {
                errorMessage = error.localizedDescription
            }
        }

        // 3. Людина звіряє — це і є сенс позначки needsReview
        editing = draft
    }
}

private struct ExpenseRow: View {
    let expense: Expense

    var body: some View {
        HStack(spacing: 12) {
            Text(expense.category.icon)
                .font(.title3)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(expense.merchant.isEmpty ? expense.category.title : expense.merchant)
                        .font(.body.weight(.medium))
                        .lineLimit(1)

                    if expense.needsReview {
                        Text("перевірити")
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(.orange.opacity(0.18), in: Capsule())
                            .foregroundStyle(.orange)
                    }
                }

                Text(expense.category.title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            Text(Money.format(expense.amountCents))
                .font(.body.weight(.semibold))
                .monospacedDigit()
        }
        .padding(.vertical, 2)
    }
}

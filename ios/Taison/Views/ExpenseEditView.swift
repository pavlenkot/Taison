import SwiftUI
import QuickLook

/// Картка витрати. Усе, що розпізнав AI, тут відкрито для правки —
/// саме заради цього скан і зберігається з позначкою «на перевірці».
@MainActor
struct ExpenseEditView: View {
    @EnvironmentObject private var store: ExpenseStore
    @Environment(\.dismiss) private var dismiss

    @State private var draft: Expense
    @State private var amountText: String
    @State private var previewURL: URL?

    init(expense: Expense) {
        _draft = State(initialValue: expense)
        _amountText = State(
            initialValue: expense.amountCents > 0 ? Money.input(expense.amountCents) : ""
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Сума") {
                    HStack {
                        TextField("0,00", text: $amountText)
                            .keyboardType(.decimalPad)
                            .font(.system(size: 28, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                        Text("€")
                            .font(.title2)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Деталі") {
                    TextField("Магазин", text: $draft.merchant)

                    Picker("Категорія", selection: $draft.category) {
                        ForEach(Category.allCases) { category in
                            Text("\(category.icon)  \(category.title)").tag(category)
                        }
                    }

                    DatePicker("Дата", selection: $draft.date, displayedComponents: .date)
                        .environment(\.locale, Locale(identifier: "uk_UA"))

                    TextField("Нотатка", text: $draft.note, axis: .vertical)
                        .lineLimit(1...4)
                }

                if let name = draft.pdfFileName {
                    Section("Скан") {
                        Button {
                            previewURL = ExpenseStore.pdfURL(for: name)
                        } label: {
                            Label("Переглянути PDF", systemImage: "doc.richtext")
                        }
                    }
                }

                if isExisting {
                    Section {
                        Button("Видалити", role: .destructive) {
                            store.delete(draft)
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(draft.needsReview ? "Звірте чек" : "Витрата")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Скасувати") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Зберегти") { save() }
                        .disabled(Money.cents(from: amountText) == nil)
                }
            }
            .quickLookPreview($previewURL)
        }
    }

    private var isExisting: Bool {
        store.expenses.contains { $0.id == draft.id }
    }

    private func save() {
        guard let cents = Money.cents(from: amountText), cents > 0 else { return }

        draft.amountCents = cents
        draft.needsReview = false

        if isExisting {
            store.update(draft)
        } else {
            store.add(draft)
        }
        dismiss()
    }
}

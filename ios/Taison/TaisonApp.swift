import SwiftUI

@main
@MainActor
struct TaisonApp: App {
    @StateObject private var store = ExpenseStore()
    @StateObject private var folder = ReceiptFolder()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
                .environmentObject(folder)
        }
    }
}

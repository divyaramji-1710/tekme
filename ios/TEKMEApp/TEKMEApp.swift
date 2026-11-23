// TEKMĒ host app (SwiftUI). STATUS: written on Windows, NEVER COMPILED OR RUN.
// The app explains how to enable the filter and lets the user paste a message to check it with the
// same compact on-device classifier the extension uses. It makes no network requests.

import SwiftUI

@main
struct TEKMEApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
    }
}

struct ContentView: View {
    @State private var text = ""
    @State private var result: TekmeResult?
    @State private var loadError: String?
    private let classifier: TekmeClassifier? = try? TekmeClassifier()

    var body: some View {
        NavigationStack {
            Form {
                Section("Check a message") {
                    TextEditor(text: $text).frame(minHeight: 120)
                        .accessibilityLabel("Message to check")
                    Button("Check on this iPhone") {
                        result = classifier?.classify(text)
                        if classifier == nil { loadError = "The on-device model could not be loaded." }
                    }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    if let r = result {
                        Label(r.isJunk ? "Likely scam — would be filtered as Junk" : "Not filtered",
                              systemImage: r.isJunk ? "exclamationmark.triangle.fill" : "checkmark.seal")
                            .foregroundStyle(r.isJunk ? .red : .green)
                        Text(String(format: "Calibrated scam probability: %.1f%%", r.probability * 100)).font(.footnote)
                    }
                    if let e = loadError { Text(e).foregroundStyle(.red) }
                }
                Section("Turn on automatic filtering") {
                    Text("Settings → Apps → Messages → Unknown & Spam → SMS Filtering → TEKMĒ")
                    Text("Only SMS/MMS from senders that are not in your contacts are checked. iMessages are never passed to filters.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section("Privacy") {
                    Text("Messages are classified on this iPhone. TEKMĒ has no network code and never sends message text anywhere.")
                        .font(.footnote)
                }
                Section("Accuracy (measured in Python, not on device)") {
                    Text("The filter uses a compact model tuned to wrongly filter at most about 1% of genuine messages on validation data; it therefore misses more scams than the full TEKMĒ web app. See docs/IOS_GUIDE.md.")
                        .font(.footnote)
                }
            }
            .navigationTitle("TEKMĒ")
        }
    }
}

import Foundation

struct GeminiParser: ReceiptParser {
    let apiKey: String
    var model: String = "gemini-2.5-flash"

    func parse(jpeg: Data) async throws -> ParsedReceipt {
        guard !apiKey.isEmpty else { throw ParserError.missingKey }

        var components = URLComponents(
            string: "https://generativelanguage.googleapis.com/v1beta/models/\(model):generateContent"
        )!
        components.queryItems = [URLQueryItem(name: "key", value: apiKey)]

        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 60

        let systemInstruction: [String: Any] = [
            "parts": [["text": ReceiptPrompt.system]],
        ]
        let imagePart: [String: Any] = [
            "inlineData": [
                "mimeType": "image/jpeg",
                "data": jpeg.base64EncodedString(),
            ] as [String: Any],
        ]
        let textPart: [String: Any] = ["text": ReceiptPrompt.user]
        let content: [String: Any] = [
            "role": "user",
            "parts": [imagePart, textPart],
        ]
        let generationConfig: [String: Any] = [
            "responseMimeType": "application/json",
            "responseSchema": ReceiptPrompt.jsonSchema(for: .gemini),
        ]
        let body: [String: Any] = [
            "systemInstruction": systemInstruction,
            "contents": [content],
            "generationConfig": generationConfig,
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let detail = String(data: data, encoding: .utf8) ?? "невідомо"
            throw ParserError.badResponse(String(detail.prefix(300)))
        }

        let envelope = try JSONDecoder().decode(GeminiResponse.self, from: data)
        guard let text = envelope.candidates.first?.content.parts.first?.text,
              let payload = text.data(using: .utf8)
        else {
            throw ParserError.emptyResult
        }

        return try JSONDecoder().decode(ParsedReceipt.self, from: payload)
    }

    private struct GeminiResponse: Decodable {
        struct Candidate: Decodable {
            struct Content: Decodable {
                struct Part: Decodable { let text: String? }
                let parts: [Part]
            }
            let content: Content
        }
        let candidates: [Candidate]
    }
}

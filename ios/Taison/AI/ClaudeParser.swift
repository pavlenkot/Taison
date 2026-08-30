import Foundation

struct ClaudeParser: ReceiptParser {
    let apiKey: String
    /// Типово найточніша модель. Дешевша приблизно вп'ятеро: claude-haiku-4-5
    var model: String = "claude-opus-5"

    func parse(jpeg: Data) async throws -> ParsedReceipt {
        guard !apiKey.isEmpty else { throw ParserError.missingKey }

        var request = URLRequest(url: URL(string: "https://api.anthropic.com/v1/messages")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        request.timeoutInterval = 90

        let source: [String: Any] = [
            "type": "base64",
            "media_type": "image/jpeg",
            "data": jpeg.base64EncodedString(),
        ]
        let imageBlock: [String: Any] = ["type": "image", "source": source]
        let textBlock: [String: Any] = ["type": "text", "text": ReceiptPrompt.user]
        let message: [String: Any] = [
            "role": "user",
            "content": [imageBlock, textBlock],
        ]
        let format: [String: Any] = [
            "type": "json_schema",
            "schema": ReceiptPrompt.jsonSchema(for: .claude),
        ]
        let body: [String: Any] = [
            "model": model,
            "max_tokens": 4000,
            "system": ReceiptPrompt.system,
            "messages": [message],
            "output_config": ["format": format],
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let detail = String(data: data, encoding: .utf8) ?? "невідомо"
            throw ParserError.badResponse(String(detail.prefix(300)))
        }

        let envelope = try JSONDecoder().decode(ClaudeResponse.self, from: data)

        // Модель могла думати перед відповіддю — беремо перший текстовий блок.
        guard let text = envelope.content.first(where: { $0.type == "text" })?.text,
              let payload = text.data(using: .utf8)
        else {
            throw ParserError.emptyResult
        }

        return try JSONDecoder().decode(ParsedReceipt.self, from: payload)
    }

    private struct ClaudeResponse: Decodable {
        struct Block: Decodable {
            let type: String
            let text: String?
        }
        let content: [Block]
    }
}

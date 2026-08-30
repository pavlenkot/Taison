import UIKit

enum PDFBuilder {
    /// A4 у пунктах.
    private static let pageSize = CGSize(width: 595, height: 842)
    private static let margin: CGFloat = 24

    static func makePDF(from images: [UIImage]) -> Data {
        let bounds = CGRect(origin: .zero, size: pageSize)
        let renderer = UIGraphicsPDFRenderer(bounds: bounds)

        return renderer.pdfData { context in
            for image in images {
                context.beginPage()

                let available = bounds.insetBy(dx: margin, dy: margin)
                let scale = min(
                    available.width / image.size.width,
                    available.height / image.size.height
                )
                let size = CGSize(
                    width: image.size.width * scale,
                    height: image.size.height * scale
                )
                let origin = CGPoint(
                    x: (bounds.width - size.width) / 2,
                    y: (bounds.height - size.height) / 2
                )
                image.draw(in: CGRect(origin: origin, size: size))
            }
        }
    }

    /// Зменшений JPEG для передавання моделі: менше трафіку і дешевший розбір.
    static func jpegForAI(_ image: UIImage, maxEdge: CGFloat = 1600) -> Data? {
        let longest = max(image.size.width, image.size.height)
        let scale = min(1, maxEdge / longest)
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)

        let renderer = UIGraphicsImageRenderer(size: size)
        let resized = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return resized.jpegData(compressionQuality: 0.85)
    }
}

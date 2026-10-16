import SwiftUI
import Vision
import AVFoundation

struct ProjectionPhoto: UIViewControllerRepresentable {
    let onPhoto: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController(); picker.sourceType = .camera; picker.cameraDevice = .rear; picker.delegate = context.coordinator; return picker
    }
    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}
    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        let parent: ProjectionPhoto
        init(_ parent: ProjectionPhoto) { self.parent = parent }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey:Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onPhoto(image) }; parent.dismiss()
        }
    }
}
struct ProjectionEvidence {
    static func recognize(_ image: UIImage) async throws -> String {
        // Render orientation into pixels before OCR. Never infer a film from faces or scenery.
        let size = CGSize(width: 1600, height: 1600 * image.size.height / image.size.width)
        let rendered = UIGraphicsImageRenderer(size: size).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        guard let cg = rendered.cgImage else { return "" }
        return try await Task.detached {
            let request = VNRecognizeTextRequest(); request.recognitionLevel = .accurate; request.usesLanguageCorrection = false
            try VNImageRequestHandler(cgImage: cg).perform([request])
            return (request.results ?? []).compactMap { observation -> String? in
                guard let candidate = observation.topCandidates(1).first, candidate.confidence >= 0.7 else { return nil }
                return String(candidate.string.prefix(180))
            }.prefix(12).joined(separator: "\n")
        }.value
    }
}
struct PhotoSummaryShare: UIViewControllerRepresentable {
    let image: UIImage
    let text: String
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: [text, image], applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

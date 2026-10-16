import Foundation

enum ListeningKind: String, Codable, CaseIterable {
    case meeting, movie
    var label: String { self == .meeting ? "Reunión" : "Película" }
}
enum ListeningState: String, Codable { case listening, paused, recorded, summaryPending, complete }
struct AudioChunk: Codable, Identifiable {
    var id: Int { seq }
    let seq: Int
    let filename: String
    let startSeconds: Double
    let durationSeconds: Double
    var transcript: String?
    var uploaded = false
}
struct ListeningNote: Codable, Identifiable {
    let id: String
    let accountID: String
    var conversationID: String?
    let kind: ListeningKind
    let title: String
    let startedAt: Date
    var state: ListeningState = .listening
    var chunks: [AudioChunk] = []
    var expectedChunks: Int?
    var summary: String?
    var photoFilename: String?
    var projectionText: String?
    var allChunksReady: Bool {
        guard let expectedChunks, expectedChunks > 0, chunks.count == expectedChunks else { return false }
        return chunks.sorted { $0.seq < $1.seq }.enumerated().allSatisfy { $0.offset == $0.element.seq && $0.element.uploaded }
    }
}
struct ConversationRef: Codable, Identifiable { let id: String; let title: String }
struct SummaryReply: Decodable { let status: String; let summary: String?; let processed: Int?; let total: Int? }

struct NoteFiles {
    let root: URL
    init(root: URL? = nil) throws {
        self.root = try root ?? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("AdmiritoNotes", isDirectory: true)
        try FileManager.default.createDirectory(at: self.root, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        var excluded = self.root; var values = URLResourceValues(); values.isExcludedFromBackup = true; try excluded.setResourceValues(values)
    }
    func directory(_ id: String) throws -> URL {
        let url = root.appendingPathComponent(id, isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]); return url
    }
    func save(_ note: ListeningNote) throws {
        try JSONEncoder().encode(note).write(to: directory(note.id).appendingPathComponent("session.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    func load() throws -> [ListeningNote] {
        try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).compactMap { dir in
            guard var note = try? JSONDecoder().decode(ListeningNote.self, from: Data(contentsOf: dir.appendingPathComponent("session.json"))) else { return nil }
            // A killed app cannot still be listening. Recover only completed, durable chunks.
            if note.state == .listening { note.state = .paused; note.expectedChunks = nil }
            for url in (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? [] where url.lastPathComponent.hasPrefix("chunk-") && url.pathExtension == "json" {
                if let chunk = try? JSONDecoder().decode(AudioChunk.self, from: Data(contentsOf: url)), !note.chunks.contains(where: { $0.seq == chunk.seq }) { note.chunks.append(chunk) }
            }
            note.chunks.sort { $0.seq < $1.seq }; return note
        }.sorted { $0.startedAt > $1.startedAt }
    }
}

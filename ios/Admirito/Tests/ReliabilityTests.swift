import XCTest
@testable import Admirito

@MainActor private final class SuspendedUploadService: AssistantService {
    var accountID: String? = "queue-test"
    var connected: Bool { accountID != nil }
    var suspended = false
    var continuation: CheckedContinuation<Void, Never>?
    var uploaded: [Int] = []
    var summaries = 0
    func disconnect() { accountID = nil }
    func beginPairing() async throws -> PairingChallenge { throw AssistantError.notLinked }
    func poll(_ challenge: PairingChallenge) async throws -> Bool { false }
    func conversation() async throws -> String { "conversation-test" }
    func register(_ note: ListeningNote) async throws {}
    func transcribe(_ file: URL) async throws -> String { "Audio captado" }
    func upload(_ chunk: AudioChunk, noteID: String) async throws {
        if chunk.seq == 0 && !suspended {
            suspended = true
            await withCheckedContinuation { continuation = $0 }
        }
        uploaded.append(chunk.seq)
    }
    func ask(_ text: String, conversation: String, requestID: String) async throws -> String { "Respuesta" }
    func summarize(_ note: ListeningNote) async throws -> SummaryReply {
        XCTAssertTrue(note.allChunksReady); summaries += 1
        return SummaryReply(status: "complete", summary: "Resumen del audio captado", processed: nil, total: nil)
    }
    func identifyFilm(_ note: ListeningNote, jpeg: Data) async throws -> FilmIdentification { FilmIdentification(status: "unknown", title: nil, evidence: [], message: "No identificada") }
}
@MainActor final class ReliabilityTests: XCTestCase {
    func testFinalChunkArrivingDuringUploadIsDrainedAndSummarizedWithoutManualRetry() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let files = try NoteFiles(root: root)
        var note = ListeningNote(id: UUID().uuidString.lowercased(), accountID: "queue-test", conversationID: "conversation-test", kind: .movie, title: "Prueba de cola", startedAt: Date(), state: .recorded)
        note.expectedChunks = 2
        note.chunks = [AudioChunk(seq: 0, filename: "first.wav", startSeconds: 0, durationSeconds: 25, transcript: "Primer fragmento")]
        try files.save(note)
        let service = SuspendedUploadService(), store = AssistantStore(service: service, noteFiles: files)
        store.retry()
        for _ in 0..<1000 { if service.continuation != nil { break }; await Task.yield() }
        XCTAssertNotNil(service.continuation); XCTAssertEqual(service.summaries, 0)
        store.append(AudioChunk(seq: 1, filename: "last.wav", startSeconds: 25, durationSeconds: 5, transcript: "Último fragmento"), to: note.id)
        service.continuation?.resume(); service.continuation = nil
        for _ in 0..<30 { if store.notes.first?.state == .complete { break }; try await Task.sleep(for: .milliseconds(200)) }
        XCTAssertEqual(service.uploaded, [0, 1]); XCTAssertEqual(service.summaries, 1)
        XCTAssertEqual(store.notes.first?.state, .complete)
        XCTAssertEqual(try files.load().first?.summary, "Resumen del audio captado")
        store.signOut()
    }
    func testBedtimeIsNotBackdatedToPhoneStationarySinceBeginningOfMovie() {
        let end = Date(timeIntervalSince1970: 1792274400)
        XCTAssertEqual(RestRules.bedtimeProposal(filmEnd: end, silenceEnded: false), end)
        XCTAssertEqual(RestRules.bedtimeProposal(filmEnd: end, silenceEnded: true), end.addingTimeInterval(-300))
    }
}

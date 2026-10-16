import XCTest
@testable import Admirito

@MainActor final class LiveServiceTests: XCTestCase {
    func testAccountLinkTranscriptionSummaryAndConversationUsingNativeNetworking() async throws {
        guard ProcessInfo.processInfo.environment["ADMIRITO_LIVE_TESTS"] == "1" else { throw XCTSkip("Requires explicit live QA run and account approval from the test controller.") }
        let api = APIClient(); api.disconnect()
        let challenge = try await api.beginPairing()
        // Public one-time approval code only. The device secret never leaves this process.
        FileHandle.standardOutput.write(Data("ADMIRITO_PAIR_CODE=\(challenge.code)\n".utf8))
        var paired = false
        for _ in 0..<35 { try await Task.sleep(for: .seconds(3)); if try await api.poll(challenge) { paired = true; break } }
        XCTAssertTrue(paired); guard paired else { return }
        let restored = APIClient(); XCTAssertEqual(restored.accountID, api.accountID)
        let conversation = try await restored.newConversation()
        var note = ListeningNote(id: UUID().uuidString.lowercased(), accountID: try XCTUnwrap(restored.accountID), conversationID: conversation, kind: .meeting, title: "Prueba técnica nativa: audio sintético", startedAt: Date(), state: .recorded)
        do {
            let file = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "meeting-proof", withExtension: "wav"))
            let text = try await restored.transcribe(file)
            XCTAssertTrue(text.lowercased().contains("informe"))
            note.expectedChunks = 1
            try await restored.register(note)
            let chunk = AudioChunk(seq: 0, filename: "meeting-proof.wav", startSeconds: 0, durationSeconds: 8, transcript: text)
            try await restored.upload(chunk, noteID: note.id)
            var result = try await restored.summarize(note)
            for _ in 0..<10 where result.status != "complete" { try await Task.sleep(for: .seconds(3)); result = try await restored.summarize(note) }
            XCTAssertEqual(result.status, "complete"); XCTAssertTrue(result.summary?.lowercased().contains("informe") == true)
            let reply = try await restored.ask("¿Qué documento se decidió enviar? Responde brevemente basándote en el resumen anterior.", conversation: conversation, requestID: UUID().uuidString.lowercased())
            XCTAssertTrue(reply.lowercased().contains("informe"))
            try await restored.deleteNote(note.id); try await restored.deleteConversation(conversation); restored.disconnect(); api.disconnect()
        } catch {
            try? await restored.deleteNote(note.id); try? await restored.deleteConversation(conversation); restored.disconnect(); api.disconnect(); throw error
        }
    }
}

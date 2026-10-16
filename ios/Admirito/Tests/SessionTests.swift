import XCTest
@testable import Admirito
final class SessionTests: XCTestCase {
    func testSummaryRequiresAllContiguousUploadedChunks() {
        var note = ListeningNote(id: UUID().uuidString.lowercased(), accountID: "account-a", kind: .meeting, title: "Reunión", startedAt: Date(), state: .recorded)
        note.expectedChunks = 2
        note.chunks = [AudioChunk(seq: 0, filename: "0.wav", startSeconds: 0, durationSeconds: 25, transcript: "Hola", uploaded: true)]
        XCTAssertFalse(note.allChunksReady)
        note.chunks.append(AudioChunk(seq: 2, filename: "2.wav", startSeconds: 50, durationSeconds: 25, transcript: "Hola", uploaded: true)); XCTAssertFalse(note.allChunksReady)
        note.chunks[1] = AudioChunk(seq: 1, filename: "1.wav", startSeconds: 25, durationSeconds: 25, transcript: "", uploaded: false); XCTAssertFalse(note.allChunksReady)
        note.chunks[1].uploaded = true; XCTAssertTrue(note.allChunksReady)
    }
    func testKilledRecordingRecoversCompletedSidecarsWithoutClaimingItIsListening() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let files = try NoteFiles(root: root)
        let note = ListeningNote(id: UUID().uuidString.lowercased(), accountID: "account-a", kind: .movie, title: "Película", startedAt: Date())
        try files.save(note)
        let chunk = AudioChunk(seq: 0, filename: "chunk-00000.wav", startSeconds: 0, durationSeconds: 25)
        try JSONEncoder().encode(chunk).write(to: files.directory(note.id).appendingPathComponent("chunk-00000.json"))
        let recovered = try XCTUnwrap(files.load().first)
        XCTAssertEqual(recovered.state, .paused); XCTAssertEqual(recovered.chunks.count, 1); XCTAssertEqual(recovered.accountID, "account-a")
    }
    func testUploadedManifestWinsOverStaleSidecar() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString); defer { try? FileManager.default.removeItem(at: root) }
        let files = try NoteFiles(root: root)
        let sidecar = AudioChunk(seq: 0, filename: "chunk-00000.wav", startSeconds: 0, durationSeconds: 25)
        var note = ListeningNote(id: UUID().uuidString.lowercased(), accountID: "a", kind: .meeting, title: "Prueba", startedAt: Date())
        var uploaded = sidecar; uploaded.transcript = "Texto guardado"; uploaded.uploaded = true; note.chunks = [uploaded]; try files.save(note)
        try JSONEncoder().encode(sidecar).write(to: files.directory(note.id).appendingPathComponent("chunk-00000.json"))
        XCTAssertEqual(try files.load()[0].chunks[0].transcript, "Texto guardado"); XCTAssertTrue(try files.load()[0].chunks[0].uploaded)
    }
}

import AVFoundation
extension SessionTests {
    func testNativeAudioConversionSegmentsDurableMonoAudioWithoutLosingFrames() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let input = try XCTUnwrap(AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 48000, channels: 1, interleaved: false))
        let writer = try AudioChunkWriter(input: input, directory: root, sequence: 0, offset: 10)
        let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: input, frameCapacity: 4800)); buffer.frameLength = 4800
        for frame in 0..<4800 { buffer.floatChannelData![0][frame] = Float(sin(Double(frame) / 48000 * 440 * 2 * .pi)) * 0.1 }
        var chunks: [AudioChunk] = []
        for _ in 0..<600 { if let chunk = try writer.consume(buffer) { chunks.append(chunk) } }
        let (last, expected) = try writer.finish(); if let last { chunks.append(last) }
        XCTAssertEqual(expected, 3); XCTAssertEqual(chunks.count, 3)
        XCTAssertEqual(chunks.map(\.durationSeconds).reduce(0, +), 60, accuracy: 0.05)
        XCTAssertEqual(chunks.first?.startSeconds ?? 0, 10, accuracy: 0.001)
        for chunk in chunks {
            let audio = try AVAudioFile(forReading: root.appendingPathComponent(chunk.filename))
            XCTAssertEqual(audio.fileFormat.sampleRate, 16000); XCTAssertEqual(audio.fileFormat.channelCount, 1)
            let size = try root.appendingPathComponent(chunk.filename).resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            XCTAssertLessThan(size, 3_000_000)
            XCTAssertTrue(FileManager.default.fileExists(atPath: root.appendingPathComponent(String(format: "chunk-%05d.json", chunk.seq)).path))
        }
    }
}

extension SessionTests {
    func testSilenceStopUsesConsecutiveAudioAndResetsWhenSoundReturns() {
        var monitor = SilenceMonitor()
        XCTAssertFalse(monitor.consume(rms: 0, duration: 299))
        XCTAssertFalse(monitor.consume(rms: 500, duration: 1))
        XCTAssertEqual(monitor.seconds, 0)
        XCTAssertFalse(monitor.consume(rms: 20, duration: 299))
        XCTAssertTrue(monitor.consume(rms: 20, duration: 1))
        XCTAssertFalse(monitor.consume(rms: 0, duration: 10))
    }
    func testQuietAudibleSoundDoesNotCountAsSilence() {
        var monitor = SilenceMonitor()
        XCTAssertFalse(monitor.consume(rms: 105, duration: 600))
        XCTAssertFalse(monitor.stopped)
    }
}

import UIKit
extension SessionTests {
    @MainActor func testProjectionOCRReadsVisibleTitleWithoutInventingIdentification() async throws {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 1000, height: 500)).image { context in
            UIColor.white.setFill(); context.fill(CGRect(x: 0, y: 0, width: 1000, height: 500))
            ("CINEMA TEST 2049" as NSString).draw(at: CGPoint(x: 70, y: 190), withAttributes: [.font: UIFont.systemFont(ofSize: 65), .foregroundColor: UIColor.black])
        }
        let text = try await ProjectionEvidence.recognize(image)
        XCTAssertTrue(text.contains("CINEMA TEST 2049")); XCTAssertFalse(text.contains("Blade Runner"))
    }
    func testProjectionAttachmentSurvivesNoteReload() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString); defer { try? FileManager.default.removeItem(at: root) }
        let files = try NoteFiles(root: root)
        var note = ListeningNote(id: UUID().uuidString, accountID: "a", kind: .movie, title: "TV", startedAt: Date(), state: .complete)
        note.photoFilename = "projection.jpg"; note.projectionText = "Texto sin verificar"; note.summary = "Extracto"
        try files.save(note)
        let restored = try XCTUnwrap(files.load().first)
        XCTAssertEqual(restored.photoFilename, "projection.jpg"); XCTAssertEqual(restored.projectionText, "Texto sin verificar"); XCTAssertEqual(restored.summary, "Extracto")
    }
}

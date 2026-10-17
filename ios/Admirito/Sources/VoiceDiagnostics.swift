import Foundation

/// Debug-only acoustic and lifecycle counters. Never stores audio or words.
@MainActor enum VoiceDiagnostics {
    static func record(_ event: String, _ fields: [String: String] = [:]) {
        #if DEBUG
        let url = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("admirito-voice-qa.jsonl")
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        var row = fields; row["event"] = event; row["time"] = ISO8601DateFormatter().string(from: Date())
        guard let data = try? JSONSerialization.data(withJSONObject: row, options: [.sortedKeys]) else { return }
        if ((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) > 100_000 { try? Data().write(to: url) }
        if !FileManager.default.fileExists(atPath: url.path) { FileManager.default.createFile(atPath: url.path, contents: nil) }
        if let file = try? FileHandle(forWritingTo: url) { defer { try? file.close() }; _ = try? file.seekToEnd(); try? file.write(contentsOf: data + Data([10])) }
        #endif
    }
}

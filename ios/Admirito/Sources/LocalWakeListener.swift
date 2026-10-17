import AVFoundation
import Speech

/// New local speech engine for iOS 26+. No ambient recording is written to disk.
@available(iOS 26, *)
@MainActor final class LocalWakeListener {
    private var engine: AVAudioEngine?
    private var analyzer: SpeechAnalyzer?
    private var results: Task<Void, Never>?
    private var continuation: AsyncStream<AnalyzerInput>.Continuation?
    private var stopped = false

    func start(words: @escaping (String) -> Void, failed: @escaping () -> Void) async throws {
        VoiceDiagnostics.record("listener_start", ["command": "false"])
        guard SpeechTranscriber.isAvailable, let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: "es-ES")) else {
            throw AssistantError.recording("Reconocimiento local no disponible")
        }
        let transcriber = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
        try await AssetInventory.reserve(locale: locale)
        if let download = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) { try await download.downloadAndInstall() }
        guard !stopped else { throw CancellationError() }
        let analyzer = SpeechAnalyzer(modules: [transcriber], options: .init(priority: .userInitiated, modelRetention: .lingering)); self.analyzer = analyzer
        guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else { throw AssistantError.recording("Formato de voz no disponible") }
        try await analyzer.prepareToAnalyze(in: format)
        let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream(bufferingPolicy: .bufferingNewest(100))
        self.continuation = continuation
        results = Task {
            do {
                for try await result in transcriber.results {
                    guard !Task.isCancelled else { return }
                    let text = String(result.text.characters)
                    VoiceDiagnostics.record("result", ["chars": String(text.count), "final": String(result.isFinal)])
                    words(text)
                }
            } catch { if !Task.isCancelled { VoiceDiagnostics.record("analysis_error", ["domain": (error as NSError).domain, "code": String((error as NSError).code)]); failed() } }
        }
        let context = AnalysisContext(); context.contextualStrings[.general] = ["Admirito"]
        try await analyzer.setContext(context)
        try await analyzer.start(inputSequence: stream)
        guard !stopped else { throw CancellationError() }
        let engine = AVAudioEngine()
        let input = engine.inputNode
        let source = input.outputFormat(forBus: 0)
        guard source.sampleRate > 0, source.channelCount > 0 else { throw AssistantError.recording("Micrófono no disponible") }
        guard let converter = AVAudioConverter(from: source, to: format) else { throw AssistantError.recording("Conversión de voz no disponible") }
        var frames = 0
        var peak: Float = -160
        input.installTap(onBus: 0, bufferSize: 4096, format: source) { buffer, _ in
            frames += 1
            if let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 {
                var energy: Float = 0
                for i in 0..<Int(buffer.frameLength) { energy += samples[i] * samples[i] }
                peak = max(peak, 10 * log10(max(1e-12, energy / Float(buffer.frameLength))))
            }
            if frames % 12 == 0 {
                let count = frames; let db = Int(peak)
                Task { @MainActor in VoiceDiagnostics.record("pcm", ["frames": String(count), "peakDB": String(db), "command": "false"]) }
            }
            let capacity = AVAudioFrameCount(ceil(Double(buffer.frameLength) * format.sampleRate / source.sampleRate)) + 64
            guard let converted = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return }
            var fed = false; var error: NSError?
            let status = converter.convert(to: converted, error: &error) { _, state in
                if fed { state.pointee = .noDataNow; return nil }
                fed = true; state.pointee = .haveData; return buffer
            }
            if status != .error && converted.frameLength > 0 { continuation.yield(AnalyzerInput(buffer: converted)) }
        }
        self.engine = engine
        engine.prepare(); try engine.start()
        VoiceDiagnostics.record("engine_start", ["command": "false", "sourceRate": String(source.sampleRate), "targetRate": String(format.sampleRate)])
    }
    func stop() {
        VoiceDiagnostics.record("listener_stop")
        stopped = true
        engine?.stop(); engine?.inputNode.removeTap(onBus: 0); engine = nil
        continuation?.finish(); continuation = nil
        results?.cancel(); results = nil
        if let analyzer { Task { await analyzer.cancelAndFinishNow() } }; analyzer = nil
    }
}

import AVFoundation
import Foundation

final class AudioChunkWriter: @unchecked Sendable {
    private let lock = NSLock()
    private let converter: AVAudioConverter
    private let target: AVAudioFormat
    private let directory: URL
    private let baseOffset: Double
    private var file: AVAudioFile?
    private var filename = ""
    private var frames: AVAudioFramePosition = 0
    private var totalFrames: AVAudioFramePosition = 0
    private var peak = 0
    private(set) var nextSequence: Int
    init(input: AVAudioFormat, directory: URL, sequence: Int, offset: Double) throws {
        guard let target = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true), let converter = AVAudioConverter(from: input, to: target) else { throw AssistantError.recording("No se ha podido preparar el formato del micrófono.") }
        self.target = target; self.converter = converter; self.directory = directory; self.nextSequence = sequence; self.baseOffset = offset
    }
    func consume(_ input: AVAudioPCMBuffer) throws -> AudioChunk? {
        lock.lock(); defer { lock.unlock() }
        guard nextSequence < 1440 else { return nil }
        let capacity = AVAudioFrameCount(ceil(Double(input.frameLength) * target.sampleRate / input.format.sampleRate)) + 64
        guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { throw AssistantError.recording("No se ha podido preparar el audio.") }
        var supplied = false; var error: NSError?
        converter.convert(to: output, error: &error) { _, status in
            if supplied { status.pointee = .noDataNow; return nil }
            supplied = true; status.pointee = .haveData; return input
        }
        if let error { throw error }; if output.frameLength == 0 { return nil }
        if file == nil {
            filename = String(format: "chunk-%05d.wav", nextSequence)
            let url = directory.appendingPathComponent(filename)
            FileManager.default.createFile(atPath: url.path, contents: nil, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
            file = try AVAudioFile(forWriting: url, settings: target.settings, commonFormat: .pcmFormatInt16, interleaved: true)
        }
        if let samples = output.int16ChannelData?[0] { for frame in 0..<Int(output.frameLength) { peak = max(peak, abs(Int(samples[frame]))) } }
        try file?.write(from: output); frames += AVAudioFramePosition(output.frameLength)
        return frames >= 25 * 16000 ? try finishLocked() : nil
    }
    func finish() throws -> (AudioChunk?, Int) {
        lock.lock(); defer { lock.unlock() }; let chunk = try finishLocked(); return (chunk, nextSequence)
    }
    private func finishLocked() throws -> AudioChunk? {
        guard file != nil, frames > 0 else { return nil }; file = nil
        let chunk = AudioChunk(seq: nextSequence, filename: filename, startSeconds: baseOffset + Double(totalFrames) / 16000, durationSeconds: Double(frames) / 16000, transcript: peak < 8 ? "" : nil)
        // Independent sidecar survives termination between closing audio and updating the UI manifest.
        try JSONEncoder().encode(chunk).write(to: directory.appendingPathComponent(String(format: "chunk-%05d.json", nextSequence)), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        nextSequence += 1; totalFrames += frames; frames = 0; peak = 0; return chunk
    }
}
@MainActor final class AudioCapture {
    private var engine: AVAudioEngine?
    private var writer: AudioChunkWriter?
    private var interruption: NSObjectProtocol?
    private var routeChange: NSObjectProtocol?
    var onChunk: ((AudioChunk) -> Void)?
    var onInterruption: ((String) -> Void)?
    var routeName: String { AVAudioSession.sharedInstance().currentRoute.inputs.map(\.portName).joined(separator: ", ") }
    init() {
        interruption = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt, AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
            Task { @MainActor in self?.onInterruption?("La escucha se ha pausado por una llamada u otra interrupción. Puedes reanudarla.") }
        }
        routeChange = NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt, AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
            Task { @MainActor in self?.onInterruption?("El micrófono conectado ha cambiado. Revisa la entrada y reanuda la escucha.") }
        }
    }
    func start(directory: URL, sequence: Int, offset: Double) async throws {
        let allowed = await AVAudioApplication.requestRecordPermission()
        guard allowed else { throw AssistantError.recording("Permite el micrófono en Ajustes para iniciar la escucha.") }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .measurement, options: [.mixWithOthers, .allowBluetoothHFP, .defaultToSpeaker])
        try session.setActive(true)
        do {
            let engine = AVAudioEngine(); let input = engine.inputNode; let format = input.outputFormat(forBus: 0)
            guard format.channelCount > 0, format.sampleRate > 0 else { throw AssistantError.recording("No hay un micrófono disponible.") }
            let writer = try AudioChunkWriter(input: format, directory: directory, sequence: sequence, offset: offset)
            let handler = self.onChunk
            let completed: @Sendable (AudioChunk) -> Void = { chunk in Task { @MainActor in handler?(chunk) } }
            let failed: @Sendable () -> Void = { [weak self] in Task { @MainActor in self?.onInterruption?("No se ha podido seguir guardando el audio. La escucha se ha pausado.") } }
            input.installTap(onBus: 0, bufferSize: 2048, format: format) { buffer, _ in
                do { if let chunk = try writer.consume(buffer) { completed(chunk) } } catch { failed() }
            }
            engine.prepare(); try engine.start(); self.writer = writer; self.engine = engine
        } catch { try? session.setActive(false, options: .notifyOthersOnDeactivation); throw error }
    }
    func stop() throws -> (AudioChunk?, Int) {
        engine?.inputNode.removeTap(onBus: 0); engine?.stop(); engine = nil
        defer { writer = nil; try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
        return try writer?.finish() ?? (nil, 0)
    }
}

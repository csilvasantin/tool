import AVFoundation
import SwiftUI

/// Explicit, short command recording using the same authenticated transcriber
/// as listening sessions. It never creates a note or executes a command.
@MainActor final class CommandDictation: ObservableObject {
    @Published private(set) var listening = false
    @Published private(set) var starting = false
    @Published private(set) var processing = false
    @Published private(set) var transcript = ""
    @Published private(set) var status = ""
    @Published private(set) var level: Double = 0
    private let service: any AssistantService
    private var recorder: AVAudioRecorder?
    private var audioURL: URL?
    private var meter: Task<Void, Never>?
    private var generation = UUID()
    private var ownsSession = false
    private var interruption: NSObjectProtocol?
    private var peakDB: Float = -160

    init(service: (any AssistantService)? = nil) {
        self.service = service ?? APIClient()
        interruption = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) == AVAudioSession.InterruptionType.began.rawValue else { return }
            Task { @MainActor in self?.cancel(); self?.status = "Dictado interrumpido. No se ha enviado ninguna orden." }
        }
    }
    deinit { if let interruption { NotificationCenter.default.removeObserver(interruption) } }

    func start() async {
        guard !listening, !starting, !processing else { return }
        cancel(); let id = UUID(); generation = id
        starting = true; transcript = ""; level = 0; peakDB = -160; status = "Preparando el micrófono…"
        defer { if generation == id { starting = false } }
        let allowed = await AVAudioApplication.requestRecordPermission()
        guard generation == id else { return }
        guard allowed else { status = "Permite el micrófono de Admirito en Ajustes para dictar."; return }
        guard service.connected else { status = "Vincula tu cuenta de Admirito para transcribir la orden."; return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
            try session.setActive(true); ownsSession = true
            if let input = session.availableInputs?.first(where: { $0.portType == .builtInMic }) { try session.setPreferredInput(input) }
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("admirito-command-\(UUID().uuidString).wav")
            audioURL = url
            FileManager.default.createFile(atPath: url.path, contents: nil, attributes: [.protectionKey: FileProtectionType.complete])
            var values = URLResourceValues(); values.isExcludedFromBackup = true; var protectedURL = url; try protectedURL.setResourceValues(values)
            let recorder = try AVAudioRecorder(url: url, settings: [
                AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 16000,
                AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16,
                AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false
            ])
            recorder.isMeteringEnabled = true
            guard recorder.prepareToRecord(), recorder.record() else { throw AssistantError.recording("No se ha podido abrir el micrófono.") }
            self.recorder = recorder; listening = true
            let route = session.currentRoute.inputs.map(\.portName).joined(separator: ", ")
            status = "Escuchando · \(route). Di: tour Starbucks México."
            meter = Task { [weak self] in
                for _ in 0..<150 {
                    try? await Task.sleep(for: .milliseconds(200))
                    guard !Task.isCancelled, let self, self.generation == id, let recorder = self.recorder else { return }
                    recorder.updateMeters(); self.peakDB = max(self.peakDB, recorder.peakPower(forChannel: 0))
                    self.level = min(1, pow(10, Double(recorder.averagePower(forChannel: 0)) / 20) * 12)
                }
                self?.stop()
            }
        } catch { cancel(); status = "No se ha podido iniciar el dictado: \(error.localizedDescription)" }
    }
    func stop() {
        guard listening, let recorder, let url = audioURL else { return }
        let id = generation; let duration = recorder.currentTime
        recorder.updateMeters(); peakDB = max(peakDB, recorder.peakPower(forChannel: 0))
        endCapture(); processing = true
        status = "Transcribiendo la orden…"
        Task {
            defer {
                try? FileManager.default.removeItem(at: url)
                if generation == id { audioURL = nil; processing = false }
            }
            do {
                guard duration >= 0.3, peakDB > -70 else {
                    if generation == id { status = "No he recibido sonido suficiente. No se ha enviado ninguna orden." }; return
                }
                let text = try await service.transcribe(url).trimmingCharacters(in: .whitespacesAndNewlines)
                guard generation == id else { return }
                transcript = text
                status = text.isEmpty ? "No he reconocido palabras. No se ha enviado ninguna orden." : "Dictado listo. Revisa la orden y pulsa Ejecutar."
            } catch {
                guard generation == id else { return }
                status = "No se ha podido transcribir la orden. Reintenta el dictado; no se ha ejecutado nada."
            }
        }
    }
    private func endCapture() {
        meter?.cancel(); meter = nil; recorder?.stop(); recorder = nil
        listening = false; starting = false; level = 0
        if ownsSession {
            ownsSession = false
            try? AVAudioSession.sharedInstance().setPreferredInput(nil)
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
    func cancel() {
        let wasActive = listening || starting || processing
        generation = UUID(); endCapture(); processing = false
        if let url = audioURL { try? FileManager.default.removeItem(at: url) }; audioURL = nil
        if wasActive { status = "Dictado cancelado. No se ha enviado ninguna orden." }
    }
}

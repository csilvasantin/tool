import AVFoundation
import Speech
import SwiftUI

/// Foreground-only, opt-in wake recognition. Ambient audio stays on this device;
/// unsupported local speech never falls back to a network recognizer.
@MainActor final class WakeWord: ObservableObject {
    @Published private(set) var enabled = false
    @Published private(set) var listening = false
    @Published private(set) var starting = false
    @Published private(set) var status = "Activación por voz apagada"
    @Published private(set) var detections = 0
    private var recognizer: SFSpeechRecognizer?
    private var modern: AnyObject?
    private var engine: AVAudioEngine?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var generation = UUID()
    private var beganAt = Date()
    private var ownsSession = false

    init() { enabled = UserDefaults.standard.bool(forKey: "admirito.wakeWordEnabled") }

    static func containsWakeWord(_ text: String) -> Bool {
        text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "es"))
            .split(whereSeparator: { !$0.isLetter }).contains("admirito")
    }
    func toggle() async {
        if enabled { enabled = false; UserDefaults.standard.set(false, forKey: "admirito.wakeWordEnabled"); pause(); status = "Activación por voz apagada" }
        else { enabled = true; UserDefaults.standard.set(true, forKey: "admirito.wakeWordEnabled"); await resume() }
    }
    func pause() {
        generation = UUID()
        if #available(iOS 26, *) { (modern as? LocalWakeListener)?.stop(); modern = nil }
        task?.cancel(); task = nil; request?.endAudio(); request = nil
        if let engine { engine.stop(); engine.inputNode.removeTap(onBus: 0) }
        engine = nil; recognizer = nil; listening = false; starting = false
        if ownsSession {
            ownsSession = false
            try? AVAudioSession.sharedInstance().setPreferredInput(nil)
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
    func resume() async {
        guard enabled, !starting else { return }
        if listening {
            if modern != nil { return }
            guard Date().timeIntervalSince(beganAt) > 45 else { return }
            pause()
        }
        starting = true; let id = UUID(); generation = id
        defer { if generation == id { starting = false } }
        let allowed = await AVAudioApplication.requestRecordPermission()
        let authorization = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
        }
        guard generation == id, enabled else { return }
        guard allowed, authorization == .authorized else {
            fail("Permite el micrófono y reconocimiento de voz en Ajustes para activar Admirito."); return
        }
        if #available(iOS 26, *) {
            status = "Preparando detección local de Admirito…"
            let listener = LocalWakeListener(); modern = listener
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
                try session.setActive(true); ownsSession = true
                if let input = session.availableInputs?.first(where: { $0.portType == .builtInMic }) { try session.setPreferredInput(input) }
                try await listener.start(words: { [weak self] text in
                    guard let self, self.generation == id, self.enabled else { return }
                    if Self.containsWakeWord(text) {
                        self.pause(); self.status = "Admirito activado. Di tu orden."; self.detections += 1
                    }
                }, failed: { [weak self] in
                    guard let self, self.generation == id else { return }
                    self.fail("La detección local se ha detenido. Mantén pulsada la nube o reactiva Admirito.")
                })
                guard generation == id, enabled else { listener.stop(); return }
                listening = true; beganAt = Date(); status = "Micrófono local activo · di «Hola, Admirito»"
            } catch { if generation == id { fail("No se ha podido preparar la detección local. Mantén pulsada la nube para hablar.") } }
            return
        }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "es-ES")), recognizer.isAvailable, recognizer.supportsOnDeviceRecognition else {
            fail("La activación local no está disponible en este iPhone. Puedes mantener pulsada la nube."); return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
            try session.setActive(true); ownsSession = true
            if let input = session.availableInputs?.first(where: { $0.portType == .builtInMic }) { try session.setPreferredInput(input) }
            self.recognizer = recognizer
            let engine = AVAudioEngine()
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.requiresOnDeviceRecognition = true
            request.shouldReportPartialResults = true
            request.contextualStrings = ["Admirito"]
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else { throw AssistantError.recording("Micrófono no disponible") }
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }
            self.engine = engine; self.request = request
            task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                Task { @MainActor in
                    guard let self, self.generation == id, self.enabled else { return }
                    if let result, Self.containsWakeWord(result.bestTranscription.formattedString) {
                        self.pause(); self.status = "Admirito activado. Di tu orden."; self.detections += 1
                    } else if error != nil {
                        self.fail("La activación local se ha detenido. Puedes reactivarla o mantener pulsada la nube.")
                    } else if result?.isFinal == true { self.pause() }
                }
            }
            engine.prepare(); try engine.start()
            listening = true; beganAt = Date(); status = "Micrófono local activo · di «Hola, Admirito»"
        } catch { fail("No se ha podido activar la palabra Admirito. Mantén pulsada la nube para hablar.") }
    }
    private func fail(_ message: String) { enabled = false; UserDefaults.standard.set(false, forKey: "admirito.wakeWordEnabled"); pause(); status = message }
}

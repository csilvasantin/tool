import AVFoundation
import SwiftUI

/// Brief mascot reply; capture resumes only after speech finishes. Cancellation
/// invalidates the utterance before stopping it, so a stale delegate cannot open mic.
@MainActor final class WakeFeedback: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    @Published private(set) var speaking = false
    @Published private(set) var lastReplyCompleted = false
    @Published private(set) var voiceName = "Español"
    private var synthesizer: AVSpeechSynthesizer?
    private var active: AVSpeechUtterance?
    private var completion: (() -> Void)?
    private var watchdog: Task<Void, Never>?
    override init() { super.init() }

    func reply(_ text: String = "¡Aquí estoy! Te escucho.", completion: @escaping () -> Void = {}) {
        cancel(); lastReplyCompleted = false
        let voices = AVSpeechSynthesisVoice.speechVoices()
        let voice = voices.filter { $0.language == "es-MX" }.sorted { $0.quality.rawValue > $1.quality.rawValue }.first
            ?? voices.filter { $0.language == "es-ES" }.sorted { $0.quality.rawValue > $1.quality.rawValue }.first
            ?? AVSpeechSynthesisVoice(language: "es-ES")
        let utterance = AVSpeechUtterance(string: String(text.prefix(1200)))
        utterance.voice = voice; utterance.pitchMultiplier = 1.22; utterance.rate = 0.49; utterance.volume = 1
        voiceName = voice?.name ?? "Español"
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
            try session.setActive(true)
        } catch { completion(); return }
        self.completion = completion; active = utterance; speaking = true
        let synthesizer = AVSpeechSynthesizer(); synthesizer.delegate = self
        self.synthesizer = synthesizer; synthesizer.speak(utterance)
        VoiceDiagnostics.record("feedback_start", ["voice": voiceName])
        watchdog = Task { [weak self, weak utterance] in
            try? await Task.sleep(for: .seconds(max(10, Double(text.count) / 8 + 5)))
            guard !Task.isCancelled, let self, let utterance, self.active === utterance else { return }
            let callback = self.completion; self.cancel(); callback?()
        }
    }
    func cancel() {
        active = nil; completion = nil; watchdog?.cancel(); watchdog = nil
        let old = synthesizer; synthesizer = nil; old?.stopSpeaking(at: .immediate)
        if speaking { speaking = false; try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in
            guard self.synthesizer === synthesizer else { return }
            VoiceDiagnostics.record("feedback_finish")
            let callback = self.completion
            self.synthesizer = nil; self.lastReplyCompleted = true; self.active = nil; self.completion = nil; self.speaking = false; self.watchdog?.cancel(); self.watchdog = nil
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            callback?()
        }
    }
}

import AVFoundation

@MainActor final class SpeechOutput: NSObject, AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()
    private var current: AVSpeechUtterance?
    private var ownsSession = false
    override init() { super.init(); synthesizer.delegate = self }
    func speak(_ text: String) throws {
        stop()
        let session = AVAudioSession.sharedInstance(); try session.setCategory(.playback, mode: .spokenAudio, options: [.mixWithOthers]); try session.setActive(true); ownsSession = true
        let utterance = AVSpeechUtterance(string: text); utterance.voice = AVSpeechSynthesisVoice(language: "es-ES"); current = utterance; synthesizer.speak(utterance)
    }
    func stop() {
        current = nil; synthesizer.stopSpeaking(at: .immediate)
        if ownsSession { ownsSession = false; try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
    }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let completed = ObjectIdentifier(utterance)
        Task { @MainActor in
            guard self.current.map(ObjectIdentifier.init) == completed, self.ownsSession else { return }
            self.current = nil; self.ownsSession = false
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
}

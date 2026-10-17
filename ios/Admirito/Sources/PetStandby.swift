import SwiftUI
import UIKit

enum StandbyRules {
    static func shouldShow(lastInteraction: Date, now: Date, busy: Bool) -> Bool {
        !busy && now.timeIntervalSince(lastInteraction) >= 30
    }
    // Only explicitly named public tours may auto-run after releasing the pet.
    // Everything else remains editable for the existing Expert permission flow.
    static func tourCommand(_ speech: String) -> String? {
        let text = speech.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "es"))
            .components(separatedBy: .whitespacesAndNewlines.union(.punctuationCharacters)).filter { !$0.isEmpty }.joined(separator: " ")
        let prefixes = ["lanza el tour de ", "inicia el tour de ", "lanza el tour ", "inicia el tour ", "start the tour of ", "start the tour ", "tour "]
        guard let prefix = prefixes.first(where: { text.hasPrefix($0) }) else { return nil }
        let target = String(text.dropFirst(prefix.count)).trimmingCharacters(in: .whitespaces)
        let known = ["starbucks mexico", "alsea mexico", "altadis", "altadis espana", "dooh total"]
        guard known.contains(target) else { return nil }
        return "/tour " + target
    }
}

@MainActor final class PetStandby: ObservableObject {
    @Published var gaze = CGPoint.zero
    @Published var showing = false
    @Published var holding = false
    @Published var awaitingCommand = false
    @Published var message = "Mantén pulsado para hablar"
    private(set) var lastInteraction = Date()
    func interact() { lastInteraction = Date() }
    func wake() { showing = false; interact() }
}

/// UIControl delivers the release/cancellation even when a finger moves off the
/// cloud. Accessibility activation offers a start/stop alternative to holding.
struct HoldToTalkSurface: UIViewRepresentable {
    let active: Bool
    var monitoring = false
    let began: () -> Void
    let ended: () -> Void
    var moved: (CGPoint) -> Void = { _ in }
    final class Surface: UIControl {
        var began: (() -> Void)?
        var ended: (() -> Void)?
        var moved: ((CGPoint) -> Void)?
        private var down = false
        private func track(_ touch: UITouch) {
            let point = touch.location(in: self)
            moved?(CGPoint(x: max(-1, min(1, point.x / max(1, bounds.width) * 2 - 1)), y: max(-1, min(1, point.y / max(1, bounds.height) * 2 - 1))))
        }
        override func continueTracking(_ touch: UITouch, with event: UIEvent?) -> Bool { track(touch); return true }
        override func beginTracking(_ touch: UITouch, with event: UIEvent?) -> Bool {
            track(touch); down = true; began?(); return true
        }
        override func endTracking(_ touch: UITouch?, with event: UIEvent?) { release() }
        override func cancelTracking(with event: UIEvent?) { release() }
        private func release() { guard down else { return }; down = false; ended?() }
        override func accessibilityActivate() -> Bool {
            if down { release() } else { down = true; began?() }; return true
        }
    }
    func makeUIView(context: Context) -> Surface {
        let view = Surface(); view.backgroundColor = .clear
        view.isAccessibilityElement = true; view.accessibilityTraits = .button
        view.accessibilityIdentifier = "petHoldToTalk"
        view.accessibilityLabel = "Hablar con Admirito"
        view.accessibilityHint = "Mantén pulsado y suelta para enviar. Con VoiceOver, activa para iniciar y vuelve a activar para terminar."
        return view
    }
    func updateUIView(_ view: Surface, context: Context) {
        view.began = began; view.ended = ended; view.moved = moved
        view.accessibilityValue = active ? "Escuchando" : monitoring ? "Escuchando Admirito en el dispositivo" : "Micrófono apagado"
    }
}

struct PetStandbyView: View {
    var character = "Admirito"
    @ObservedObject var pet: PetStandby
    @ObservedObject var dictation: CommandDictation
    @ObservedObject var wakeWord: WakeWord
    @ObservedObject var feedback: WakeFeedback
    let began: () -> Void
    let ended: () -> Void
    let close: () -> Void
    let selectMascot: (String) -> Void
    @StateObject private var macGaze = MacGaze()
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color(uiColor: .systemGroupedBackground).ignoresSafeArea()
                RadialGradient(colors: [characterColor.opacity(scheme == .dark ? 0.17 : 0.10), .clear], center: .center, startRadius: 0, endRadius: max(geometry.size.width, geometry.size.height) * 0.6).ignoresSafeArea()
                let landscape = geometry.size.width > geometry.size.height
                VStack(spacing: landscape ? 6 : 12) {
                    HStack {
                        Button("Supervisor") { selectMascot("supervisor") }.buttonStyle(.bordered).accessibilityIdentifier("petSelectSupervisor")
                        Spacer(minLength:4)
                        Text(character).font(.headline).lineLimit(1).minimumScaleFactor(0.8).accessibilityIdentifier("petCharacter")
                        Spacer(minLength:4)
                        Button("Bugito") { selectMascot("bugito") }.buttonStyle(.bordered).accessibilityIdentifier("petSelectBugito")
                    }
                    HStack {
                        Spacer()
                        Button { macGaze.toggle() } label: { Image(systemName: "cursorarrow.motionlines") }.accessibilityLabel("Seguir ratón del Mac").accessibilityIdentifier("petMacGaze").accessibilityValue(macGaze.status)
                        Button { Task { await wakeWord.toggle() } } label: {
                            Label(wakeWord.enabled ? "Admirito: ON" : "Activar Admirito", systemImage: wakeWord.enabled ? "ear.fill" : "ear")
                                .labelStyle(.iconOnly)
                        }.buttonStyle(.bordered).disabled(dictation.listening || dictation.starting || dictation.processing || feedback.speaking).accessibilityIdentifier("petWakeWord")
                            .accessibilityValue(wakeWord.listening ? "Escucha local activa" : wakeWord.enabled ? "En pausa" : "Apagado")
                        Button {
                            wakeWord.pause()
                            pet.awaitingCommand = true
                            feedback.reply { pet.awaitingCommand = false }
                        } label: { Image(systemName: "speaker.wave.2.fill") }
                            .disabled(dictation.listening || dictation.starting || dictation.processing || feedback.speaking)
                            .accessibilityLabel("Probar voz de Admirito").accessibilityIdentifier("petVoicePreview")
                            .accessibilityValue(feedback.speaking ? "Hablando con \(feedback.voiceName)" : "Voz \(feedback.voiceName)" + (feedback.lastReplyCompleted ? " · respuesta completada" : ""))
                        Button(action: close) { Image(systemName: "xmark.circle.fill").font(.title2) }
                            .accessibilityLabel("Volver a los controles").accessibilityIdentifier("petClose")
                    }
                    ZStack {
                        AdmiritoFace(mood: (dictation.listening || feedback.speaking) ? .laugh : .awake, gaze: macGaze.point ?? pet.gaze, immersive: landscape, character: character)
                            .accessibilityHidden(true)
                        HoldToTalkSurface(active: dictation.listening, monitoring: wakeWord.listening, began: began, ended: ended, moved: { pet.gaze = $0 })
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .layoutPriority(-1)
                    .onContinuousHover { phase in
                        switch phase {
                        case .active(let location):
                            pet.gaze = CGPoint(x: max(-1, min(1, location.x / max(1, geometry.size.width) * 2 - 1)), y: max(-1, min(1, location.y / max(1, geometry.size.height) * 2 - 1)))
                        case .ended: pet.gaze = .zero
                        }
                    }
                    status.padding(8).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                    if !landscape { privacy }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .frame(width: geometry.size.width, height: geometry.size.height)

            }
        }
        .tint(characterColor)
        .onAppear { macGaze.resume() }
        .onDisappear { macGaze.stop() }
    }
    private var characterColor: Color { character == "Bugito" ? .red : character == "Supervisor" ? .blue : .green }
    private var status: some View {
        VStack(spacing: 12) {
            Text(dictation.listening ? (dictation.handsFree ? "Te escucho. Di tu orden; terminaré cuando hagas una pausa." : "Te escucho. Suelta para continuar.") : dictation.starting ? "Preparando el micrófono…" : dictation.processing ? "Entendiendo tu orden…" : wakeWord.listening ? "Di «Admirito» para llamarme" : pet.message)
                .font(.headline).multilineTextAlignment(.center).lineLimit(3).accessibilityIdentifier("petStatus")
            if !dictation.listening && !dictation.processing { Text(wakeWord.status).font(.caption).multilineTextAlignment(.center).accessibilityIdentifier("petWakeWordStatus") }
            if dictation.listening { ProgressView(value: dictation.level).frame(maxWidth: 220).accessibilityLabel("Nivel del micrófono") }
            if !dictation.transcript.isEmpty && (dictation.listening || dictation.processing || pet.awaitingCommand) { Text(dictation.transcript).lineLimit(2).font(.callout).multilineTextAlignment(.center).accessibilityIdentifier("petTranscript") }
        }
    }
    private var privacy: some View {
        Text(wakeWord.enabled ? "Di Admirito, espera a que te escuche y después di tu orden. La palabra se detecta localmente, con esta pantalla abierta." : "Mantén pulsado para hablar, o activa Admirito para llamarlo por su nombre.")
            .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
    }
}

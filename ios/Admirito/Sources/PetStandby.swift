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
            .trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
        let prefixes = ["lanza el tour de ", "inicia el tour de ", "lanza el tour ", "inicia el tour ", "start the tour of ", "start the tour ", "tour "]
        guard let prefix = prefixes.first(where: { text.hasPrefix($0) }) else { return nil }
        let target = String(text.dropFirst(prefix.count)).trimmingCharacters(in: .whitespaces)
        let known = ["starbucks mexico", "alsea mexico", "altadis", "altadis espana", "dooh total"]
        guard known.contains(target) else { return nil }
        return "/tour " + target
    }
}

@MainActor final class PetStandby: ObservableObject {
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
    let began: () -> Void
    let ended: () -> Void
    final class Surface: UIControl {
        var began: (() -> Void)?
        var ended: (() -> Void)?
        private var down = false
        override func beginTracking(_ touch: UITouch, with event: UIEvent?) -> Bool {
            down = true; began?(); return true
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
        view.began = began; view.ended = ended
        view.accessibilityValue = active ? "Escuchando" : "Micrófono apagado"
    }
}

struct PetStandbyView: View {
    @ObservedObject var pet: PetStandby
    @ObservedObject var dictation: CommandDictation
    let began: () -> Void
    let ended: () -> Void
    let close: () -> Void
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color(uiColor: .systemGroupedBackground).ignoresSafeArea()
                RadialGradient(colors: [Color.green.opacity(scheme == .dark ? 0.17 : 0.10), .clear], center: .center, startRadius: 0, endRadius: max(geometry.size.width, geometry.size.height) * 0.6).ignoresSafeArea()
                VStack(spacing: 12) {
                    HStack {
                        Text("Admirito").font(.headline).foregroundStyle(.secondary)
                        Spacer()
                        Button(action: close) { Image(systemName: "xmark.circle.fill").font(.title2) }
                            .accessibilityLabel("Volver a los controles").accessibilityIdentifier("petClose")
                    }
                    if geometry.size.width > geometry.size.height {
                        HStack(spacing: 16) {
                            cloud(height: max(120, geometry.size.height - 100)).frame(maxWidth: .infinity)
                            VStack(spacing: 12) { status; privacy }
                                .frame(width: min(280, geometry.size.width * 0.35))
                        }.frame(maxHeight: .infinity)
                    } else {
                        Spacer(minLength: 0)
                        cloud(height: min(geometry.size.height * 0.62, geometry.size.width * 0.8))
                        status
                        Spacer(minLength: 0)
                        privacy
                    }
                }.padding(24)
            }
        }
    }
    private func cloud(height: CGFloat) -> some View {
        ZStack {
            AdmiritoFace(mood: dictation.listening ? .laugh : .awake).accessibilityHidden(true)
            HoldToTalkSurface(active: dictation.listening, began: began, ended: ended)
        }.frame(height: height)
            .background {
                Circle().fill(Color.green.opacity(dictation.listening ? 0.12 + dictation.level * 0.3 : 0)).padding(20)
            }
    }
    private var status: some View {
        VStack(spacing: 12) {
            Text(dictation.listening ? "Te escucho. Suelta para continuar." : dictation.starting ? "Preparando el micrófono…" : dictation.processing ? "Entendiendo tu orden…" : pet.message)
                .font(.headline).multilineTextAlignment(.center).accessibilityIdentifier("petStatus")
            if dictation.listening { ProgressView(value: dictation.level).frame(maxWidth: 220).accessibilityLabel("Nivel del micrófono") }
            if !dictation.transcript.isEmpty { Text(dictation.transcript).font(.callout).multilineTextAlignment(.center).accessibilityIdentifier("petTranscript") }
        }
    }
    private var privacy: some View {
        Text("El micrófono solo se activa al pulsar. Al soltar se procesa tu orden.")
            .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
    }
}

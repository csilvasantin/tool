import SwiftUI
import WebKit

enum AssistantMode: String, CaseIterable {
    case meeting, movie, suite
    var label: String { switch self { case .meeting: return "Reunión"; case .movie: return "Película"; case .suite: return "AdmiraNeXT" } }
}
@MainActor final class SuiteExpertConsole: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    @Published var command = ""
    @Published var ready = false
    @Published var busy = false
    @Published var status = "Cargando el modo Experto de admira.biz…"
    @Published var output = ""
    @Published private(set) var tourRunning = false
    @Published private(set) var tourProgress = ""
    let webView: WKWebView
    private var timer: Timer?
    override init() {
        let config = WKWebViewConfiguration()
        // Website's own login and cookies. The paired conversation credential is never injected here.
        config.websiteDataStore = .default()
        if let url = Bundle.main.url(forResource: "SuiteExpertBridge", withExtension: "js"), let script = try? String(contentsOf: url) {
            config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        webView = WKWebView(frame: .zero, configuration: config)
        super.init(); webView.navigationDelegate = self; webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.load(URLRequest(url: URL(string: "https://www.admira.biz/")!))
    }
    func observe() {
        guard timer == nil else { return }
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in Task { @MainActor in await self?.refresh() } }
    }
    func stopObserving() { timer?.invalidate(); timer = nil }
    private var trustedPage: Bool { webView.url?.scheme == "https" && ["www.admira.biz", "admira.biz"].contains(webView.url?.host ?? "") }
    private func refresh() async {
        guard !busy else { return }
        guard trustedPage else { ready = false; tourRunning = false; tourProgress = ""; return }
        let value = try? await webView.evaluateJavaScript("({ready:Boolean(window.AdmiritoSuiteBridge?.ready()),running:document.body.classList.contains('gt-on')&&Boolean(document.querySelector('.gt-hud')),progress:document.querySelector('.gt-hud .gt-journey')?.textContent||''})") as? [String: Any]
        ready = value?["ready"] as? Bool == true
        let running = value?["running"] as? Bool == true
        let progress = value?["progress"] as? String ?? ""
        if running != tourRunning || progress != tourProgress { VoiceDiagnostics.record("tour_state", ["running": String(running), "progress": progress]) }
        tourRunning = running; tourProgress = progress
        if ready && status == "Cargando el modo Experto de admira.biz…" { status = "Modo Experto conectado. Escribe una orden o usa el dictado del teclado." }
    }
    func send(_ preset: String? = nil, completion: ((String?) -> Void)? = nil) {
        let text = (preset ?? command).trimmingCharacters(in: .whitespacesAndNewlines)
        guard trustedPage, ready, !busy, !text.isEmpty, text.count <= 2000 else { completion?("El modo Experto no está disponible. No he enviado la orden."); return }
        VoiceDiagnostics.record("suite_send", ["publicTour": String(text.hasPrefix("/tour "))])
        busy = true; command = text; let requestID = UUID().uuidString
        Task {
            defer { busy = false }
            do {
                // Arguments are data, never JavaScript interpolation. No native parser or automatic replay.
                let result = try await webView.callAsyncJavaScript("return await window.AdmiritoSuiteBridge.execute(command, requestID)", arguments: ["command": text, "requestID": requestID], in: nil, contentWorld: .page) as? [String: Any]
                output = result?["output"] as? String ?? "Consulta el resultado en el mapa y en la consola web."
                status = result?["state"] as? String == "not_ready" ? "El modo Experto aún no está listo. No se ha enviado la orden." : "Orden entregada al modo Experto. Comprueba su respuesta y el recorrido."
                if result?["state"] as? String == "not_ready" { completion?("El modo Experto aún no está listo. No he enviado la orden.") }
                else if result?["ok"] as? Bool == false { completion?("El modo Experto ha rechazado la orden. Puedes ver el motivo en su respuesta.") }
                else { completion?(nil) }
            } catch {
                // A command may navigate. A lost bridge response does not mean it failed, so never retry it automatically.
                status = "La página ha cambiado o no se pudo recoger la respuesta. Revisa el mapa antes de repetir la orden."
                completion?("He enviado la orden, pero no puedo confirmar el resultado. Revisa el mapa antes de repetirla.")
            }
        }
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { ready = false }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { Task { await refresh() } }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { status = "No se ha podido cargar admira.biz. Revisa la conexión o abre su sesión en la vista web." }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url, url.scheme == "https" { webView.load(URLRequest(url: url)) }
        return nil
    }
}
struct SuiteExpertSurface: UIViewRepresentable {
    @ObservedObject var console: SuiteExpertConsole
    func makeUIView(context: Context) -> WKWebView { console.webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}
struct SuiteExpertView: View {
    @ObservedObject var console: SuiteExpertConsole
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @ObservedObject var dictation: CommandDictation
    @Environment(\.scenePhase) private var scene
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("AdmiraNeXT · modo Experto").font(.headline)
            Text("Las mismas órdenes y permisos de admira.biz. Dicta la orden, revísala y pulsa Ejecutar.").font(.caption).foregroundStyle(.secondary)
            TextField("/tour alsea mexico", text: $console.command, axis: .vertical).textFieldStyle(.roundedBorder).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("suiteCommand")
            Button(dictation.listening ? "Terminar dictado" : dictation.starting ? "Preparando voz…" : "Dictar orden") {
                if dictation.listening { dictation.stop() }
                else {
                    console.command = ""
                    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                    Task { await dictation.start() }
                }
            }.buttonStyle(.bordered).disabled(dictation.starting || dictation.processing || console.busy).accessibilityIdentifier("suiteDictation")
            Text("Al pulsar «Dictar orden» se envía solo esa grabación al transcriptor de Admira y se borra al terminar.").font(.caption2).foregroundStyle(.secondary)
            if !dictation.status.isEmpty {
                Text(dictation.status).font(.caption).accessibilityIdentifier("suiteDictationStatus")
                if dictation.listening { ProgressView(value: dictation.level).accessibilityLabel("Nivel del micrófono").accessibilityIdentifier("suiteMicrophoneLevel") }
            }
            HStack {
                Button(console.busy ? "Enviando…" : "Ejecutar") { dictation.cancel(); console.send() }.buttonStyle(.borderedProminent).disabled(!console.ready || console.busy || console.command.isEmpty || dictation.listening || dictation.starting || dictation.processing)
                Button("Ayuda") { console.send("/help") }.disabled(!console.ready || console.busy)
            }
            ScrollView(.horizontal) { HStack {
                Button("Starbucks México") { console.send("/tour alsea mexico") }
                Button("Altadis") { console.send("/tour altadis") }
                Button("DOOH total") { console.send("/tour DooH total") }
                Button("Parar tour") { console.send("/parar") }
            }.buttonStyle(.bordered).disabled(!console.ready || console.busy || dictation.listening || dictation.starting || dictation.processing) }
            Text(console.status).font(.caption).accessibilityIdentifier("suiteStatus")
            if !console.output.isEmpty { DisclosureGroup("Respuesta del modo Experto") { Text(console.output).font(.system(.caption, design: .monospaced)).textSelection(.enabled) } }
            if console.tourRunning { Text("Tour en curso · " + console.tourProgress).font(.caption).accessibilityIdentifier("suiteTourProgress") }
            SuiteExpertSurface(console: console).frame(height: verticalSizeClass == .compact ? max(240, min(360, UIScreen.main.bounds.height - 110)) : 520).clipShape(RoundedRectangle(cornerRadius: 12)).id("suiteMap")
            Text("Si una acción requiere identificación, entra con tu cuenta de admira.biz en esta vista. Vincular Admirito no concede permisos de control físico.").font(.caption).foregroundStyle(.secondary)
            Link("Abrir admira.biz en Safari", destination: URL(string: "https://www.admira.biz/")!)
        }.onAppear { console.observe() }.onDisappear { dictation.cancel() }
            .onChange(of: dictation.transcript) { _, text in if !text.isEmpty { console.command = text } }
            .onChange(of: scene) { _, phase in if phase == .background { dictation.cancel() } }
    }
}

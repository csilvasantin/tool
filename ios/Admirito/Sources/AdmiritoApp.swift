import SwiftUI
import WebKit
import UniformTypeIdentifiers

@main struct AdmiritoApp: App {
    @StateObject private var assistant = AssistantStore()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup { AssistantView().environmentObject(assistant).onChange(of: phase) { _, value in if value == .active { assistant.retry() } } }
    }
}
struct AdmiritoFace: UIViewRepresentable {
    let listening: Bool
    func makeUIView(context: Context) -> WKWebView {
        let view = WKWebView(); view.isOpaque = false; view.backgroundColor = .clear; view.scrollView.backgroundColor = .clear; view.scrollView.isScrollEnabled = false; view.isUserInteractionEnabled = false
        if let url = Bundle.main.url(forResource: "Admirito", withExtension: "svg"), let svg = try? String(contentsOf: url) {
            view.loadHTMLString("<meta name='viewport' content='width=device-width,initial-scale=1'><style>body{margin:0;background:transparent;display:grid;place-items:center;height:100vh}svg{width:90%;height:90%}.da-nube-cuerpo{transform-origin:50% 50%;animation:breathe 3s ease-in-out infinite}@keyframes breathe{50%{transform:translateY(-5px)}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}</style>" + svg, baseURL: nil)
        }; return view
    }
    func updateUIView(_ view: WKWebView, context: Context) { view.accessibilityLabel = listening ? "Admirito escuchando" : "Admirito" }
}
struct AssistantView: View {
    @EnvironmentObject private var assistant: AssistantStore
    @Environment(\.openURL) private var openURL
    @State private var kind = ListeningKind.meeting
    @State private var title = ""
    @State private var importing = false
    private let green = Color(red: 0.40, green: 0.59, blue: 0.25)
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    AdmiritoFace(listening: assistant.listening).frame(height: 160).frame(maxWidth: .infinity).accessibilityHidden(true)
                    Text(assistant.listening ? "Estoy escuchando." : "Aquí está tu Admirito.").font(.largeTitle.bold())
                    Text(assistant.status).font(.callout).foregroundStyle(.secondary).accessibilityIdentifier("assistantStatus")
                    if assistant.linked { listeningControls; conversation; notes }
                    else { pairing }
                    Text("La escucha solo empieza cuando tú la activas. Puedes pausarla o terminarla en cualquier momento. El resumen utiliza lo realmente captado por el micrófono; no ve las imágenes del televisor.")
                        .font(.footnote).foregroundStyle(.secondary)
                }.padding(24)
            }
            .background(Color(uiColor: .systemGroupedBackground)).tint(green)
            .navigationTitle("Admirito").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if assistant.linked { ToolbarItem(placement: .topBarTrailing) { Menu {
                    Button("Mi conversación en admira.app") { openURL(URL(string: "https://www.admira.app/conversar")!) }
                    Button("Reintentar envíos pendientes") { assistant.retry() }
                    Button("Salir de esta app", role: .destructive) { assistant.signOut() }.disabled(assistant.listening || assistant.starting)
                } label: { Image(systemName: "person.crop.circle") } } }
            }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.audio, .movie]) { result in
                if case .success(let url) = result { assistant.importMedia(url, kind: kind) }
            }
        }
    }
    private var pairing: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("La misma cuenta, la misma conversación.").font(.headline)
            if let challenge = assistant.challenge {
                Text(challenge.code).font(.system(size: 34, weight: .bold, design: .monospaced)).textSelection(.enabled)
                Button("Copiar código y abrir admira.app") { UIPasteboard.general.string = challenge.code; openURL(URL(string: "https://www.admira.app/conversar")!) }.buttonStyle(.borderedProminent)
                Text("En Safari, entra con tu cuenta, abre «Continuar en otro dispositivo» e introduce el código. Después vuelve a Admirito. Caduca a los cinco minutos.").font(.footnote)
            } else { Button("Vincular mi cuenta") { assistant.pair() }.buttonStyle(.borderedProminent).accessibilityIdentifier("linkAccount") }
        }.padding().background(.background, in: RoundedRectangle(cornerRadius: 20))
    }
    private var listeningControls: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let active = assistant.active, active.state == .listening {
                Label("Escucha activa · micrófono", systemImage: "mic.fill").foregroundStyle(.red).font(.headline)
                TimelineView(.periodic(from: .now, by: 1)) { context in Text(active.startedAt, style: .timer).monospacedDigit() }
                Text(assistant.inputName).font(.caption).foregroundStyle(.secondary)
                HStack {
                    Button("Pausar") { assistant.pause() }.buttonStyle(.bordered)
                    Button("Terminar y resumir") { assistant.finish(active.id) }.buttonStyle(.borderedProminent)
                }
            } else {
                Picker("Voy a escuchar", selection: $kind) { ForEach(ListeningKind.allCases, id: \.self) { Text($0.label).tag($0) } }.pickerStyle(.segmented)
                TextField(kind == .meeting ? "Nombre de la reunión (opcional)" : "Nombre de la película (opcional)", text: $title).textFieldStyle(.roundedBorder)
                Text(kind == .meeting ? "Deja el iPhone cerca de las personas que hablan." : "Deja el iPhone cerca del televisor u ordenador, con volumen audible.").font(.callout)
                Button { assistant.start(kind: kind, title: title) } label: { Label("Iniciar escucha", systemImage: "mic.fill").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).disabled(assistant.starting)
                Button("Importar audio o vídeo") { importing = true }.disabled(assistant.starting)
            }
            if assistant.isWorking { ProgressView("Guardando transcripción o resumen…").font(.caption) }
        }.padding().background(.background, in: RoundedRectangle(cornerRadius: 20))
    }
    private var conversation: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Habla con Admirito").font(.headline)
            TextField("Pregunta o usa el dictado del teclado", text: $assistant.question, axis: .vertical).textFieldStyle(.roundedBorder).disabled(assistant.listening)
            if assistant.listening { Text("Pausa la escucha para conversar sin que mi voz entre en la grabación.").font(.caption) }
            HStack {
                Button(assistant.replying ? "Pensando…" : "Preguntar") { assistant.ask() }.buttonStyle(.borderedProminent).disabled(assistant.listening || assistant.replying || assistant.question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Button("Interrumpir voz") { assistant.stopSpeaking() }.disabled(assistant.listening)
            }
            if !assistant.answer.isEmpty { Text(assistant.answer).textSelection(.enabled) }
        }.padding().background(.background, in: RoundedRectangle(cornerRadius: 20))
    }
    private var notes: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Tus escuchas").font(.title2.bold())
            ForEach(assistant.visibleNotes) { note in
                VStack(alignment: .leading, spacing: 10) {
                    Label(note.title, systemImage: note.kind == .meeting ? "person.2" : "film").font(.headline)
                    Text(note.startedAt.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
                    if let summary = note.summary { Text(summary).textSelection(.enabled); Button("Leer resumen") { assistant.read(summary) }.disabled(assistant.listening); ShareLink(item: summary) { Label("Compartir resumen", systemImage: "square.and.arrow.up") } }
                    else {
                        Text("\(note.chunks.filter { $0.uploaded }.count)/\(note.chunks.count) fragmentos guardados en tu cuenta").font(.caption)
                        if note.state == .paused { HStack { Button("Reanudar") { assistant.resume(note.id) }; Button("Resumir lo grabado") { assistant.finish(note.id) } }.disabled(assistant.listening || assistant.starting) }
                        if [.recorded, .summaryPending].contains(note.state) { Button("Reintentar resumen") { assistant.retry() } }
                    }
                    if let conversation = note.conversationID { Link("Continuar la conversación", destination: URL(string: "https://www.admira.app/conversar#\(conversation)")!) }
                }.padding().frame(maxWidth: .infinity, alignment: .leading).background(.background, in: RoundedRectangle(cornerRadius: 18))
            }
        }
    }
}

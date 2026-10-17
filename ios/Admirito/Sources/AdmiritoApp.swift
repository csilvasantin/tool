import AVFoundation
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
enum PetMood: String, CaseIterable { case awake, laugh, rainbow, resting }
struct AdmiritoFace: UIViewRepresentable {
    let mood: PetMood
    func makeUIView(context: Context) -> WKWebView {
        let view = WKWebView(); view.isOpaque = false; view.backgroundColor = .clear; view.scrollView.backgroundColor = .clear; view.scrollView.isScrollEnabled = false; view.isUserInteractionEnabled = false
        if let svgURL = Bundle.main.url(forResource: "Admirito", withExtension: "svg"), let svg = try? String(contentsOf: svgURL), let templateURL = Bundle.main.url(forResource: "AdmiritoPet", withExtension: "html"), let template = try? String(contentsOf: templateURL) {
            view.loadHTMLString(template.replacingOccurrences(of: "{{SVG}}", with: svg).replacingOccurrences(of: "{{MOOD}}", with: mood.rawValue), baseURL: nil)
        }
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) { view.evaluateJavaScript("document.body.dataset.mood='" + mood.rawValue + "'"); view.accessibilityLabel = "Admirito " + mood.rawValue }
}
struct AssistantView: View {
    @EnvironmentObject private var assistant: AssistantStore
    @Environment(\.openURL) private var openURL
    @StateObject private var diary = RestDiary()
    @Environment(\.scenePhase) private var scene
    @State private var petMood: PetMood?
    @AppStorage("admirito.selectedMode") private var selectedMode = AssistantMode.meeting.rawValue
    @State private var kind = ListeningKind.meeting
    @State private var title = ""
    @State private var importing = false
    @State private var takingPhoto = false
    @State private var photoError: String?
    @State private var sharingPhoto: UIImage?
    @State private var sharingText = ""
    @State private var sharing = false
    private let green = Color(red: 0.40, green: 0.59, blue: 0.25)
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    AdmiritoFace(mood: petMood ?? defaultMood).frame(height: 160).frame(maxWidth: .infinity).accessibilityHidden(true)
                    Text(assistant.listening ? "Estoy escuchando." : "Aquí está tu Admirito.").font(.largeTitle.bold())
                    Text(assistant.status).font(.callout).foregroundStyle(.secondary).accessibilityIdentifier("assistantStatus")
                    if assistant.linked {
                        HStack { Button("Ríe") { play(.laugh) }; Button("Arcoíris") { play(.rainbow) }; Button("Descansa") { play(.resting) } }.font(.caption)
                        Picker("Modo de Admirito", selection: $selectedMode) {
                            ForEach(AssistantMode.allCases, id: \.rawValue) { Text($0.label).tag($0.rawValue) }
                        }.pickerStyle(.segmented).disabled(assistant.listening || assistant.starting)
                        if selectedMode == AssistantMode.suite.rawValue { SuiteExpertView() }
                        else { listeningControls; RestDiaryView(diary: diary); conversation; notes }
                    }
                    else { pairing }
                    Text("La escucha solo empieza cuando tú la activas. Puedes pausarla o terminarla en cualquier momento. Se detiene automáticamente tras cinco minutos seguidos de silencio. El resumen utiliza lo realmente captado por el micrófono; no ve las imágenes del televisor.")
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
            .onAppear { bindDiary(); applyMode() }
            .onChange(of: selectedMode) { _, _ in applyMode() }
            .onChange(of: assistant.linked) { _, _ in bindDiary() }
            .onChange(of: scene) { _, phase in if phase == .active { bindDiary() } }
            .onChange(of: diary.enabled) { _, enabled in if enabled && assistant.listening { diary.startMotion() } }
            .sheet(isPresented: $takingPhoto) { ProjectionPhoto { assistant.attachProjection($0) } }
            .sheet(isPresented: $sharing) { if let image = sharingPhoto { PhotoSummaryShare(image: image, text: sharingText) } }
            .alert("Cámara", isPresented: Binding(get: { photoError != nil }, set: { if !$0 { photoError = nil } })) { Button("Aceptar") { photoError = nil } } message: { Text(photoError ?? "") }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.audio, .movie]) { result in
                if case .success(let url) = result { assistant.importMedia(url, kind: kind) }
            }
        }
    }
    private func applyMode() {
        if selectedMode == AssistantMode.movie.rawValue { kind = .movie }
        else if selectedMode == AssistantMode.meeting.rawValue { kind = .meeting }
        else if selectedMode != AssistantMode.suite.rawValue { selectedMode = AssistantMode.meeting.rawValue }
    }
    private var defaultMood: PetMood {
        if assistant.listening { return .awake }
        if diary.enabled, let last = diary.visible.first, last.morningAppOpen == nil, RestRules.isNight(Date()) { return .resting }
        return .awake
    }
    private func bindDiary() { diary.bind(assistant.accountID); assistant.restDiary = diary; diary.observeMorning() }
    private func play(_ mood: PetMood) {
        petMood = mood
        Task { try? await Task.sleep(for: .seconds(5)); if petMood == mood { petMood = nil } }
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
                TextField(kind == .meeting ? "Nombre de la reunión (opcional)" : "Nombre de la película (opcional)", text: $title).textFieldStyle(.roundedBorder)
                Text(kind == .meeting ? "Deja el iPhone cerca de las personas que hablan." : "Deja el iPhone cerca del televisor u ordenador, con volumen audible.").font(.callout)
                if kind == .movie {
                    Button { Task {
                        guard UIImagePickerController.isSourceTypeAvailable(.camera) else { photoError = "No hay cámara disponible."; return }
                        if await AVCaptureDevice.requestAccess(for: .video) { takingPhoto = true } else { photoError = "Permite la cámara en Ajustes para fotografiar la proyección." }
                    } } label: { Label(assistant.projectionPhoto == nil ? "Fotografiar la proyección" : "Repetir fotografía", systemImage: "camera") }
                    if let photo = assistant.projectionPhoto {
                        Image(uiImage: photo).resizable().scaledToFit().frame(maxHeight: 220).clipShape(RoundedRectangle(cornerRadius: 12))
                        if assistant.readingPhoto { ProgressView("Leyendo texto visible…") }
                        else if !assistant.projectionText.isEmpty {
                            Text("Texto visible (lectura automática, no identificación confirmada):").font(.caption.bold())
                            Text(assistant.projectionText).font(.caption).textSelection(.enabled)
                            Text("Si reconoces el título entre esas palabras, escríbelo arriba. Después de escuchar podrás intentar reconocer la película combinando la escena y el audio.").font(.caption)
                        } else { Text("Película no identificada: no hay un título legible. La foto quedará adjunta al resumen.").font(.caption) }
                        Button("Quitar foto", role: .destructive) { assistant.clearProjection() }
                    }
                    Text("La foto se guarda en este iPhone. Al pulsar «Reconocer por escena y audio», se enviará al servicio IA de Admira (Cloudflare) junto con la transcripción para intentar identificarla.").font(.caption).foregroundStyle(.secondary)
                }
                Button { assistant.start(kind: kind, title: title) } label: { Label("Iniciar escucha", systemImage: "mic.fill").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).disabled(assistant.starting || assistant.readingPhoto)
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
                    if let photo = assistant.photo(for: note) {
                        Image(uiImage: photo).resizable().scaledToFit().frame(maxHeight: 240).clipShape(RoundedRectangle(cornerRadius: 12))
                        Text("Foto de esta escucha").font(.caption)
                        if let result = note.filmIdentification {
                            if let title = result.title { Text("Posible película: " + title).font(.headline) }
                            Text(result.message).font(.callout)
                            ForEach(result.evidence, id: \.self) { Text("Pista: " + $0).font(.caption) }
                        } else if note.state == .complete {
                            Text("Analizar envía esta foto y el audio transcrito al servicio IA de Admira (Cloudflare). No confirma automáticamente un título.").font(.caption)
                            Button(assistant.identifyingFilm == note.id ? "Analizando escena y audio…" : "Reconocer por escena y audio") { assistant.identifyMovie(note.id) }.disabled(assistant.identifyingFilm != nil || assistant.listening)
                        }
                        if let text = note.projectionText, !text.isEmpty { Text("Texto detectado en la foto:\n" + text).font(.caption).textSelection(.enabled) }
                        if let summary = note.summary { Button("Compartir foto y resumen") { sharingPhoto = photo; sharingText = summary + "\n\nTexto visible sin verificar: " + (note.projectionText ?? "No identificado"); sharing = true } }
                    }
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

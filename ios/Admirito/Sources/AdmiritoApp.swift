import AVFoundation
import SwiftUI
import WebKit
import UniformTypeIdentifiers

@main struct AdmiritoApp: App {
    init() {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--admirito-ui-test") { UIView.setAnimationsEnabled(false) }
        #endif
    }
    @StateObject private var assistant = AssistantStore()
    @Environment(\.scenePhase) private var phase
    var body: some Scene {
        WindowGroup { AssistantView().environmentObject(assistant).onChange(of: phase) { _, value in if value == .active { assistant.retry() } } }
    }
}
enum PetMood: String, CaseIterable { case awake, laugh, rainbow, resting }
struct AdmiritoFace: UIViewRepresentable {
    let mood: PetMood
    var gaze = CGPoint.zero
    var immersive = false
    func makeUIView(context: Context) -> WKWebView {
        let view = WKWebView(); view.isOpaque = false; view.backgroundColor = .clear; view.scrollView.backgroundColor = .clear; view.scrollView.isScrollEnabled = false; view.isUserInteractionEnabled = false
        if let svgURL = Bundle.main.url(forResource: "Admirito", withExtension: "svg"), let svg = try? String(contentsOf: svgURL), let templateURL = Bundle.main.url(forResource: "AdmiritoPet", withExtension: "html"), let template = try? String(contentsOf: templateURL) {
            var html = template
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--admirito-ui-test") { html += "<style>*,*:before,*:after{animation:none!important;transition:none!important}</style>" }
            #endif
            view.loadHTMLString(html.replacingOccurrences(of: "{{SVG}}", with: svg).replacingOccurrences(of: "{{MOOD}}", with: mood.rawValue) + "<script>window.setPetPresentation?.(\(gaze.x),\(gaze.y),\(immersive));</script>", baseURL: nil)
        }
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) { view.evaluateJavaScript("document.body.dataset.mood='" + mood.rawValue + "'"); view.evaluateJavaScript("window.setPetPresentation?.(\(gaze.x),\(gaze.y),\(immersive))"); view.accessibilityLabel = "Admirito " + mood.rawValue }
}
struct AssistantView: View {
    @EnvironmentObject private var assistant: AssistantStore
    @Environment(\.openURL) private var openURL
    @StateObject private var diary = RestDiary()
    @StateObject private var suite = SuiteExpertConsole()
    @StateObject private var commandVoice = CommandDictation()
    @StateObject private var pet = PetStandby()
    @StateObject private var wakeWord = WakeWord()
    @StateObject private var feedback = WakeFeedback()
    @StateObject private var invokedAgent = AgentInvocation()
    @State private var agentVoiceQueue: [String] = []
    @Environment(\.scenePhase) private var scene
    @State private var petMood: PetMood?
    @State private var petRequest = UUID()
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
    private let idleTimer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
            ZStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    AdmiritoFace(mood: petMood ?? defaultMood).frame(height: 160).frame(maxWidth: .infinity).accessibilityHidden(true)
                    Text(assistant.listening ? "Estoy escuchando." : "Aquí está tu Admirito.").font(.largeTitle.bold())
                    Text(assistant.status).font(.callout).foregroundStyle(.secondary).accessibilityIdentifier("assistantStatus")
                    if assistant.linked {
                        HStack { Button("Ríe") { play(.laugh) }; Button("Arcoíris") { play(.rainbow) }; Button("Descansa") { play(.resting) } }.font(.caption)
                        Picker("Modo de Admirito", selection: $selectedMode) {
                            ForEach(AssistantMode.allCases, id: \.rawValue) { Text($0.label).tag($0.rawValue) }
                        }.pickerStyle(.segmented).disabled(assistant.listening || assistant.starting || commandVoice.listening || commandVoice.starting || commandVoice.processing)
                        if selectedMode == AssistantMode.suite.rawValue { VStack(alignment:.leading, spacing:8) {
                            Menu("Invocar un agente") {
                                ForEach(AgentInvocationRules.names.keys.sorted(), id:\.self) { target in
                                    Button(AgentInvocationRules.names[target] ?? target) {
                                        invokedAgent.bind(assistant.accountID)
                                        wakeWord.pause(); feedback.reply("Voy a contactar con \(AgentInvocationRules.names[target] ?? target).") {
                                            invokedAgent.send("Carlos quiere hablar contigo desde Admirito. Preséntate brevemente y espera su siguiente petición.", target:target) { response in agentVoiceQueue.append(response) }
                                        }
                                    }
                                }
                            }.disabled(invokedAgent.busy).accessibilityIdentifier("invokeAgentMenu")
                            if invokedAgent.target != nil || !invokedAgent.status.isEmpty {
                                Text(invokedAgent.status).font(.caption).accessibilityIdentifier("invokedAgentStatus")
                                if !invokedAgent.answer.isEmpty { Text(invokedAgent.answer).textSelection(.enabled).accessibilityIdentifier("invokedAgentAnswer") }
                                HStack {
                                    Button("Comprobar respuesta") { invokedAgent.resume { text in agentVoiceQueue.append(text) } }.disabled(invokedAgent.busy)
                                    Button("Dejar de esperar") { invokedAgent.stopWaiting() }.disabled(invokedAgent.busy)
                                    Button("Volver a Admirito") { invokedAgent.leave() }
                                }
                            }
                        }
                        SuiteExpertView(console: suite, dictation: commandVoice).id("suiteCommands") }
                        else { listeningControls; RestDiaryView(diary: diary); conversation; notes }
                    }
                    else { pairing }
                    Text("La escucha solo empieza cuando tú la activas. Puedes pausarla o terminarla en cualquier momento. Se detiene automáticamente tras cinco minutos seguidos de silencio. El resumen utiliza lo realmente captado por el micrófono; no ve las imágenes del televisor.")
                        .font(.footnote).foregroundStyle(.secondary)
                }.padding(24)
            }
            .simultaneousGesture(TapGesture().onEnded { pet.interact() })
            .simultaneousGesture(DragGesture(minimumDistance: 10).onChanged { _ in pet.interact() })
            .allowsHitTesting(!pet.showing).accessibilityHidden(pet.showing)
            .background(Color(uiColor: .systemGroupedBackground)).tint(green)
                if pet.showing {
                    PetStandbyView(pet: pet, dictation: commandVoice, wakeWord: wakeWord, feedback: feedback, began: beginPetVoice, ended: endPetVoice, close: closePet)
                }
            }.tint(green)
            .overlay(alignment: .bottomTrailing) {
                if assistant.linked && !pet.showing && !assistant.listening && !assistant.starting {
                    Button { pet.message = "Mantén pulsado para hablar"; pet.showing = true; pet.interact() } label: {
                        AdmiritoFace(mood: .awake).frame(width: 76, height: 60).background(.regularMaterial, in: Capsule())
                    }.accessibilityLabel("Ampliar Admirito").accessibilityValue(suite.tourRunning ? "Tour en curso · " + suite.tourProgress : "Sin recorrido activo").accessibilityIdentifier("petWake").padding(12)
                }
            }
            .navigationTitle("Admirito").navigationBarTitleDisplayMode(.inline)
            .toolbar(pet.showing ? .hidden : .visible, for: .navigationBar)
            .toolbar {
                if assistant.linked { ToolbarItem(placement: .topBarTrailing) { Menu {
                    Button("Mi conversación en admira.app") { openURL(URL(string: "https://www.admira.app/conversar")!) }
                    Button("Reintentar envíos pendientes") { assistant.retry() }
                    Button("Salir de esta app", role: .destructive) { assistant.signOut() }.disabled(assistant.listening || assistant.starting)
                } label: { Image(systemName: "person.crop.circle") } } }
            }
            .onAppear { bindDiary(); applyMode(); suite.observe() }
            .onDisappear { feedback.cancel(); wakeWord.pause(); commandVoice.cancel(); suite.stopObserving() }
            .onChange(of: wakeWord.detections) { _, _ in
                guard pet.showing, scene == .active, !assistant.listening, !assistant.starting, !commandVoice.processing else { return }
                pet.awaitingCommand = true; pet.interact(); petRequest = UUID()
                suite.command = ""; selectedMode = AssistantMode.suite.rawValue
                UIImpactFeedbackGenerator(style: .soft).impactOccurred()
                pet.message = "¡Aquí estoy! Te escucho."
                let request = petRequest
                feedback.reply {
                    guard request == petRequest, pet.showing, scene == .active else { return }
                    Task { await commandVoice.start(stopAfterSilence: true) }
                }
            }
            .onReceive(idleTimer) { _ in
                    if scene == .active && !agentVoiceQueue.isEmpty && !feedback.speaking && !commandVoice.listening && !commandVoice.starting && !commandVoice.processing && !pet.holding && !pet.awaitingCommand && !assistant.listening && !assistant.replying {
                        wakeWord.pause(); let message = agentVoiceQueue.removeFirst(); pet.message = message; feedback.reply(message)
                    }
                    if pet.showing && scene == .active && !assistant.listening && !assistant.starting && !assistant.replying && !commandVoice.listening && !commandVoice.starting && !commandVoice.processing && !pet.awaitingCommand && !pet.holding && !feedback.speaking {
                        Task { await wakeWord.resume() }
                    } else if wakeWord.listening || wakeWord.starting { wakeWord.pause() }

                    let busy = !assistant.linked || scene != .active || assistant.listening || assistant.starting || assistant.replying || commandVoice.listening || commandVoice.starting || commandVoice.processing || pet.awaitingCommand || pet.holding || suite.busy || suite.tourRunning
                    if !pet.showing && StandbyRules.shouldShow(lastInteraction: pet.lastInteraction, now: Date(), busy: busy) {
                        pet.message = "Mantén pulsado para hablar"; pet.showing = true
                    }
            }
            .onChange(of: assistant.answer) { _, answer in
                if !answer.isEmpty {
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(100))
                        withAnimation { proxy.scrollTo("latestAssistantReply", anchor: .bottom) }
                    }
                }
            }
            .onChange(of: commandVoice.listening) { _, listening in
                if !listening && !commandVoice.starting && !commandVoice.processing && pet.awaitingCommand && !pet.holding { processPetCommand(proxy: proxy) }
            }
            .onChange(of: commandVoice.processing) { _, processing in
                if !processing && pet.awaitingCommand && !pet.holding { processPetCommand(proxy: proxy) }
            }
            .onChange(of: pet.holding) { _, holding in
                if !holding && pet.awaitingCommand && !commandVoice.listening && !commandVoice.starting && !commandVoice.processing { processPetCommand(proxy: proxy) }
            }
            .onChange(of: pet.showing) { _, showing in
                if showing { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) }
            }
            .onChange(of: commandVoice.starting) { _, starting in
                if !starting && !commandVoice.listening && !commandVoice.processing && pet.awaitingCommand {
                    pet.awaitingCommand = false; pet.message = commandVoice.status; wakeWord.pause(); feedback.reply("No he podido iniciar el micrófono. Revisa el permiso y vuelve a intentarlo.")
                }
            }
            .onChange(of: scene) { _, phase in
                if phase == .background { closePet() }
                else if phase == .active { pet.interact() }
            }
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
    }
    private func beginPetVoice() {
        guard !pet.holding, !commandVoice.processing, !commandVoice.starting, !assistant.listening, !assistant.starting else { return }
        wakeWord.pause(); feedback.cancel()
        if commandVoice.listening { pet.awaitingCommand = false; commandVoice.cancel() }
        pet.holding = true; pet.awaitingCommand = true; pet.interact()
        petRequest = UUID()
        suite.command = ""; selectedMode = AssistantMode.suite.rawValue
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        Task {
            await commandVoice.start()
            if !pet.holding && commandVoice.listening { commandVoice.stop() }
        }
    }
    private func endPetVoice() {
        guard pet.holding else { return }; pet.holding = false; pet.interact()
        if commandVoice.listening { commandVoice.stop() }
    }
    private func closePet() {
        wakeWord.pause(); feedback.cancel()
        petRequest = UUID()
        pet.holding = false; pet.awaitingCommand = false; commandVoice.cancel(); pet.wake()
    }
    private func processPetCommand(proxy: ScrollViewProxy) {
        pet.awaitingCommand = false; pet.interact()
        let text = commandVoice.transcript
        guard !text.isEmpty else { pet.message = commandVoice.status; wakeWord.pause(); feedback.reply("No he podido entender la orden. Mantén el dedo sobre mí y vuelve a intentarlo."); return }
        invokedAgent.bind(assistant.accountID)
        if AgentInvocationRules.returnsToAdmirito(text) {
            invokedAgent.leave(); wakeWord.pause(); feedback.reply("Aquí está Admirito otra vez."); return
        }
        if let target = AgentInvocationRules.target(text) {
            wakeWord.pause(); feedback.reply("Voy a contactar con \(AgentInvocationRules.names[target] ?? target).") {
                invokedAgent.send("Carlos quiere hablar contigo desde Admirito. Preséntate brevemente y espera su siguiente petición.", target:target) { response in agentVoiceQueue.append(response) }
            }
            return
        }
        if AgentInvocationRules.isInvocation(text) {
            wakeWord.pause(); feedback.reply("No he reconocido a ese agente. Puedes invocar a Oráculo, Jobs, Wozniak, Disney, Lucas o Musk."); return
        }
        if let target = invokedAgent.target, StandbyRules.tourCommand(text) == nil {
            wakeWord.pause(); feedback.reply("Voy a enviar tu mensaje a \(AgentInvocationRules.names[target] ?? target).") {
                invokedAgent.send(text, target:target) { response in agentVoiceQueue.append(response) }
            }
            return
        }
        guard let command = StandbyRules.tourCommand(text) else {
            suite.command = text; wakeWord.pause(); feedback.reply("No he entendido una orden que pueda ejecutar. La he dejado escrita para que puedas revisarla."); pet.wake()
            Task { try? await Task.sleep(for: .milliseconds(300)); withAnimation { proxy.scrollTo("suiteCommands", anchor: .top) } }
            return
        }
        suite.command = command; pet.message = "Abriendo el tour…"
        let request = petRequest
        Task {
            for _ in 0..<100 {
                guard request == petRequest, scene == .active, pet.showing, !pet.holding else { return }
                if suite.ready && !suite.busy { break }
                try? await Task.sleep(for: .milliseconds(200))
            }
            guard request == petRequest else { return }
            guard scene == .active, pet.showing, suite.ready, !suite.busy else {
                pet.message = "El modo Experto no está listo. Abre los controles para revisar la conexión."; feedback.reply("El modo Experto no está listo. No he enviado la orden."); return
            }
            wakeWord.pause()
            feedback.reply("Voy a abrir el tour.") {
                guard request == petRequest, scene == .active else { return }
                suite.send(command) { warning in
                    guard request == petRequest, scene == .active else { return }
                    if let warning { agentVoiceQueue.append(warning) }
                }
                pet.wake()
            }
            try? await Task.sleep(for: .milliseconds(300))
            withAnimation { proxy.scrollTo("suiteMap", anchor: .top) }
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
    private func bindDiary() { invokedAgent.bind(assistant.accountID); diary.bind(assistant.accountID); assistant.restDiary = diary; diary.observeMorning() }
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
            if !assistant.answer.isEmpty { Text(assistant.answer).textSelection(.enabled).id("latestAssistantReply") }
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

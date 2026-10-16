import AVFoundation
import SwiftUI
import UniformTypeIdentifiers

@MainActor final class AssistantStore: ObservableObject {
    @Published var linked = false
    @Published var projectionPhoto: UIImage?
    @Published var projectionText = ""
    @Published var readingPhoto = false
    @Published var identifyingFilm: String?
    @Published var challenge: PairingChallenge?
    @Published var notes: [ListeningNote] = []
    @Published var activeID: String?
    @Published var status = "Tu conversación, también en el iPhone."
    @Published var isWorking = false
    @Published var starting = false
    @Published var inputName = ""
    @Published var question = ""
    @Published var answer = ""
    @Published var replying = false
    private let speech = SpeechOutput()
    private var photoRequest = UUID()
    private var chatConversation: String?
    private var pendingQuestion: (text: String, conversation: String, requestID: String)?
    private let api = APIClient()
    private let audio = AudioCapture()
    private let files: NoteFiles
    private var pairingTask: Task<Void, Never>?
    private var worker: Task<Void, Never>?
    private var backgroundTask = UIBackgroundTaskIdentifier.invalid
    var active: ListeningNote? { notes.first { $0.id == activeID } }
    var listening: Bool { active?.state == .listening }
    var visibleNotes: [ListeningNote] { notes.filter { $0.accountID == api.accountID } }
    init() {
        do { files = try NoteFiles() } catch { fatalError("No se puede abrir el almacenamiento protegido de Admirito.") }
        notes = (try? files.load()) ?? []; linked = api.connected
        audio.onInterruption = { [weak self] message in guard self?.listening == true else { return }; self?.pause(); self?.status = message }
    }
    func attachProjection(_ image: UIImage) {
        projectionPhoto = image; projectionText = ""; readingPhoto = true
        let request = UUID(); photoRequest = request
        Task {
            do { let text = try await ProjectionEvidence.recognize(image); guard photoRequest == request else { return }; projectionText = text }
            catch { guard photoRequest == request else { return }; status = "Foto adjunta. No se ha podido leer el texto de la proyección." }
            readingPhoto = false
        }
    }
    func identifyMovie(_ id: String) {
        guard identifyingFilm == nil, !listening, let note = note(id), note.state == .complete, note.accountID == api.accountID, let image = photo(for: note) else { return }
        identifyingFilm = id
        Task {
            defer { identifyingFilm = nil }
            do {
                let scale = min(1, 1000 / max(image.size.width, image.size.height))
                let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
                let resized = UIGraphicsImageRenderer(size: size).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
                guard let jpeg = resized.jpegData(compressionQuality: 0.65), jpeg.count <= 700000 else { throw AssistantError.recording("La foto es demasiado grande para analizarla.") }
                let result = try await api.identifyFilm(note, jpeg: jpeg)
                guard note.accountID == api.accountID else { return }
                update(id) { $0.filmIdentification = result }
                status = result.message
            } catch { status = "No se ha podido analizar la película. Puedes reintentarlo; no se ha supuesto ningún título." }
        }
    }
    func clearProjection() { photoRequest = UUID(); projectionPhoto = nil; projectionText = ""; readingPhoto = false }
    func photo(for note: ListeningNote) -> UIImage? {
        guard let filename = note.photoFilename, filename == "projection.jpg", let url = try? files.directory(note.id).appendingPathComponent(filename) else { return nil }
        return UIImage(contentsOfFile: url.path)
    }
    func pair() {
        pairingTask?.cancel(); challenge = nil
        pairingTask = Task {
            do {
                let value = try await api.beginPairing(); challenge = value; status = "Copia el código y apruébalo en tu cuenta de admira.app."
                let deadline = Date().addingTimeInterval(Double(value.expiresIn))
                while Date() < deadline, !Task.isCancelled {
                    try await Task.sleep(for: .seconds(4)); try Task.checkCancellation()
                    if try await api.poll(value) { linked = true; challenge = nil; status = "Cuenta vinculada. Puedes empezar a escuchar."; retry(); return }
                }
                challenge = nil; status = "El código ha caducado. Puedes solicitar otro."
            } catch is CancellationError {} catch { challenge = nil; status = error.localizedDescription }
        }
    }
    func signOut() { guard !listening else { return }; pairingTask?.cancel(); worker?.cancel(); clearProjection(); api.disconnect(); linked = false; activeID = nil; challenge = nil; chatConversation = nil; pendingQuestion = nil; question = ""; answer = ""; speech.stop(); status = "Has salido de esta app. Tus notas locales permanecen protegidas y vinculadas a su cuenta." }
    private func index(_ id: String) -> Int? { notes.firstIndex { $0.id == id } }
    @discardableResult private func persist(_ id: String) -> Bool { guard let i = index(id) else { return false }; do { try files.save(notes[i]); return true } catch { status = "No se han podido guardar los cambios: \(error.localizedDescription)"; return false } }
    func start(kind: ListeningKind, title: String) {
        guard linked, !starting, !listening, let accountID = api.accountID else { return }; starting = true
        Task {
            speech.stop()
            let note = ListeningNote(id: UUID().uuidString.lowercased(), accountID: accountID, kind: kind, title: title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "\(kind.label) · \(Date().formatted(date: .abbreviated, time: .shortened))" : String(title.prefix(120)), startedAt: Date(), state: .paused)
            do {
                var note = note
                if kind == .movie, let photo = projectionPhoto, let data = photo.jpegData(compressionQuality: 0.8) {
                    try data.write(to: files.directory(note.id).appendingPathComponent("projection.jpg"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                    note.photoFilename = "projection.jpg"; note.projectionText = projectionText
                }
                try files.save(note); notes.insert(note, at: 0); activeID = note.id
                projectionPhoto = nil; projectionText = ""
                bindChunks(to: note.id)
                try await audio.start(directory: files.directory(note.id), sequence: 0, offset: 0)
                if let i = index(note.id) { notes[i].state = .listening; persist(note.id) }
                inputName = audio.routeName; status = "Escuchando. Puedes bloquear la pantalla. Admirito permanece en silencio hasta terminar."
            } catch { if let i = index(note.id) { notes[i].state = .paused; persist(note.id) }; status = error.localizedDescription }
            starting = false
        }
    }
    private func bindChunks(to id: String) {
        audio.onChunk = { [weak self] chunk in self?.append(chunk, to: id) }
        audio.onSilence = { [weak self] in
            guard let self, self.listening, self.activeID == id else { return }
            self.finish(id)
            self.status = "Escucha terminada automáticamente tras cinco minutos de silencio. Preparando el resumen…"
        }
    }
    private func append(_ chunk: AudioChunk, to id: String) {
        guard let i = index(id), !notes[i].chunks.contains(where: { $0.seq == chunk.seq }) else { return }
        notes[i].chunks.append(chunk); notes[i].chunks.sort { $0.seq < $1.seq }; persist(id); retry()
        if chunk.seq == 1439 && activeID == id && listening { Task { [weak self] in guard let self, self.listening, self.activeID == id else { return }; self.finish(id); self.status = "Escucha de diez horas completada. Preparando el resumen…" } }
    }
    func pause() {
        guard let id = activeID, let i = index(id), notes[i].state == .listening else { return }
        do { let (chunk, expected) = try audio.stop(); if let chunk { append(chunk, to: id) }; notes[i].expectedChunks = expected; notes[i].state = .paused; persist(id); status = "Escucha pausada. Los fragmentos ya guardados se conservan." } catch { notes[i].state = .paused; persist(id); status = error.localizedDescription }
    }
    func resume(_ id: String) {
        guard !listening, !starting, let i = index(id), notes[i].state == .paused, notes[i].accountID == api.accountID else { return }; starting = true; activeID = id; speech.stop()
        Task { do { let sequence = max((notes[i].chunks.map(\.seq).max() ?? -1) + 1, notes[i].expectedChunks ?? 0); guard sequence < 1440 else { throw AssistantError.recording("Esta escucha ya está completa. Pulsa Resumir lo grabado.") }; bindChunks(to: id); try await audio.start(directory: files.directory(id), sequence: sequence, offset: Date().timeIntervalSince(notes[i].startedAt)); notes[i].state = .listening; persist(id); inputName = audio.routeName; status = "Escuchando de nuevo." } catch { status = error.localizedDescription }; starting = false }
    }
    func finish(_ id: String) {
        guard let i = index(id) else { return }
        if listening && activeID == id {
            do { let (chunk, expected) = try audio.stop(); if let chunk { append(chunk, to: id) }; notes[i].expectedChunks = expected } catch { status = error.localizedDescription; return }
        } else { notes[i].expectedChunks = (notes[i].chunks.map(\.seq).max() ?? -1) + 1 }
        if notes[i].expectedChunks == 0 { notes[i].state = .paused; persist(id); status = "Todavía no se ha captado audio. Puedes reanudar la escucha."; return }
        notes[i].state = .recorded; persist(id); status = "Escucha terminada. Transcribiendo y preparando el resumen…"; beginBackgroundWork(); retry()
    }
    @discardableResult private func update(_ id: String, _ body: (inout ListeningNote) -> Void) -> Bool {
        guard let i = index(id) else { return false }; body(&notes[i]); return persist(id)
    }
    private func note(_ id: String) -> ListeningNote? { notes.first { $0.id == id } }
    func retry() {
        linked = api.connected; guard worker == nil, linked else { return }
        worker = Task {
            isWorking = true; defer { isWorking = false; worker = nil; endBackgroundWork() }
            do {
                var shouldRepeat = true
                while shouldRepeat && !Task.isCancelled {
                    shouldRepeat = false
                    for id in visibleNotes.filter({ $0.state != .complete }).map(\.id) {
                        try Task.checkCancellation()
                        guard let initial = note(id) else { continue }
                        if initial.conversationID == nil { let conversation = try await api.conversation(); update(id) { $0.conversationID = conversation } }
                        guard let registered = note(id) else { continue }; try await api.register(registered)
                        for seq in registered.chunks.filter({ !$0.uploaded }).map(\.seq) {
                            guard let chunk = note(id)?.chunks.first(where: { $0.seq == seq }) else { continue }
                            if chunk.transcript == nil {
                                let url = try files.directory(id).appendingPathComponent(chunk.filename)
                                guard FileManager.default.fileExists(atPath: url.path) else { throw AssistantError.missingAudio }
                                let text = try await api.transcribe(url)
                                update(id) { note in if let i = note.chunks.firstIndex(where: { $0.seq == seq }) { note.chunks[i].transcript = text } }
                            }
                            guard let ready = note(id)?.chunks.first(where: { $0.seq == seq }) else { continue }
                            try await api.upload(ready, noteID: id)
                            let durable = update(id) { note in if let i = note.chunks.firstIndex(where: { $0.seq == seq }) { note.chunks[i].uploaded = true } }
                            if durable { try? FileManager.default.removeItem(at: files.directory(id).appendingPathComponent(ready.filename)) }
                        }
                        guard let current = note(id), [.recorded, .summaryPending].contains(current.state), current.allChunksReady else { continue }
                        update(id) { $0.state = .summaryPending }
                        let result = try await api.summarize(current)
                        if result.status == "complete", let summary = result.summary {
                            update(id) { $0.summary = summary; $0.state = .complete }; status = "Resumen guardado en la misma conversación de admira.app."
                        } else { shouldRepeat = true; status = "Resumiendo fragmentos \(result.processed ?? 0)/\(result.total ?? 0)…" }
                    }
                    if shouldRepeat { try await Task.sleep(for: .seconds(3)) }
                }
            } catch is CancellationError {} catch { linked = api.connected; status = error.localizedDescription }
        }
    }
    func ask() {
        let text = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard linked, !listening, !replying, !text.isEmpty, text.count <= 2000 else { return }; replying = true
        Task {
            defer { replying = false }
            do {
                let conversation: String
                if let existing = chatConversation ?? active?.conversationID { conversation = existing }
                else { conversation = try await api.conversation() }
                chatConversation = conversation
                if pendingQuestion?.text != text || pendingQuestion?.conversation != conversation { pendingQuestion = (text, conversation, UUID().uuidString.lowercased()) }
                let response = try await api.ask(text, conversation: conversation, requestID: pendingQuestion!.requestID)
                answer = response; question = ""; pendingQuestion = nil
                if !listening { try speech.speak(response) }
            } catch { linked = api.connected; status = error.localizedDescription }
        }
    }
    func read(_ text: String) { guard !listening else { return }; do { try speech.speak(text) } catch { status = error.localizedDescription } }
    func stopSpeaking() { if !listening { speech.stop() } }
    private func beginBackgroundWork() {
        guard backgroundTask == .invalid else { return }
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Admirito guarda el resumen") { [weak self] in Task { @MainActor in self?.worker?.cancel(); self?.endBackgroundWork() } }
    }
    private func endBackgroundWork() { if backgroundTask != .invalid { UIApplication.shared.endBackgroundTask(backgroundTask); backgroundTask = .invalid } }
    func importMedia(_ source: URL, kind: ListeningKind) {
        guard linked, !starting, !listening, let accountID = api.accountID else { return }; starting = true
        Task {
            let access = source.startAccessingSecurityScopedResource(); defer { if access { source.stopAccessingSecurityScopedResource() }; starting = false }
            let note = ListeningNote(id: UUID().uuidString.lowercased(), accountID: accountID, kind: kind, title: String(source.deletingPathExtension().lastPathComponent.prefix(120)), startedAt: Date(), state: .paused)
            do {
                try files.save(note); notes.insert(note, at: 0); activeID = note.id
                let asset = AVURLAsset(url: source); let duration = try await asset.load(.duration).seconds
                guard duration.isFinite, duration > 0, duration <= 10 * 3600 else { throw AssistantError.recording("El archivo debe durar entre unos segundos y diez horas.") }
                let directory = try files.directory(note.id); let count = Int(ceil(duration / 25))
                for seq in 0..<count {
                    try Task.checkCancellation(); let start = Double(seq) * 25, length = min(25, duration - start), name = String(format: "chunk-%05d.m4a", seq), url = directory.appendingPathComponent(name)
                    guard let exporter = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else { throw AssistantError.recording("No se puede importar este archivo. Puede estar protegido o no contener audio accesible.") }
                    exporter.outputURL = url; exporter.outputFileType = .m4a; exporter.timeRange = CMTimeRange(start: CMTime(seconds: start, preferredTimescale: 600), duration: CMTime(seconds: length, preferredTimescale: 600))
                    await exporter.export(); guard exporter.status == .completed else { throw exporter.error ?? AssistantError.recording("No se ha podido leer el audio de este archivo.") }
                    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
                    let chunk = AudioChunk(seq: seq, filename: name, startSeconds: start, durationSeconds: length)
                    try JSONEncoder().encode(chunk).write(to: directory.appendingPathComponent(String(format: "chunk-%05d.json", seq)), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                    append(chunk, to: note.id); status = "Importando audio \(seq + 1)/\(count)…"
                }
                if let i = index(note.id) { notes[i].expectedChunks = count; notes[i].state = .recorded; persist(note.id) }; retry()
            } catch { status = error.localizedDescription }
        }
    }
}

import SwiftUI
import CoreMotion

struct RestEntry: Codable, Identifiable {
    var id = UUID().uuidString
    let accountID: String
    var bedtime: Date
    var bedtimeSource: String
    var morningMovement: Date?
    var morningAppOpen: Date?
    var correctedBedtime = false
    var correctedMorning = false
}
enum RestRules {
    static func isNight(_ date: Date, calendar: Calendar = .current) -> Bool { let hour = calendar.component(.hour, from: date); return hour >= 20 || hour < 4 }
    static func isMorning(_ date: Date, after bedtime: Date, calendar: Calendar = .current) -> Bool { let hour = calendar.component(.hour, from: date); return date.timeIntervalSince(bedtime) >= 7200 && date.timeIntervalSince(bedtime) < 20 * 3600 && (4..<15).contains(hour) }
}
@MainActor final class RestDiary: ObservableObject {
    @Published private(set) var entries: [RestEntry] = []
    @Published var enabled = false
    @Published var notice = ""
    private var accountID: String?
    private let activity = CMMotionActivityManager()
    private let motion = CMMotionManager()
    private var stillSince: Date?
    private var lastSample: Date?
    private let file: URL
    init() {
        let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        file = root.appendingPathComponent("AdmiritoRestDiary.json")
        entries = (try? JSONDecoder().decode([RestEntry].self, from: Data(contentsOf: file))) ?? []
    }
    var visible: [RestEntry] { entries.filter { $0.accountID == accountID }.sorted { $0.bedtime > $1.bedtime } }
    func bind(_ account: String?) {
        accountID = account; enabled = account.map { UserDefaults.standard.bool(forKey: "rest.enabled." + $0) } ?? false
        if account == nil { stopMotion() }
    }
    func setEnabled(_ value: Bool) {
        guard let accountID else { return }; enabled = value; UserDefaults.standard.set(value, forKey: "rest.enabled." + accountID)
        if value { observeMorning() } else { stopMotion() }
    }
    private func save() {
        do { try JSONEncoder().encode(entries).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]); var url = file; var values = URLResourceValues(); values.isExcludedFromBackup = true; try url.setResourceValues(values) }
        catch { notice = "No se ha podido guardar el diario. Las horas no están confirmadas." }
    }
    func startMotion() {
        guard enabled, motion.isAccelerometerAvailable else { return }
        stillSince = nil; lastSample = nil; motion.accelerometerUpdateInterval = 1
        motion.startAccelerometerUpdates(to: .main) { [weak self] sample, _ in
            guard let sample else { return }; Task { @MainActor in
                guard let self else { return }; let now = Date(), a = sample.acceleration
                let magnitude = sqrt(a.x*a.x + a.y*a.y + a.z*a.z)
                if abs(magnitude - 1) > 0.04 || self.lastSample.map({ now.timeIntervalSince($0) > 5 }) == true { self.stillSince = nil }
                else if self.stillSince == nil { self.stillSince = now }
                self.lastSample = now
            }
        }
    }
    func stopMotion() { motion.stopAccelerometerUpdates(); stillSince = nil; lastSample = nil }
    func movieEnded(at date: Date = Date()) {
        defer { stopMotion() }
        guard enabled, let accountID, RestRules.isNight(date) else { return }
        guard !visible.contains(where: { abs($0.bedtime.timeIntervalSince(date)) < 4 * 3600 && $0.morningAppOpen == nil }) else { return }
        let still = stillSince.flatMap { date.timeIntervalSince($0) >= 120 && date.timeIntervalSince(lastSample ?? .distantPast) < 5 ? $0 : nil }
        entries.append(RestEntry(accountID: accountID, bedtime: still ?? date, bedtimeSource: still == nil ? "Fin de escucha nocturna; pendiente de confirmar" : "Teléfono quieto al menos dos minutos y fin de escucha nocturna; estimación")); save()
    }
    func observeMorning(at date: Date = Date()) {
        guard enabled, let accountID, let entry = visible.first, RestRules.isMorning(date, after: entry.bedtime), let index = entries.firstIndex(where: { $0.id == entry.id }) else { return }
        if entries[index].morningAppOpen == nil { entries[index].morningAppOpen = date; save() }
        guard entry.morningMovement == nil, !entry.correctedMorning, CMMotionActivityManager.isActivityAvailable() else { return }
        let morning = Calendar.current.date(bySettingHour: 4, minute: 0, second: 0, of: date)!
        activity.queryActivityStarting(from: max(morning, entry.bedtime.addingTimeInterval(7200)), to: date, to: .main) { [weak self] activities, error in
            Task { @MainActor in
                guard let self, self.accountID == accountID, self.enabled else { return }
                guard error == nil else { self.notice = "Sin permiso o datos de movimiento. Solo consta cuándo abriste Admirito."; return }
                if let first = activities?.filter({ $0.confidence != .low && ($0.walking || $0.running) && !$0.automotive }).min(by: { $0.startDate < $1.startDate }), let i = self.entries.firstIndex(where: { $0.id == entry.id }), !self.entries[i].correctedMorning {
                    self.entries[i].morningMovement = first.startDate; self.save()
                }
            }
        }
    }
    func correct(_ id: String, bedtime: Date, morning: Date?) {
        guard let i = entries.firstIndex(where: { $0.id == id && $0.accountID == accountID }) else { return }
        guard morning.map({ $0 >= bedtime }) ?? true else { notice = "La hora de la mañana debe ser posterior a acostarte."; return }
        entries[i].bedtime = bedtime; entries[i].correctedBedtime = true; entries[i].bedtimeSource = "Hora corregida por ti"
        entries[i].morningMovement = morning; entries[i].correctedMorning = morning != nil; save()
    }
}
struct RestDiaryView: View {
    @ObservedObject var diary: RestDiary
    @State private var editing: RestEntry?
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Mi horario de descanso").font(.headline)
            Toggle("Estimar mis horarios", isOn: Binding(get: { diary.enabled }, set: { diary.setEnabled($0) }))
            Text("No mide sueño. Usa el fin de la escucha nocturna y el movimiento del teléfono como pistas de acostarte. Por la mañana distingue movimiento observado de la primera apertura de Admirito; no puede ver el uso de otras apps ni tus alarmas.").font(.caption).foregroundStyle(.secondary)
            if !diary.notice.isEmpty { Text(diary.notice).font(.caption) }
            ForEach(diary.visible.prefix(7)) { entry in
                VStack(alignment: .leading, spacing: 6) {
                    Text(entry.bedtime.formatted(date: .abbreviated, time: .omitted)).font(.subheadline.bold())
                    Text("Acostarme (estimación): " + entry.bedtime.formatted(date: .omitted, time: .shortened))
                    Text(entry.bedtimeSource).font(.caption)
                    if let morning = entry.morningMovement { Text((entry.correctedMorning ? "Cogí el móvil (corregido): " : "Primer movimiento matutino observado (pista): ") + morning.formatted(date: .omitted, time: .shortened)) }
                    if let opened = entry.morningAppOpen { Text("Primera apertura de Admirito: " + opened.formatted(date: .omitted, time: .shortened)) }
                    if entry.morningAppOpen == nil && entry.morningMovement == nil { Text("Mañana: todavía sin datos").font(.caption) }
                    Button("Corregir horas") { editing = entry }
                }.padding(.vertical, 6)
            }
        }.padding().background(.background, in: RoundedRectangle(cornerRadius: 20))
        .sheet(item: $editing) { entry in RestCorrection(entry: entry) { bed, morning in diary.correct(entry.id, bedtime: bed, morning: morning) } }
    }
}
struct RestCorrection: View {
    let entry: RestEntry
    let save: (Date, Date?) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var bed: Date
    @State private var morning: Date
    @State private var hasMorning: Bool
    init(entry: RestEntry, save: @escaping (Date, Date?) -> Void) { self.entry = entry; self.save = save; _bed = State(initialValue: entry.bedtime); _morning = State(initialValue: entry.morningMovement ?? entry.morningAppOpen ?? entry.bedtime.addingTimeInterval(8*3600)); _hasMorning = State(initialValue: entry.morningMovement != nil || entry.morningAppOpen != nil) }
    var body: some View { NavigationStack { Form { DatePicker("Me acosté", selection: $bed); Toggle("Sé cuándo cogí el móvil", isOn: $hasMorning); if hasMorning { DatePicker("Cogí el móvil", selection: $morning, in: bed...) }; Text("Son horarios de acostarte y coger el móvil, no de dormir ni despertar.").font(.caption); Button("Guardar corrección") { save(bed, hasMorning ? morning : nil); dismiss() }.disabled(hasMorning && morning < bed) }.navigationTitle("Corregir horarios") } }
}

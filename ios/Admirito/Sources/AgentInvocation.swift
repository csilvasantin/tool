import Foundation
import SwiftUI

struct AgentInvocationReply: Decodable {
    let requestId: String
    let target: String
    let state: String
    let answer: String?
    let message: String?
}
enum AgentInvocationRules {
    static let names = ["bugito":"Bugito", "supervisor":"Supervisor", "oraculo":"Oráculo", "jobs":"Jobs", "wozniak":"Wozniak", "disney":"Disney", "lucas":"Lucas", "musk":"Musk"]
    static func question(_ text: String, target: String?) -> String {
        guard target == "bugito" || target == "supervisor" else { return AgentFallbackRules.question(text) }
        return text
    }
    static func mascot(_ target: String?) -> String { target == "bugito" ? "Bugito" : target == "supervisor" ? "Supervisor" : "Admirito" }
    static func normalized(_ text: String) -> String {
        text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier:"es_ES")).components(separatedBy: CharacterSet.letters.inverted).filter { !$0.isEmpty }.joined(separator:" ")
    }
    static func target(_ text: String) -> String? {
        var words = normalized(text)
        if words.hasPrefix("admirito ") { words.removeFirst(9) }
        for prefix in ["invoca a ", "invoca al consejero ", "invoca al agente ", "invoca "] where words.hasPrefix(prefix) {
            let literal = String(words.dropFirst(prefix.count))
            let name = literal == "bujito" ? "bugito" : literal
            return names[name] == nil ? nil : name
        }
        return nil
    }
    static func isInvocation(_ text: String) -> Bool { normalized(text).contains("invoca") }
    static func returnsToAdmirito(_ text: String) -> Bool { ["vuelve a admirito", "volver a admirito", "admirito vuelve"].contains(normalized(text)) }
}
/// Uses the real fleet mailbox. The model conversation is never used as a substitute.
@MainActor final class AgentInvocation: ObservableObject {
    @Published private(set) var target: String?
    @Published private(set) var lastDemo: RemoteDemoRequest?
    @Published private(set) var busy = false
    @Published private(set) var status = ""
    @Published private(set) var answer = ""
    private var api = APIClient()
    private var task: Task<Void, Never>?
    private var account: String?
    private var pending: Pending?
    private var channelConversation: String?
    private struct Pending: Codable { let conversation: String; let request: String; let target: String; let text: String; let demo: RemoteDemoRequest? }
    private var key: String? { account.map { "admirito.invocation.\($0)" } }
    func bind(_ account: String?) {
        guard account != self.account else { return }
        task?.cancel(); task = nil; busy = false; target = nil; answer = ""; status = ""; pending = nil; self.account = account; api = APIClient(); channelConversation = nil; lastDemo = nil
        if let key {
            if let data = UserDefaults.standard.data(forKey:key + ".demo"), let value = try? JSONDecoder().decode(RemoteDemoRequest.self,from:data), RemoteDemoRules.catalog?.demos[value.id] != nil, RemoteDemoRules.catalog?.destinations[value.destination] != nil { lastDemo = value }
            if let selected = UserDefaults.standard.string(forKey:key + ".target"), AgentInvocationRules.names[selected] != nil { target = selected; status = "Canal de \(AgentInvocationRules.names[selected] ?? selected) seleccionado." }
            if let conversation = UserDefaults.standard.string(forKey:key + ".conversation"), UUID(uuidString:conversation) != nil { channelConversation = conversation }
        }
        if let key, let data = UserDefaults.standard.data(forKey:key), let value = try? JSONDecoder().decode(Pending.self, from:data) { pending = value; status = "Hay una petición al agente pendiente de comprobar." }
    }
    func selectMascot(_ selected: String) {
        guard account != nil else { return }
        if selected == "admirito" { leave(); return }
        guard ["bugito","supervisor"].contains(selected) else { return }
        target = selected
        if let key { UserDefaults.standard.set(selected,forKey:key + ".target") }
        status = "Canal de \(SelfName(selected)) seleccionado."
    }
    private func SelfName(_ value: String) -> String { AgentInvocationRules.names[value] ?? value }
    func leave() { if let key { UserDefaults.standard.removeObject(forKey:key + ".target") }; task?.cancel(); task = nil; busy = false; target = nil; status = "Has vuelto a Admirito. Las peticiones ya enviadas continúan en la flota." }
    func stopWaiting() {
        task?.cancel(); task = nil; busy = false; pending = nil; save()
        status = "Has dejado de esperar en el iPhone. Esto no cancela una petición ya entregada al agente."
    }
    func send(_ text: String, target selected: String, demo: RemoteDemoRequest? = nil, speak: @escaping (String)->Void) {
        guard !busy, pending == nil, account != nil else { speak("Todavía hay una petición pendiente. Primero comprobaré su respuesta."); resume(speak:speak); return }
        if demo == nil { target = selected; if let key { UserDefaults.standard.set(selected,forKey:key + ".target") } }; answer = ""; busy = true; status = demo.map { "Preparando \(RemoteDemoRules.label($0))…" } ?? "Preparando la petición a \(AgentInvocationRules.names[selected] ?? selected)…"
        let owner = account
        task = Task {
            do {
                let conversation: String
                if let existing = channelConversation { conversation = existing }
                else { conversation = try await api.conversation() }
                guard owner == account, !Task.isCancelled else { return }
                channelConversation = conversation
                if let key { UserDefaults.standard.set(conversation,forKey:key + ".conversation") }
                let item = Pending(conversation:conversation, request:UUID().uuidString.lowercased(), target:selected, text:text, demo:demo)
                pending = item; save()
                if let demo, let key, let data = try? JSONEncoder().encode(demo) { lastDemo = demo; UserDefaults.standard.set(data,forKey:key + ".demo") }
                let result: AgentInvocationReply
                if let demo { result = try await api.invokeDemo(demo,conversation:conversation,requestID:item.request) }
                else { result = try await api.invoke(text, target:selected, conversation:conversation, requestID:item.request) }
                guard owner == account, !Task.isCancelled else { return }
                status = result.state == "waiting" ? (demo.map { "He solicitado la \(RemoteDemoRules.label($0)). Esperando confirmación del ordenador." } ?? "Petición entregada a \(AgentInvocationRules.names[selected] ?? selected). Esperando su respuesta real.") : (result.message ?? "Comprobando la entrega de la petición…")
                speak(status)
                await poll(item, owner:owner, speak:speak)
            } catch {
                guard owner == account, !Task.isCancelled else { return }
                busy = false
                if case AssistantError.server(let code, _) = error, (400..<500).contains(code) {
                    pending = nil; save()
                    status = code == 403 ? "Tu cuenta no tiene permiso para invocar agentes. No he enviado la petición." : code == 401 ? "Vincula de nuevo tu cuenta para hablar con el agente." : "El servidor no ha aceptado la petición al agente. Puedes revisar la conexión y volver a intentarlo."
                } else { status = "No puedo confirmar la entrega al agente. No voy a reenviarla automáticamente." }
                speak(status)
            }
        }
    }
    func resume(speak: @escaping (String)->Void) {
        guard !busy, let item = pending else { return }
        busy = true; let owner = account
        task = Task { await poll(item, owner:owner, speak:speak) }
    }
    private func poll(_ item: Pending, owner: String?, speak: @escaping (String)->Void) async {
        defer { if owner == account && (pending == nil || pending?.request == item.request) { busy = false } }
        // Real fleet tasks can include a measured pause/recovery interval. Keep
        // polling for up to ten minutes; never resend a delivered request.
        for _ in 0..<200 {
            guard owner == account, pending?.request == item.request, !Task.isCancelled else { return }
            do {
                let result = try await api.invocation(conversation:item.conversation, requestID:item.request)
                guard owner == account, !Task.isCancelled else { return }
                if result.state == "complete" || result.state == "failed" {
                    answer = result.answer ?? result.message ?? "El agente ha cerrado la petición sin adjuntar una respuesta."
                    status = "\(AgentInvocationRules.names[item.target] ?? item.target) · \(result.state == "complete" ? "Respuesta recibida" : "Petición no completada")"
                    pending = nil; save(); speak(answer); return
                }
                if result.state == "uncertain" || result.state == "submitting" || result.state == "unavailable" {
                    status = result.message ?? "La entrega sigue sin confirmar."; return
                }
            } catch { status = "No puedo consultar la respuesta ahora. La petición se conserva sin reenviarla."; return }
            try? await Task.sleep(for:.seconds(3))
        }
        status = "El agente todavía no ha respondido. La petición sigue pendiente; puedes pulsar «Comprobar respuesta»."
        speak("El agente todavía no ha respondido. Puedes comprobar la respuesta más tarde.")
    }
    private func save() {
        guard let key else { return }
        if let pending, let data = try? JSONEncoder().encode(pending) { UserDefaults.standard.set(data,forKey:key) }
        else { UserDefaults.standard.removeObject(forKey:key) }
    }
}

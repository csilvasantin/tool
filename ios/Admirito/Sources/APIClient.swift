import Foundation
import Security

enum AssistantError: LocalizedError {
    case server(Int, String), notLinked, missingAudio, recording(String)
    var errorDescription: String? {
        switch self {
        case .notLinked: return "Vincula tu cuenta de admira.app para continuar."
        case .server(let status, let code): return "No se ha completado la petición (\(status), \(code)). Tus fragmentos siguen guardados para reintentar."
        case .missingAudio: return "Falta un fragmento de audio. No se generará un resumen incompleto."
        case .recording(let message): return message
        }
    }
}
struct PairingChallenge: Decodable { let deviceId: String; let secret: String; let code: String; let expiresIn: Int }
private struct PairingResult: Decodable { let status: String; let accountId: String? }
private struct DeviceCredential: Codable { let value: String; let expires: Date; let accountID: String }
private enum CredentialStore {
    static let service = "com.admira.admirito.conversation"
    static func load() -> Data? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "device", kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?; return SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess ? result as? Data : nil
    }
    static func save(_ data: Data) throws {
        clear(); let result = SecItemAdd([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "device", kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly] as CFDictionary, nil)
        if result != errSecSuccess { throw AssistantError.recording("No se ha podido guardar el vínculo en el llavero.") }
    }
    static func clear() { SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "device"] as CFDictionary) }
}
@MainActor protocol AssistantService: AnyObject {
    var accountID: String? { get }
    var connected: Bool { get }
    func disconnect()
    func beginPairing() async throws -> PairingChallenge
    func poll(_ challenge: PairingChallenge) async throws -> Bool
    func conversation() async throws -> String
    func register(_ note: ListeningNote) async throws
    func transcribe(_ file: URL) async throws -> String
    func transcribeCommand(_ file: URL) async throws -> String
    func upload(_ chunk: AudioChunk, noteID: String) async throws
    func ask(_ text: String, conversation: String, requestID: String) async throws -> String
    func summarize(_ note: ListeningNote) async throws -> SummaryReply
    func identifyFilm(_ note: ListeningNote, jpeg: Data) async throws -> FilmIdentification
}
@MainActor extension AssistantService {
    func transcribeCommand(_ file: URL) async throws -> String { try await transcribe(file) }
}
@MainActor final class APIClient: AssistantService {
    // Both names are declared custom domains of the same yokup-rtc service.
    // The .app API currently resolves to unreachable anycast addresses on this
    // network. Use the reachable official API alias, never a web-view cookie.
    private let base = URL(string: "https://api.admira.biz")!
    private let session = URLSession(configuration: .ephemeral)
    private(set) var accountID: String?
    var connected: Bool { accountID != nil }
    init() {
        if let data = CredentialStore.load(), let credential = try? JSONDecoder().decode(DeviceCredential.self, from: data), credential.expires > Date() {
            let cookie = HTTPCookie(properties: [.domain: base.host!, .path: "/", .name: "__Host-admira_agents", .value: credential.value, .secure: "TRUE", .expires: credential.expires])
            if let cookie { session.configuration.httpCookieStorage?.setCookie(cookie); accountID = credential.accountID }
        }
    }
    struct LabIncidentReply: Decodable { let ok: Bool; let id: String; let url: String }
    func labLighting(_ mascot: String) async throws {
        struct Result: Decodable { let queued: Bool }
        let _: Result = try await request("agents/lab-lighting", method:"POST", object:["mascot":mascot,"request_id":UUID().uuidString.lowercased()])
    }
    func reportPlayerIncident(jpeg: Data, requestID: String, capturedAt: Int64) async throws -> LabIncidentReply {
        try await request("agents/player-incidents",method:"POST",data:jpeg,mime:"image/jpeg",headers:["X-Request-ID":requestID,"X-Captured-At":String(capturedAt)])
    }
    func labCameraFrame() async throws -> Data {
        var request=URLRequest(url:base.appendingPathComponent("agents/lab-camera/frame"))
        request.timeoutInterval=20
        request.setValue("https://www.admira.app",forHTTPHeaderField:"Origin")
        let (data,response)=try await session.data(for:request)
        guard let http=response as? HTTPURLResponse,http.statusCode==200,http.mimeType=="image/jpeg" else { throw AssistantError.recording("No se recibe la Insta360. Comprueba el vínculo y la conexión del Lab.") }
        return data
    }
    func disconnect() { accountID = nil; CredentialStore.clear(); session.configuration.httpCookieStorage?.removeCookies(since: .distantPast) }
    private func request<T: Decodable>(_ path: String, method: String = "GET", object: [String: Any]? = nil, data: Data? = nil, mime: String = "application/json", headers: [String:String] = [:]) async throws -> T {
        var request = URLRequest(url: base.appendingPathComponent(path)); request.httpMethod = method; request.timeoutInterval = 110
        request.setValue("https://www.admira.app", forHTTPHeaderField: "Origin"); request.setValue(mime, forHTTPHeaderField: "Content-Type")
        for (key,value) in headers { request.setValue(value,forHTTPHeaderField:key) }
        request.httpBody = try object.map { try JSONSerialization.data(withJSONObject: $0) } ?? data
        let (responseData, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        if !(200..<300).contains(http.statusCode) {
            let code = (try? JSONSerialization.jsonObject(with: responseData) as? [String: Any])?["error"] as? String ?? "unavailable"
            if http.statusCode == 401 { disconnect() }
            throw AssistantError.server(http.statusCode, code)
        }
        let decoder = JSONDecoder(); decoder.keyDecodingStrategy = .convertFromSnakeCase; return try decoder.decode(T.self, from: responseData)
    }
    func beginPairing() async throws -> PairingChallenge { try await request("agents/devices/start", method: "POST", object: ["client": "ios"]) }
    func poll(_ challenge: PairingChallenge) async throws -> Bool {
        let result: PairingResult = try await request("agents/devices/poll", method: "POST", object: ["device_id": challenge.deviceId, "secret": challenge.secret])
        guard result.status == "paired", let account = result.accountId else { return false }
        guard let cookie = session.configuration.httpCookieStorage?.cookies?.first(where: { $0.name == "__Host-admira_agents" && $0.domain == base.host }), let expires = cookie.expiresDate else { throw AssistantError.notLinked }
        try CredentialStore.save(JSONEncoder().encode(DeviceCredential(value: cookie.value, expires: expires, accountID: account))); accountID = account; return true
    }
    func conversation() async throws -> String {
        struct List: Decodable { let conversations: [ConversationRef] }; struct Created: Decodable { let conversation: ConversationRef }
        let list: List = try await request("agents/conversations"); if let first = list.conversations.first { return first.id }
        let created: Created = try await request("agents/conversations", method: "POST", object: [:]); return created.conversation.id
    }
    func newConversation() async throws -> String {
        struct Created: Decodable { let conversation: ConversationRef }
        let created: Created = try await request("agents/conversations", method: "POST", object: [:]); return created.conversation.id
    }
    func deleteConversation(_ id: String) async throws {
        struct Result: Decodable { let ok: Bool }; let _: Result = try await request("agents/conversations/\(id)", method: "DELETE")
    }
    func deleteNote(_ id: String) async throws {
        struct Result: Decodable { let ok: Bool }; let _: Result = try await request("agents/listening/\(id)", method: "DELETE")
    }
    func register(_ note: ListeningNote) async throws {
        struct Result: Decodable { struct Session: Decodable { let id: String }; let session: Session }
        guard let conversation = note.conversationID else { throw AssistantError.notLinked }
        let _: Result = try await request("agents/listening", method: "POST", object: ["id": note.id, "conversation_id": conversation, "kind": note.kind.rawValue, "title": note.title])
    }
    func transcribe(_ file: URL) async throws -> String {
        struct Result: Decodable { let text: String }
        do { let result: Result = try await request("agents/transcribe", method: "POST", data: Data(contentsOf: file), mime: file.pathExtension == "m4a" ? "audio/mp4" : "audio/wav"); return result.text }
        catch AssistantError.server(422, "no_speech") { return "" }
    }
    func transcribeCommand(_ file: URL) async throws -> String {
        struct Result: Decodable { let text: String }
        do {
            let result: Result = try await request("agents/transcribe", method:"POST", data:Data(contentsOf:file), mime:"audio/wav", headers:["X-Admirito-Language":"es"])
            return result.text
        } catch AssistantError.server(422, "no_speech") { return "" }
    }
    func upload(_ chunk: AudioChunk, noteID: String) async throws {
        struct Result: Decodable { let ok: Bool }
        let _: Result = try await request("agents/listening/\(noteID)/chunks", method: "POST", object: ["seq": chunk.seq, "start_seconds": chunk.startSeconds, "duration_seconds": chunk.durationSeconds, "text": chunk.transcript ?? ""])
    }
    func ask(_ text: String, conversation: String, requestID: String) async throws -> String {
        struct Reply: Decodable { let answer: String }
        let reply: Reply = try await request("agents/conversations/\(conversation)/messages", method: "POST", object: ["text": text, "agent": "admirito", "lang": "es", "request_id": requestID]); return reply.answer
    }
    func invoke(_ text: String, target: String, conversation: String, requestID: String) async throws -> AgentInvocationReply {
        try await request("agents/conversations/\(conversation)/invocations", method:"POST", object:["text":text,"target":target,"request_id":requestID])
    }
    func invokeDemo(_ demo: RemoteDemoRequest, conversation: String, requestID: String) async throws -> AgentInvocationReply {
        try await request("agents/conversations/\(conversation)/invocations",method:"POST",object:["target":"oraculo","text":RemoteDemoRules.label(demo),"demo":["id":demo.id,"destination":demo.destination],"request_id":requestID])
    }
    func invocation(conversation: String, requestID: String) async throws -> AgentInvocationReply {
        try await request("agents/conversations/\(conversation)/invocations/\(requestID)")
    }
    func identifyFilm(_ note: ListeningNote, jpeg: Data) async throws -> FilmIdentification {
        try await request("agents/listening/\(note.id)/identify", method: "POST", data: jpeg, mime: "image/jpeg")
    }
    func summarize(_ note: ListeningNote) async throws -> SummaryReply { try await request("agents/listening/\(note.id)/summary", method: "POST", object: ["expected_chunks": note.expectedChunks ?? 0]) }
}

import Foundation

struct RemoteDemoRequest: Codable, Equatable { let id: String; let destination: String }
enum RemoteDemoRules {
    struct Demo: Decodable { let name: String; let url: String; let aliases: [String] }
    struct Destination: Decodable { let name: String; let browser: String; let aliases: [String] }
    struct Catalog: Decodable { let demos: [String:Demo]; let destinations: [String:Destination] }
    static let catalog: Catalog? = {
        guard let url = Bundle.main.url(forResource:"RemoteDemos",withExtension:"json"), let data = try? Data(contentsOf:url) else { return nil }
        return try? JSONDecoder().decode(Catalog.self,from:data)
    }()
    static func normalized(_ text: String) -> String {
        text.folding(options:[.caseInsensitive,.diacriticInsensitive],locale:Locale(identifier:"es_ES")).components(separatedBy:CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }.joined(separator:" ")
    }
    private static func commandText(_ text: String) -> String {
        var value = normalized(text)
        if value.hasPrefix("admirito ") { value.removeFirst(9) }
        for prefix in ["abre la ", "pon la ", "lanza la ", "muestra la "] where value.hasPrefix(prefix + "demo ") { value.removeFirst(prefix.count); break }
        if value.hasPrefix("demo de ") { value = "demo " + value.dropFirst(8) }
        return value
    }
    static func request(_ text: String) -> RemoteDemoRequest? {
        let value = commandText(text)
        guard value.hasPrefix("demo "), let catalog else { return nil }
        let parts = String(value.dropFirst(5)).components(separatedBy:" en ")
        guard parts.count == 2,
              let demo = catalog.demos.first(where:{ $0.value.aliases.contains(parts[0]) }),
              let destination = catalog.destinations.first(where:{ $0.value.aliases.contains(parts[1]) }) else { return nil }
        return RemoteDemoRequest(id:demo.key,destination:destination.key)
    }
    static func isRemoteDemo(_ text: String) -> Bool {
        let value = commandText(text)
        return value.hasPrefix("demo ") && value.contains(" en ")
    }
    static func label(_ request: RemoteDemoRequest) -> String {
        let name = catalog?.demos[request.id]?.name ?? request.id
        let destination = catalog?.destinations[request.destination]
        return "demo \(name) en \(destination?.browser ?? "Firefox") de \(destination?.name ?? request.destination)"
    }
}

enum RemoteDemoControl: String, CaseIterable {
    case next, previous, stop
    var phrase: String { switch self { case .next:return "siguiente"; case .previous:return "anterior"; case .stop:return "para la demo" } }
    var acknowledgement: String { switch self { case .next:return "Voy a pasar a la siguiente lámina en Firefox."; case .previous:return "Voy a volver a la lámina anterior en Firefox."; case .stop:return "Voy a pedir que se detenga la demo en Firefox." } }
    static func parse(_ text: String) -> Self? {
        var value = RemoteDemoRules.normalized(text)
        if value.hasPrefix("admirito ") { value.removeFirst(9) }
        switch value {
        case "siguiente", "la siguiente", "siguiente diapositiva", "siguiente lamina", "pasa a la siguiente": return .next
        case "anterior", "la anterior", "diapositiva anterior", "lamina anterior", "vuelve a la anterior": return .previous
        case "para la demo", "parar la demo", "deten la demo", "detener la demo", "pausa la demo": return .stop
        default: return nil
        }
    }
    func instruction(context: RemoteDemoRequest?) -> String {
        let destination = context.map(RemoteDemoRules.label) ?? "presentación Alsea que Carlos ya ha abierto en Firefox del MacMini"
        let action: String
        switch self {
        case .next: action = "Avanza exactamente una lámina. Comprueba el contador antes y después. Si ya está al final, indícalo sin afirmar que avanzaste."
        case .previous: action = "Retrocede exactamente una lámina. Comprueba el contador antes y después. Si ya está al principio, indícalo sin afirmar que retrocediste."
        case .stop: action = "Detén la reproducción automática, ensayo y voz de esa demo mediante sus controles visibles. Conserva la pestaña abierta y la lámina actual. Si ya estaba parada, dilo. No pulses Ensayar ni inicies reproducción para probar la parada. Verifica el estado final y explica cualquier limitación."
        }
        return "CONTROL DE PRESENTACIÓN solicitado por Carlos desde Admirito: \(phrase). Contexto: \(destination). Actúa en la pestaña YA ABIERTA en Firefox de ese equipo; verifica primero URL y título. No abras una demo o pestaña nueva ni envíes teclas a otra aplicación. \(action) No muevas ni redimensiones ventanas. Devuelve una respuesta breve en la nota del encargo solo después de comprobar el resultado. No repitas automáticamente la acción si no puedes confirmar si ya se aplicó."
    }
}
enum AgentFallbackRules {
    static func question(_ text: String) -> String {
        let quoted = String(data:(try? JSONEncoder().encode(text)) ?? Data(),encoding:.utf8) ?? ""
        return "CONSULTA DE ADMIRITO AL AGENTE. Carlos ha dicho (texto literal JSON): \(quoted). Admirito no reconoce esta orden y te pide interpretarla. Si es una pregunta, respóndela. Si es una acción no reconocida, propón tu interpretación y pide la aclaración necesaria. No ejecutes acciones a partir de esta consulta: primero devuelve la propuesta o la aclaración. No inventes que has ejecutado nada."
    }
}

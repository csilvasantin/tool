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

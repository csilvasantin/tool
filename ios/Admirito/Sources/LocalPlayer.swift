import SwiftUI
import WebKit

struct LocalPlayerRequest: Equatable {
    let project: String, location: String, device: String
    static func parse(_ command: String) throws -> Self? {
        let parts = command.split(whereSeparator: \.isWhitespace).map(String.init)
        guard parts.first?.lowercased() == "/player" else { return nil }
        if parts.count == 1 { return nil }
        guard parts.count == 4, parts.dropFirst().allSatisfy({ $0.range(of: "^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$", options: .regularExpression) != nil }) else {
            throw LocalPlayerError.message("Usa /player PROYECTO LOCAL ID_IOT, o el botón «Player en este iPhone».")
        }
        return Self(project: parts[1], location: parts[2], device: parts[3])
    }
}
enum LocalPlayerError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return nil }
}
struct PlayerDevice: Identifiable, Equatable {
    let id: String, name: String, screen: String
}
struct PlayerLocation: Identifiable {
    let id: String, name: String, projects: [String], devices: [PlayerDevice]
    static func catalog(_ data: Data) throws -> [Self] {
        guard let body = try JSONSerialization.jsonObject(with: data) as? [String: Any], let rows = body["locations"] as? [[String: Any]] else { throw URLError(.cannotParseResponse) }
        return rows.compactMap { row in
            guard let id = row["id"] as? String, let name = row["name"] as? String else { return nil }
            var projects = row["projects"] as? [String] ?? []
            if let project = row["project_id"] as? String { projects.append(project) }
            // Same exact membership contract as Admira.biz; names/branding grant no project membership.
            if id.hasPrefix("alsea-sbux-") { projects.append("starbucks") }
            var devices: [PlayerDevice] = []
            for item in (row["iot"] as? [[String: Any]] ?? []) + (row["surfaces"] as? [[String: Any]] ?? []) {
                let screen = [item["player"], item["instance"], item["screen"]].compactMap { $0 as? String }.first { !$0.isEmpty } ?? ""
                let device = (item["idIoT"] as? String) ?? (item["itil"] as? String) ?? screen
                guard screen.range(of: "^[a-z0-9][a-z0-9_-]{1,79}$", options: .regularExpression) != nil, !device.isEmpty, !devices.contains(where: { $0.id == device }) else { continue }
                devices.append(PlayerDevice(id: device, name: item["name"] as? String ?? device, screen: screen))
            }
            return projects.isEmpty ? nil : Self(id: id, name: name, projects: Array(Set(projects)).sorted(), devices: devices)
        }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
}
enum LocalPlayerHTTP {
    static func read(_ url: URL) async throws -> Data {
        let session = URLSession(configuration: .ephemeral); defer { session.invalidateAndCancel() }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 25)
        request.setValue("Mozilla/5.0 AdmiritoPlayer/" + MobileRelease.version, forHTTPHeaderField: "User-Agent")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200, data.count <= 32 * 1024 * 1024 else { throw URLError(.badServerResponse) }
        return data
    }
    static func playlist(_ data: Data) throws -> String {
        guard let body = try JSONSerialization.jsonObject(with: data) as? [String: Any], body["ok"] as? Bool == true,
              let draft = body["draft"] as? [String: Any], let items = draft["items"] as? [[String: Any]], !items.isEmpty,
              items.allSatisfy({ item in
                  let asset = (item["asset"] as? String) ?? (item["url"] as? String) ?? ""
                  return URL(string: asset)?.scheme == "https" && ["video", "animation", "audio", "music", "locucion", "image"].contains((item["assetType"] as? String ?? item["type"] as? String ?? "image").lowercased())
              }) else { throw LocalPlayerError.message("Este IoT no tiene una playlist reproducible asignada. Elige otro dispositivo.") }
        return draft["name"] as? String ?? "Playlist asignada"
    }
}

@MainActor final class LocalPlayerSession: NSObject, ObservableObject, WKScriptMessageHandler, WKNavigationDelegate {
    @Published var status = "Preparando AdmiraPlayer…"
    @Published var playing = false
    @Published var suspended = false
    let webView: WKWebView
    private var previousIdleTimer = false
    private var closed = false
    private var inactivityObserver: NSObjectProtocol?
    init(source: String) {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let saved = UserDefaults.standard.string(forKey: "admirito.localPlayer.identity") ?? "virtual-admirito-iphone-" + UUID().uuidString.lowercased()
        UserDefaults.standard.set(saved, forKey: "admirito.localPlayer.identity")
        let sourceJSON = String(data: try! JSONSerialization.data(withJSONObject: [source, saved]), encoding: .utf8)!
        // The canonical web player remains the renderer. Only its public playlist read is redirected.
        // Its own screen/circuit identity never becomes the selected physical IoT's identity.
        let bridge = """
        (()=>{'use strict';const [source,identity]=\(sourceJSON),original=window.fetch.bind(window);
        window.fetch=async function(input,init){const u=new URL(typeof input==='string'?input:input.url,location.href);
          if(u.origin===location.origin&&u.pathname==='/api/playlist'&&u.searchParams.get('screen')===identity){
            u.searchParams.set('screen',source);const response=await original(u.href,init);
            const data=await response.clone().json();if(!response.ok||data.ok!==true||!data.draft?.items?.length)throw Error('Playlist source unavailable');return response;
          }return original(input,init);};
        addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='#stage{visibility:hidden!important}html.admirito-assigned #stage{visibility:visible!important}';document.head.appendChild(style);
          setInterval(()=>{const assigned=typeof playlist!=='undefined'&&playlist.length>0&&playlist.every(item=>item._default===true);
          document.documentElement.classList.toggle('admirito-assigned',assigned);const media=document.querySelector('#stage video,#stage audio');if(!assigned&&media)media.pause();
          window.webkit.messageHandlers.localPlayer.postMessage({time:assigned?(media?.currentTime||0):0,ready:assigned?(media?.readyState||0):0,paused:media?.paused??true,image:assigned&&!!document.querySelector('#stage img')});},500);});})();
        """
        config.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        config.userContentController.add(self, name: "localPlayer")
        webView.navigationDelegate = self; webView.isOpaque = true; webView.backgroundColor = .black
        previousIdleTimer = UIApplication.shared.isIdleTimerDisabled; UIApplication.shared.isIdleTimerDisabled = true
        var url = URLComponents(string: "https://admira.tv/canal")!
        url.queryItems = ["screen": saved, "circuit": saved, "playerType": "virtual", "clean": "1", "fit": "screen", "muted": "1", "rtb": "0", "name": "Admirito · iPhone"].map { URLQueryItem(name: $0.key, value: $0.value) }
        webView.load(URLRequest(url: url.url!))
        // A presented SwiftUI cover can retain an active scenePhase; use the actual UIKit event.
        inactivityObserver = NotificationCenter.default.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.suspend() }
        }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard !closed, !suspended, message.frameInfo.isMainFrame, ["admira.tv", "www.admira.tv"].contains(message.frameInfo.securityOrigin.host), let value = message.body as? [String: Any] else { return }
        let seconds = value["time"] as? Double ?? 0
        playing = (value["ready"] as? Int ?? 0) >= 2 && value["paused"] as? Bool == false && seconds > 0.2
        status = playing ? "Reproduciendo en este iPhone · \(Int(seconds)) s" : value["image"] as? Bool == true ? "Imagen de la playlist en pantalla" : "Cargando contenido de la playlist…"
    }
    func resume() { guard !closed else { return }; suspended = false; UIApplication.shared.isIdleTimerDisabled = true; webView.evaluateJavaScript("if(typeof setPaused==='function')setPaused(false);document.querySelectorAll('video,audio').forEach(x=>x.play().catch(()=>{}))") }
    func suspend() { suspended = true; playing = false; status = "Player detenido al salir de la aplicación"; webView.evaluateJavaScript("if(typeof setPaused==='function')setPaused(true);document.querySelectorAll('video,audio').forEach(x=>x.pause())"); UIApplication.shared.isIdleTimerDisabled = previousIdleTimer }
    func close() {
        guard !closed else { return }; closed = true; if let inactivityObserver { NotificationCenter.default.removeObserver(inactivityObserver) }; inactivityObserver = nil; suspend(); webView.stopLoading(); webView.loadHTMLString("", baseURL: nil)
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "localPlayer")
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        decisionHandler(url.scheme == "https" && ["admira.tv", "www.admira.tv"].contains(url.host ?? "") ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { status = "No se ha podido abrir AdmiraPlayer. Cierra y vuelve a intentarlo." }
}
private struct LocalPlayerSurface: UIViewRepresentable {
    let session: LocalPlayerSession
    func makeUIView(context: Context) -> WKWebView { session.webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}
struct LocalPlayerView: View {
    @Environment(\.dismiss) private var dismiss
    let request: LocalPlayerRequest?
    @State private var locations: [PlayerLocation] = []
    @State private var project = ""
    @State private var location = ""
    @State private var device = ""
    @State private var search = ""
    @FocusState private var searching: Bool
    @State private var status = "Cargando proyectos, locales e IoT…"
    @State private var busy = false
    @State private var session: LocalPlayerSession?
    @State private var playlistName = ""
    private var projects: [String] { Array(Set(locations.flatMap(\.projects))).sorted() }
    private var projectLocations: [PlayerLocation] { locations.filter { $0.projects.contains(project) } }
    private var chosen: PlayerLocation? { projectLocations.first { $0.id == location } }
    private var chosenDevice: PlayerDevice? { chosen?.devices.first { $0.id == device } }
    var body: some View {
        NavigationStack {
            Group {
                if let session { LocalPlayerPlayback(session: session, playlistName: playlistName, context: "\(project) · \(location) · \(device)") }
                else { Form {
                    Section("Reproducir en este iPhone") {
                        Picker("Proyecto", selection: Binding(get: { project }, set: { project = $0; location = ""; device = "" })) { Text("Selecciona un proyecto").tag(""); ForEach(projects, id: \.self) { Text($0).tag($0) } }.accessibilityIdentifier("localPlayerProject")
                        TextField("Buscar local", text: $search).focused($searching).submitLabel(.search).onSubmit { searching = false }.accessibilityIdentifier("localPlayerSearch")
                        Picker("Local", selection: Binding(get: { location }, set: { location = $0; device = ""; searching = false })) { Text("Selecciona un local").tag(""); ForEach(projectLocations.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) || $0.id.localizedCaseInsensitiveContains(search) }) { Text($0.name).tag($0.id) } }.accessibilityIdentifier("localPlayerLocation")
                        Picker("Dispositivo IoT", selection: $device) { Text("Selecciona un dispositivo").tag(""); ForEach(chosen?.devices ?? []) { Text($0.name).tag($0.id) } }.pickerStyle(.navigationLink).accessibilityIdentifier("localPlayerDevice")
                        if let selected = chosenDevice { Text("IoT: " + selected.id + " · Player: " + selected.screen).font(.caption2).accessibilityIdentifier("localPlayerSelectedDevice") }
                        Text("El iPhone reproduce la playlist asignada al IoT elegido. El dispositivo de origen conserva su reproducción y sus controles.").font(.caption)
                        Button(busy ? "Preparando…" : "Reproducir en este iPhone") { launch() }.disabled(chosenDevice == nil || busy).accessibilityIdentifier("localPlayerStart")
                    }
                    Section { Text(status).accessibilityIdentifier("localPlayerSetupStatus"); Button("Actualizar catálogo") { Task { await load() } }.disabled(busy) }
                    Section("Orden en Experto") { Text("/player PROYECTO LOCAL ID_IOT").font(.system(.caption, design: .monospaced)); Text("Solo aparecen asociaciones publicadas en el catálogo. Los locales sin IoT asignado no permiten iniciar reproducción.").font(.caption) }
                } }
            }.navigationTitle("AdmiraPlayer · iPhone").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Volver a Admirito") { session?.close(); dismiss() }.accessibilityIdentifier("localPlayerClose") } }
                .task { if locations.isEmpty { await load() } }
                .onDisappear { session?.close() }
        }
    }
    private func load() async {
        guard !busy, session == nil else { return }; busy = true; defer { busy = false }
        do {
            locations = try PlayerLocation.catalog(await LocalPlayerHTTP.read(URL(string: "https://api.admira.store/locations")!))
            status = "Catálogo actualizado. Selecciona proyecto, local e IoT."
            if let request {
                guard locations.contains(where: { $0.projects.contains(request.project) && $0.id == request.location && $0.devices.contains(where: { $0.id == request.device }) }) else { throw LocalPlayerError.message("La combinación proyecto, local e IoT no existe en el catálogo. Selecciónala aquí.") }
                project = request.project; location = request.location; device = request.device
                guard let selected = chosenDevice else { throw URLError(.cannotParseResponse) }
                try await prepare(selected)
            }
        } catch { status = error.localizedDescription }
    }
    private func prepare(_ selected: PlayerDevice) async throws {
        var url = URLComponents(string: "https://admira.tv/api/playlist")!; url.queryItems = [URLQueryItem(name: "screen", value: selected.screen)]
        playlistName = try LocalPlayerHTTP.playlist(await LocalPlayerHTTP.read(url.url!))
        try Task.checkCancellation()
        session = LocalPlayerSession(source: selected.screen)
    }
    private func launch() {
        guard let selected = chosenDevice, !busy else { return }; busy = true; status = "Comprobando la playlist asignada…"
        Task { defer { busy = false }
            do {
                try await prepare(selected)
            } catch { status = error.localizedDescription }
        }
    }
}
private struct LocalPlayerPlayback: View {
    @ObservedObject var session: LocalPlayerSession
    let playlistName: String, context: String
    var body: some View {
        VStack(spacing: 4) {
            Text(playlistName).font(.caption).lineLimit(1)
            Text(context).font(.caption2).lineLimit(2).accessibilityIdentifier("localPlayerContext")
            Text(session.status).font(.caption).accessibilityIdentifier("localPlayerStatus")
            if session.suspended { Button("Reanudar en este iPhone") { session.resume() }.accessibilityIdentifier("localPlayerResume") }
            LocalPlayerSurface(session: session).accessibilityIdentifier("localPlayerSurface")
        }
    }
}

import Foundation
import SwiftUI

/// A dedicated laboratory player; never accepts an arbitrary screen or circuit.
enum PlayerLabAction: String, CaseIterable {
    case popup, rotate, canvas, half, title, pause, resume, clear, inspect
    var label: String { switch self {
    case .popup:return "Popup";case .rotate:return "Girar contenido";case .canvas:return "Cambiar proporción";case .half:return "Media pantalla";case .title:return "Barra de título";case .pause:return "Pausar";case .resume:return "Reproducir";case .clear:return "Restaurar imagen";case .inspect:return "Supervisor: comprobar"
    } }
    var command: String? { switch self {
    case .popup:return "fault-popup";case .rotate:return "fault-rotate";case .canvas:return "fault-canvas";case .half:return "fault-half";case .title:return "fault-title";case .pause:return "pause";case .resume:return "play";case .clear:return "fault-clear";case .inspect:return nil
    } }
    static func parse(_ text: String) -> Self? {
        var value = RemoteDemoRules.normalized(text)
        if value.contains("macbook") || value.contains("macmini") || value.contains("mac mini") { return nil }
        for prefix in ["admirito ","bugito ","bujito ","supervisor "] where value.hasPrefix(prefix) { value.removeFirst(prefix.count) }
        for suffix in [" en el samsung fold"," en el fold"," del samsung fold"," del fold"," el samsung fold"," el fold"] where value.hasSuffix(suffix) { value.removeLast(suffix.count);break }
        switch value {
        case "pon un popup","pon popup","popup","muestra un popup","muestra un aviso","pon un aviso","pon una ventana encima","pon una ventana encima del contenido":return .popup
        case "gira el contenido","gira la pantalla","gira el player":return .rotate
        case "cambia la proporcion","cambia la resolucion":return .canvas
        case "media pantalla","pon media pantalla":return .half
        case "pon la barra de titulo","muestra la barra de titulo","barra de titulo":return .title
        case "pausa el player","pausa la reproduccion":return .pause
        case "reanuda el player","reproduce el player","continua el player":return .resume
        case "restaura el player","quita las trastadas","restaura la imagen":return .clear
        case "revisa","comprueba","revisa el player","comprueba el player","detecta las incidencias":return .inspect
        default:return nil
        }
    }
}
struct PlayerLabSnapshot {
    let seen: Double
    let item: String
    let issues: [String]
    static func decode(_ data: [String:Any], now: Double = Date().timeIntervalSince1970 * 1000) throws -> Self {
        guard data["screen"] as? String == PlayerLab.screen,
              let seen = data["lastSeen"] as? Double, now-seen < 40000, seen <= now+10000,
              data["standby"] as? Bool != true,
              let device = data["device"] as? [String:Any], let d = device["display"] as? [String:Any] else { throw URLError(.resourceUnavailable) }
        var issues: [String] = []
        guard let angle=d["paintedRotation"] as? Int, let overlay=d["overlay"] as? Double,
              let visible=d["visible"] as? Double, let top=d["chromeTop"] as? Double,
              let isPaused=d["playbackPaused"] as? Bool else { throw URLError(.cannotParseResponse) }
        let configured=d["rotation"] as? Int ?? 0
        if (angle-configured+360)%360 != 0 { issues.append("contenido girado \(angle) grados") }
        if overlay >= 10 { issues.append("emisión tapada en un \(Int(overlay)) por ciento") }
        if visible < 90 { issues.append("contenido limitado al \(Int(visible)) por ciento del lienzo") }
        if top >= 8 { issues.append("barra superior de \(Int(top)) píxeles") }
        if isPaused { issues.append("reproducción pausada") }
        if let canvas=d["canvas"] as? [String:Double], let w=canvas["w"],let h=canvas["h"],let vw=d["viewportWidth"] as? Double,let vh=d["viewportHeight"] as? Double, w>0,h>0,vw>0,vh>0, (w>=h) != (vw>=vh) { issues.append("proporción del lienzo distinta a la pantalla") }
        let item=(data["item"] as? [String:Any])?["title"] as? String ?? "pieza sin identificar"
        return Self(seen:seen,item:item,issues:issues)
    }
}
@MainActor final class PlayerLab: ObservableObject {
    static let screen = "virtual-lab-admirito-fold"
    @Published private(set) var busy = false
    @Published private(set) var report = "Destino: Samsung Fold · laboratorio. Inicia Player en Admirito Android."
    private let session = URLSession(configuration:.ephemeral)
    private func request(_ path: String, body: [String:Any]? = nil) async throws -> [String:Any] {
        let base="https://api.admira.store/"
        var req=URLRequest(url:URL(string:base+path)!,timeoutInterval:20)
        req.setValue("https://www.admira.biz",forHTTPHeaderField:"Origin")
        req.cachePolicy = .reloadIgnoringLocalCacheData
        if let body {req.httpMethod="POST";req.setValue("application/json",forHTTPHeaderField:"Content-Type");req.httpBody=try JSONSerialization.data(withJSONObject:body)}
        let (data,response)=try await session.data(for:req)
        guard let response=response as? HTTPURLResponse,(200..<300).contains(response.statusCode),let json=try JSONSerialization.jsonObject(with:data) as? [String:Any] else {throw URLError(.badServerResponse)}
        return json
    }
    private func snapshot() async throws -> PlayerLabSnapshot {
        try PlayerLabSnapshot.decode(await request("signage/now?screen=\(Self.screen)&t=\(UUID().uuidString)"))
    }
    func perform(_ action: PlayerLabAction, speak: @escaping (String)->Void) {
        guard !busy else { return }
        busy=true;report="Comprobando el Fold…"
        speak(action == .inspect ? "Supervisor va a comprobar el player del Fold." : "Voy a \(action.label.lowercased()) en el Fold de laboratorio.")
        Task {
            defer {busy=false}
            do {
                // A real recent producer must exist before queuing any fault.
                let before=try await snapshot()
                if let command=action.command {
                    let sent=try await request("locations/cmd",body:["id":Self.screen,"screen":Self.screen,"cmd":command])
                    guard sent["ok"] as? Bool == true,let id=sent["id"] as? String,id==Self.screen,let receipt=sent["action"] as? String else {throw URLError(.badServerResponse)}
                    var acknowledged=false
                    for _ in 0..<20 {
                        let result=try await request("locations/cmd/ack?id=\(Self.screen)&action=\(receipt)")
                        if result["seen"] as? Bool == true,let ack=result["ack"] as? [String:Any] {guard ack["status"] as? String == "executed" else {throw URLError(.cannotLoadFromNetwork)};acknowledged=true;break}
                        try await Task.sleep(for:.seconds(1))
                    }
                    guard acknowledged else {throw URLError(.timedOut)}
                }
                var first:PlayerLabSnapshot?
                var confirmed:PlayerLabSnapshot?
                for _ in 0..<30 {
                    try await Task.sleep(for:.seconds(1))
                    let current=try await snapshot()
                    guard current.seen>before.seen else {continue}
                    if let previous=first,current.seen>previous.seen {
                        if current.issues==previous.issues {confirmed=current;break}
                        first=current
                    }else if first == nil {first=current}
                }
                guard let current=confirmed else {throw URLError(.timedOut)}
                let description=current.issues.isEmpty ? "No comunica giro, popup, barra superior, recorte ni pausa." : "Detecto: "+current.issues.joined(separator:", ")+"."
                report="Supervisor · datos comunicados por el player del Fold en dos muestras recientes. \(description) Pieza: \(current.item). Esto no confirma por sí solo la imagen de la cámara ni el audio."
                speak(report)
            }catch {
                report="No puedo confirmar el resultado en el Fold. Abre Player en Admirito Android y comprueba la conexión. No repetiré la orden automáticamente."
                speak(report)
            }
        }
    }
}
struct PlayerLabPanel: View {
    @ObservedObject var lab: PlayerLab
    let execute:(PlayerLabAction)->Void
    @Environment(\.dismiss) private var dismiss
    var body:some View {
        NavigationStack { VStack(spacing:10) {
            Text(lab.report).font(.caption).lineLimit(5).frame(maxWidth:.infinity,alignment:.leading).accessibilityIdentifier("playerLabStatus")
            ScrollView { LazyVGrid(columns:Array(repeating:GridItem(.flexible()),count:3),spacing:10) {
                ForEach(PlayerLabAction.allCases,id:\.rawValue) { action in
                    Button(action.label){execute(action)}.buttonStyle(.bordered).disabled(lab.busy).accessibilityIdentifier("lab_"+action.rawValue)
                }
            } }
            Text("Destino exclusivo: Fold de laboratorio · lectura del player, no prueba de cámara.").font(.caption2).foregroundStyle(.secondary)
        }.padding().navigationTitle("Player del Fold").navigationBarTitleDisplayMode(.inline).toolbar{Button("Cerrar"){dismiss()}}}
    }
}

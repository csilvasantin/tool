import Foundation
import Network
import SwiftUI

/// Opt-in, foreground-only nearby cursor. Receives coordinates, never keys or clicks.
@MainActor final class MacGaze: ObservableObject {
    @Published private(set) var point: CGPoint?
    @Published private(set) var status = "Ratón del Mac apagado"
    private var enabled = UserDefaults.standard.bool(forKey:"admirito.macGaze")
    private var browser: NWBrowser?
    private var connection: NWConnection?
    private var buffer = Data()
    private var lastSeen = Date.distantPast
    private var timer: Task<Void,Never>?
    func toggle() {
        enabled.toggle(); UserDefaults.standard.set(enabled,forKey:"admirito.macGaze")
        if enabled { resume() } else { stop() }
    }
    func resume() {
        guard enabled, browser == nil else { return }
        status = "Buscando ratón del MacMini…"
        let parameters = NWParameters.tcp; parameters.includePeerToPeer = true
        let browser = NWBrowser(for:.bonjour(type:"_admira-gaze._tcp",domain:nil),using:parameters)
        self.browser = browser
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            let match = results.first { result in
                if case .service(let name,_,_,_) = result.endpoint { return name == "Admirito MacMini" }
                return false
            }
            Task { @MainActor in if let endpoint = match?.endpoint { self?.connect(endpoint) } }
        }
        browser.stateUpdateHandler = { [weak self] state in
            if case .failed = state { Task { @MainActor in self?.status = "No se puede descubrir el Mac. Revisa Red local."; self?.point = nil } }
        }
        browser.start(queue:.main)
        timer = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for:.seconds(1))
                guard !Task.isCancelled, let self else { return }
                if Date().timeIntervalSince(self.lastSeen) > 2 { self.point = nil; if self.connection != nil { self.status = "Ratón sin datos recientes" } }
            }
        }
    }
    private func connect(_ endpoint: NWEndpoint) {
        guard connection == nil else { return }
        let parameters = NWParameters.tcp; parameters.includePeerToPeer = true
        let c = NWConnection(to:endpoint,using:parameters); connection = c
        c.stateUpdateHandler = { [weak self, weak c] state in
            Task { @MainActor in
                guard let self, let c, self.connection === c else { return }
                switch state {
                case .ready: self.status = "Conectando mirada…"; self.receive(c)
                case .waiting(let error): self.status = "Esperando red local del Mac"; VoiceDiagnostics.record("mac_gaze_waiting", ["error":String(describing:error)])
                case .failed, .cancelled: self.connection = nil; self.point = nil; self.buffer.removeAll(); self.status = "Ratón del Mac desconectado"
                default: break
                }
            }
        }
        c.start(queue:.main)
    }
    private func receive(_ c: NWConnection) {
        c.receive(minimumIncompleteLength:1,maximumLength:4096) { [weak self, weak c] data,_,complete,error in
            Task { @MainActor in
                guard let self, let c, self.connection === c else { return }
                if let data { self.buffer.append(data) }
                if self.buffer.count > 8192 { self.buffer.removeAll(); c.cancel(); return }
                while let end = self.buffer.firstIndex(of:10) {
                    let line = self.buffer.prefix(upTo:end); self.buffer.removeSubrange(...end)
                    if let value = try? JSONDecoder().decode(Sample.self,from:Data(line)), value.x.isFinite, value.y.isFinite, abs(value.x)<=1, abs(value.y)<=1 {
                        self.point = CGPoint(x:value.x,y:value.y); self.lastSeen = Date(); self.status = "Siguiendo ratón del MacMini"
                    }
                }
                if complete || error != nil { c.cancel() } else { self.receive(c) }
            }
        }
    }
    struct Sample: Decodable { let x:Double; let y:Double }
    func stop() {
        timer?.cancel(); timer = nil; browser?.cancel(); browser = nil
        connection?.cancel(); connection = nil; buffer.removeAll(); point = nil; status = "Ratón del Mac apagado"
    }
}

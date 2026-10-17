import AppKit
import Network

// Nearby, read-only cursor publisher. No keys, clicks, screenshots, or control API.
// Run only while the owner wants Admirito to follow this Mac's pointer.
let parameters = NWParameters.tcp; parameters.includePeerToPeer = true
let listener = try NWListener(using:parameters)
listener.service = NWListener.Service(name:"Admirito MacMini",type:"_admira-gaze._tcp")
var clients: [UUID:NWConnection] = [:]
listener.newConnectionHandler = { c in
    let id = UUID(); clients[id] = c; print("Cliente de mirada conectado"); fflush(stdout)
    c.stateUpdateHandler = { state in
        if case .failed = state { print("Cliente de mirada falló"); fflush(stdout); clients.removeValue(forKey:id); c.cancel() }
        if case .cancelled = state { clients.removeValue(forKey:id) }
    }
    c.start(queue:.main)
}
listener.stateUpdateHandler = { state in
    if case .ready = state { print("Mac gaze listo: solo coordenadas normalizadas por Bonjour."); fflush(stdout) }
    if case .failed(let e) = state { fputs("No se pudo iniciar Mac gaze: \(e)\n",stderr); exit(1) }
}
listener.start(queue:.main)
var lastReported = CGPoint(x:9,y:9)
let timer = Timer.scheduledTimer(withTimeInterval:0.1,repeats:true) { _ in
    let p = NSEvent.mouseLocation
    guard let screen = NSScreen.screens.first(where:{$0.frame.contains(p)}) else { return }
    let r = screen.frame
    let x = max(-1,min(1,2*(p.x-r.minX)/r.width-1))
    let y = max(-1,min(1,1-2*(p.y-r.minY)/r.height))
    if CommandLine.arguments.contains("--diagnostics"), !clients.isEmpty, abs(x-lastReported.x)+abs(y-lastReported.y)>0.1 {
        lastReported = CGPoint(x:x,y:y);print(String(format:"gaze x=%.3f y=%.3f",x,y));fflush(stdout)
    }
    let data = Data("{\"x\":\(x),\"y\":\(y)}\n".utf8)
    for c in clients.values { c.send(content:data,completion:.contentProcessed({ _ in })) }
}
RunLoop.main.run()

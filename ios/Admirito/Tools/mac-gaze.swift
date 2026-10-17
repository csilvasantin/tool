import AppKit
import Network

// Nearby, read-only cursor publisher. No keys, clicks, screenshots, or control API.
// Run only while the owner wants Admirito to follow this Mac's pointer.
let listener = try NWListener(using:.tcp)
listener.service = NWListener.Service(name:"Admirito MacMini",type:"_admira-gaze._tcp")
var clients: [UUID:NWConnection] = [:]
listener.newConnectionHandler = { c in
    let id = UUID(); clients[id] = c
    c.stateUpdateHandler = { state in
        if case .failed = state { clients.removeValue(forKey:id); c.cancel() }
        if case .cancelled = state { clients.removeValue(forKey:id) }
    }
    c.start(queue:.main)
}
listener.stateUpdateHandler = { state in
    if case .ready = state { print("Mac gaze listo: solo coordenadas normalizadas por Bonjour."); fflush(stdout) }
    if case .failed(let e) = state { fputs("No se pudo iniciar Mac gaze: \(e)\n",stderr); exit(1) }
}
listener.start(queue:.main)
let timer = Timer.scheduledTimer(withTimeInterval:0.1,repeats:true) { _ in
    let p = NSEvent.mouseLocation
    guard let screen = NSScreen.screens.first(where:{$0.frame.contains(p)}) else { return }
    let r = screen.frame
    let x = max(-1,min(1,2*(p.x-r.minX)/r.width-1))
    let y = max(-1,min(1,1-2*(p.y-r.minY)/r.height))
    let data = Data("{\"x\":\(x),\"y\":\(y)}\n".utf8)
    for c in clients.values { c.send(content:data,completion:.contentProcessed({ _ in })) }
}
RunLoop.main.run()

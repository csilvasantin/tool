import SwiftUI
struct LabCameraView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scene
    @State private var image: UIImage?
    @State private var rotated=true
    @State private var status="Conectando con la Insta360 del Lab…"
    @State private var received: Date?
    private let client=APIClient()
    var body: some View {
        NavigationStack {
            VStack(spacing:16) {
                if let image { Image(uiImage:image).resizable().scaledToFit().rotationEffect(.degrees(rotated ? 180 : 0)).accessibilityIdentifier("labCameraFrame") }
                Button("Girar imagen") { rotated.toggle() }
                Text(status).font(.callout).accessibilityIdentifier("labCameraStatus")
                if let received { Text(received,style:.time).font(.caption) }
                Text("Vista remota · actualización cada 3 segundos. Se detiene al cerrar o salir de la aplicación.").font(.caption).foregroundStyle(.secondary)
            }.padding().navigationTitle("Insta360 · Lab").toolbar { Button("Cerrar") { dismiss() } }
            .task(id:scene) {
                guard scene == .active else {return}
                while !Task.isCancelled {
                    do {
                        let data=try await client.labCameraFrame()
                        try Task.checkCancellation()
                        guard let frame=UIImage(data:data) else {throw URLError(.cannotDecodeContentData)}
                        image=frame;received=Date();status="Insta360 conectada · imagen recibida"
                    } catch {
                        if Task.isCancelled {return}
                        image=nil;received=nil;status="Sin imagen reciente. Reintentando conexión…"
                    }
                    do {try await Task.sleep(for:.seconds(3))} catch {return}
                }
            }
        }
    }
}

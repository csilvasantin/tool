const MAX_MESSAGE = 180000;

function send(socket, payload) {
  if (!socket || socket.readyState !== 1) return false;
  try { socket.send(JSON.stringify(payload)); return true; }
  catch { return false; }
}

export class PtyRoom {
  constructor() {
    this.bridge = null;
    this.viewers = new Set();
    this.lastSize = { cols:120, rows:36 };
  }

  broadcast(payload) {
    for (const viewer of this.viewers) if (!send(viewer, payload)) this.viewers.delete(viewer);
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status:426 });
    const role = request.headers.get("x-pty-role");
    if (role !== "viewer" && role !== "bridge") return new Response("invalid role", { status:403 });
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    server.accept();

    if (role === "bridge") {
      if (this.bridge && this.bridge.readyState === 1) try { this.bridge.close(4001, "bridge replaced"); } catch {}
      this.bridge = server;
      send(server, { type:"bridge-ready", viewers:this.viewers.size, ...this.lastSize });
      this.broadcast({ type:"status", state:"connected", text:"PTY enlazado al tmux verificado" });
      if (this.viewers.size) send(server, { type:"viewer-ready", ...this.lastSize });
    } else {
      this.viewers.add(server);
      send(server, { type:"status", state:this.bridge && this.bridge.readyState === 1 ? "connected" : "waiting",
        text:this.bridge && this.bridge.readyState === 1 ? "PTY conectado" : "Esperando al puente del equipo" });
      if (this.bridge && this.bridge.readyState === 1) send(this.bridge, { type:"viewer-ready", ...this.lastSize });
    }

    server.addEventListener("message", (event) => {
      if (typeof event.data !== "string" || event.data.length > MAX_MESSAGE) return;
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (!message || typeof message !== "object") return;
      if (role === "viewer") {
        if (message.type === "resize") {
          const cols = Math.max(20, Math.min(320, Number(message.cols) || 0));
          const rows = Math.max(6, Math.min(160, Number(message.rows) || 0));
          if (Number.isInteger(cols) && Number.isInteger(rows)) this.lastSize = { cols, rows };
        }
        if ((message.type === "input" || message.type === "resize" || message.type === "focus") && this.bridge) send(this.bridge, message);
      } else if (message.type === "output" || message.type === "status" || message.type === "title" || message.type === "bell") {
        this.broadcast(message);
      }
    });

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      if (role === "bridge") {
        if (this.bridge === server) {
          this.bridge = null;
          this.broadcast({ type:"status", state:"waiting", text:"Puente PTY desconectado; reintentando" });
        }
      } else {
        this.viewers.delete(server);
        if (!this.viewers.size && this.bridge) send(this.bridge, { type:"viewer-left" });
      }
    };
    server.addEventListener("close", close);
    server.addEventListener("error", close);
    return new Response(null, { status:101, webSocket:client });
  }
}

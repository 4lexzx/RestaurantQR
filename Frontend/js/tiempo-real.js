// Tiempo real multi-pestaña y multi-tenant.
// Una sola pestaña por restaurante mantiene el EventSource; las demás reciben
// los eventos por BroadcastChannel para no agotar las conexiones del navegador.
class RealTimeClient {
  constructor() {
    this.eventSource = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 3000;
    this.isConnecting = false;
    this.isLeader = false;
    this.started = false;
    this.slug = String(window.MENUGO_SLUG || "menugo").trim().toLowerCase();
    this.tabId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.leaseKey = `menugo:sse-leader:${this.slug}`;
    this.channel = typeof BroadcastChannel === "function"
      ? new BroadcastChannel(`menugo:realtime:${this.slug}`)
      : null;
    this.leaseTimer = null;
    this.reconnectTimer = null;
  }

  connect() {
    if (this.started) return;
    this.started = true;

    if (!this.channel) {
      this.isLeader = true;
      this.openEventSource();
      return;
    }

    this.channel.onmessage = (event) => {
      const mensaje = event.data || {};
      if (mensaje.type === "event" && mensaje.payload) this.handleEvent(mensaje.payload);
      if (mensaje.type === "leader-alive" && mensaje.id !== this.tabId && this.isLeader) {
        this.evaluateLeadership();
      }
    };

    this.evaluateLeadership();
    this.leaseTimer = setInterval(() => this.evaluateLeadership(), 4000);
    window.addEventListener("beforeunload", () => this.disconnect(), { once: true });
  }

  readLease() {
    try { return JSON.parse(localStorage.getItem(this.leaseKey) || "null"); }
    catch (_) { return null; }
  }

  writeLease() {
    try {
      localStorage.setItem(this.leaseKey, JSON.stringify({ id: this.tabId, expires: Date.now() + 11000 }));
      return this.readLease()?.id === this.tabId;
    } catch (_) { return false; }
  }

  evaluateLeadership() {
    const lease = this.readLease();
    const expired = !lease || Number(lease.expires || 0) < Date.now();
    const mine = lease && lease.id === this.tabId;

    if (mine || (expired && this.writeLease())) {
      this.isLeader = true;
      this.writeLease();
      this.channel?.postMessage({ type: "leader-alive", id: this.tabId });
      this.openEventSource();
      return;
    }

    if (this.isLeader) this.closeEventSource();
    this.isLeader = false;
  }

  openEventSource() {
    if (!this.isLeader || this.isConnecting) return;
    if (this.eventSource && this.eventSource.readyState !== EventSource.CLOSED) return;

    this.isConnecting = true;
    const baseUrl = window.MENUGO_API || "http://localhost:4000/api";
    try {
      this.eventSource = new EventSource(`${baseUrl}/events?slug=${encodeURIComponent(this.slug)}&v=2`);
      this.eventSource.onopen = () => {
        this.reconnectAttempts = 0;
        this.isConnecting = false;
      };
      this.eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handleEvent(payload);
          this.channel?.postMessage({ type: "event", payload });
        } catch (error) {
          console.error("Error procesando actualización en tiempo real:", error);
        }
      };
      this.eventSource.onerror = () => {
        this.isConnecting = false;
        this.closeEventSource();
        this.reconnect();
      };
    } catch (_) {
      this.isConnecting = false;
      this.reconnect();
    }
  }

  closeEventSource() {
    if (this.eventSource) this.eventSource.close();
    this.eventSource = null;
    this.isConnecting = false;
  }

  reconnect() {
    if (!this.isLeader || this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts += 1;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.openEventSource(), this.reconnectDelay);
  }

  handleEvent(payload) {
    const type = payload && payload.type;
    const eventData = payload && payload.data;
    (this.listeners.get(type) || []).forEach((callback) => {
      try { callback(eventData); } catch (error) { console.error(`Error en evento ${type}:`, error); }
    });

    if (type === "cuentas:actualizadas" || type === "pago:cruzado:registrado") {
      (this.listeners.get("pago_cruzado:actualizado") || []).forEach((callback) => {
        try { callback(eventData); } catch (error) { console.error("Error actualizando pago cruzado:", error); }
      });
    }
  }

  on(eventType, callback) {
    if (!this.listeners.has(eventType)) this.listeners.set(eventType, []);
    this.listeners.get(eventType).push(callback);
  }

  off(eventType, callback) {
    const callbacks = this.listeners.get(eventType) || [];
    const index = callbacks.indexOf(callback);
    if (index >= 0) callbacks.splice(index, 1);
  }

  disconnect() {
    clearInterval(this.leaseTimer);
    clearTimeout(this.reconnectTimer);
    this.closeEventSource();
    if (this.isLeader) {
      try {
        if (this.readLease()?.id === this.tabId) localStorage.removeItem(this.leaseKey);
      } catch (_) {}
    }
    this.channel?.close();
    this.listeners.clear();
    this.isLeader = false;
    this.started = false;
  }
}

const realTime = new RealTimeClient();

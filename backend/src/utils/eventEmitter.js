const EventEmitter = require('events');

function getTenantActivo() {
  try {
    return require('../config/db').getTenantActivo();
  } catch (error) {
    return null;
  }
}

// Etiqueta el payload con el tenant activo de la request para que
// el stream SSE pueda filtrar por restaurante sin filtrar datos.
function tenantizar(payload) {
  const valor = payload && typeof payload === 'object' ? payload : { data: payload };
  const tenant = getTenantActivo();
  if (tenant && valor.id_restaurante === undefined) {
    valor.id_restaurante = Number(tenant.id);
  }
  return valor;
}

class RealTimeEvents extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  emitPedidoCreado(pedido) {
    this.emit('pedido:creado', tenantizar(pedido));
  }

  emitPedidoActualizado(pedido) {
    this.emit('pedido:actualizado', tenantizar(pedido));
  }

  emitMesaActualizada(mesa) {
    this.emit('mesa:actualizada', tenantizar(mesa));
  }

  emitCuentaActualizada(cuenta) {
    this.emit('cuenta:actualizada', tenantizar(cuenta));
  }

  emitPagoRegistrado(pago) {
    this.emit('pago:registrado', tenantizar(pago));
  }

  emitPagoCruzadoRegistrado(pago) {
    this.emit('pago:cruzado:registrado', tenantizar(pago));
  }

  emitProductoActualizado(producto) {
    this.emit('producto:actualizado', tenantizar(producto));
  }

  emitCuentasActualizadas(cuentas) {
    this.emit('cuentas:actualizadas', tenantizar(cuentas));
  }

  emitComentarioMesa(comentario) {
    this.emit('comentario:mesa', tenantizar(comentario));
  }

  emitPedidoCancelado(pedido) {
    this.emit('pedido:cancelado', tenantizar(pedido));
  }

  emitNuevoProducto(producto) {
    this.emit('producto:nuevo', tenantizar(producto));
  }

  emitProductoEliminado(productoId) {
    this.emit('producto:eliminado', tenantizar(productoId));
  }
}

module.exports = new RealTimeEvents();
const express = require("express");
const router = express.Router();
const pedidosController = require("../controllers/pedidos.controller");
const { requireAuth } = require('../middleware/auth');

router.get("/", pedidosController.listarPedidos);
router.post("/", pedidosController.crearPedido);
router.get("/mesa/:id_mesa", pedidosController.obtenerPedidosMesa);
router.get("/llevar/seguimiento/:codigo", pedidosController.obtenerSeguimientoLlevar);
router.post("/mesa/:id_mesa/solicitar-cuenta", pedidosController.solicitarCuenta);
router.post("/mesa/:id_mesa/comentario", pedidosController.enviarComentarioMesa);
router.get("/:id", pedidosController.obtenerPedidoPorId);
router.get("/:id/estado", pedidosController.obtenerEstadoPedido);
router.patch("/:id/estado", requireAuth('mesero', 'cocina', 'admin'), pedidosController.actualizarEstadoPedido);

module.exports = router;

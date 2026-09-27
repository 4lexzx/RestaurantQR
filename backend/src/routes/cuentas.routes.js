const express = require("express");
const router = express.Router();
const cuentasController = require("../controllers/cuentas.controller");
const { requireAuth } = require("../middleware/auth");

router.get("/activas", requireAuth("mesero", "admin"), cuentasController.listarCuentasActivas);
router.get("/pagos", requireAuth("mesero", "admin"), cuentasController.listarPagos);
router.post("/pagos", requireAuth("mesero", "admin"), cuentasController.registrarPago);

module.exports = router;

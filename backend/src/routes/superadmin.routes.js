const { Router } = require("express");
const ctrl = require("../controllers/superadmin.controller");
const { requireAuth } = require('../middleware/auth');

const router = Router();

router.post("/login", ctrl.login);
router.use(requireAuth('superadmin'));
router.get("/dashboard", ctrl.dashboard);
router.get("/restaurantes", ctrl.listarRestaurantes);
router.post("/restaurantes", ctrl.crearRestaurante);
router.patch("/restaurantes/:slug", ctrl.actualizarRestaurante);
router.delete("/restaurantes/:slug", ctrl.eliminarRestaurante);
router.get("/restaurantes/:slug/credenciales", ctrl.listarCredenciales);
router.post("/restaurantes/:slug/credenciales", ctrl.crearCredencial);
router.patch("/restaurantes/:slug/credenciales/:id/:tipo/toggle", ctrl.toggleCredencial);
router.patch("/restaurantes/:slug/credenciales/:id/:tipo", ctrl.actualizarCredencial);
router.delete("/restaurantes/:slug/credenciales/:id/:tipo", ctrl.eliminarCredencial);

module.exports = router;

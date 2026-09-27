const express = require("express");
const router = express.Router();
const restaurantesController = require("../controllers/restaurantes.controller");
const { tenantMiddleware } = require("../middleware/tenant");

router.get("/", restaurantesController.listar);
router.post("/", tenantMiddleware, restaurantesController.crear);
router.get("/:slug", restaurantesController.getConfig);
router.patch("/:slug", tenantMiddleware, restaurantesController.updateConfig);
router.delete("/:slug", tenantMiddleware, restaurantesController.desactivar);

module.exports = router;
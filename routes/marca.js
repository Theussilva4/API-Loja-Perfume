import { checkRole } from "../middlewares/rbacMiddleware.js";
import express from "express"
import { listarMarca, alterarMarca, criarMarca } from "../controllers/marcaController.js"

const router = express.Router()

router.get("/", listarMarca)
router.post("/", checkRole(["ADMIN", "GERENTE"]), criarMarca)
router.patch("/:codcategoria", alterarMarca)

export default router
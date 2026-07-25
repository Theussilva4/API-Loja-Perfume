import express from "express"
import { listarMarca, alterarMarca, criarMarca } from "../controllers/marcaController.js"

const router = express.Router()

router.get("/", listarMarca)
router.post("/", criarMarca)
router.patch("/:codcategoria", alterarMarca)

export default router
import express from "express"
import { listarEstoque, alterarEstoque, listarMovimentacoesSaida, registrarSaidaManual, cancelarSaidaManual } from "../controllers/estoqueController.js"

const router = express.Router()

router.get("/", listarEstoque)
router.get("/saidas", listarMovimentacoesSaida)
router.post("/saidas", registrarSaidaManual)
router.post("/saidas/:id/cancelar", cancelarSaidaManual)
router.patch("/:codproduto", alterarEstoque)


export default router
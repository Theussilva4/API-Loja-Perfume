import express from "express"
import { listarEstoque, alterarEstoque, listarMovimentacoesSaida, registrarSaidaManual, cancelarSaidaManual, extratoProduto, registrarEntradaManual } from "../controllers/estoqueController.js"

const router = express.Router()

router.get("/", listarEstoque)
router.get("/saidas", listarMovimentacoesSaida)
router.post("/saidas", registrarSaidaManual)
router.post("/entradas", registrarEntradaManual)
router.post("/saidas/:id/cancelar", cancelarSaidaManual)
router.get("/produto/:id/extrato", extratoProduto)
router.patch("/:codproduto", alterarEstoque)


export default router
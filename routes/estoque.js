import express from "express"
import { listarEstoque, alterarEstoque, listarMovimentacoesSaida, listarMovimentacoesEntrada, registrarSaidaManual, cancelarSaidaManual, extratoProduto, registrarEntradaManual, transferirEstoque, listarLotes, listarTodasValidades, listarPendenciasRastreabilidade, atribuirValidadeManual, descartarLote } from "../controllers/estoqueController.js"

const router = express.Router()

router.get("/", listarEstoque)
router.get("/saidas", listarMovimentacoesSaida)
router.get("/entradas", listarMovimentacoesEntrada)
router.post("/saidas", registrarSaidaManual)
router.post("/entradas", registrarEntradaManual)
router.post("/saidas/:id/cancelar", cancelarSaidaManual)
router.get("/produto/:id/extrato", extratoProduto)
router.patch("/:codproduto", alterarEstoque)

// Validades e Lotes
router.get("/validades/lotes", listarTodasValidades)
router.get("/validades/pendencias", listarPendenciasRastreabilidade)
router.post("/validades/atribuir", atribuirValidadeManual)
router.post("/validades/descartar", descartarLote)
router.get("/lotes/:codproduto", listarLotes)

router.post("/transferencias", transferirEstoque)

export default router
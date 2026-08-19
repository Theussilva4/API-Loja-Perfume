import express from "express"
import { listarEstoque, alterarEstoque, listarMovimentacoesSaida, listarMovimentacoesEntrada, registrarSaidaManual, cancelarSaidaManual, extratoProduto, registrarEntradaManual, transferirEstoque, listarLotes, listarTodasValidades, listarPendenciasRastreabilidade, atribuirValidadeManual, descartarLote } from "../controllers/estoqueController.js"
import { checkRole } from "../middlewares/rbacMiddleware.js"

const router = express.Router()

router.get("/", listarEstoque)
router.get("/saidas", listarMovimentacoesSaida)
router.get("/entradas", listarMovimentacoesEntrada)
router.post("/saidas", checkRole(["ADMIN", "GERENTE"]), registrarSaidaManual)
router.post("/entradas", checkRole(["ADMIN", "GERENTE"]), registrarEntradaManual)
router.post("/saidas/:id/cancelar", checkRole(["ADMIN", "GERENTE"]), cancelarSaidaManual)
router.get("/produto/:id/extrato", extratoProduto)
router.patch("/:codproduto", checkRole(["ADMIN", "GERENTE"]), alterarEstoque)

// Validades e Lotes
router.get("/validades/lotes", listarTodasValidades)
router.get("/validades/pendencias", listarPendenciasRastreabilidade)
router.post("/validades/atribuir", checkRole(["ADMIN", "GERENTE"]), atribuirValidadeManual)
router.post("/validades/descartar", checkRole(["ADMIN", "GERENTE"]), descartarLote)
router.get("/lotes/:codproduto", listarLotes)

router.post("/transferencias", checkRole(["ADMIN", "GERENTE"]), transferirEstoque)

export default router
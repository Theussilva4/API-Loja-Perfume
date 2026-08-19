import express from "express";
import { listarPlanosPagamento, criarPlanoPagamento, atualizarPlanoPagamento, alterarStatusPlano } from "../controllers/planoPagamentoController.js";

const router = express.Router();

router.get("/", listarPlanosPagamento);
router.post("/", criarPlanoPagamento);
router.put("/:id", atualizarPlanoPagamento);
router.patch("/:id/ativo", alterarStatusPlano);

export default router;
import { Router } from "express";
import * as controller from "../controllers/precificacaoController.js";
import { auth } from "../middlewares/authMiddleware.js";

const router = Router();

// Configurações
router.get("/configuracao", auth, controller.getConfig);
router.put("/configuracao", auth, controller.updateConfig);

// Tabela de Preços
router.get("/tabela", auth, controller.listarTabelaPrecos);
router.get("/historico/:codproduto", auth, controller.getHistoricoPrecos);
router.post("/definir/:codproduto", auth, controller.definirPrecoBase);

// Motor de Preço (Simulação ao vivo)
router.get("/simular/:codproduto", auth, controller.simularPreco);

// Promoções
router.get("/promocoes", auth, controller.listarPromocoes);
router.post("/promocoes", auth, controller.criarPromocao);
router.put("/promocoes/:codpromocao", auth, controller.atualizarPromocao);
router.delete("/promocoes/:codpromocao", auth, controller.deletarPromocao);

export default router;

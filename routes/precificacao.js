import { Router } from "express";
import * as controller from "../controllers/precificacaoController.js";
import { checkRole } from "../middlewares/rbacMiddleware.js";

const router = Router();

// Configurações
router.get("/configuracao", controller.getConfig);
router.put("/configuracao", controller.updateConfig);

// Tabela de Preços
router.get("/tabela", controller.listarTabelaPrecos);
router.get("/historico/:codproduto", controller.getHistoricoPrecos);
router.post("/definir/:codproduto", controller.definirPrecoBase);

// Motor de Preço (Simulação ao vivo)
router.get("/simular/:codproduto", controller.simularPreco);

// Promoções
router.get("/promocoes", controller.listarPromocoes);
router.post("/promocoes", controller.criarPromocao);
router.put("/promocoes/:codpromocao", controller.atualizarPromocao);
router.delete("/promocoes/:codpromocao", controller.deletarPromocao);

export default router;

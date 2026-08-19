import { checkRole } from "../middlewares/rbacMiddleware.js";
import express from "express";
import { faturamentoProduto } from "../controllers/relatoriosController.js";

const router = express.Router();

router.use(checkRole(["ADMIN", "GERENTE"]));

router.get("/faturamento-produto", faturamentoProduto);

export default router;

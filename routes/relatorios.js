import express from "express";
import { faturamentoProduto } from "../controllers/relatoriosController.js";

const router = express.Router();

router.get("/faturamento-produto", faturamentoProduto);

export default router;

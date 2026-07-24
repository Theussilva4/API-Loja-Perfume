import express from "express";
import {  listarPlanosPagamento,criarPlanoPagamento} from "../controllers/planoPagamentoController.js";

const router = express.Router();

router.get("/", listarPlanosPagamento);

router.post("/",criarPlanoPagamento);

export default router;
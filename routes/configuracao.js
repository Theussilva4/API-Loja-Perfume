import express from "express";
import { getConfiguracoes, updateConfiguracoes } from "../controllers/configuracaoController.js";
import { checkRole } from "../middlewares/rbacMiddleware.js";

const router = express.Router();

router.get("/", getConfiguracoes);
router.put("/", checkRole(["ADMIN", "GERENTE"]), updateConfiguracoes);

export default router;

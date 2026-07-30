import express from "express";
import { getConfiguracoes, updateConfiguracoes } from "../controllers/configuracaoController.js";

const router = express.Router();

router.get("/", getConfiguracoes);
router.put("/", updateConfiguracoes);

export default router;

import express from "express"
import { listarProdutos,alterarProdutos,alterarStatusProduto,criarProdutos } from "../controllers/produtosController.js"
import upload from "../utils/upload.js"
import { checkRole } from "../middlewares/rbacMiddleware.js";

const router = express.Router()

router.get("/", listarProdutos)
router.post("/", checkRole(["ADMIN", "GERENTE"]), upload.single('imagem'), criarProdutos)
router.patch("/:codproduto", checkRole(["ADMIN", "GERENTE"]), upload.single('imagem'), alterarProdutos)
router.patch("/:codproduto/ativo", checkRole(["ADMIN", "GERENTE"]), alterarStatusProduto);

export default router
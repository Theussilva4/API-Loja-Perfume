import express from "express"
import { listarProdutos,alterarProdutos,alterarStatusProduto,criarProdutos } from "../controllers/produtosController.js"

const router = express.Router()

router.get("/", listarProdutos)
router.post("/", criarProdutos)
router.patch("/:codproduto",alterarProdutos)
router.patch("/:codproduto/ativo", alterarStatusProduto);

export default router
import express from "express"
import { listarProdutos,alterarProdutos,alterarStatusProduto,criarProdutos } from "../controllers/produtosController.js"
import upload from "../utils/upload.js"

const router = express.Router()

router.get("/", listarProdutos)
router.post("/", upload.single('imagem'), criarProdutos)
router.patch("/:codproduto", upload.single('imagem'), alterarProdutos)
router.patch("/:codproduto/ativo", alterarStatusProduto);

export default router
import express from "express"
import { listarEstoque,alterarEstoque } from "../controllers/estoqueController.js"

const router = express.Router()

router.get("/", listarEstoque)
router.patch("/:codproduto",alterarEstoque)


export default router
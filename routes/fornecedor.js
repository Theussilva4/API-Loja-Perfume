import express from "express"
import { getFornecedores, createFornecedor, updateFornecedor, deleteFornecedor } from "../controllers/fornecedoresController.js"

const router = express.Router()

router.get("/", getFornecedores)
router.post("/", createFornecedor)
router.put("/:uuid", updateFornecedor)
router.delete("/:uuid", deleteFornecedor)

export default router

import express from "express"
import { listarVendedor,criarVendedor,alterarStatusVendedor, alterarVendedor } from "../controllers/vendedorController.js"


const router = express.Router()

router.get("/", listarVendedor)
router.post("/", criarVendedor)
router.patch("/:codvendedor",alterarVendedor)
router.patch("/:codvendedor/ativo", alterarStatusVendedor);

export default router
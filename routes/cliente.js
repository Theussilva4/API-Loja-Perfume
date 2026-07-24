import express from "express"
import { listarClientes,criarClientes,alterarStatusCliente, alterarclientes } from "../controllers/clienteController.js"


const router = express.Router()

router.get("/", listarClientes)
router.post("/", criarClientes)
router.patch("/:codcliente",alterarclientes)
router.patch("/:codcliente/ativo", alterarStatusCliente);

export default router
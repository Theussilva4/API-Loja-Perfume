import express from "express"
import { listarMarca,alterarMarca } from "../controllers/marcaController.js"

const router = express.Router()

router.get("/", listarMarca)
router.patch("/:codcategoria",alterarMarca)
//router.patch("/:codcategoria/ativo", alterarStatuscategoria);

export default router
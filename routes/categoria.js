import express from "express"
import { listarcategorias,alterarcategorias,alterarStatuscategoria } from "../controllers/categoriasController.js"

const router = express.Router()

router.get("/", listarcategorias)
router.patch("/:codcategoria",alterarcategorias)
//router.patch("/:codcategoria/ativo", alterarStatuscategoria);

export default router
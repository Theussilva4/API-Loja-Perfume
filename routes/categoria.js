import express from "express"
import { listarcategorias, alterarcategorias, alterarStatuscategoria, criarcategorias } from "../controllers/categoriasController.js"

const router = express.Router()

router.get("/", listarcategorias)
router.post("/", criarcategorias)
router.patch("/:codcategoria", alterarcategorias)
//router.patch("/:codcategoria/ativo", alterarStatuscategoria);

export default router
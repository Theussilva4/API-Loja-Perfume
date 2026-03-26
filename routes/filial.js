import express from "express"
import { listarFilial,alterarFilial } from "../controllers/filialController.js"

const router = express.Router()

router.get("/", listarFilial)
router.patch("/:codfilial",alterarFilial)


export default router
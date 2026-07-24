import express from "express"
import { getCompras, createCompra, getCompraById, updateCompraStatus } from "../controllers/compra.js"

const router = express.Router()

router.get("/", getCompras)
router.post("/", createCompra)
router.get("/:uuid", getCompraById)
router.patch("/:uuid/status", updateCompraStatus)

export default router

import express from "express"
import multer from "multer"
import { getCompras, createCompra, getCompraById, updateCompraStatus } from "../controllers/compra.js"
import { importarXml, finalizarConferencia } from "../controllers/comprasController.js"

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage() })

router.get("/", getCompras)
router.post("/", createCompra)
router.post("/importar-xml", upload.single("xml"), importarXml)
router.post("/:uuid/finalizar-conferencia", finalizarConferencia)
router.get("/:uuid", getCompraById)
router.patch("/:uuid/status", updateCompraStatus)

export default router

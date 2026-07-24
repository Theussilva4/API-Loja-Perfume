import { Router } from "express";
import * as controller from "../controllers/usuarioController.js";
import { auth } from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", auth, controller.listarUsuario);
router.post("/", controller.criarUsuario);
router.put("/:codusur", auth, controller.alterarUsuario);

export default router;
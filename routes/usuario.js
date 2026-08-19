import { Router } from "express";
import * as controller from "../controllers/usuarioController.js";
import { checkRole } from "../middlewares/rbacMiddleware.js";

const router = Router();

router.use(checkRole(["ADMIN", "GERENTE"]));

router.get("/", controller.listarUsuario);
router.post("/", controller.criarUsuario);
router.put("/:codusur", controller.alterarUsuario);

export default router;
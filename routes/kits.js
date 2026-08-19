import express from "express";
import { listarKits, criarKit, atualizarKit, excluirKit } from "../controllers/kitsController.js";
import { checkRole } from "../middlewares/rbacMiddleware.js";

const router = express.Router();


router.get("/", listarKits);
router.post("/", checkRole(["ADMIN", "GERENTE"]), criarKit);
router.put("/:id", atualizarKit);
router.delete("/:id", excluirKit);

export default router;

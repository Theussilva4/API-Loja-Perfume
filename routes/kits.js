import express from "express";
import { listarKits, criarKit, atualizarKit, excluirKit } from "../controllers/kitsController.js";
import { auth } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(auth);

router.get("/", listarKits);
router.post("/", criarKit);
router.put("/:id", atualizarKit);
router.delete("/:id", excluirKit);

export default router;

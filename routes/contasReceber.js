import express from "express";
import { listarContas, criarConta, receberConta } from "../controllers/contasReceberController.js";
import { auth } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(auth);

router.get('/', listarContas);
router.post('/', criarConta);
router.post('/:id/baixar', receberConta);

export default router;

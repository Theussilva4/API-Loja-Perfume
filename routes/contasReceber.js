import express from "express";
import { listarContas, criarConta, receberConta } from "../controllers/contasReceberController.js";

const router = express.Router();


router.get('/', listarContas);
router.post('/', criarConta);
router.post('/:id/baixar', receberConta);

export default router;

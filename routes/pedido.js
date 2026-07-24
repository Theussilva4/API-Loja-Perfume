import express from "express";
import {
  criarPedido,
  listarPedidos,
  alterarStatus,
  adicionarItem,
  removerItem,
  atualizarPedido
} from "../controllers/pedidoController.js";

const router = express.Router();

// pedidos
router.get("/", listarPedidos);
router.post("/", criarPedido);
router.put("/:id", atualizarPedido);

// status
router.patch("/:id/status", alterarStatus);

// itens
router.post("/:id/itens", adicionarItem);
router.delete("/itens/:itemId", removerItem);

export default router;
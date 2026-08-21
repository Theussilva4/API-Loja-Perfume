import { Router } from "express";
import { login } from "../controllers/loginController.js";

const router = Router();

import rateLimit from "express-rate-limit";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // Limita a 10 tentativas por IP
  message: { erro: "Muitas tentativas de login. Tente novamente mais tarde." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/", loginLimiter, login);

export default router;
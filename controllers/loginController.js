import prisma from "../prismaClient.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export async function login(req, res) {
  const { login, password } = req.body;
  console.log("body", req.body);

  const usuario = await prisma.msusuario.findUnique({
    where: { login }
  });

  if (!usuario) {
    return res.status(400).json({ erro: "Usuário não encontrado" });
  }

  const senhaValida = await bcrypt.compare(password, usuario.senha_hash);

  if (!senhaValida) {
    return res.status(400).json({ erro: "Senha inválida" });
  }

  const isDefaultPassword = !usuario.senha_alterada && await bcrypt.compare("padrao", usuario.senha_hash);
  const forceChangePassword = isDefaultPassword;

  const token = jwt.sign(
    {
      id: usuario.codusur,
      tipo: usuario.tipo_usuario
    },
    "SEGREDO",
    { expiresIn: "1d" }
  );

  res.json({
    token,
    usuario: {
      id: usuario.codusur,
      nome: usuario.nome,          // ⚠️ CONFERE esse campo no banco
      email: usuario.email,
      tipo: usuario.tipo_usuario
    },
    forceChangePassword
  });
}
import prisma from "../prismaClient.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export async function login(req, res) {
  const { login, password } = req.body;

  const usuario = await prisma.msusuario.findUnique({
    where: { login }
  });

  if (!usuario) {
    return res.status(400).json({ erro: "UsuÃ¡rio nÃ£o encontrado" });
  }

  const senhaValida = await bcrypt.compare(password, usuario.senha_hash);

  if (!senhaValida) {
    return res.status(400).json({ erro: "Senha invÃ¡lida" });
  }

  const isDefaultPassword = !usuario.senha_alterada && await bcrypt.compare("padrao", usuario.senha_hash);
  const forceChangePassword = isDefaultPassword;

  const token = jwt.sign(
    {
      id: usuario.codusur,
      tipo: usuario.tipo_usuario,
      codvendedor: usuario.codvendedor
    },
    "SEGREDO",
    { expiresIn: "1d" }
  );

  res.json({
    token,
    usuario: {
      id: usuario.codusur,
      nome: usuario.nome,          // â ï¸ CONFERE esse campo no banco
      email: usuario.email,
      tipo: usuario.tipo_usuario,
      codvendedor: usuario.codvendedor,
      codfilial: usuario.codfilial
    },
    forceChangePassword
  });
}
import jwt from "jsonwebtoken";

export function auth(req, res, next) {
  let token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ erro: "Sem token" });
  }

  if (token.startsWith("Bearer ")) {
    token = token.slice(7, token.length).trimLeft();
  }

  try {
    const decoded = jwt.verify(token, "SEGREDO");
    req.usuario = decoded;
    next();
  } catch {
    return res.status(401).json({ erro: "Token invÃ¡lido" });
  }
}
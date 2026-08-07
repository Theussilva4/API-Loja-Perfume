import * as usuarioService from "../services/usuarioService.js";

export async function listarUsuario(req, res) {
  try {
    const usuarios = await usuarioService.listar();
    res.json({ sucesso: true, dados: usuarios });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
}

export async function criarUsuario(req, res) {
  try {
    const usuario = await usuarioService.criar(req.body);
    res.json({ sucesso: true, dados: usuario });
  } catch (error) {
    res.status(400).json({ sucesso: false, erro: error.message });
  }
}

export async function alterarUsuario(req, res) {
  try {
    const usuario = await usuarioService.alterar(
      req.params.codusur,
      req.body
    );
    res.json({ sucesso: true, dados: usuario });
  } catch (error) {
    console.error("ERRO DETALHADO UPDATE:", error);
    res.status(400).json({ sucesso: false, erro: error.message });
  }
}
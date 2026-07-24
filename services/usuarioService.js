import prisma from "../prismaClient.js";
import bcrypt from "bcryptjs";

export async function listar() {
  return await prisma.msusuario.findMany({
    select: {
      codusur: true,
      nome: true,
      email: true,
      login: true,
      tipo_usuario: true,
      ativo: true,
      codfilial: true,
      ultimo_login: true
    }
  });
}

export async function criar(dados) {
  const {
    nome,
    email,
    login,
    senha,
    tipo_usuario,
    codfilial,
    cpf,
    telefone,
    data_nascimento
  } = dados;

  if (!nome || !login || !senha) {
    throw new Error("Nome, login e senha são obrigatórios");
  }

  if (senha.length < 6) {
    throw new Error("Senha deve ter no mínimo 6 caracteres");
  }

  const usuarioExistente = await prisma.msusuario.findUnique({
    where: { login }
  });

  if (usuarioExistente) {
    throw new Error("Login já existe");
  }

  const senhaHash = await bcrypt.hash(senha, 10);

  const usuario = await prisma.msusuario.create({
    data: {
      nome,
      email,
      login,
      senha_hash: senhaHash,
      senha_alterada: senha !== "padrao",
      tipo_usuario,
      codfilial,
      cpf: cpf || null,
      telefone: telefone || null,
      data_nascimento: data_nascimento ? new Date(data_nascimento) : null,
      ativo: "S",
      data_criacao: new Date()
    }
  });

  if (tipo_usuario === "VENDEDOR") {
    await prisma.msvendedor.create({
      data: {
        nome,
        cpf: cpf || null,
        telefone: telefone || null,
        ativo: "S",
        data_criacao: new Date()
      }
    });
  }

  delete usuario.senha_hash;
  return usuario;
}

export async function alterar(codusur, dados) {
  if (!codusur) {
    throw new Error("Código do usuário obrigatório");
  }

  if (dados.senha) {
    if (dados.senha.length < 6) {
      throw new Error("Senha muito curta");
    }

    dados.senha_hash = await bcrypt.hash(dados.senha, 10);
    dados.senha_alterada = true;
    delete dados.senha;
  }

  const camposPermitidos = [
    "nome",
    "email",
    "telefone",
    "codrca",
    "senha_hash",
    "senha_alterada"
  ];

  Object.keys(dados).forEach((key) => {
    if (!camposPermitidos.includes(key)) {
      delete dados[key];
    }
  });

  const usuario = await prisma.msusuario.update({
    where: { codusur: Number(codusur) },
    data: dados
  });

  delete usuario.senha_hash;
  return usuario;
}
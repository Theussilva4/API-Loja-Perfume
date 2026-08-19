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
      ultimo_login: true,
      codvendedor: true
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
    data_nascimento,
    codvendedor
  } = dados;

  if (!nome || !login || !senha) {
    throw new Error("Nome, login e senha sÃ£o obrigatÃ³rios");
  }

  if (senha.length < 6) {
    throw new Error("Senha deve ter no mÃ­nimo 6 caracteres");
  }

  const usuarioExistente = await prisma.msusuario.findUnique({
    where: { login }
  });

  if (usuarioExistente) {
    throw new Error("Login jÃ¡ existe");
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
      data_criacao: new Date(),
      codvendedor: codvendedor ? Number(codvendedor) : null
    }
  });

  delete usuario.senha_hash;
  return usuario;
}

export async function alterar(codusur, dados) {
  if (!codusur) {
    throw new Error("CÃ³digo do usuÃ¡rio obrigatÃ³rio");
  }

  if (dados.senha) {
    if (dados.senha.length < 6) {
      throw new Error("Senha muito curta");
    }

    dados.senha_hash = await bcrypt.hash(dados.senha, 10);
    dados.senha_alterada = true;
    delete dados.senha;
  }

  if (dados.data_nascimento !== undefined) {
    dados.data_nascimento = dados.data_nascimento ? new Date(dados.data_nascimento) : null;
  }

  if (dados.cpf === "") dados.cpf = null;
  if (dados.telefone === "") dados.telefone = null;
  if (dados.email === "") dados.email = null;

  const camposPermitidos = [
    "nome",
    "email",
    "telefone",
    "cpf",
    "data_nascimento",
    "codfilial",
    "codrca",
    "codvendedor",
    "ativo",
    "senha_hash",
    "senha_alterada",
    "tipo_usuario"
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

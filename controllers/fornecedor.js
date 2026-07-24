import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getFornecedores = async (req, res) => {
  try {
    const fornecedores = await prisma.msfornecedor.findMany({
      where: { ativo: "S" }
    });
    res.json(fornecedores);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar fornecedores." });
  }
};

export const createFornecedor = async (req, res) => {
  try {
    const data = req.body;
    const fornecedor = await prisma.msfornecedor.create({
      data: {
        nome: data.nome,
        cnpj: data.cnpj,
        telefone: data.telefone,
        email: data.email,
        contato: data.contato,
        cidade: data.cidade,
        uf: data.uf,
        observacoes: data.observacoes,
        ativo: "S",
      }
    });
    res.json(fornecedor);
  } catch (error) {
    res.status(500).json({ error: "Erro ao criar fornecedor." });
  }
};

export const updateFornecedor = async (req, res) => {
  try {
    const { uuid } = req.params;
    const data = req.body;
    
    // Procura o ID interno via UUID
    const f = await prisma.msfornecedor.findFirst({ where: { uuid } });
    if(!f) return res.status(404).json({ error: "Não encontrado" });

    const fornecedor = await prisma.msfornecedor.update({
      where: { codfornecedor: f.codfornecedor },
      data: {
        nome: data.nome,
        cnpj: data.cnpj,
        telefone: data.telefone,
        email: data.email,
        contato: data.contato,
        cidade: data.cidade,
        uf: data.uf,
        observacoes: data.observacoes,
      }
    });
    res.json(fornecedor);
  } catch (error) {
    res.status(500).json({ error: "Erro ao atualizar fornecedor." });
  }
};

export const deleteFornecedor = async (req, res) => {
  try {
    const { uuid } = req.params;
    const f = await prisma.msfornecedor.findFirst({ where: { uuid } });
    if(!f) return res.status(404).json({ error: "Não encontrado" });

    // Exclusão Lógica
    await prisma.msfornecedor.update({
      where: { codfornecedor: f.codfornecedor },
      data: { ativo: "N" }
    });
    res.json({ message: "Fornecedor inativado com sucesso" });
  } catch (error) {
    res.status(500).json({ error: "Erro ao excluir fornecedor." });
  }
};

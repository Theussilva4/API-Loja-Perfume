import prisma from "../prismaClient.js";

export async function listarPlanosPagamento(req, res) {
  try {
    const planos = await prisma.MSPLANOPAGAMENTO.findMany({
      where: {
        ATIVO: "S" // 👈 só ativos
      },
      orderBy: {
        DESCRICAO: "asc"
      }
    });

    res.json(planos);

  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao listar planos de pagamento" });
  }
}

export async function criarPlanoPagamento(req, res) {
  try {
    const { descricao } = req.body;

    // validação
    if (!descricao) {
      return res.status(400).json({
        erro: "Descrição é obrigatória"
      });
    }

    const plano = await prisma.MSPLANOPAGAMENTO.create({
      data: {
        DESCRICAO: descricao,
        ATIVO: "S"
      }
    });

    res.status(201).json(plano);

  } catch (error) {
    console.error(error);
    res.status(500).json({
      erro: "Erro ao criar plano de pagamento"
    });
  }
}
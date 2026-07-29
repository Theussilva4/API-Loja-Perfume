import prisma from "../prismaClient.js";

export async function listarPlanosPagamento(req, res) {
  try {
    const planos = await prisma.MSPLANOPAGAMENTO.findMany({
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
    const { descricao, tem_acrescimo, taxa_acrescimo, max_parcelas, valor_minimo_parcela, regras_parcelamento } = req.body;

    // validação
    if (!descricao) {
      return res.status(400).json({
        erro: "Descrição é obrigatória"
      });
    }

    const plano = await prisma.MSPLANOPAGAMENTO.create({
      data: {
        DESCRICAO: descricao,
        tem_acrescimo: tem_acrescimo || false,
        taxa_acrescimo: taxa_acrescimo || 0,
        max_parcelas: max_parcelas || 1,
        valor_minimo_parcela: valor_minimo_parcela || 0,
        regras_parcelamento: regras_parcelamento ? JSON.stringify(regras_parcelamento) : null,
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

export async function atualizarPlanoPagamento(req, res) {
  try {
    const { id } = req.params;
    const { descricao, tem_acrescimo, taxa_acrescimo, max_parcelas, valor_minimo_parcela, regras_parcelamento } = req.body;

    if (!descricao) {
      return res.status(400).json({ erro: "Descrição é obrigatória" });
    }

    const plano = await prisma.MSPLANOPAGAMENTO.update({
      where: { CODPLPAG: Number(id) },
      data: {
        DESCRICAO: descricao,
        tem_acrescimo: tem_acrescimo || false,
        taxa_acrescimo: taxa_acrescimo || 0,
        max_parcelas: max_parcelas || 1,
        valor_minimo_parcela: valor_minimo_parcela || 0,
        regras_parcelamento: regras_parcelamento ? JSON.stringify(regras_parcelamento) : null,
      }
    });

    res.json(plano);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao atualizar plano de pagamento" });
  }
}

export async function alterarStatusPlano(req, res) {
  try {
    const { id } = req.params;
    const { ativo } = req.body;

    const plano = await prisma.MSPLANOPAGAMENTO.update({
      where: { CODPLPAG: Number(id) },
      data: { ATIVO: ativo ? "S" : "N" }
    });

    res.json(plano);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao alterar status do plano" });
  }
}
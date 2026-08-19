/**
 * estoqueService.js
 * Centraliza as regras de negócio de movimentação de estoque (FEFO, crédito, débito, estorno).
 * Trabalha sempre recebendo a transação do Prisma (tx) para garantir atomicidade.
 */

/**
 * Debita o estoque seguindo a regra FEFO (First Expire, First Out).
 * Consome os lotes que estão mais próximos do vencimento primeiro.
 * @param {Object} tx - Prisma Transaction Client
 * @param {Number} codproduto - ID do Produto
 * @param {Number} codfilial - ID da Filial
 * @param {Number} quantidadeDesejada - Quantidade a ser baixada
 * @param {String} origem - Origem da movimentação (ex: "VENDA", "TRANSFERENCIA")
 * @param {Number|String} origem_id - ID da origem (ex: numpedido)
 */
export const debitarEstoqueFefo = async (tx, codproduto, codfilial, quantidadeDesejada, origem, origem_id) => {
  let qtdRestante = quantidadeDesejada;

  // Busca lotes disponíveis ordenados por validade
  const lotesComValidade = await tx.msestoque_lote.findMany({
    where: { codproduto, codfilial, quantidade: { gt: 0 }, validade: { not: null } },
    orderBy: { validade: 'asc' }
  });

  const lotesSemValidade = await tx.msestoque_lote.findMany({
    where: { codproduto, codfilial, quantidade: { gt: 0 }, validade: null }
  });

  const lotesDisponiveis = [...lotesComValidade, ...lotesSemValidade];

  for (const lote of lotesDisponiveis) {
    if (qtdRestante <= 0) break;
    const qtdAbater = Math.min(lote.quantidade, qtdRestante);
    
    await tx.msestoque_lote.update({
      where: { id: lote.id },
      data: { quantidade: { decrement: qtdAbater } }
    });

    await tx.mssaida_lote.create({
      data: {
        codproduto,
        codfilial,
        lote: lote.lote,
        quantidade: qtdAbater,
        tipo_saida: origem,
        origem_id: origem_id
      }
    });

    qtdRestante -= qtdAbater;
  }

  // Se ainda faltar, abate de um lote virtual "SEM_LOTE"
  if (qtdRestante > 0) {
    await tx.mssaida_lote.create({
      data: {
        codproduto,
        codfilial,
        lote: "SEM_LOTE",
        quantidade: qtdRestante,
        tipo_saida: origem,
        origem_id: origem_id
      }
    });
  }

  await tx.msmov_estoque.create({
    data: {
      codproduto,
      codfilial,
      tipo: "SAIDA",
      origem: origem,
      quantidade: quantidadeDesejada,
      origem_id: origem_id
    }
  });

  await tx.msestoque.upsert({
    where: { codproduto_codfilial: { codproduto, codfilial } },
    update: { quantidade: { decrement: quantidadeDesejada }, atualizado_em: new Date() },
    create: { codproduto, codfilial, quantidade: -quantidadeDesejada }
  });
};


/**
 * Estorna uma baixa feita por FEFO (recoloca as quantidades nos lotes de onde saíram).
 * @param {Object} tx - Prisma Transaction Client
 * @param {Number|String} origem_id - ID da movimentação original (ex: numpedido)
 * @param {Array} itens - Lista de itens para criar msmov_estoque de entrada (opcional)
 * @param {Number} codfilial - Filial de retorno
 * @param {String} motivoMovimentacao - Opcional para msmov_estoque
 */
export const estornarEstoqueFefo = async (tx, origem_id, itens, codfilial = 1, motivoMovimentacao = "CANCELAMENTO_VENDA") => {
  const saidas = await tx.mssaida_lote.findMany({
    where: { origem_id: origem_id } // Pode filtrar por tipo_saida se necessário, mas origem_id costuma ser único pro fluxo
  });

  for (const saida of saidas) {
    const { codproduto, codfilial: filial_saida, lote, quantidade } = saida;
    if (lote !== "SEM_LOTE") {
      const loteExistente = await tx.msestoque_lote.findFirst({
        where: { codproduto, codfilial: filial_saida, lote }
      });
      if (loteExistente) {
        await tx.msestoque_lote.update({
          where: { id: loteExistente.id },
          data: { quantidade: { increment: quantidade } }
        });
      } else {
        await tx.msestoque_lote.create({
          data: { codproduto, codfilial: filial_saida, lote, quantidade }
        });
      }
    }
  }

  if (itens && itens.length > 0) {
    for (const item of itens) {
      await tx.msmov_estoque.create({
        data: {
          codproduto: item.codproduto,
          codfilial: codfilial,
          tipo: "ENTRADA",
          origem: motivoMovimentacao,
          quantidade: item.quantidade,
          origem_id: origem_id
        }
      });

      await tx.msestoque.upsert({
        where: { codproduto_codfilial: { codproduto: item.codproduto, codfilial } },
        update: { quantidade: { increment: item.quantidade }, atualizado_em: new Date() },
        create: { codproduto: item.codproduto, codfilial, quantidade: item.quantidade }
      });
    }
  }
};


/**
 * Credita o estoque de forma simplificada (cria/atualiza lote e msestoque global).
 * Muito utilizado em compras e conferências.
 * @param {Object} tx - Prisma Transaction Client
 * @param {Number} codproduto - ID do Produto
 * @param {Number} codfilial - ID da Filial
 * @param {Number} quantidade - Quantidade a ser creditada
 * @param {String} origem - Origem da movimentação (ex: "COMPRA")
 * @param {Number|String} origem_id - ID do documento de origem
 * @param {String} lote - Lote do produto
 * @param {Date} validade - Data de validade
 * @param {Number} custo_unitario - Custo unitário do lote (opcional)
 */
export const creditarEstoque = async (tx, codproduto, codfilial, quantidade, origem, origem_id, lote = null, validade = null, custo_unitario = 0) => {
  const loteValue = lote ? String(lote) : "PADRAO";
  const validadeValue = validade ? new Date(validade) : null;

  // 1. Grava histórico
  await tx.msmov_estoque.create({
    data: {
      codproduto,
      codfilial,
      tipo: "ENTRADA",
      origem: origem,
      quantidade,
      origem_id
    }
  });

  // 2. Manipula o msestoque_lote
  const loteExistente = await tx.msestoque_lote.findFirst({
    where: {
      codproduto,
      codfilial,
      lote: loteValue
    }
  });

  if (loteExistente) {
    await tx.msestoque_lote.update({
      where: { id: loteExistente.id },
      data: { quantidade: { increment: quantidade } }
    });
  } else {
    await tx.msestoque_lote.create({
      data: {
        codproduto,
        codfilial,
        lote: loteValue,
        validade: validadeValue,
        quantidade,
        custo_unitario
      }
    });
  }

  // 3. Atualiza msestoque
  await tx.msestoque.upsert({
    where: {
      codproduto_codfilial: {
        codproduto,
        codfilial
      }
    },
    update: {
      quantidade: { increment: quantidade },
      atualizado_em: new Date()
    },
    create: {
      codproduto,
      codfilial,
      quantidade
    }
  });
};
export const debitarEstoque = async (tx, codproduto, codfilial, quantidade, origem, origem_id, lote = null) => {
  const loteValue = lote ? String(lote) : "PADRAO";

  // 1. Grava hist�rico
  await tx.msmov_estoque.create({
    data: {
      codproduto,
      codfilial,
      tipo: "SAIDA",
      origem: origem,
      quantidade,
      origem_id
    }
  });

  // 2. Manipula o msestoque_lote
  const loteExistente = await tx.msestoque_lote.findFirst({
    where: {
      codproduto,
      codfilial,
      lote: loteValue
    }
  });

  if (loteExistente) {
    await tx.msestoque_lote.update({
      where: { id: loteExistente.id },
      data: { quantidade: { decrement: quantidade } }
    });
  }

  // 3. Atualiza msestoque
  await tx.msestoque.upsert({
    where: {
      codproduto_codfilial: {
        codproduto,
        codfilial
      }
    },
    update: {
      quantidade: { decrement: quantidade },
      atualizado_em: new Date()
    },
    create: {
      codproduto,
      codfilial,
      quantidade: -quantidade
    }
  });
};

import prisma from "../prismaClient.js";

/**
 * Busca as configuraÃ§Ãµes da empresa ou cria com os padrÃµes se nÃ£o existirem
 */
export async function getConfiguracao() {
  let config = await prisma.msconfiguracao_empresa.findFirst();
  if (!config) {
    config = await prisma.msconfiguracao_empresa.create({
      data: {
        margem_alvo: 40.0,
        margem_minima: 10.0,
        permite_prejuizo: false,
        permite_desconto_acima_limite: false,
        dias_promocao_padrao: 30
      }
    });
  }
  return config;
}

/**
 * Atualiza as configuraÃ§Ãµes da empresa
 */
export async function updateConfiguracao(dados) {
  const config = await getConfiguracao();
  return await prisma.msconfiguracao_empresa.update({
    where: { id: config.id },
    data: {
      margem_alvo: dados.margem_alvo !== undefined ? Number(dados.margem_alvo) : undefined,
      margem_minima: dados.margem_minima !== undefined ? Number(dados.margem_minima) : undefined,
      permite_prejuizo: dados.permite_prejuizo,
      permite_desconto_acima_limite: dados.permite_desconto_acima_limite,
      dias_promocao_padrao: dados.dias_promocao_padrao !== undefined ? Number(dados.dias_promocao_padrao) : undefined,
    }
  });
}

/**
 * Motor de PrecificaÃ§Ã£o Principal
 * Retorna o preÃ§o de venda e eventuais promoÃ§Ãµes aplicadas a um produto.
 */
export async function calculatePrice(codproduto) {
  const hoje = new Date();
  
  // 1. Buscar a tabela de preÃ§o vigente
  const tabelaPreco = await prisma.mstabela_preco.findFirst({
    where: {
      codproduto: Number(codproduto),
      ativo: "S",
      data_fim: null
    },
    orderBy: {
      data_inicio: 'desc'
    }
  });

  if (!tabelaPreco) {
    return {
      precoBase: 0,
      custoBase: 0,
      promocaoAplicada: null,
      descontoReais: 0,
      precoFinal: 0,
      margem: 0,
      markup: 0,
      lucro: 0,
      descontoMaximo: 0
    };
  }

  const precoBase = Number(tabelaPreco.preco_venda);
  const precoCartao = Number(tabelaPreco.preco_cartao || 0);
  const custoBase = Number(tabelaPreco.preco_custo);
  let precoFinal = precoBase;
  let promocaoAplicada = null;
  let descontoReais = 0;

  // 2. Buscar promoÃ§Ãµes vigentes que contÃªm esse produto
  // Precisamos das que estÃ£o dentro da data (hoje)
  const promocoes = await prisma.mspromocao.findMany({
    where: {
      ativo: "S",
      data_inicio: { lte: hoje },
      data_fim: { gte: hoje },
      itens: {
        some: {
          codproduto: Number(codproduto)
        }
      }
    },
    include: {
      itens: {
        where: { codproduto: Number(codproduto) }
      }
    },
    orderBy: {
      prioridade: 'desc'
    }
  });

  if (promocoes.length > 0) {
    // Vence a de maior prioridade (jÃ¡ garantido pelo orderBy)
    // Se houvesse empate, poderÃ­amos avaliar qual dÃ¡ o maior desconto. 
    // Para manter simples, pegamos o primeiro da lista ordenada.
    const promoVencedora = promocoes[0];
    const itemPromo = promoVencedora.itens[0];

    // Verifica se hÃ¡ regra especÃ­fica para este item
    const hasRegraItem = !!itemPromo.tipo_opcional && itemPromo.valor_opcional !== null && itemPromo.valor_opcional !== undefined;
    const tipo = hasRegraItem ? itemPromo.tipo_opcional : promoVencedora.tipo_geral;
    const valor = Number(hasRegraItem ? itemPromo.valor_opcional : promoVencedora.valor_geral);

    promocaoAplicada = promoVencedora.nome;

    if (tipo === "PERCENTUAL") {
      descontoReais = precoBase * (valor / 100);
      precoFinal = precoBase - descontoReais;
    } else if (tipo === "VALOR_FIXO") {
      descontoReais = valor;
      precoFinal = precoBase - descontoReais;
    } else if (tipo === "PRECO_FIXO") {
      precoFinal = valor;
      descontoReais = precoBase - precoFinal;
    }
    
    // Impede preÃ§o negativo
    if (precoFinal < 0) precoFinal = 0;
  }

  // 3. Calcular Margem e Markup
  const lucro = precoFinal - custoBase;
  const margem = precoFinal > 0 ? (lucro / precoFinal) * 100 : 0;
  const markup = custoBase > 0 ? (precoFinal / custoBase) : 0;

  return {
    precoBase,
    precoCartao,
    custoBase,
    promocaoAplicada,
    descontoReais,
    precoFinal,
    margem,
    markup,
    lucro,
    descontoMaximo: tabelaPreco.desconto_maximo ? Number(tabelaPreco.desconto_maximo) : 0
  };
}

/**
 * Cria ou Atualiza a Tabela de PreÃ§o do Produto
 * Garante que o histÃ³rico seja mantido.
 */
export async function setPrecoBase(codproduto, preco_custo, preco_venda, codusur, desconto_maximo = 0, preco_cartao = 0) {
  // Encontra a vigÃªncia atual e encerra
  const atual = await prisma.mstabela_preco.findFirst({
    where: {
      codproduto: Number(codproduto),
      ativo: "S",
      data_fim: null
    }
  });

  if (atual) {
    // Se tudo for idÃªntico, nÃ£o faz nada
    if (
      Number(atual.preco_custo) === Number(preco_custo) && 
      Number(atual.preco_venda) === Number(preco_venda) &&
      Number(atual.desconto_maximo || 0) === Number(desconto_maximo || 0) &&
      Number(atual.preco_cartao || 0) === Number(preco_cartao || 0)
    ) {
      return atual;
    }
    await prisma.mstabela_preco.update({
      where: { codpreco: atual.codpreco },
      data: { data_fim: new Date() }
    });
  }

  // Cria o novo preÃ§o
  return await prisma.mstabela_preco.create({
    data: {
      codproduto: Number(codproduto),
      preco_custo: Number(preco_custo),
      preco_venda: Number(preco_venda),
      preco_cartao: Number(preco_cartao),
      desconto_maximo: Number(desconto_maximo),
      data_inicio: new Date(),
      created_by: codusur ? Number(codusur) : null
    }
  });
}

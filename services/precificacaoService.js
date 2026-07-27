import prisma from "../prismaClient.js";

/**
 * Busca as configurações da empresa ou cria com os padrões se não existirem
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
 * Atualiza as configurações da empresa
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
 * Motor de Precificação Principal
 * Retorna o preço de venda e eventuais promoções aplicadas a um produto.
 */
export async function calculatePrice(codproduto) {
  const hoje = new Date();
  
  // 1. Buscar a tabela de preço vigente
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
  const custoBase = Number(tabelaPreco.preco_custo);
  let precoFinal = precoBase;
  let promocaoAplicada = null;
  let descontoReais = 0;

  // 2. Buscar promoções vigentes que contêm esse produto
  // Precisamos das que estão dentro da data (hoje)
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
    // Vence a de maior prioridade (já garantido pelo orderBy)
    // Se houvesse empate, poderíamos avaliar qual dá o maior desconto. 
    // Para manter simples, pegamos o primeiro da lista ordenada.
    const promoVencedora = promocoes[0];
    const itemPromo = promoVencedora.itens[0];

    // Verifica se há regra específica para este item
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
    
    // Impede preço negativo
    if (precoFinal < 0) precoFinal = 0;
  }

  // 3. Calcular Margem e Markup
  const lucro = precoFinal - custoBase;
  const margem = precoFinal > 0 ? (lucro / precoFinal) * 100 : 0;
  const markup = custoBase > 0 ? (precoFinal / custoBase) : 0;

  return {
    precoBase,
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
 * Cria ou Atualiza a Tabela de Preço do Produto
 * Garante que o histórico seja mantido.
 */
export async function setPrecoBase(codproduto, preco_custo, preco_venda, codusur, desconto_maximo = 0) {
  // Encontra a vigência atual e encerra
  const atual = await prisma.mstabela_preco.findFirst({
    where: {
      codproduto: Number(codproduto),
      ativo: "S",
      data_fim: null
    }
  });

  if (atual) {
    // Se tudo for idêntico, não faz nada
    if (
      Number(atual.preco_custo) === Number(preco_custo) && 
      Number(atual.preco_venda) === Number(preco_venda) &&
      Number(atual.desconto_maximo || 0) === Number(desconto_maximo || 0)
    ) {
      return atual;
    }
    await prisma.mstabela_preco.update({
      where: { codpreco: atual.codpreco },
      data: { data_fim: new Date() }
    });
  }

  // Cria o novo preço
  return await prisma.mstabela_preco.create({
    data: {
      codproduto: Number(codproduto),
      preco_custo: Number(preco_custo),
      preco_venda: Number(preco_venda),
      desconto_maximo: Number(desconto_maximo),
      data_inicio: new Date(),
      created_by: codusur ? Number(codusur) : null
    }
  });
}

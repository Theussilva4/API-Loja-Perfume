import prisma from "../prismaClient.js"

// Função auxiliar para gerar codigo da venda
const generateVendaCode = async () => {
  const lastVenda = await prisma.mspedido.findFirst({
    orderBy: { numpedido: 'desc' }
  });
  const nextId = lastVenda ? lastVenda.numpedido + 1 : 1;
  return `VEN-${nextId.toString().padStart(6, '0')}`;
};

// --- FUNCOES FEFO ---
const baixarEstoqueFefo = async (tx, codproduto, codfilial, quantidadeDesejada, numpedido) => {
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
        tipo_saida: "VENDA",
        origem_id: numpedido
      }
    });

    qtdRestante -= qtdAbater;
  }

  if (qtdRestante > 0) {
    await tx.mssaida_lote.create({
      data: {
        codproduto,
        codfilial,
        lote: "SEM_LOTE",
        quantidade: qtdRestante,
        tipo_saida: "VENDA",
        origem_id: numpedido
      }
    });
  }

  await tx.msmov_estoque.create({
    data: {
      codproduto,
      codfilial,
      tipo: "SAIDA",
      origem: "VENDA",
      quantidade: quantidadeDesejada,
      origem_id: numpedido
    }
  });

  await tx.msestoque.upsert({
    where: { codproduto_codfilial: { codproduto, codfilial } },
    update: { quantidade: { decrement: quantidadeDesejada }, atualizado_em: new Date() },
    create: { codproduto, codfilial, quantidade: -quantidadeDesejada }
  });
};

const estornarEstoqueFefo = async (tx, numpedido, pedido) => {
  const saidas = await tx.mssaida_lote.findMany({
    where: { origem_id: numpedido, tipo_saida: "VENDA" }
  });

  for (const saida of saidas) {
    const { codproduto, codfilial, lote, quantidade } = saida;
    if (lote !== "SEM_LOTE") {
      const loteExistente = await tx.msestoque_lote.findFirst({
        where: { codproduto, codfilial, lote }
      });
      if (loteExistente) {
        await tx.msestoque_lote.update({
          where: { id: loteExistente.id },
          data: { quantidade: { increment: quantidade } }
        });
      } else {
        await tx.msestoque_lote.create({
          data: { codproduto, codfilial, lote, quantidade }
        });
      }
    }
  }

  if (pedido) {
    const filial = pedido.codfilial || 1;
    for (const item of pedido.mspedido_item) {
      await tx.msmov_estoque.create({
        data: {
          codproduto: item.codproduto,
          codfilial: filial,
          tipo: "ENTRADA",
          origem: "CANCELAMENTO_VENDA",
          quantidade: item.quantidade,
          origem_id: numpedido
        }
      });
      await tx.msestoque.upsert({
        where: { codproduto_codfilial: { codproduto: item.codproduto, codfilial: filial } },
        update: { quantidade: { increment: item.quantidade }, atualizado_em: new Date() },
        create: { codproduto: item.codproduto, codfilial: filial, quantidade: item.quantidade }
      });
    }
  }
};
// --------------------

export async function listarPedidos(req, res) {
  try {
    const { dataInicio, dataFim } = req.query;
    let where = {};
    
    if (dataInicio && dataFim) {
      where.data_pedido = {
        gte: new Date(`${dataInicio}T00:00:00.000-03:00`),
        lte: new Date(`${dataFim}T23:59:59.999-03:00`)
      };
    } else if (dataInicio) {
      where.data_pedido = {
        gte: new Date(`${dataInicio}T00:00:00.000-03:00`),
        lte: new Date(`${dataInicio}T23:59:59.999-03:00`)
      };
    }

    const pedidos = await prisma.mspedido.findMany({
      where,
      orderBy: { numpedido: "desc" },
      include: {
        mscliente: { select: { nome: true, telefone: true } },
        msusuario_mspedido_codusur_vendedorTomsusuario: { select: { nome: true } },
        mspedido_item: {
          include: {
            msproduto: { select: { descricao: true } }
          }
        },
        msusuario_mspedido_codusur_cancelouTomsusuario: { select: { nome: true } }
      }
    });
    res.json(pedidos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao listar pedidos", details: error.message });
  }
}

export async function criarPedido(req, res) {
  try {
    const {
      codcliente,
      codusur_criou,
      codvendedor,
      codfilial,
      formaPagamento,
      parcelas,
      desconto,
      valor_frete,
      observacoes,
      status, // EM_DIGITACAO ou FINALIZADO
      produtos = [], // avulsos
      kits = []      // kits comerciais
    } = req.body;

    // Se vier itens (legado) e não tiver produtos, mapear para produtos para retrocompatibilidade
    const itensLegado = req.body.itens || [];
    const listaProdutos = produtos.length > 0 ? produtos : itensLegado;

    if (!codcliente || (listaProdutos.length === 0 && kits.length === 0)) {
      return res.status(400).json({ erro: "Dados inválidos: O pedido precisa ter produtos ou kits." });
    }

    const codigo_venda = await generateVendaCode();
    const finalStatus = status || "EM_ABERTO";
    const descGlobal = desconto ? Number(desconto) : 0;
    const filial = codfilial ? Number(codfilial) : 1;

    const result = await prisma.$transaction(async (tx) => {
      let subtotalGlobal = 0;
      
      // 1. Processar os Avulsos (Produtos Normais)
      const avulsosProcessados = listaProdutos.map(p => {
        const qtd = Number(p.quantidade);
        const preco = Number(p.preco_unitario);
        subtotalGlobal += (qtd * preco);
        return {
          codproduto: Number(p.codproduto || p.produtoId),
          quantidade: qtd,
          preco_unitario: preco,
          valor_total: qtd * preco,
          pedido_kit_id: null // avulso
        };
      });

      // 2. Processar os Kits
      const kitsProcessados = [];
      const itensDeKits = [];

      for (const k of kits) {
        const kitDB = await tx.mskit.findUnique({
          where: { id: Number(k.kitId) },
          include: { itens: { include: { produto: { include: { mstabela_preco: { where: { ativo: 'S' } } } } } } }
        });

        if (!kitDB) throw new Error(`Kit ${k.kitId} não encontrado`);

        const qtdKitVendido = Number(k.quantidade);
        const precoKitUnitario = Number(kitDB.preco_kit);
        const valorKitTotal = precoKitUnitario * qtdKitVendido;

        let somaPrecosOriginais = 0;
        kitDB.itens.forEach(ki => {
          somaPrecosOriginais += Number(ki.produto.mstabela_preco?.[0]?.preco_venda || 0) * ki.quantidade;
        });

        const valorOriginalTotal = somaPrecosOriginais * qtdKitVendido;
        const descontoKitTotal = valorOriginalTotal - valorKitTotal;
        
        subtotalGlobal += valorKitTotal;

        kitsProcessados.push({
          kitIdOriginal: kitDB.id,
          nome_kit: kitDB.nome,
          quantidade: qtdKitVendido,
          valor_original: valorOriginalTotal,
          valor_kit: valorKitTotal,
          desconto: descontoKitTotal > 0 ? descontoKitTotal : 0,
          componentes: kitDB.itens // guardamos para inserir no mspedido_item depois
        });
      }

      const freteGlobal = parseFloat(valor_frete) || 0;
      const valor_total_venda = subtotalGlobal - descGlobal + freteGlobal;

      // 3. Criar o Cabeçalho do Pedido
      const pedido = await tx.mspedido.create({
        data: {
          codigo_venda,
          codcliente: Number(codcliente),
          codusur_criou: codusur_criou ? Number(codusur_criou) : null,
          codvendedor: codvendedor ? Number(codvendedor) : null,
          codfilial: filial,
          data_pedido: new Date(),
          subtotal: subtotalGlobal,
          valor_frete: freteGlobal,
          desconto: descGlobal,
          valor_total: valor_total_venda,
          status: finalStatus,
          observacoes: observacoes || null,
          CODPLPAG: formaPagamento ? Number(formaPagamento) : null,
          parcelas: parcelas ? Number(parcelas) : 1
        }
      });

      // 4. Inserir os Kits (mspedido_kit) e seus Itens (mspedido_item)
      for (const kp of kitsProcessados) {
        const pedidoKit = await tx.mspedido_kit.create({
          data: {
            pedido_id: pedido.numpedido,
            kit_id: kp.kitIdOriginal,
            nome_kit: kp.nome_kit,
            quantidade: kp.quantidade,
            valor_original: kp.valor_original,
            valor_kit: kp.valor_kit,
            desconto: kp.desconto
          }
        });

        // Ratear o preço do kit entre os itens (apenas para histórico de item)
        // Pegar o fator de desconto do kit (ex: se era 220 e virou 199, fator é 0.9045)
        let somaRateio = 0;
        let fator = kp.valor_original > 0 ? kp.valor_kit / kp.valor_original : 1;

        for (let i = 0; i < kp.componentes.length; i++) {
          const comp = kp.componentes[i];
          const qtdItemTotal = comp.quantidade * kp.quantidade;
          
          let valorTotalItemRateado;
          if (i === kp.componentes.length - 1) {
            // Último item fica com a diferença para evitar erro de centavos
            valorTotalItemRateado = kp.valor_kit - somaRateio;
          } else {
            const precoOriginal = Number(comp.produto.mstabela_preco?.[0]?.preco_venda || 0) * qtdItemTotal;
            valorTotalItemRateado = Number((precoOriginal * fator).toFixed(2));
            somaRateio += valorTotalItemRateado;
          }

          itensDeKits.push({
            numpedido: pedido.numpedido,
            codproduto: comp.produto_id,
            quantidade: qtdItemTotal,
            preco_unitario: valorTotalItemRateado / qtdItemTotal, // valor unitário rateado
            valor_total: valorTotalItemRateado,
            pedido_kit_id: pedidoKit.id
          });
        }
      }

      // 5. Inserir os Itens Avulsos no array final e criar no banco
      const todosOsItensParaGravar = [
        ...avulsosProcessados.map(a => ({ ...a, numpedido: pedido.numpedido })),
        ...itensDeKits
      ];

      await tx.mspedido_item.createMany({
        data: todosOsItensParaGravar
      });

      // 6. Baixa de estoque se a venda for concluída agora
      if (finalStatus === "FINALIZADO") {
        for (const item of todosOsItensParaGravar) {
          await baixarEstoqueFefo(tx, Number(item.codproduto), filial, Number(item.quantidade), pedido.numpedido);
        }
      }

      // Retornar pedido populado
      return tx.mspedido.findUnique({
        where: { numpedido: pedido.numpedido },
        include: { mspedido_item: true, mspedido_kit: true }
      });
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    console.error("ERRO CRIAR PEDIDO:", error); res.status(500).json({ erro: error.message || "Erro ao criar pedido" });
  }
}

export async function alterarStatus(req, res) {
  try {
    const { id } = req.params; // numpedido
    const { status, motivo_cancelamento, codusur_cancelou } = req.body;

    const pedidoAnterior = await prisma.mspedido.findUnique({
      where: { numpedido: Number(id) },
      include: { mspedido_item: true }
    });

    if (!pedidoAnterior) return res.status(404).json({ error: "Pedido não encontrado" });

    // Se estiver mudando para CANCELADO
    if (status === "CANCELADO") {
      if (pedidoAnterior.status === "CANCELADO") {
        return res.status(400).json({ error: "Este pedido já está cancelado." });
      }

      if (!motivo_cancelamento || motivo_cancelamento.trim().length < 15) {
        return res.status(400).json({ error: "O motivo do cancelamento deve ter pelo menos 15 caracteres." });
      }

      await prisma.$transaction(async (tx) => {
        if (pedidoAnterior.status === "FINALIZADO") {
          await estornarEstoqueFefo(tx, pedidoAnterior.numpedido, pedidoAnterior);
        }

        await tx.mspedido.update({
          where: { numpedido: Number(id) },
          data: { 
            status: "CANCELADO",
            motivo_cancelamento,
            data_cancelamento: new Date(),
            codusur_cancelou: codusur_cancelou ? Number(codusur_cancelou) : null
          }
        });
      });

      return res.json({ mensagem: "Pedido cancelado com sucesso." });
    }

    if (status === "FINALIZADO" && pedidoAnterior.status !== "FINALIZADO") {
      await prisma.$transaction(async (tx) => {
        await tx.mspedido.update({
          where: { numpedido: Number(id) },
          data: { status }
        });

        for (const item of pedidoAnterior.mspedido_item) {
          const filial = pedidoAnterior.codfilial || 1;
          await baixarEstoqueFefo(tx, item.codproduto, filial, item.quantidade, pedidoAnterior.numpedido);
        }
      });
      return res.json({ mensagem: "Status alterado e estoque baixado." });
    }

    const pedido = await prisma.mspedido.update({
      where: { numpedido: Number(id) },
      data: { status }
    });
    res.json(pedido);

  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao alterar status" });
  }
}

export async function atualizarPedido(req, res) {
  // Simplificação: apenas permitimos atualizar se o status não estiver FINALIZADO.
  try {
    const { id } = req.params;
    const {
      codcliente,
      codvendedor,
      codfilial,
      status,
      formaPagamento,
      parcelas,
      desconto,
      valor_frete,
      observacoes,
      produtos = [], // avulsos
      kits = []      // kits comerciais
    } = req.body;

    const pedidoAnterior = await prisma.mspedido.findUnique({
      where: { numpedido: Number(id) }
    });

    if(pedidoAnterior.status === "FINALIZADO") {
      return res.status(400).json({ error: "Não é possível alterar um pedido finalizado" });
    }

    const itensLegado = req.body.itens || [];
    const listaProdutos = produtos.length > 0 ? produtos : itensLegado;

    const descGlobal = desconto ? Number(desconto) : 0;
    const filial = codfilial ? Number(codfilial) : 1;

    // Transação para deletar itens, recriar, e atualizar dados do pedido
    const pedido = await prisma.$transaction(async (tx) => {
      // Remover itens e kits antigos
      await tx.mspedido_item.deleteMany({ where: { numpedido: Number(id) } });
      await tx.mspedido_kit.deleteMany({ where: { pedido_id: Number(id) } });

      let subtotalGlobal = 0;
      
      const avulsosProcessados = listaProdutos.map(p => {
        const qtd = Number(p.quantidade);
        const preco = Number(p.preco_unitario);
        subtotalGlobal += (qtd * preco);
        return {
          numpedido: Number(id),
          codproduto: Number(p.codproduto || p.produtoId),
          quantidade: qtd,
          preco_unitario: preco,
          valor_total: qtd * preco,
          pedido_kit_id: null
        };
      });

      const itensDeKits = [];
      for (const k of kits) {
        const kitDB = await tx.mskit.findUnique({
          where: { id: Number(k.kitId) },
          include: { itens: { include: { produto: { include: { mstabela_preco: { where: { ativo: 'S' } } } } } } }
        });

        if (!kitDB) throw new Error(`Kit ${k.kitId} não encontrado`);

        const qtdKitVendido = Number(k.quantidade);
        const precoKitUnitario = Number(kitDB.preco_kit);
        const valorKitTotal = precoKitUnitario * qtdKitVendido;

        let somaPrecosOriginais = 0;
        kitDB.itens.forEach(ki => {
          somaPrecosOriginais += Number(ki.produto.mstabela_preco?.[0]?.preco_venda || 0) * ki.quantidade;
        });

        const valorOriginalTotal = somaPrecosOriginais * qtdKitVendido;
        const descontoKitTotal = valorOriginalTotal - valorKitTotal;
        
        subtotalGlobal += valorKitTotal;

        const pedidoKit = await tx.mspedido_kit.create({
          data: {
            pedido_id: Number(id),
            kit_id: kitDB.id,
            nome_kit: kitDB.nome,
            quantidade: qtdKitVendido,
            valor_original: valorOriginalTotal,
            valor_kit: valorKitTotal,
            desconto: descontoKitTotal > 0 ? descontoKitTotal : 0
          }
        });

        let somaRateio = 0;
        let fator = valorOriginalTotal > 0 ? valorKitTotal / valorOriginalTotal : 1;

        for (let i = 0; i < kitDB.itens.length; i++) {
          const comp = kitDB.itens[i];
          const qtdItemTotal = comp.quantidade * qtdKitVendido;
          
          let valorTotalItemRateado;
          if (i === kitDB.itens.length - 1) {
            valorTotalItemRateado = valorKitTotal - somaRateio;
          } else {
            const precoOriginal = Number(comp.produto.mstabela_preco?.[0]?.preco_venda || 0) * qtdItemTotal;
            valorTotalItemRateado = Number((precoOriginal * fator).toFixed(2));
            somaRateio += valorTotalItemRateado;
          }

          itensDeKits.push({
            numpedido: Number(id),
            codproduto: comp.produto_id,
            quantidade: qtdItemTotal,
            preco_unitario: valorTotalItemRateado / qtdItemTotal,
            valor_total: valorTotalItemRateado,
            pedido_kit_id: pedidoKit.id
          });
        }
      }

      const freteGlobal = parseFloat(valor_frete) || 0;
      const valor_total_venda = subtotalGlobal - descGlobal + freteGlobal;

      // Inserir os itens todos
      const todosOsItensParaGravar = [...avulsosProcessados, ...itensDeKits];
      if (todosOsItensParaGravar.length > 0) {
        await tx.mspedido_item.createMany({
          data: todosOsItensParaGravar
        });
      }

      const updated = await tx.mspedido.update({
        where: { numpedido: Number(id) },
        data: {
          codcliente: Number(codcliente),
          codvendedor: codvendedor ? Number(codvendedor) : null,
          codfilial: filial,
          status: status || "EM_ABERTO",
          subtotal: subtotalGlobal,
          valor_frete: freteGlobal,
          desconto: descGlobal,
          valor_total: valor_total_venda,
          observacoes: observacoes || null,
          CODPLPAG: formaPagamento ? Number(formaPagamento) : null,
          parcelas: parcelas ? Number(parcelas) : 1
        },
        include: {
          mspedido_item: true,
          mspedido_kit: true
        }
      });
      
      // Baixa o estoque se o pedido for alterado de EM_ABERTO para FINALIZADO
      if (pedidoAnterior.status !== "FINALIZADO" && (status === "FINALIZADO" || status === "FINALIZADA")) {
        for (const item of todosOsItensParaGravar) {
          await baixarEstoqueFefo(tx, Number(item.codproduto), filial, Number(item.quantidade), updated.numpedido);
        }
      }

      return updated;
    });

    res.json(pedido);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: error.message || "Erro ao atualizar pedido" });
  }
}

export async function removerItem(req, res) {
  res.status(400).json({ error: "Deprecated na API nova. Atualize o pedido completo." });
}

export async function adicionarItem(req, res) {
  res.status(400).json({ error: "Deprecated na API nova. Atualize o pedido completo." });
}




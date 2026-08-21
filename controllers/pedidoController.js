import prisma from "../prismaClient.js"

// FunÃ§Ã£o auxiliar para gerar codigo da venda
const getVencimentoPadrao = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
};

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

  // Busca lotes disponÃ­veis ordenados por validade
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
        msusuario_mspedido_codusur_criouTomsusuario: { select: { nome: true } },
        mspedido_item: {
          include: {
            msproduto: { select: { descricao: true } }
          }
        },
        msusuario_mspedido_codusur_cancelouTomsusuario: { select: { nome: true } }
      },
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
      kits = [],      // kits comerciais
      pagamentos = [] // pagamentos mÃºltiplos: { codplano_pagamento, valor }
    } = req.body;

    // Se vier itens (legado) e nÃ£o tiver produtos, mapear para produtos para retrocompatibilidade
    const itensLegado = req.body.itens || [];
    const listaProdutos = produtos.length > 0 ? produtos : itensLegado;

    if (!codcliente || (listaProdutos.length === 0 && kits.length === 0)) {
      return res.status(400).json({ erro: "Dados invÃ¡lidos: O pedido precisa ter produtos ou kits." });
    }

    const codigo_venda = await generateVendaCode();
    const finalStatus = status || "EM_ABERTO";
    const descGlobal = desconto ? Number(desconto) : 0;
    const filial = codfilial ? Number(codfilial) : 1;

    const result = await prisma.$transaction(async (tx) => {
      const config = await tx.msconfiguracao_empresa.findFirst();
      const modoCobrancaCartao = config?.modo_cobranca_cartao || 'PERCENTUAL';
      let sessaoCaixa = null;
      if (finalStatus === "FINALIZADO") {
        sessaoCaixa = await tx.mscaixa_sessao.findFirst({
          where: { status: 'ABERTO' }
        });
        if (!sessaoCaixa) {
          throw new Error("VocÃª precisa ter um caixa aberto para finalizar uma venda.");
        }
      }

      let subtotalGlobal = 0;
      
      // Pré-carregar planos para ver se tem cartão envolvido
      const basePlanos = await tx.mSPLANOPAGAMENTO.findMany();
      let temCartao = false;
      if (pagamentos && pagamentos.length > 0) {
        for (const pag of pagamentos) {
          const plano = basePlanos.find(p => p.CODPLPAG === Number(pag.codplano_pagamento));
          if (plano && (plano.tipo_pagamento?.includes('CARTAO') || plano.DESCRICAO?.toUpperCase().includes('CART') || plano.tem_acrescimo)) {
            temCartao = true;
          }
        }
      } else if (formaPagamento) {
        const plano = basePlanos.find(p => p.CODPLPAG === Number(formaPagamento));
        if (plano && (plano.tipo_pagamento?.includes('CARTAO') || plano.DESCRICAO?.toUpperCase().includes('CART') || plano.tem_acrescimo)) {
          temCartao = true;
        }
      }

      // 1. Processar os Avulsos (Produtos Normais) com Validação de Preço
      const avulsosProcessados = [];
      let subtotalCartaoEsperado = 0;
      for (const p of listaProdutos) {
        const cod = Number(p.codproduto || p.produtoId);
        const qtd = Number(p.quantidade);
        const precoFront = Number(p.preco_unitario);

        const tabelaPreco = await tx.mstabela_preco.findFirst({
          where: { codproduto: cod, ativo: 'S' }
        });

        if (!tabelaPreco) {
          throw new Error(`Produto código ${cod} não possui preço ativo na tabela.`);
        }

        const precoReal = Number(tabelaPreco.preco_venda);
        const precoCartao = Number(tabelaPreco.preco_cartao);
        
        if (temCartao && modoCobrancaCartao === 'PRECO_FIXO' && precoCartao > 0) {
          subtotalCartaoEsperado += (qtd * precoCartao);
        } else {
          subtotalCartaoEsperado += (qtd * precoFront);
        }

        const maxDesconto = Number(tabelaPreco.desconto_maximo || 0);

        if (precoFront < precoReal) {
          const percDesconto = ((precoReal - precoFront) / precoReal) * 100;
          if (percDesconto > maxDesconto) {
            const config = await tx.msconfiguracao_empresa.findFirst();
            if (!config?.permite_desconto_acima_limite) {
              throw new Error(`O desconto aplicado ao produto ${cod} (${percDesconto.toFixed(2)}%) excede o limite permitido (${maxDesconto}%).`);
            }
          }
        }

        subtotalGlobal += (qtd * precoFront);
        avulsosProcessados.push({
          codproduto: cod,
          quantidade: qtd,
          preco_unitario: precoFront,
          valor_total: qtd * precoFront,
          pedido_kit_id: null // avulso
        });
      }

      // 2. Processar os Kits
      const kitsProcessados = [];
      const itensDeKits = [];

      for (const k of kits) {
        const kitDB = await tx.mskit.findUnique({
          where: { id: Number(k.kitId) },
          include: { itens: { include: { produto: { include: { mstabela_preco: { where: { ativo: 'S' } } } } } } }
        });

        if (!kitDB) throw new Error(`Kit ${k.kitId} nÃ£o encontrado`);

        const qtdKitVendido = Number(k.quantidade);
        const precoKitUnitario = Number(kitDB.preco_kit);
        const precoKitCartao = Number(kitDB.preco_kit_cartao);
        const valorKitTotal = precoKitUnitario * qtdKitVendido;

        if (temCartao && modoCobrancaCartao === 'PRECO_FIXO' && precoKitCartao > 0) {
          subtotalCartaoEsperado += (qtdKitVendido * precoKitCartao);
        } else {
          subtotalCartaoEsperado += valorKitTotal;
        }

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
      let valor_total_venda = Number((subtotalGlobal - descGlobal + freteGlobal).toFixed(2));

      const todosPlanos = await tx.mSPLANOPAGAMENTO.findMany();
      const planosMap = {};
      for(const p of todosPlanos) {
        planosMap[p.CODPLPAG] = p;
      }

      let somaPagamentos = 0;
      let acrescimoTotalGeral = 0;

      if (pagamentos && pagamentos.length > 0) {
        for (const pag of pagamentos) {
          somaPagamentos += pag.valor;
          const plano = planosMap[pag.codplano_pagamento];
          if (plano && plano.tem_acrescimo) {
            if (modoCobrancaCartao === 'PERCENTUAL') {
              let taxa = Number(plano.taxa_acrescimo || 0);
              if (plano.regras_parcelamento) {
                try {
                  const regras = JSON.parse(plano.regras_parcelamento);
                  const regra = regras.find(r => Number(r.parcelas) === Number(pag.parcelas || 1));
                  if (regra) taxa = Number(regra.acrescimo_percentual || 0);
                } catch(e) {}
              }
              if (taxa > 0) {
                const valorSemAcrescimo = pag.valor / (1 + (taxa / 100));
                const acrescimoDestePagamento = pag.valor - valorSemAcrescimo;
                acrescimoTotalGeral += acrescimoDestePagamento;
                pag.acrescimo_percentual = taxa;
                pag.valor_acrescimo = Number(acrescimoDestePagamento.toFixed(2));
              }
            } else {
              pag.valor_acrescimo = Number((pag.snapshot_acrescimo_aplicado || 0).toFixed(2));
              acrescimoTotalGeral += pag.valor_acrescimo;
            }
          }
        }
        somaPagamentos = Number(somaPagamentos.toFixed(2));
        acrescimoTotalGeral = Number(acrescimoTotalGeral.toFixed(2));

        if (temCartao && modoCobrancaCartao === 'PRECO_FIXO') {
          const acrescimoNecessario = Number((subtotalCartaoEsperado - subtotalGlobal).toFixed(2));
          if (acrescimoNecessario > 0 && acrescimoTotalGeral < acrescimoNecessario) {
            throw new Error(`A venda no cartão exige o acréscimo de Preço Fixo (R$ ${acrescimoNecessario}). Valor informado: R$ ${acrescimoTotalGeral}.`);
          }
        }

        valor_total_venda = Number((valor_total_venda + acrescimoTotalGeral).toFixed(2));

        if (Math.abs(somaPagamentos - valor_total_venda) > 0.05 && (finalStatus === "FINALIZADO" || finalStatus === "FINALIZADA")) {
          throw new Error(`Soma de pagamentos (R$ ${somaPagamentos}) diverge do valor da venda (R$ ${valor_total_venda}).`);
        }
      }

      // 3. Criar o CabeÃ§alho do Pedido
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

        // Ratear o preÃ§o do kit entre os itens (apenas para histÃ³rico de item)
        // Pegar o fator de desconto do kit (ex: se era 220 e virou 199, fator Ã© 0.9045)
        let somaRateio = 0;
        let fator = kp.valor_original > 0 ? kp.valor_kit / kp.valor_original : 1;

        for (let i = 0; i < kp.componentes.length; i++) {
          const comp = kp.componentes[i];
          const qtdItemTotal = comp.quantidade * kp.quantidade;
          
          let valorTotalItemRateado;
          if (i === kp.componentes.length - 1) {
            // Ãltimo item fica com a diferenÃ§a para evitar erro de centavos
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
            preco_unitario: valorTotalItemRateado / qtdItemTotal, // valor unitÃ¡rio rateado
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

      // 6. Baixa de estoque se a venda for concluÃ­da agora
      if (finalStatus === "FINALIZADO") {
        for (const item of todosOsItensParaGravar) {
          await baixarEstoqueFefo(tx, Number(item.codproduto), filial, Number(item.quantidade), pedido.numpedido);
        }

        // 7. Salvar pagamentos e movimento de caixa
        const todosPlanos = await tx.mSPLANOPAGAMENTO.findMany();
        const planosMap = {};
        for(const p of todosPlanos) planosMap[p.CODPLPAG] = p.tipo_pagamento;

        if (pagamentos && pagamentos.length > 0) {
          for (const pag of pagamentos) {
            const valorPag = parseFloat(pag.valor);
            const isCrediario = planosMap[Number(pag.codplano_pagamento)] === 'CREDIARIO';
            
            await tx.mspedido_pagamento.create({
              data: {
                numpedido: pedido.numpedido,
                codplano_pagamento: Number(pag.codplano_pagamento),
                valor: valorPag,
                bandeira: pag.bandeira || null,
                parcelas: pag.parcelas ? Number(pag.parcelas) : null,
                acrescimo_percentual: pag.acrescimo_percentual ? Number(pag.acrescimo_percentual) : null,
                valor_acrescimo: pag.valor_acrescimo ? Number(pag.valor_acrescimo) : null,
                valor_parcela: pag.valor_parcela ? Number(pag.valor_parcela) : null,
                modo_cobranca: pag.modo_cobranca || null
              }
            });

            if (isCrediario) {
              await tx.mscontas_receber.create({
                data: {
                  codcliente: Number(codcliente),
                  codfilial: filial,
                  numpedido: pedido.numpedido,
                  valor_total: valorPag,
                  data_emissao: new Date(),
                  data_vencimento: getVencimentoPadrao(),
                  status: "PENDENTE",
                  observacoes: `Venda ${codigo_venda} (MÃºltiplos)`
                }
              });
            } else {
              await tx.mscaixa_movimento.create({
                data: {
                  codsessao: sessaoCaixa.codsessao,
                  codusur: codusur_criou ? Number(codusur_criou) : sessaoCaixa.codusur_abertura,
                  tipo: 'ENTRADA',
                  categoria: 'VENDA',
                  valor: valorPag,
                  codplano_pagamento: Number(pag.codplano_pagamento),
                  numpedido: pedido.numpedido,
                  observacao: `Venda ${codigo_venda}`
                }
              });
            }
          }
        } else if (formaPagamento) {
          // Fallback para legado
          const isCrediario = planosMap[Number(formaPagamento)] === 'CREDIARIO';
          
          await tx.mspedido_pagamento.create({
            data: {
              numpedido: pedido.numpedido,
              codplano_pagamento: Number(formaPagamento),
              valor: valor_total_venda
            }
          });
          
          if (isCrediario) {
            await tx.mscontas_receber.create({
              data: {
                codcliente: Number(codcliente),
                codfilial: filial,
                numpedido: pedido.numpedido,
                valor_total: valor_total_venda,
                data_emissao: new Date(),
                  data_vencimento: getVencimentoPadrao(),
                  status: "PENDENTE",
                observacoes: `Venda ${codigo_venda}`
              }
            });
          } else {
            await tx.mscaixa_movimento.create({
              data: {
                codsessao: sessaoCaixa.codsessao,
                codusur: codusur_criou ? Number(codusur_criou) : sessaoCaixa.codusur_abertura,
                tipo: 'ENTRADA',
                categoria: 'VENDA',
                valor: valor_total_venda,
                codplano_pagamento: Number(formaPagamento),
                numpedido: pedido.numpedido,
                observacao: `Venda ${codigo_venda}`
              }
            });
          }
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

    if (!pedidoAnterior) return res.status(404).json({ error: "Pedido nÃ£o encontrado" });

    // Se estiver mudando para CANCELADO
    if (status === "CANCELADO") {
      if (pedidoAnterior.status === "CANCELADO") {
        return res.status(400).json({ error: "Este pedido jÃ¡ estÃ¡ cancelado." });
      }

      if (!motivo_cancelamento || motivo_cancelamento.trim().length < 15) {
        return res.status(400).json({ error: "O motivo do cancelamento deve ter pelo menos 15 caracteres." });
      }

      const contasPagas = await prisma.mscontas_receber.findFirst({
        where: { 
          numpedido: pedidoAnterior.numpedido, 
          status: { in: ['PARCIAL', 'PAGO'] }
        }
      });

      if (contasPagas) {
        return res.status(400).json({ error: "Não é possível cancelar este pedido, pois já existem pagamentos parciais ou totais nas contas a receber vinculadas." });
      }

      await prisma.$transaction(async (tx) => {
        if (pedidoAnterior.status === "FINALIZADO") {
          await estornarEstoqueFefo(tx, pedidoAnterior.numpedido, pedidoAnterior);

          // Estornar os valores do caixa
          const usrId = codusur_cancelou || pedidoAnterior.codusur_criou;
          const sessaoCaixa = await tx.mscaixa_sessao.findFirst({
            where: { status: 'ABERTO' }
          });

          const movimentos = await tx.mscaixa_movimento.findMany({
            where: { numpedido: pedidoAnterior.numpedido, categoria: 'VENDA' }
          });
          
          for (const mov of movimentos) {
            await tx.mscaixa_movimento.create({
              data: {
                codsessao: sessaoCaixa ? sessaoCaixa.codsessao : mov.codsessao, // Se nÃ£o tiver caixa aberto, joga no mesmo da venda (embora caixa devesse estar aberto)
                codusur: usrId ? Number(usrId) : mov.codusur,
                tipo: 'SAIDA',
                categoria: 'ESTORNO',
                valor: mov.valor,
                codplano_pagamento: mov.codplano_pagamento,
                numpedido: mov.numpedido,
                observacao: `Estorno de Venda ${pedidoAnterior.codigo_venda || pedidoAnterior.numpedido}`
              }
            });
          }
        }
        
        // Cancela todas as contas a receber pendentes geradas por esse pedido
        await tx.mscontas_receber.updateMany({
          where: { numpedido: pedidoAnterior.numpedido, status: 'PENDENTE' },
          data: { status: 'CANCELADO' }
        });

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
        // Verifica caixa aberto
        // Precisamos do codusur_criou. Se nÃ£o vier no body, usamos do pedidoAnterior.
        const usrId = req.body.codusur_cancelou || req.body.codusur || req.usuario?.id || pedidoAnterior.codusur_criou || 1;
        const sessaoCaixa = await tx.mscaixa_sessao.findFirst({
          where: { status: 'ABERTO' }
        });
        if (!sessaoCaixa) {
          throw new Error("VocÃª precisa ter um caixa aberto para finalizar uma venda.");
        }

        await tx.mspedido.update({
          where: { numpedido: Number(id) },
          data: { status }
        });

        for (const item of pedidoAnterior.mspedido_item) {
          const filial = pedidoAnterior.codfilial || 1;
          await baixarEstoqueFefo(tx, item.codproduto, filial, item.quantidade, pedidoAnterior.numpedido);
        }

        // Registrar o movimento de caixa e pagamento
        const plano = await tx.mSPLANOPAGAMENTO.findUnique({
          where: { CODPLPAG: Number(pedidoAnterior.CODPLPAG || 1) }
        });
        const isCrediario = plano && plano.tipo_pagamento === 'CREDIARIO';

        await tx.mspedido_pagamento.create({
          data: {
            numpedido: pedidoAnterior.numpedido,
            codplano_pagamento: Number(pedidoAnterior.CODPLPAG || 1),
            valor: pedidoAnterior.valor_total
          }
        });

        if (isCrediario) {
          await tx.mscontas_receber.create({
            data: {
              codcliente: pedidoAnterior.codcliente,
              codfilial: pedidoAnterior.codfilial || 1,
              numpedido: pedidoAnterior.numpedido,
              valor_total: pedidoAnterior.valor_total,
              data_emissao: new Date(),
              data_vencimento: getVencimentoPadrao(),
              status: "PENDENTE",
              observacoes: `Venda ${pedidoAnterior.codigo_venda}`
            }
          });
        } else {
          await tx.mscaixa_movimento.create({
            data: {
              codsessao: sessaoCaixa.codsessao,
              codusur: usrId ? Number(usrId) : 0,
              tipo: 'ENTRADA',
              categoria: 'VENDA',
              valor: pedidoAnterior.valor_total,
              codplano_pagamento: Number(pedidoAnterior.CODPLPAG || 1),
              numpedido: pedidoAnterior.numpedido,
              observacao: `Venda ${pedidoAnterior.codigo_venda}`
            }
          });
        }
      });
      return res.json({ mensagem: "Status alterado, estoque baixado e movimentaÃ§Ã£o registrada no caixa." });
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
  // SimplificaÃ§Ã£o: apenas permitimos atualizar se o status nÃ£o estiver FINALIZADO.
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
      kits = [],      // kits comerciais
      pagamentos = [], // pagamentos mÃºltiplos
      codusur // UsuÃ¡rio que estÃ¡ realizando a aÃ§Ã£o
    } = req.body;

    const pedidoAnterior = await prisma.mspedido.findUnique({
      where: { numpedido: Number(id) }
    });

    if(pedidoAnterior.status === "FINALIZADO") {
      return res.status(400).json({ error: "NÃ£o Ã© possÃ­vel alterar um pedido finalizado" });
    }

    const itensLegado = req.body.itens || [];
    const listaProdutos = produtos.length > 0 ? produtos : itensLegado;

    const descGlobal = desconto ? Number(desconto) : 0;
    const filial = codfilial ? Number(codfilial) : 1;

    // TransaÃ§Ã£o para deletar itens, recriar, e atualizar dados do pedido
    const pedido = await prisma.$transaction(async (tx) => {
      let sessaoCaixa = null;
      if (pedidoAnterior.status !== "FINALIZADO" && (status === "FINALIZADO" || status === "FINALIZADA")) {
        sessaoCaixa = await tx.mscaixa_sessao.findFirst({
          // Caixa compartilhado: Pega o caixa aberto da loja
          where: { status: 'ABERTO' }
        });
        if (!sessaoCaixa) {
          throw new Error("VocÃª precisa ter um caixa aberto para finalizar uma venda.");
        }
      }

      // Remover itens e kits antigos
      await tx.mspedido_item.deleteMany({ where: { numpedido: Number(id) } });
      await tx.mspedido_kit.deleteMany({ where: { pedido_id: Number(id) } });
      // Remover pagamentos antigos, se existirem (para caso estejamos re-gravando)
      await tx.mspedido_pagamento.deleteMany({ where: { numpedido: Number(id) } });

      let subtotalGlobal = 0;
      
      const config = await tx.msconfiguracao_empresa.findFirst();
      const modoCobrancaCartao = config?.modo_cobranca_cartao || 'PERCENTUAL';

      // Pré-carregar planos para ver se tem cartão envolvido
      const basePlanos = await tx.mSPLANOPAGAMENTO.findMany();
      let temCartao = false;
      if (pagamentos && pagamentos.length > 0) {
        for (const pag of pagamentos) {
          const plano = basePlanos.find(p => p.CODPLPAG === Number(pag.codplano_pagamento));
          if (plano && (plano.tipo_pagamento?.includes('CARTAO') || plano.DESCRICAO?.toUpperCase().includes('CART') || plano.tem_acrescimo)) {
            temCartao = true;
          }
        }
      } else if (formaPagamento) {
        const plano = basePlanos.find(p => p.CODPLPAG === Number(formaPagamento));
        if (plano && (plano.tipo_pagamento?.includes('CARTAO') || plano.DESCRICAO?.toUpperCase().includes('CART') || plano.tem_acrescimo)) {
          temCartao = true;
        }
      }

      const avulsosProcessados = [];
      let subtotalCartaoEsperado = 0;
      for (const p of listaProdutos) {
        const cod = Number(p.codproduto || p.produtoId);
        const qtd = Number(p.quantidade);
        const precoFront = Number(p.preco_unitario);

        const tabelaPreco = await tx.mstabela_preco.findFirst({
          where: { codproduto: cod, ativo: 'S' }
        });

        if (!tabelaPreco) {
          throw new Error(`Produto código ${cod} não possui preço ativo na tabela.`);
        }

        const precoReal = Number(tabelaPreco.preco_venda);
        const precoCartao = Number(tabelaPreco.preco_cartao);
        
        if (temCartao && modoCobrancaCartao === 'PRECO_FIXO' && precoCartao > 0) {
          subtotalCartaoEsperado += (qtd * precoCartao);
        } else {
          subtotalCartaoEsperado += (qtd * precoFront);
        }

        const maxDesconto = Number(tabelaPreco.desconto_maximo || 0);

        if (precoFront < precoReal) {
          const percDesconto = ((precoReal - precoFront) / precoReal) * 100;
          if (percDesconto > maxDesconto) {
            const config = await tx.msconfiguracao_empresa.findFirst();
            if (!config?.permite_desconto_acima_limite) {
              throw new Error(`O desconto aplicado ao produto ${cod} (${percDesconto.toFixed(2)}%) excede o limite permitido (${maxDesconto}%).`);
            }
          }
        }

        subtotalGlobal += (qtd * precoFront);
        avulsosProcessados.push({
          numpedido: Number(id),
          codproduto: cod,
          quantidade: qtd,
          preco_unitario: precoFront,
          valor_total: qtd * precoFront,
          pedido_kit_id: null
        });
      }

      const itensDeKits = [];
      for (const k of kits) {
        const kitDB = await tx.mskit.findUnique({
          where: { id: Number(k.kitId) },
          include: { itens: { include: { produto: { include: { mstabela_preco: { where: { ativo: 'S' } } } } } } }
        });

        if (!kitDB) throw new Error(`Kit ${k.kitId} nÃ£o encontrado`);

        const qtdKitVendido = Number(k.quantidade);
        const precoKitUnitario = Number(kitDB.preco_kit);
        const precoKitCartao = Number(kitDB.preco_kit_cartao);
        const valorKitTotal = precoKitUnitario * qtdKitVendido;

        if (temCartao && modoCobrancaCartao === 'PRECO_FIXO' && precoKitCartao > 0) {
          subtotalCartaoEsperado += (qtdKitVendido * precoKitCartao);
        } else {
          subtotalCartaoEsperado += valorKitTotal;
        }

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
      let valor_total_venda = Number((subtotalGlobal - descGlobal + freteGlobal).toFixed(2));

      const todosPlanosUpdate = await tx.mSPLANOPAGAMENTO.findMany();
      const planosMapUpdate = {};
      for(const p of todosPlanosUpdate) {
        planosMapUpdate[p.CODPLPAG] = p;
      }

      let somaPagamentosUpdate = 0;
      let acrescimoTotalGeralUpdate = 0;

      if (pagamentos && pagamentos.length > 0) {
        for (const pag of pagamentos) {
          somaPagamentosUpdate += pag.valor;
          const plano = planosMapUpdate[pag.codplano_pagamento];
          if (plano && plano.tem_acrescimo) {
            if (modoCobrancaCartao === 'PERCENTUAL') {
              let taxa = Number(plano.taxa_acrescimo || 0);
              if (plano.regras_parcelamento) {
                try {
                  const regras = JSON.parse(plano.regras_parcelamento);
                  const regra = regras.find(r => Number(r.parcelas) === Number(pag.parcelas || 1));
                  if (regra) taxa = Number(regra.acrescimo_percentual || 0);
                } catch(e) {}
              }
              if (taxa > 0) {
                const valorSemAcrescimo = pag.valor / (1 + (taxa / 100));
                const acrescimoDestePagamento = pag.valor - valorSemAcrescimo;
                acrescimoTotalGeralUpdate += acrescimoDestePagamento;
                pag.acrescimo_percentual = taxa;
                pag.valor_acrescimo = Number(acrescimoDestePagamento.toFixed(2));
              }
            } else {
              pag.valor_acrescimo = Number((pag.snapshot_acrescimo_aplicado || 0).toFixed(2));
              acrescimoTotalGeralUpdate += pag.valor_acrescimo;
            }
          }
        }
        somaPagamentosUpdate = Number(somaPagamentosUpdate.toFixed(2));
        acrescimoTotalGeralUpdate = Number(acrescimoTotalGeralUpdate.toFixed(2));

        if (temCartao && modoCobrancaCartao === 'PRECO_FIXO') {
          const acrescimoNecessario = Number((subtotalCartaoEsperado - subtotalGlobal).toFixed(2));
          if (acrescimoNecessario > 0 && acrescimoTotalGeralUpdate < acrescimoNecessario) {
            throw new Error(`A atualização para pagamento em cartão exige o acréscimo de Preço Fixo (R$ ${acrescimoNecessario}). Valor informado: R$ ${acrescimoTotalGeralUpdate}.`);
          }
        }

        valor_total_venda = Number((valor_total_venda + acrescimoTotalGeralUpdate).toFixed(2));

        if (Math.abs(somaPagamentosUpdate - valor_total_venda) > 0.05 && (status === "FINALIZADO" || status === "FINALIZADA")) {
          throw new Error(`Soma de pagamentos (R$ ${somaPagamentosUpdate}) diverge do valor da venda (R$ ${valor_total_venda}).`);
        }
      }

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

        // Buscar os planos de pagamento para saber se Ã© crediÃ¡rio
        const todosPlanos = await tx.mSPLANOPAGAMENTO.findMany();
        const planosMap = {};
        for(const p of todosPlanos) planosMap[p.CODPLPAG] = p.tipo_pagamento;

        // Inserir os pagamentos no pedido e no movimento de caixa (ou contas a receber)
        if (pagamentos && pagamentos.length > 0) {
          for (const pag of pagamentos) {
            const valorPag = parseFloat(pag.valor);
            const isCrediario = planosMap[Number(pag.codplano_pagamento)] === 'CREDIARIO';

            await tx.mspedido_pagamento.create({
              data: {
                numpedido: updated.numpedido,
                codplano_pagamento: Number(pag.codplano_pagamento),
                valor: valorPag
              }
            });

            if (isCrediario) {
              await tx.mscontas_receber.create({
                data: {
                  codcliente: Number(codcliente),
                  codfilial: filial,
                  numpedido: updated.numpedido,
                  valor_total: valorPag,
                  data_emissao: new Date(),
                  data_vencimento: getVencimentoPadrao(),
                  status: "PENDENTE",
                  observacoes: `Venda ${updated.codigo_venda} (MÃºltiplos)`
                }
              });
            } else {
              await tx.mscaixa_movimento.create({
                data: {
                  codsessao: sessaoCaixa.codsessao,
                  codusur: (req.body.codusur_criou || codusur) ? Number(req.body.codusur_criou || codusur) : sessaoCaixa.codusur_abertura,
                  tipo: 'ENTRADA',
                  categoria: 'VENDA',
                  valor: valorPag,
                  codplano_pagamento: Number(pag.codplano_pagamento),
                  numpedido: updated.numpedido,
                  observacao: `Venda ${updated.codigo_venda}`
                }
              });
            }
          }
        } else if (formaPagamento) {
          const isCrediario = planosMap[Number(formaPagamento)] === 'CREDIARIO';

          await tx.mspedido_pagamento.create({
            data: {
              numpedido: updated.numpedido,
              codplano_pagamento: Number(formaPagamento),
              valor: valor_total_venda
            }
          });

          if (isCrediario) {
            await tx.mscontas_receber.create({
              data: {
                codcliente: Number(codcliente),
                codfilial: filial,
                numpedido: updated.numpedido,
                valor_total: valor_total_venda,
                data_emissao: new Date(),
                  data_vencimento: getVencimentoPadrao(),
                  status: "PENDENTE",
                observacoes: `Venda ${updated.codigo_venda}`
              }
            });
          } else {
            await tx.mscaixa_movimento.create({
              data: {
                codsessao: sessaoCaixa.codsessao,
                codusur: (req.body.codusur_criou || codusur) ? Number(req.body.codusur_criou || codusur) : sessaoCaixa.codusur_abertura,
                tipo: 'ENTRADA',
                categoria: 'VENDA',
                valor: valor_total_venda,
                codplano_pagamento: Number(formaPagamento),
                numpedido: updated.numpedido,
                observacao: `Venda ${updated.codigo_venda}`
              }
            });
          }
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




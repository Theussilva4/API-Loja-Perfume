import prisma from "../prismaClient.js"

export async function listarLotes(req, res) {
  try {
    const { codproduto } = req.params;
    const { codfilial } = req.query;

    const where = { codproduto: Number(codproduto), quantidade: { gt: 0 } };
    if (codfilial) {
      where.codfilial = Number(codfilial);
    }

    const lotes = await prisma.msestoque_lote.findMany({
      where,
      orderBy: { validade: 'asc' }
    });

    res.json(lotes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao buscar lotes" });
  }
}
import { logAuditoria } from "../services/auditService.js"
import { randomUUID } from "crypto"

export async function listarEstoque(req, res) {
  try {
    const estoque = await prisma.msestoque.findMany()
    res.json(estoque)
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: "Erro ao buscar estoques" })
  }
}

export async function alterarEstoque(req, res) {
  const{codestoque} = req.params;
  const {...dados} = req.body;

 if (!codestoque) {
    return res.status(400).json({ erro: "O cÃ³digo do estoque Ã© obrigatÃ³rio" });
  }
  // Remover campos que nÃ£o devem ser atualizados
  const camposProibidos = ["data_cadastro", "ativo"];
  camposProibidos.forEach(campo => delete dados[campo]);
  try {
    const estoqueAtualizado = await prisma.msestoque.update({
      where: { codestoque: Number(codestoque) },
      data: dados,
      
    })
    res.json(estoqueAtualizado)
  } catch (error) {
    res.status(500).json({ erro: "Erro ao alterar estoque" })
  }
}

export async function listarMovimentacoesSaida(req, res) {
  try {
    const saidas = await prisma.msmov_estoque.findMany({
      where: { tipo: "SAIDA" },
      orderBy: { data_mov: "desc" },
    });

    const codigosProdutos = [...new Set(saidas.map(s => s.codproduto))];
    const produtos = await prisma.msproduto.findMany({
      where: { codproduto: { in: codigosProdutos } }
    });

    const produtosMap = produtos.reduce((acc, p) => {
      acc[p.codproduto] = p;
      return acc;
    }, {});

    const saidasComProduto = saidas.map(s => ({
      ...s,
      produto: produtosMap[s.codproduto] || null
    }));

    res.json(saidasComProduto);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao buscar saÃ­das" });
  }
}

export async function registrarEntradaManual(req, res) {
  try {
    let { filialDestino, itens, origem, codproduto, codfilial, quantidade } = req.body;
    
    // Suporte ao formato antigo (frontend com cache)
    if (!itens && codproduto && codfilial && quantidade) {
      filialDestino = parseInt(codfilial);
      itens = [{
        codproduto: parseInt(codproduto),
        quantidade: Number(quantidade)
      }];
    }

    if (!filialDestino || !itens || !itens.length) {
      return res.status(400).json({ erro: "Filial destino e itens sÃ£o obrigatÃ³rios" });
    }

    const ajusteUuid = randomUUID();

    await prisma.$transaction(async (tx) => {
      for (const item of itens) {
        // Encontrar ou criar registro de estoque
        const estoque = await tx.msestoque.findUnique({
          where: {
            codproduto_codfilial: {
              codproduto: item.codproduto,
              codfilial: filialDestino
            }
          }
        });

        if (estoque) {
          await tx.msestoque.update({
            where: {
              codproduto_codfilial: {
                codproduto: item.codproduto,
                codfilial: filialDestino
              }
            },
            data: {
              quantidade: estoque.quantidade + item.quantidade
            }
          });
        } else {
          await tx.msestoque.create({
            data: {
              codproduto: item.codproduto,
              codfilial: filialDestino,
              quantidade: item.quantidade
            }
          });
        }

        // Registrar movimentaÃ§Ã£o individual com UUID comum
        await tx.msmov_estoque.create({
          data: {
            codproduto: item.codproduto,
            codfilial: filialDestino,
            tipo: "ENTRADA",
            origem: origem || "AJUSTE",
            quantidade: item.quantidade,
            uuid: ajusteUuid,
            created_by: req.usuario ? req.usuario.id : null
          }
        });

        // Registrar Lote/Validade para o FEFO
        if (item.validade) {
          const loteNome = item.lote || "SEM_LOTE";
          
          const loteExistente = await tx.msestoque_lote.findFirst({
            where: {
              codproduto: item.codproduto,
              codfilial: filialDestino,
              lote: loteNome,
              validade: new Date(item.validade)
            }
          });

          if (loteExistente) {
            await tx.msestoque_lote.update({
              where: { id: loteExistente.id },
              data: { quantidade: loteExistente.quantidade + item.quantidade }
            });
          } else {
            await tx.msestoque_lote.create({
              data: {
                codproduto: item.codproduto,
                codfilial: filialDestino,
                lote: loteNome,
                validade: new Date(item.validade),
                quantidade: item.quantidade
              }
            });
          }
        } else {
          // Se nÃ£o enviou validade, cria/atualiza lote genÃ©rico SEM_LOTE e sem validade
          const loteExistente = await tx.msestoque_lote.findFirst({
            where: {
              codproduto: item.codproduto,
              codfilial: filialDestino,
              lote: "SEM_LOTE",
              validade: null
            }
          });

          if (loteExistente) {
            await tx.msestoque_lote.update({
              where: { id: loteExistente.id },
              data: { quantidade: loteExistente.quantidade + item.quantidade }
            });
          } else {
            await tx.msestoque_lote.create({
              data: {
                codproduto: item.codproduto,
                codfilial: filialDestino,
                lote: "SEM_LOTE",
                quantidade: item.quantidade
              }
            });
          }
        }
      }
    });

    res.status(201).json({ message: "Ajustes de estoque registrados com sucesso." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao registrar entradas de estoque." });
  }
}

export async function listarMovimentacoesEntrada(req, res) {
  try {
    const entradas = await prisma.msmov_estoque.findMany({
      where: { tipo: "ENTRADA", origem: "AJUSTE" },
      orderBy: { data_mov: "desc" },
    });

    const codigosProdutos = [...new Set(entradas.map(e => e.codproduto))];
    const produtos = await prisma.msproduto.findMany({
      where: { codproduto: { in: codigosProdutos } }
    });

    const produtosMap = produtos.reduce((acc, p) => {
      acc[p.codproduto] = p;
      return acc;
    }, {});

    const grouped = entradas.reduce((acc, mov) => {
      const key = mov.uuid || mov.id.toString();
      if (!acc[key]) {
        acc[key] = {
          id: mov.id,
          uuid: mov.uuid,
          data_mov: mov.data_mov,
          codfilial: mov.codfilial,
          origem: mov.origem,
          itens: []
        };
      }
      acc[key].itens.push({
        ...mov,
        produto: produtosMap[mov.codproduto] || null
      });
      return acc;
    }, {});

    const agrupadosArray = Object.values(grouped).sort((a, b) => new Date(b.data_mov) - new Date(a.data_mov));

    res.status(200).json(agrupadosArray);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao listar movimentaÃ§Ãµes de entrada." });
  }
}

export async function registrarSaidaManual(req, res) {
  try {
    const { codproduto, codfilial, quantidade, origem } = req.body;

    if (!codproduto || !quantidade || quantidade <= 0) {
      return res.status(400).json({ erro: "Produto e quantidade vÃ¡lidos sÃ£o obrigatÃ³rios" });
    }

    const filialId = codfilial ? Number(codfilial) : 1;

    const result = await prisma.$transaction(async (tx) => {
      const novaMov = await tx.msmov_estoque.create({
        data: {
          codproduto: Number(codproduto),
          codfilial: filialId,
          tipo: "SAIDA",
          origem: origem || "AJUSTE",
          quantidade: Number(quantidade),
          created_by: req.usuario ? req.usuario.id : null
        }
      });

      await tx.msestoque.upsert({
        where: {
          codproduto_codfilial: {
            codproduto: Number(codproduto),
            codfilial: filialId
          }
        },
        update: {
          quantidade: { decrement: Number(quantidade) },
          atualizado_em: new Date()
        },
        create: {
          codproduto: Number(codproduto),
          codfilial: filialId,
          quantidade: -Number(quantidade)
        }
      });

      return novaMov;
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao registrar saÃ­da" });
  }
}

export async function cancelarSaidaManual(req, res) {
  try {
    const { id } = req.params;
    const { motivo } = req.body; // Vem do front

    const mov = await prisma.msmov_estoque.findUnique({
      where: { id: Number(id) }
    });

    if (!mov) {
      return res.status(404).json({ erro: "MovimentaÃ§Ã£o nÃ£o encontrada" });
    }

    if (mov.tipo !== "SAIDA") {
      return res.status(400).json({ erro: "Esta movimentaÃ§Ã£o nÃ£o Ã© uma saÃ­da" });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.msestoque.update({
        where: {
          codproduto_codfilial: {
            codproduto: mov.codproduto,
            codfilial: mov.codfilial
          }
        },
        data: {
          quantidade: { increment: mov.quantidade },
          atualizado_em: new Date()
        }
      });

      const deletada = await tx.msmov_estoque.delete({
        where: { id: mov.id }
      });

      return deletada;
    });

    await logAuditoria({
      acao: "CANCELAR",
      tabela: "msmov_estoque",
      registro_id: id,
      campo: "id",
      valor_antigo: JSON.stringify(mov),
      valor_novo: null,
      motivo: motivo || "Sem motivo"
    });

    res.json(result);
  } catch (error) {
    console.error("Erro ao cancelar saÃ­da:", error);
    res.status(500).json({ erro: "Erro ao cancelar saÃ­da" });
  }
}

export async function extratoProduto(req, res) {
  try {
    const { id } = req.params;
    let { dataInicial, dataFinal } = req.query;

    const codproduto = Number(id);

    let whereMovs = { codproduto };
    let whereSaldoInicial = { codproduto };

    if (dataInicial) {
      const start = new Date(dataInicial);
      whereMovs.data_mov = { gte: start };
      whereSaldoInicial.data_mov = { lt: start };
    }
    if (dataFinal) {
      const end = new Date(dataFinal);
      end.setHours(23, 59, 59, 999);
      if (whereMovs.data_mov) {
        whereMovs.data_mov.lte = end;
      } else {
        whereMovs.data_mov = { lte: end };
      }
    }

    // 1. Calcula o saldo inicial
    const movimentosAnteriores = await prisma.msmov_estoque.findMany({
      where: whereSaldoInicial,
      select: { tipo: true, quantidade: true }
    });

    let saldoAcumulado = 0;
    for (const m of movimentosAnteriores) {
      if (m.tipo === "ENTRADA") saldoAcumulado += m.quantidade;
      else if (m.tipo === "SAIDA") saldoAcumulado -= m.quantidade;
    }
    const saldoInicial = saldoAcumulado;

    // 2. Busca os movimentos do periodo
    const movimentos = await prisma.msmov_estoque.findMany({
      where: whereMovs,
      orderBy: { data_mov: 'asc' }
    });

    let totalEntradas = 0;
    let totalSaidas = 0;

    const resultado = [];

    for (const mov of movimentos) {
      let documento = "";
      let envolvido = "";
      let precoUnitario = null;
      let operacao = `${mov.tipo === 'ENTRADA' ? 'E' : 'S'} - ${mov.origem}`;
      let motivo = "";

      if (mov.tipo === "ENTRADA") {
        totalEntradas += mov.quantidade;
        saldoAcumulado += mov.quantidade;
      } else {
        totalSaidas += mov.quantidade;
        saldoAcumulado -= mov.quantidade;
      }

      if (mov.origem === "VENDA" && mov.origem_id) {
        const pedido = await prisma.mspedido.findUnique({
          where: { numpedido: mov.origem_id },
          include: { 
            mscliente: true,
            msusuario_mspedido_codusur_vendedorTomsusuario: true,
            mspedido_item: { where: { codproduto } }
          }
        });
        if (pedido) {
          documento = pedido.numpedido.toString();
          envolvido = pedido.mscliente?.nome || "";
          if (pedido.mspedido_item.length > 0) {
            precoUnitario = pedido.mspedido_item[0].preco_venda;
          }
        }
      } else if (mov.origem === "COMPRA" && mov.origem_id) {
        const compra = await prisma.mscompra.findUnique({
          where: { codcompra: mov.origem_id },
          include: { 
            msfornecedor: true,
            mscompra_item: { where: { codproduto } }
          }
        });
        if (compra) {
          documento = compra.codcompra.toString();
          envolvido = compra.msfornecedor?.nome || "";
          if (compra.mscompra_item.length > 0) {
            precoUnitario = compra.mscompra_item[0].custo_unitario;
          }
        }
      } else if (mov.tipo === "SAIDA" && mov.origem === "CANCELAMENTO_COMPRA") {
         documento = mov.origem_id ? mov.origem_id.toString() : "";
      } else if (mov.tipo === "ENTRADA" && mov.origem === "CANCELAMENTO_VENDA") {
         documento = mov.origem_id ? mov.origem_id.toString() : "";
      }

      resultado.push({
        id: mov.id,
        data_mov: mov.data_mov,
        operacao,
        motivo: mov.origem !== "VENDA" && mov.origem !== "COMPRA" ? mov.origem : "", // Simplificado
        documento,
        envolvido,
        precoUnitario,
        qt_entrada: mov.tipo === "ENTRADA" ? mov.quantidade : 0,
        qt_saida: mov.tipo === "SAIDA" ? mov.quantidade : 0,
        saldo_est: saldoAcumulado
      });
    }

    res.json({
      saldo_inicial: saldoInicial,
      movimentacoes: resultado,
      totais: {
        entradas: totalEntradas,
        saidas: totalSaidas
      },
      saldo_final: saldoAcumulado
    });
  } catch (error) {
    console.error("Erro ao gerar extrato:", error);
    res.status(500).json({ erro: "Erro ao gerar extrato de estoque" });
  }
}

export async function transferirEstoque(req, res) {
  try {
    const { codproduto, filialOrigem, filialDestino, quantidade, observacao } = req.body;

    if (!codproduto || !filialOrigem || !filialDestino || !quantidade || quantidade <= 0) {
      return res.status(400).json({ erro: "Dados invÃ¡lidos para transferÃªncia" });
    }

    if (filialOrigem === filialDestino) {
      return res.status(400).json({ erro: "Filial de origem e destino devem ser diferentes" });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Verificar saldo da origem
      const estoqueOrigem = await tx.msestoque.findUnique({
        where: { codproduto_codfilial: { codproduto: Number(codproduto), codfilial: Number(filialOrigem) } }
      });

      if (!estoqueOrigem || estoqueOrigem.quantidade < quantidade) {
        throw new Error("Estoque insuficiente na filial de origem");
      }

      // 2. Abater FIFO/FEFO dos lotes
      let qtdRestante = Number(quantidade);
      const lotesComValidade = await tx.msestoque_lote.findMany({
        where: { codproduto: Number(codproduto), codfilial: Number(filialOrigem), quantidade: { gt: 0 }, validade: { not: null } },
        orderBy: { validade: 'asc' }
      });
      const lotesSemValidade = await tx.msestoque_lote.findMany({
        where: { codproduto: Number(codproduto), codfilial: Number(filialOrigem), quantidade: { gt: 0 }, validade: null }
      });
      const lotesDisponiveis = [...lotesComValidade, ...lotesSemValidade];

      for (const lote of lotesDisponiveis) {
        if (qtdRestante <= 0) break;
        const qtdAbater = Math.min(lote.quantidade, qtdRestante);
        
        // Retira da origem
        await tx.msestoque_lote.update({
          where: { id: lote.id },
          data: { quantidade: { decrement: qtdAbater } }
        });

        await tx.mssaida_lote.create({
          data: {
            codproduto: Number(codproduto),
            codfilial: Number(filialOrigem),
            lote: lote.lote,
            quantidade: qtdAbater,
            tipo_saida: "TRANSFERENCIA"
          }
        });

        // Adiciona no destino
        const loteExistenteDestino = await tx.msestoque_lote.findFirst({
          where: { codproduto: Number(codproduto), codfilial: Number(filialDestino), lote: lote.lote }
        });
        
        if (loteExistenteDestino) {
           await tx.msestoque_lote.update({
             where: { id: loteExistenteDestino.id },
             data: { quantidade: { increment: qtdAbater } }
           });
        } else {
           await tx.msestoque_lote.create({
             data: {
               codproduto: Number(codproduto),
               codfilial: Number(filialDestino),
               lote: lote.lote,
               validade: lote.validade,
               quantidade: qtdAbater
             }
           });
        }

        qtdRestante -= qtdAbater;
      }

      if (qtdRestante > 0) {
        await tx.mssaida_lote.create({
          data: {
            codproduto: Number(codproduto),
            codfilial: Number(filialOrigem),
            lote: "SEM_LOTE",
            quantidade: qtdRestante,
            tipo_saida: "TRANSFERENCIA"
          }
        });
        const loteExistenteDestino = await tx.msestoque_lote.findFirst({
          where: { codproduto: Number(codproduto), codfilial: Number(filialDestino), lote: "SEM_LOTE" }
        });
        if (loteExistenteDestino) {
           await tx.msestoque_lote.update({
             where: { id: loteExistenteDestino.id },
             data: { quantidade: { increment: qtdRestante } }
           });
        } else {
           await tx.msestoque_lote.create({
             data: { codproduto: Number(codproduto), codfilial: Number(filialDestino), lote: "SEM_LOTE", quantidade: qtdRestante }
           });
        }
      }

      // 3. Registrar Movimentos (msmov_estoque)
      await tx.msmov_estoque.create({
        data: {
          codproduto: Number(codproduto),
          codfilial: Number(filialOrigem),
          tipo: "SAIDA",
          origem: "TRANSFERENCIA",
          quantidade: Number(quantidade),
          origem_id: null
        }
      });

      await tx.msmov_estoque.create({
        data: {
          codproduto: Number(codproduto),
          codfilial: Number(filialDestino),
          tipo: "ENTRADA",
          origem: "TRANSFERENCIA",
          quantidade: Number(quantidade),
          origem_id: null
        }
      });

      // 4. Atualizar saldos globais (msestoque)
      await tx.msestoque.update({
        where: { codproduto_codfilial: { codproduto: Number(codproduto), codfilial: Number(filialOrigem) } },
        data: { quantidade: { decrement: Number(quantidade) }, atualizado_em: new Date() }
      });

      await tx.msestoque.upsert({
        where: { codproduto_codfilial: { codproduto: Number(codproduto), codfilial: Number(filialDestino) } },
        update: { quantidade: { increment: Number(quantidade) }, atualizado_em: new Date() },
        create: { codproduto: Number(codproduto), codfilial: Number(filialDestino), quantidade: Number(quantidade) }
      });

      return true;
    });

    res.json({ mensagem: "TransferÃªncia concluÃ­da com sucesso" });
  } catch (error) {
    console.error(error);
    res.status(400).json({ erro: error.message || "Erro ao realizar transferÃªncia" });
  }
}

export async function listarTodasValidades(req, res) {
  try {
    const { codfilial } = req.query;
    const where = { quantidade: { gt: 0 }, validade: { not: null } };
    if (codfilial && codfilial !== "undefined" && !isNaN(Number(codfilial))) {
      where.codfilial = Number(codfilial);
    }

    const lotes = await prisma.msestoque_lote.findMany({
      where,
      include: {
        msproduto: { select: { descricao: true, codproduto: true, controla_validade: true, codigo_barras: true } }
      },
      orderBy: { validade: 'asc' }
    });
    res.json(lotes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: 'Erro ao buscar lotes.' });
  }
}

export async function listarPendenciasRastreabilidade(req, res) {
  try {
    const { codfilial } = req.query;
    if (!codfilial || codfilial === "undefined" || isNaN(Number(codfilial))) {
      return res.status(400).json({ erro: 'A filial Ã© obrigatÃ³ria para rastreabilidade.' });
    }

    const produtosComValidade = await prisma.msproduto.findMany({
      where: { controla_validade: 'S' },
      select: { codproduto: true, descricao: true, codigo_barras: true }
    });
    
    const codigosProdutos = produtosComValidade.map(p => p.codproduto);

    const estoquesRaw = await prisma.msestoque.findMany({
      where: {
        codfilial: Number(codfilial),
        quantidade: { gt: 0 },
        codproduto: { in: codigosProdutos }
      }
    });

    const produtosMap = produtosComValidade.reduce((acc, p) => {
      acc[p.codproduto] = p;
      return acc;
    }, {});

    const estoques = estoquesRaw.map(e => ({
      ...e,
      msproduto: produtosMap[e.codproduto]
    }));

    const lotes = await prisma.msestoque_lote.groupBy({
      by: ['codproduto'],
      where: { codfilial: Number(codfilial), validade: { not: null } },
      _sum: { quantidade: true }
    });

    const lotesMap = lotes.reduce((acc, l) => {
      acc[l.codproduto] = l._sum.quantidade || 0;
      return acc;
    }, {});

    const pendencias = estoques.filter(e => {
      const qtdLotes = lotesMap[e.codproduto] || 0;
      return e.quantidade > qtdLotes;
    }).map(e => ({
      ...e,
      qtd_rastreada: lotesMap[e.codproduto] || 0,
      qtd_pendente: e.quantidade - (lotesMap[e.codproduto] || 0)
    }));

    res.json(pendencias);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: 'Erro ao buscar pendÃªncias.' });
  }
}

export async function atribuirValidadeManual(req, res) {
  try {
    const { codproduto, codfilial, lote, validade, quantidade } = req.body;
    if (!codproduto || !codfilial || !quantidade || !validade) return res.status(400).json({ erro: 'Dados incompletos.' });

    await prisma.$transaction(async (tx) => {
      // 1. Verificar pendÃªncia limite
      const estoque = await tx.msestoque.findFirst({
        where: { codproduto: Number(codproduto), codfilial: Number(codfilial) }
      });
      if (!estoque) throw new Error('Estoque nÃ£o encontrado.');
      
      const agregados = await tx.msestoque_lote.aggregate({
        where: { codproduto: Number(codproduto), codfilial: Number(codfilial), validade: { not: null } },
        _sum: { quantidade: true }
      });
      const pendente = estoque.quantidade - (agregados._sum.quantidade || 0);
      if (Number(quantidade) > pendente) throw new Error(`Quantidade mÃ¡xima permitida para atribuiÃ§Ã£o Ã© ${pendente}.`);

      // 2. Criar ou incrementar o lote
      const validadeDate = new Date(validade);
      const loteExistente = await tx.msestoque_lote.findFirst({
        where: { codproduto: Number(codproduto), codfilial: Number(codfilial), lote: lote || "MANUAL", validade: validadeDate }
      });

      if (loteExistente) {
        await tx.msestoque_lote.update({
          where: { id: loteExistente.id },
          data: { quantidade: { increment: Number(quantidade) } }
        });
      } else {
        await tx.msestoque_lote.create({
          data: {
            codproduto: Number(codproduto),
            codfilial: Number(codfilial),
            lote: lote || "MANUAL",
            validade: validadeDate,
            quantidade: Number(quantidade)
          }
        });
      }

      // Abater dos lotes genéricos (sem validade) para manter a soma correta
      const lotesGenericos = await tx.msestoque_lote.findMany({
        where: { codproduto: Number(codproduto), codfilial: Number(codfilial), validade: null, quantidade: { gt: 0 } }
      });
      let qtdParaAbater = Number(quantidade);
      for (const lg of lotesGenericos) {
        if (qtdParaAbater <= 0) break;
        const abater = Math.min(lg.quantidade, qtdParaAbater);
        await tx.msestoque_lote.update({
          where: { id: lg.id },
          data: { quantidade: { decrement: abater } }
        });
        qtdParaAbater -= abater;
      }

      // 3. Registrar auditoria (msmov_estoque)
      await tx.msmov_estoque.create({
        data: {
          codproduto: Number(codproduto),
          codfilial: Number(codfilial),
          tipo: 'AJUSTE',
          origem: 'ATRIBUICAO_LOTE',
          quantidade: Number(quantidade),
          created_by: req.user?.id || null
        }
      });
    });

    res.json({ mensagem: 'Validade atribuÃ­da com sucesso.' });
  } catch (error) {
    console.error(error);
    res.status(400).json({ erro: error.message || 'Erro ao atribuir validade.' });
  }
}

export async function descartarLote(req, res) {
  try {
    const { id_lote, quantidade, motivo, observacao } = req.body;
    if (!id_lote || !quantidade || !motivo) return res.status(400).json({ erro: 'Dados incompletos.' });

    await prisma.$transaction(async (tx) => {
      const lote = await tx.msestoque_lote.findUnique({ where: { id: Number(id_lote) } });
      if (!lote) throw new Error('Lote nÃ£o encontrado.');
      if (lote.quantidade < Number(quantidade)) throw new Error('Quantidade insuficiente no lote.');

      // 1. Reduzir do lote
      await tx.msestoque_lote.update({
        where: { id: lote.id },
        data: { quantidade: { decrement: Number(quantidade) } }
      });

      // 2. Reduzir do msestoque global
      await tx.msestoque.update({
        where: { codproduto_codfilial: { codproduto: lote.codproduto, codfilial: lote.codfilial } },
        data: { quantidade: { decrement: Number(quantidade) }, atualizado_em: new Date() }
      });

      // 3. Registrar msmov_estoque como DESCARTE
      await tx.msmov_estoque.create({
        data: {
          codproduto: lote.codproduto,
          codfilial: lote.codfilial,
          tipo: 'SAIDA',
          origem: 'DESCARTE',
          quantidade: Number(quantidade),
          created_by: req.user?.id || null
        }
      });
    });

    res.json({ mensagem: 'Lote descartado com sucesso.' });
  } catch (error) {
    console.error(error);
    res.status(400).json({ erro: error.message || 'Erro ao descartar lote.' });
  }
}







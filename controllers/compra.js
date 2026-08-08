import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Função auxiliar para gerar numero CMP-XXXXXX
const generateCompraCode = async () => {
  const lastCompra = await prisma.mscompra.findFirst({
    orderBy: { codcompra: 'desc' }
  });
  const nextId = lastCompra ? lastCompra.codcompra + 1 : 1;
  return `CMP-${nextId.toString().padStart(6, '0')}`;
};

export const getCompras = async (req, res) => {
  try {
    const compras = await prisma.mscompra.findMany({
      include: {
        msfornecedor: { select: { nome: true } },
        _count: { select: { mscompra_item: true } }
      },
      orderBy: { data_compra: 'desc' }
    });
    res.json(compras);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar compras." });
  }
};

export const createCompra = async (req, res) => {
  try {
    const { codfornecedor, numero_documento, observacao, itens, codfilial } = req.body;
    
    // Calcula total
    const valor_total = itens.reduce((acc, item) => acc + (item.quantidade * item.custo_unitario), 0);
    const codigo_compra = await generateCompraCode();
    const status = "FINALIZADA"; // Para simplificar o MVP, vamos iniciar já finalizando e atualizando estoque. Pode ser ABERTA no futuro.

    const result = await prisma.$transaction(async (tx) => {
      // 1. Cria Compra
      const compra = await tx.mscompra.create({
        data: {
          codigo_compra,
          codfornecedor,
          numero_documento,
          observacao,
          valor_total,
          status,
          codfilial: codfilial || 1, // Default filial 1
          mscompra_item: {
            create: itens.map(item => ({
              codproduto: item.codproduto,
              quantidade: item.quantidade,
              custo_unitario: item.custo_unitario,
              valor_total: item.quantidade * item.custo_unitario,
              lote: item.lote ? String(item.lote) : null,
              validade: item.validade ? new Date(item.validade) : null
            }))
          }
        }
      });

      // 2. Se finalizada, movimenta estoque
      if (status === "FINALIZADA") {
        for (const item of itens) {
          // Busca informações atuais do produto antes de alterar o estoque
          const [tabelaPreco, estoqueAtual] = await Promise.all([
            tx.mstabela_preco.findFirst({
              where: { codproduto: item.codproduto, ativo: 'S' }
            }),
            tx.msestoque.findUnique({
              where: {
                codproduto_codfilial: {
                  codproduto: item.codproduto,
                  codfilial: codfilial || 1
                }
              }
            })
          ]);

          // Cria movimento
          await tx.msmov_estoque.create({
            data: {
              codproduto: item.codproduto,
              codfilial: codfilial || 1,
              tipo: "ENTRADA",
              origem: "COMPRA",
              quantidade: item.quantidade,
              origem_id: compra.codcompra
            }
          });

          // Adiciona/Atualiza lote no estoque
          const loteValue = item.lote ? String(item.lote) : "PADRAO";
          const validadeValue = item.validade ? new Date(item.validade) : null;
          
          const loteExistente = await tx.msestoque_lote.findFirst({
            where: {
              codproduto: item.codproduto,
              codfilial: codfilial || 1,
              lote: loteValue
            }
          });

          if (loteExistente) {
            await tx.msestoque_lote.update({
              where: { id: loteExistente.id },
              data: { quantidade: { increment: item.quantidade } }
            });
          } else {
            await tx.msestoque_lote.create({
              data: {
                codproduto: item.codproduto,
                codfilial: codfilial || 1,
                lote: loteValue,
                validade: validadeValue,
                quantidade: item.quantidade
              }
            });
          }

          // Atualiza saldo
          await tx.msestoque.upsert({
            where: {
              codproduto_codfilial: {
                codproduto: item.codproduto,
                codfilial: codfilial || 1
              }
            },
            update: {
              quantidade: { increment: item.quantidade },
              atualizado_em: new Date()
            },
            create: {
              codproduto: item.codproduto,
              codfilial: codfilial || 1,
              quantidade: item.quantidade
            }
          });
          
          // Atualiza custo do produto seguindo a regra: Max(Media Ponderada, Ultima Entrada)
          const currentQuantity = estoqueAtual?.quantidade || 0;
          const currentCost = Number(tabelaPreco?.preco_custo || 0);
          
          let novoCusto = item.custo_unitario;
          if (currentQuantity > 0) {
            const totalEmEstoqueAtual = currentQuantity * currentCost;
            const totalNovaEntrada = item.quantidade * item.custo_unitario;
            const mediaPonderada = (totalEmEstoqueAtual + totalNovaEntrada) / (currentQuantity + item.quantidade);
            
            novoCusto = Math.max(mediaPonderada, item.custo_unitario);
          }

          if (tabelaPreco) {
            await tx.mstabela_preco.update({
              where: { codtabela: tabelaPreco.codtabela },
              data: { preco_custo: Number(novoCusto.toFixed(2)) }
            });
          }
        }
      }

      return compra;
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao criar compra.", details: error.message });
  }
};

export const getCompraById = async (req, res) => {
  try {
    const { uuid } = req.params;
    const compra = await prisma.mscompra.findFirst({
      where: { uuid },
      include: {
        msfornecedor: true,
        mscompra_item: {
          include: { msproduto: { select: { descricao: true } } }
        }
      }
    });
    if(!compra) return res.status(404).json({ error: "Não encontrado" });
    res.json(compra);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar compra." });
  }
};

export const updateCompraStatus = async (req, res) => {
  try {
    const { uuid } = req.params;
    const { status, motivo_cancelamento } = req.body;

    if (status !== "CANCELADA") {
      return res.status(400).json({ error: "Apenas o status 'CANCELADA' é suportado para atualização no momento." });
    }

    if (!motivo_cancelamento || motivo_cancelamento.trim().length < 15) {
      return res.status(400).json({ error: "O motivo do cancelamento deve ter pelo menos 15 caracteres." });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Busca a compra
      const compra = await tx.mscompra.findFirst({
        where: { uuid },
        include: { mscompra_item: true }
      });

      if (!compra) {
        throw new Error("Compra não encontrada.");
      }

      if (compra.status === "CANCELADA") {
        throw new Error("Esta compra já está cancelada.");
      }

      // 2. Se a compra estava finalizada/concluída, estorna o estoque
      if (compra.status === "FINALIZADA" || compra.status === "CONCLUIDA") {
        for (const item of compra.mscompra_item) {
          // Cria movimento de estorno (saída)
          await tx.msmov_estoque.create({
            data: {
              codproduto: item.codproduto,
              codfilial: compra.codfilial || 1,
              tipo: "SAIDA",
              origem: "CANCELAMENTO_COMPRA",
              quantidade: item.quantidade,
              origem_id: compra.codcompra
            }
          });

          // Estorna o lote
          const loteValue = item.lote ? String(item.lote) : "PADRAO";
          const loteExistente = await tx.msestoque_lote.findFirst({
            where: {
              codproduto: item.codproduto,
              codfilial: compra.codfilial || 1,
              lote: loteValue
            }
          });

          if (loteExistente) {
            await tx.msestoque_lote.update({
              where: { id: loteExistente.id },
              data: { quantidade: { decrement: item.quantidade } }
            });
          }

          // Diminui o estoque
          await tx.msestoque.upsert({
            where: {
              codproduto_codfilial: {
                codproduto: item.codproduto,
                codfilial: compra.codfilial || 1
              }
            },
            update: {
              quantidade: { decrement: item.quantidade },
              atualizado_em: new Date()
            },
            create: {
              codproduto: item.codproduto,
              codfilial: compra.codfilial || 1,
              quantidade: -item.quantidade
            }
          });
          // Nota: O custo do produto (msproduto.custo) não é revertido para o valor anterior (conforme MVP).
        }
      }

      const novaObservacao = (compra.observacao ? compra.observacao + "\n\n" : "") + "Cancelamento: " + motivo_cancelamento;

      // 3. Atualiza o status
      const compraAtualizada = await tx.mscompra.update({
        where: { codcompra: compra.codcompra },
        data: { 
          status: "CANCELADA",
          observacao: novaObservacao
        }
      });

      return compraAtualizada;
    });

    res.json({ message: "Compra cancelada com sucesso", compra: result });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message || "Erro ao atualizar status da compra." });
  }
};

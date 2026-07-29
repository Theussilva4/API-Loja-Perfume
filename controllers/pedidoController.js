import prisma from "../prismaClient.js"

// Função auxiliar para gerar codigo da venda
const generateVendaCode = async () => {
  const lastVenda = await prisma.mspedido.findFirst({
    orderBy: { numpedido: 'desc' }
  });
  const nextId = lastVenda ? lastVenda.numpedido + 1 : 1;
  return `VEN-${nextId.toString().padStart(6, '0')}`;
};

export async function listarPedidos(req, res) {
  try {
    const pedidos = await prisma.mspedido.findMany({
      orderBy: { numpedido: "desc" },
      include: {
        mscliente: { select: { nome: true } },
        mspedido_item: true,
        msusuario_mspedido_codusur_cancelouTomsusuario: { select: { nome: true } }
      }
    });
    res.json(pedidos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao listar pedidos" });
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
      observacoes,
      status, // EM_DIGITACAO ou FINALIZADO
      itens
    } = req.body;

    if (!codcliente || !itens || itens.length === 0) {
      return res.status(400).json({ erro: "Dados inválidos" });
    }

    const subtotal = itens.reduce((acc, item) => acc + (item.quantidade * item.preco_unitario), 0);
    const desc = desconto ? Number(desconto) : 0;
    const valor_total = subtotal - desc;
    
    const codigo_venda = await generateVendaCode();
    const finalStatus = status || "EM_ABERTO";

    const result = await prisma.$transaction(async (tx) => {
      const pedido = await tx.mspedido.create({
        data: {
          codigo_venda,
          codcliente: Number(codcliente),
          codusur_criou: codusur_criou ? Number(codusur_criou) : null,
          codvendedor: codvendedor ? Number(codvendedor) : null,
          codfilial: codfilial ? Number(codfilial) : 1,
          data_pedido: new Date(),
          subtotal,
          desconto: desc,
          valor_total,
          status: finalStatus,
          observacoes: observacoes || null,
          CODPLPAG: formaPagamento ? Number(formaPagamento) : null,
          parcelas: parcelas ? Number(parcelas) : 1,
          mspedido_item: {
            create: itens.map(item => ({
              codproduto: Number(item.codproduto),
              quantidade: Number(item.quantidade),
              preco_unitario: Number(item.preco_unitario),
              valor_total: item.quantidade * item.preco_unitario
            }))
          }
        },
        include: {
          mspedido_item: true
        }
      });

      // Baixa de estoque se a venda for concluída agora
      if (finalStatus === "FINALIZADO") {
        for (const item of itens) {
          await tx.msmov_estoque.create({
            data: {
              codproduto: Number(item.codproduto),
              codfilial: codfilial ? Number(codfilial) : 1,
              tipo: "SAIDA",
              origem: "VENDA",
              quantidade: Number(item.quantidade),
              origem_id: pedido.numpedido
            }
          });

          await tx.msestoque.upsert({
            where: {
              codproduto_codfilial: {
                codproduto: Number(item.codproduto),
                codfilial: codfilial ? Number(codfilial) : 1
              }
            },
            update: {
              quantidade: { decrement: Number(item.quantidade) },
              atualizado_em: new Date()
            },
            create: {
              codproduto: Number(item.codproduto),
              codfilial: codfilial ? Number(codfilial) : 1,
              quantidade: -Number(item.quantidade)
            }
          });
        }
      }

      return pedido;
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao criar pedido" });
  }
}

// Para o MVP: as operações de Alterar Status ou Atualizar Pedido Completo (para finalizá-lo)
// O alterarStatus precisa processar o estoque caso mude de EM_DIGITACAO para FINALIZADO
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
        // Se o pedido estava FINALIZADO, precisamos devolver o estoque
        if (pedidoAnterior.status === "FINALIZADO") {
          for (const item of pedidoAnterior.mspedido_item) {
            const filial = pedidoAnterior.codfilial || 1;
            // Cria movimento de devolução de estoque
            await tx.msmov_estoque.create({
              data: {
                codproduto: item.codproduto,
                codfilial: filial,
                tipo: "ENTRADA",
                origem: "CANCELAMENTO_VENDA",
                quantidade: item.quantidade,
                origem_id: pedidoAnterior.numpedido
              }
            });

            // Incrementa (devolve) o estoque
            await tx.msestoque.upsert({
              where: {
                codproduto_codfilial: {
                  codproduto: item.codproduto,
                  codfilial: filial
                }
              },
              update: {
                quantidade: { increment: item.quantidade },
                atualizado_em: new Date()
              },
              create: {
                codproduto: item.codproduto,
                codfilial: filial,
                quantidade: item.quantidade
              }
            });
          }
        }

        // Atualiza o pedido para CANCELADO
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

    // Só permite baixar estoque se estiver mudando para FINALIZADO vindo de outro status
    if (status === "FINALIZADO" && pedidoAnterior.status !== "FINALIZADO") {
      await prisma.$transaction(async (tx) => {
        // Atualiza status
        await tx.mspedido.update({
          where: { numpedido: Number(id) },
          data: { status }
        });

        // Baixa estoque
        for (const item of pedidoAnterior.mspedido_item) {
          const filial = pedidoAnterior.codfilial || 1;
          await tx.msmov_estoque.create({
            data: {
              codproduto: item.codproduto,
              codfilial: filial,
              tipo: "SAIDA",
              origem: "VENDA",
              quantidade: item.quantidade,
              origem_id: pedidoAnterior.numpedido
            }
          });

          await tx.msestoque.upsert({
            where: {
              codproduto_codfilial: {
                codproduto: item.codproduto,
                codfilial: filial
              }
            },
            update: {
              quantidade: { decrement: item.quantidade },
              atualizado_em: new Date()
            },
            create: {
              codproduto: item.codproduto,
              codfilial: filial,
              quantidade: -item.quantidade
            }
          });
        }
      });
      return res.json({ mensagem: "Status alterado e estoque baixado." });
    }

    // Apenas atualização simples de status
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
      observacoes,
      itens
    } = req.body;

    const pedidoAnterior = await prisma.mspedido.findUnique({
      where: { numpedido: Number(id) }
    });

    if(pedidoAnterior.status === "FINALIZADO") {
      return res.status(400).json({ error: "Não é possível alterar um pedido finalizado" });
    }

    const subtotal = itens.reduce((acc, item) => acc + (item.quantidade * item.preco_unitario), 0);
    const desc = desconto ? Number(desconto) : 0;
    const valor_total = subtotal - desc;

    // Transação para deletar itens, recriar, e atualizar dados do pedido
    const pedido = await prisma.$transaction(async (tx) => {
      await tx.mspedido_item.deleteMany({
        where: { numpedido: Number(id) }
      });

      const updated = await tx.mspedido.update({
        where: { numpedido: Number(id) },
        data: {
          codcliente: Number(codcliente),
          codvendedor: codvendedor ? Number(codvendedor) : null,
          codfilial: codfilial ? Number(codfilial) : null,
          status: status || "EM_ABERTO",
          subtotal,
          desconto: desc,
          valor_total,
          observacoes: observacoes || null,
          CODPLPAG: formaPagamento ? Number(formaPagamento) : null,
          parcelas: parcelas ? Number(parcelas) : 1,
          mspedido_item: {
            create: itens.map(item => ({
              codproduto: Number(item.codproduto),
              quantidade: Number(item.quantidade),
              preco_unitario: Number(item.preco_unitario),
              valor_total: item.quantidade * item.preco_unitario
            }))
          }
        },
        include: {
          mspedido_item: true
        }
      });
      
      // Baixa o estoque se o pedido for alterado de EM_ABERTO para FINALIZADO
      if (pedidoAnterior.status !== "FINALIZADO" && (status === "FINALIZADO" || status === "FINALIZADA")) {
        for (const item of itens) {
          const filial = codfilial ? Number(codfilial) : 1;
          await tx.msmov_estoque.create({
            data: {
              codproduto: Number(item.codproduto),
              codfilial: filial,
              tipo: "SAIDA",
              origem: "VENDA",
              quantidade: Number(item.quantidade),
              origem_id: updated.numpedido
            }
          });

          await tx.msestoque.upsert({
            where: {
              codproduto_codfilial: {
                codproduto: Number(item.codproduto),
                codfilial: filial
              }
            },
            update: {
              quantidade: { decrement: Number(item.quantidade) },
              atualizado_em: new Date()
            },
            create: {
              codproduto: Number(item.codproduto),
              codfilial: filial,
              quantidade: -Number(item.quantidade)
            }
          });
        }
      }

      return updated;
    });

    res.json(pedido);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao atualizar pedido" });
  }
}

export async function removerItem(req, res) {
  res.status(400).json({ error: "Deprecated na API nova. Atualize o pedido completo." });
}

export async function adicionarItem(req, res) {
  res.status(400).json({ error: "Deprecated na API nova. Atualize o pedido completo." });
}
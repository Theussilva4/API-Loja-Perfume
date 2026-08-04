import prisma from "../prismaClient.js"
import { logAuditoria } from "../services/auditService.js"

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
    return res.status(400).json({ erro: "O código do estoque é obrigatório" });
  }
  // Remover campos que não devem ser atualizados
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
    res.status(500).json({ erro: "Erro ao buscar saídas" });
  }
}

export async function registrarSaidaManual(req, res) {
  try {
    const { codproduto, codfilial, quantidade, origem } = req.body;

    if (!codproduto || !quantidade || quantidade <= 0) {
      return res.status(400).json({ erro: "Produto e quantidade válidos são obrigatórios" });
    }

    const filialId = codfilial ? Number(codfilial) : 1;

    const result = await prisma.$transaction(async (tx) => {
      const novaMov = await tx.msmov_estoque.create({
        data: {
          codproduto: Number(codproduto),
          codfilial: filialId,
          tipo: "SAIDA",
          origem: origem || "AJUSTE",
          quantidade: Number(quantidade)
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
    res.status(500).json({ erro: "Erro ao registrar saída" });
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
      return res.status(404).json({ erro: "Movimentação não encontrada" });
    }

    if (mov.tipo !== "SAIDA") {
      return res.status(400).json({ erro: "Esta movimentação não é uma saída" });
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
    console.error("Erro ao cancelar saída:", error);
    res.status(500).json({ erro: "Erro ao cancelar saída" });
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

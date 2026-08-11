import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const faturamentoProduto = async (req, res) => {
  try {
    const { dataInicial, dataFinal, vendedorId, clienteId, categoriaId, marcaId, produtoId } = req.query;

    const agora = new Date();
    const brtString = agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    const dataBR = new Date(brtString);
    
    const inicioMes = new Date(Date.UTC(dataBR.getFullYear(), dataBR.getMonth(), 1, 3, 0, 0));

    let periodoInicio = inicioMes;
    let dataPedidoCondition = { gte: periodoInicio };

    if (dataInicial) {
      const parts = dataInicial.split('-');
      periodoInicio = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 3, 0, 0));
      dataPedidoCondition.gte = periodoInicio;
    }

    if (dataFinal) {
      const parts = dataFinal.split('-');
      const nextDay = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 3, 0, 0));
      nextDay.setDate(nextDay.getDate() + 1);
      dataPedidoCondition.lt = nextDay;
    }

    const whereCondition = {
      data_pedido: dataPedidoCondition,
      status: { not: "CANCELADO" },
    };

    if (vendedorId) whereCondition.codvendedor = Number(vendedorId);
    if (clienteId) whereCondition.codcliente = Number(clienteId);

    const produtoCondition = {};
    if (categoriaId) produtoCondition.codcategoria = Number(categoriaId);
    if (marcaId) produtoCondition.codmarca = Number(marcaId);
    if (produtoId) produtoCondition.codproduto = Number(produtoId);

    // Buscar pedidos no período
    const pedidos = await prisma.mspedido.findMany({
      where: whereCondition,
      include: {
        mspedido_item: {
          where: Object.keys(produtoCondition).length > 0 ? { msproduto: produtoCondition } : undefined,
          include: {
            msproduto: {
              include: { mstabela_preco: { where: { ativo: "S" } } }
            }
          }
        }
      }
    });

    const produtoMap = {};
    let faturamentoGeral = 0;

    for (const ped of pedidos) {
      const subtotalPedido = Number(ped.subtotal || 0);
      const descontoPedido = Number(ped.desconto || 0);
      
      const ratioDesconto = subtotalPedido > 0 ? (subtotalPedido - descontoPedido) / subtotalPedido : 1;

      for (const item of ped.mspedido_item) {
        const cod = item.codproduto;
        if (!cod) continue;
        
        if (!produtoMap[cod]) {
          produtoMap[cod] = {
            codigo: cod,
            descricao: item.msproduto?.descricao || "Desconhecido",
            clientes: new Set(),
            qtFaturada: 0,
            vlFaturado: 0,
            custoTotal: 0
          };
        }

        const qtd = Number(item.quantidade || 0);
        const valorOriginalDoItem = Number(item.valor_total || 0);
        let vlFaturadoReal = valorOriginalDoItem;
        
        if (descontoPedido > 0) {
            vlFaturadoReal = valorOriginalDoItem * ratioDesconto;
        }

        faturamentoGeral += vlFaturadoReal;

        const pCusto = Number(item.msproduto?.mstabela_preco?.[0]?.preco_custo || 0);

        produtoMap[cod].clientes.add(ped.codcliente);
        produtoMap[cod].qtFaturada += qtd;
        produtoMap[cod].vlFaturado += vlFaturadoReal;
        produtoMap[cod].custoTotal += (pCusto * qtd);
      }
    }

    // Formatar array final
    const resultado = Object.values(produtoMap).map(p => {
      const pctPartic = faturamentoGeral > 0 ? (p.vlFaturado / faturamentoGeral) * 100 : 0;
      const precoMedio = p.qtFaturada > 0 ? (p.vlFaturado / p.qtFaturada) : 0;
      const lucro = p.vlFaturado - p.custoTotal;
      const pctLucro = p.vlFaturado > 0 ? (lucro / p.vlFaturado) * 100 : 0;

      return {
        codigo: p.codigo,
        descricao: p.descricao,
        qtClientes: p.clientes.size,
        qtFaturada: p.qtFaturada,
        vlFaturado: p.vlFaturado,
        pctPartic,
        precoMedio,
        pctLucro,
        lucroValor: lucro
      };
    });

    // Ordenar pelo Valor Faturado descrescente
    resultado.sort((a, b) => b.vlFaturado - a.vlFaturado);

    res.json({
      resumo: { faturamentoGeral },
      produtos: resultado
    });
  } catch (error) {
    console.error("Erro no relatorio apuracao faturamento:", error);
    res.status(500).json({ error: "Erro ao gerar relatório." });
  }
};

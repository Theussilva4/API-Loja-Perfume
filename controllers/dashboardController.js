import { PrismaClient, Prisma } from "@prisma/client";
const prisma = new PrismaClient();

export const getDashboardMetrics = async (req, res) => {
  try {
    const { dataInicial, dataFinal, codfilial } = req.query;

    const agora = new Date();
    const brtString = agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    const dataBR = new Date(brtString);
    
    // Datas base (Meia-noite de hoje no Brasil = 03:00 UTC)
    const hoje = new Date(Date.UTC(dataBR.getFullYear(), dataBR.getMonth(), dataBR.getDate(), 3, 0, 0));
    const inicioMes = new Date(Date.UTC(dataBR.getFullYear(), dataBR.getMonth(), 1, 3, 0, 0));
    const inicioAno = new Date(Date.UTC(dataBR.getFullYear(), 0, 1, 3, 0, 0));

    let periodoInicio = inicioMes;
    let dataPedidoCondition = { gte: periodoInicio };
    let pedidoConditionBase = { status: { not: "CANCELADO" } };
    if (codfilial) {
      pedidoConditionBase.codfilial = Number(codfilial);
    }

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

    // Fim do dia de hoje para queries de "hoje"
    let fimHoje = new Date(hoje);
    fimHoje.setDate(fimHoje.getDate() + 1);

    // ==========================================
    // 1. FATURAMENTO (HOJE, MÃS, ANO) e PEDIDOS
    // ==========================================

    const pedidosHoje = await prisma.mspedido.findMany({
      where: { data_pedido: { gte: hoje, lt: fimHoje }, ...pedidoConditionBase },
      include: {
        mspedido_item: {
          include: {
            msproduto: {
              include: { mstabela_preco: { where: { ativo: "S" } } }
            }
          }
        }
      }
    });

    const pedidosMes = await prisma.mspedido.aggregate({
      where: { data_pedido: { gte: inicioMes }, ...pedidoConditionBase },
      _sum: { valor_total: true }
    });

    const pedidosAno = await prisma.mspedido.aggregate({
      where: { data_pedido: { gte: inicioAno }, ...pedidoConditionBase },
      _sum: { valor_total: true }
    });

    let faturamentoHoje = 0;
    let lucroBrutoHoje = 0;
    let qtdKitsHoje = 0;
    let pedidosEmAbertoHoje = 0;
    let pedidosFinalizadosHoje = 0;

    for (const ped of pedidosHoje) {
      faturamentoHoje += Number(ped.valor_total || 0);
      
      if (ped.status === "FINALIZADO" || ped.status === "ENTREGUE") {
        pedidosFinalizadosHoje++;
      } else {
        pedidosEmAbertoHoje++;
      }

      let custoTotalPedido = 0;
      for (const item of ped.mspedido_item) {
        const pCusto = Number(item.msproduto?.mstabela_preco?.[0]?.preco_custo || 0);
        const qtd = Number(item.quantidade || 0);
        custoTotalPedido += (pCusto * qtd);
      }
      const receitaProdutos = Number(ped.subtotal || 0) - Number(ped.desconto || 0);
      lucroBrutoHoje += (receitaProdutos - custoTotalPedido);
    }

    const ticketMedio = pedidosHoje.length > 0 ? (faturamentoHoje / pedidosHoje.length) : 0;

    // ==========================================
    // CLIENTES NOVOS E ATIVOS
    const clientesBase = await prisma.mscliente.count({ where: { ativo: "S" } });
    const clientesNovosMes = await prisma.mscliente.count({
      where: { ativo: "S", data_cadastro: { gte: inicioMes } }
    });

    // 2. TOP CLIENTES (PerÃ­odo)
    // ==========================================
    const topClientes = await prisma.mspedido.groupBy({
      by: ['codcliente'],
      where: {
        data_pedido: dataPedidoCondition,
        ...pedidoConditionBase
      },
      _sum: { valor_total: true },
      orderBy: { _sum: { valor_total: 'desc' } },
      take: 5
    });

    const clientesIds = topClientes.map(t => t.codcliente).filter(id => id !== null);
    const clientesNomes = await prisma.mscliente.findMany({
      where: { codcliente: { in: clientesIds } },
      select: { codcliente: true, nome: true }
    });

    const topClientesFormatado = topClientes.map(t => {
      const cli = clientesNomes.find(c => c.codcliente === t.codcliente);
      return {
        nome: cli ? cli.nome : "Cliente nÃ£o identificado",
        total: Number(t._sum.valor_total || 0)
      };
    });

    // ==========================================
    // 3. PRODUTOS MAIS VENDIDOS (PerÃ­odo)
    // ==========================================
    const maisVendidos = await prisma.mspedido_item.groupBy({
      by: ['codproduto'],
      where: { mspedido: { data_pedido: dataPedidoCondition, ...pedidoConditionBase } },
      _sum: { quantidade: true },
      orderBy: { _sum: { quantidade: 'desc' } },
      take: 5,
    });
    
    const produtosDetalhes = await prisma.msproduto.findMany({
      where: { codproduto: { in: maisVendidos.map(i => i.codproduto) } },
      select: { codproduto: true, descricao: true }
    });

    const maisVendidosFormatado = maisVendidos.map(item => {
      const prod = produtosDetalhes.find(p => p.codproduto === item.codproduto);
      return {
        descricao: prod?.descricao || "Desconhecido",
        quantidade: item._sum.quantidade
      };
    });

    // ==========================================
    // 4. GRÃFICO DE VENDAS (Ãltimos 15 dias)
    // ==========================================
    const quinzeDiasAtras = new Date(hoje);
    quinzeDiasAtras.setDate(quinzeDiasAtras.getDate() - 14);

    const vendasGrafico = await prisma.mspedido.findMany({
      where: { data_pedido: { gte: quinzeDiasAtras }, ...pedidoConditionBase },
      select: { data_pedido: true, valor_total: true }
    });

    const mapaGrafico = {};
    for (let i = 14; i >= 0; i--) {
      const d = new Date(hoje);
      d.setDate(d.getDate() - i);
      const k = d.toISOString().split('T')[0];
      mapaGrafico[k] = 0;
    }

    vendasGrafico.forEach(v => {
      const vDate = new Date(v.data_pedido);
      // Ajuste fuso do brasil para bater o dia
      vDate.setHours(vDate.getHours() - 3);
      const k = vDate.toISOString().split('T')[0];
      if (mapaGrafico[k] !== undefined) {
        mapaGrafico[k] += Number(v.valor_total || 0);
      }
    });

    const graficoFinal = Object.keys(mapaGrafico).map(data => ({
      data,
      total: mapaGrafico[data]
    }));

    // ==========================================
    // 5. PRODUTOS SEM GIRO (30, 60, 90 dias)
    // ==========================================
    // Para simplificar no Prisma sem QueryRaw complexas com JOIN, 
    // buscamos a data da ultima venda de cada produto que tem estoque
    const filialQuery = codfilial ? Prisma.sql`AND e.codfilial = ${Number(codfilial)}` : Prisma.empty;
    const filialQueryPed = codfilial ? Prisma.sql`AND ped.codfilial = ${Number(codfilial)}` : Prisma.empty;

    const estoqueDisponivel = await prisma.$queryRaw`
      SELECT p.codproduto, p.descricao, p.estoque_minimo, COALESCE(SUM(e.quantidade), 0) as saldo
      FROM msproduto p
      LEFT JOIN msestoque e ON p.codproduto = e.codproduto ${filialQuery}
      WHERE p.ativo = 'S'
      GROUP BY p.codproduto
      HAVING saldo > 0
    `;

    // Busca a ultima venda de produtos com estoque
    const ultimasVendasProd = await prisma.mspedido_item.groupBy({
      by: ['codproduto'],
      _max: { 'mspedido': { data_pedido: true } } // Isso não funciona direto no prisma groupBy se nao for aggregate.
    }).catch(() => []); 
    
    const semGiroList = await prisma.$queryRaw`
      SELECT p.codproduto, p.descricao, MAX(ped.data_pedido) as ultima_venda, COALESCE(SUM(e.quantidade), 0) as saldo
      FROM msproduto p
      LEFT JOIN msestoque e ON p.codproduto = e.codproduto ${filialQuery}
      LEFT JOIN mspedido_item pi ON pi.codproduto = p.codproduto
      LEFT JOIN mspedido ped ON ped.numpedido = pi.numpedido AND ped.status != 'CANCELADO' ${filialQueryPed}
      WHERE p.ativo = 'S'
      GROUP BY p.codproduto
      HAVING saldo > 0
    `;

    const produtosSemGiro = {
      "30d": [],
      "60d": [],
      "90d": []
    };

    const trintaDiasAtras = new Date(hoje); trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
    const sessentaDiasAtras = new Date(hoje); sessentaDiasAtras.setDate(sessentaDiasAtras.getDate() - 60);
    const noventaDiasAtras = new Date(hoje); noventaDiasAtras.setDate(noventaDiasAtras.getDate() - 90);

    for (const p of semGiroList) {
      // Se nunca vendeu, consideramos a data mais antiga possÃ­vel
      const ultimaVenda = p.ultima_venda ? new Date(p.ultima_venda) : new Date(0);
      
      const item = { descricao: p.descricao, saldo: Number(p.saldo), ultima_venda: p.ultima_venda };
      if (ultimaVenda < noventaDiasAtras) {
        produtosSemGiro["90d"].push(item);
      } else if (ultimaVenda < sessentaDiasAtras) {
        produtosSemGiro["60d"].push(item);
      } else if (ultimaVenda < trintaDiasAtras) {
        produtosSemGiro["30d"].push(item);
      }
    }

    // ==========================================
    // 6. ESTOQUE BAIXO
    // ==========================================
    const estoqueBaixoList = await prisma.$queryRaw`
      SELECT p.codproduto, p.descricao, p.estoque_minimo, COALESCE(SUM(e.quantidade), 0) as saldo
      FROM msproduto p
      LEFT JOIN msestoque e ON p.codproduto = e.codproduto ${filialQuery}
      WHERE p.ativo = 'S'
      GROUP BY p.codproduto
      HAVING saldo <= p.estoque_minimo
      LIMIT 10
    `;

    // ==========================================
    // 7. ÃLTIMOS PEDIDOS
    // ==========================================
    const ultimosPedidos = await prisma.mspedido.findMany({
      take: 5,
      orderBy: { data_pedido: "desc" },
      where: { ...pedidoConditionBase },
      include: { mscliente: { select: { nome: true } } },
    });

    // ==========================================
    // 8. VALIDADES (FEFO) E PENDÃNCIAS
    // ==========================================
    const filialCondition = codfilial ? { codfilial: Number(codfilial) } : {};
    
    const lotesValidades = await prisma.msestoque_lote.findMany({
      where: { 
        quantidade: { gt: 0 }, 
        lote: { not: 'PADRAO' },
        ...filialCondition
      }
    });

    const hojeValidade = new Date();
    const em30Dias = new Date(); em30Dias.setDate(em30Dias.getDate() + 30);
    const em90Dias = new Date(); em90Dias.setDate(em90Dias.getDate() + 90);

    let valVencidos = 0;
    let valVence30 = 0;
    let valVence90 = 0;

    lotesValidades.forEach(lote => {
      const v = new Date(lote.validade);
      if (v < hojeValidade) valVencidos++;
      else if (v <= em30Dias) valVence30++;
      else if (v <= em90Dias) valVence90++;
    });

    const produtosRastreados = codfilial ? await prisma.$queryRaw`
      SELECT e.codproduto, SUM(e.quantidade) as total_estoque
      FROM msestoque e
      JOIN msproduto p ON e.codproduto = p.codproduto
      WHERE p.controla_validade = 'S' AND e.quantidade > 0 AND e.codfilial = ${Number(codfilial)}
      GROUP BY e.codproduto
    ` : await prisma.$queryRaw`
      SELECT e.codproduto, SUM(e.quantidade) as total_estoque
      FROM msestoque e
      JOIN msproduto p ON e.codproduto = p.codproduto
      WHERE p.controla_validade = 'S' AND e.quantidade > 0
      GROUP BY e.codproduto
    `;

    const lotesMap = await prisma.msestoque_lote.groupBy({
      by: ['codproduto'],
      where: { 
        lote: { not: 'PADRAO' },
        ...filialCondition
      },
      _sum: { quantidade: true }
    });
    const qtdLotesMap = lotesMap.reduce((acc, l) => {
      acc[l.codproduto] = l._sum.quantidade || 0;
      return acc;
    }, {});

    let pendenciasRastreabilidade = 0;
    for (const prod of produtosRastreados) {
      const emEstoque = Number(prod.total_estoque);
      const rastreado = qtdLotesMap[prod.codproduto] || 0;
      if (emEstoque > rastreado) {
        pendenciasRastreabilidade++;
      }
    }

    // Enviar resposta
    
    // ==========================================
    // 9. VENDAS SEMANA ATUAL VS SEMANA PASSADA
    // ==========================================
    const diaSemanaHoje = dataBR.getDay(); // 0 = Domingo, 1 = Segunda
    const inicioSemanaAtual = new Date(hoje);
    inicioSemanaAtual.setDate(inicioSemanaAtual.getDate() - diaSemanaHoje);

    const inicioSemanaPassada = new Date(inicioSemanaAtual);
    inicioSemanaPassada.setDate(inicioSemanaPassada.getDate() - 7);

    const fimSemanaPassada = new Date(inicioSemanaAtual);

    const pedidosSemanaAtual = await prisma.mspedido.findMany({
      where: { data_pedido: { gte: inicioSemanaAtual, lt: fimHoje }, ...pedidoConditionBase }
    });

    const pedidosSemanaPassada = await prisma.mspedido.findMany({
      where: { data_pedido: { gte: inicioSemanaPassada, lt: fimSemanaPassada }, ...pedidoConditionBase }
    });

    const mapaDias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const vendasSemanaAtualPassada = mapaDias.map((dia, index) => {
      const dataAtualIndex = new Date(inicioSemanaAtual);
      dataAtualIndex.setDate(dataAtualIndex.getDate() + index);
      const dataAtualFimIndex = new Date(dataAtualIndex);
      dataAtualFimIndex.setDate(dataAtualFimIndex.getDate() + 1);

      const vendasAtualDia = pedidosSemanaAtual.filter(p => p.data_pedido >= dataAtualIndex && p.data_pedido < dataAtualFimIndex).reduce((acc, curr) => acc + Number(curr.valor_total), 0);

      const dataPassadaIndex = new Date(inicioSemanaPassada);
      dataPassadaIndex.setDate(dataPassadaIndex.getDate() + index);
      const dataPassadaFimIndex = new Date(dataPassadaIndex);
      dataPassadaFimIndex.setDate(dataPassadaFimIndex.getDate() + 1);

      const vendasPassadaDia = pedidosSemanaPassada.filter(p => p.data_pedido >= dataPassadaIndex && p.data_pedido < dataPassadaFimIndex).reduce((acc, curr) => acc + Number(curr.valor_total), 0);

      return { dia, atual: vendasAtualDia, passada: vendasPassadaDia };
    });

    res.json({
      vendasSemanaAtualPassada,
      faturamento: {
        hoje: faturamentoHoje,
        mes: Number(pedidosMes._sum.valor_total || 0),
        ano: Number(pedidosAno._sum.valor_total || 0)
      },
      pedidos: {
        hoje: pedidosHoje.length,
        emAberto: pedidosEmAbertoHoje,
        finalizados: pedidosFinalizadosHoje
      },
      ticketMedio,
      lucroBrutoHoje,
      clientesBase,
      clientesNovosMes,
      kitsVendidosHoje: qtdKitsHoje,
      topClientes: topClientesFormatado,
      produtosSemGiro,
      graficoVendas: graficoFinal,
      maisVendidos: maisVendidosFormatado,
      ultimosPedidos: ultimosPedidos.map(u => ({
        numpedido: u.numpedido,
        cliente: u.mscliente?.nome || "BalcÃ£o",
        valor_total: u.valor_total,
        status: u.status,
        data_pedido: u.data_pedido
      })),
      estoqueBaixo: estoqueBaixoList.map(e => ({
        descricao: e.descricao,
        saldo: Number(e.saldo),
        minimo: e.estoque_minimo
      })),
      fefo: {
        vencidos: valVencidos,
        vence30: valVence30,
        vence90: valVence90,
        pendencias: pendenciasRastreabilidade
      }
    });

  } catch (error) {
    console.error("Erro no dashboard:", error);
    res.status(500).json({ error: "Erro ao buscar mÃ©tricas do dashboard." });
  }
};






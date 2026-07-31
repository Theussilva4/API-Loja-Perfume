import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getDashboardMetrics = async (req, res) => {
  try {
    const { dataInicial, dataFinal } = req.query;

    const agora = new Date();
    // Obtém a data considerando o fuso de Brasília
    const brtString = agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    const dataBR = new Date(brtString);
    
    // Meia-noite de hoje no Brasil (equivale a 03:00 UTC)
    const hoje = new Date(Date.UTC(dataBR.getFullYear(), dataBR.getMonth(), dataBR.getDate(), 3, 0, 0));
    const defaultPrimeiroDiaMes = new Date(Date.UTC(dataBR.getFullYear(), dataBR.getMonth(), 1, 3, 0, 0));

    let periodoInicio = defaultPrimeiroDiaMes;
    let dataPedidoConditionMes = { gte: periodoInicio };

    if (dataInicial) {
      const parts = dataInicial.split('-');
      periodoInicio = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 3, 0, 0));
      dataPedidoConditionMes.gte = periodoInicio;
    }

    if (dataFinal) {
      const parts = dataFinal.split('-');
      const nextDay = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 3, 0, 0));
      nextDay.setDate(nextDay.getDate() + 1);
      dataPedidoConditionMes.lt = nextDay;
    }

    // O dia específico para "Venda do Dia" será a dataFinal (ou hoje)
    let diaEspecificoInicio = hoje;
    let diaEspecificoFim = new Date(hoje);
    diaEspecificoFim.setDate(diaEspecificoFim.getDate() + 1);

    if (dataFinal) {
      const parts = dataFinal.split('-');
      diaEspecificoInicio = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 3, 0, 0));
      diaEspecificoFim = new Date(diaEspecificoInicio);
      diaEspecificoFim.setDate(diaEspecificoFim.getDate() + 1);
    } else if (dataInicial && !dataFinal) {
      const parts = dataInicial.split('-');
      diaEspecificoInicio = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 3, 0, 0));
      diaEspecificoFim = new Date(diaEspecificoInicio);
      diaEspecificoFim.setDate(diaEspecificoFim.getDate() + 1);
    }

    // Venda do dia (respeita o último dia filtrado)
    const vendaDiaResult = await prisma.mspedido.aggregate({
      where: {
        data_pedido: { gte: diaEspecificoInicio, lt: diaEspecificoFim },
        status: { not: "CANCELADO" },
      },
      _sum: { valor_total: true },
    });

    // Venda do periodo (padrao: mes atual)
    const vendaMesResult = await prisma.mspedido.aggregate({
      where: {
        data_pedido: dataPedidoConditionMes,
        status: { not: "CANCELADO" },
      },
      _sum: { valor_total: true },
    });

    // Clientes cadastrados (Total global, sem filtro de data)
    const clientesCount = await prisma.mscliente.count({
      where: { ativo: "S" },
    });

    // Produtos cadastrados (Total global, sem filtro de data)
    const produtosCount = await prisma.msproduto.count({
      where: { ativo: "S" },
    });

    // Últimas vendas (Filtramos pelo período selecionado)
    const ultimasVendas = await prisma.mspedido.findMany({
      where: {
        data_pedido: dataPedidoConditionMes,
      },
      take: 5,
      orderBy: { data_pedido: "desc" },
      include: { mscliente: { select: { nome: true } } },
    });

    // Estoque Baixo (Global, não depende de data)
    const estoqueBaixoList = await prisma.$queryRaw`
      SELECT p.uuid, p.descricao, p.estoque_minimo, COALESCE(SUM(e.quantidade), 0) as saldo
      FROM msproduto p
      LEFT JOIN msestoque e ON p.codproduto = e.codproduto
      WHERE p.ativo = 'S'
      GROUP BY p.codproduto
      HAVING saldo <= p.estoque_minimo
      LIMIT 10
    `;

    // Produtos mais vendidos (Período)
    const maisVendidos = await prisma.mspedido_item.groupBy({
      by: ['codproduto'],
      where: {
        mspedido: {
          data_pedido: dataPedidoConditionMes,
          status: { not: "CANCELADO" }
        }
      },
      _sum: { quantidade: true },
      orderBy: { _sum: { quantidade: 'desc' } },
      take: 5,
    });
    
    const produtosDetalhes = await prisma.msproduto.findMany({
      where: { codproduto: { in: maisVendidos.map(i => i.codproduto) } }
    });

    const maisVendidosFormatado = maisVendidos.map(item => {
      const prod = produtosDetalhes.find(p => p.codproduto === item.codproduto);
      return {
        descricao: prod?.descricao || "Desconhecido",
        quantidade: item._sum.quantidade
      };
    });

    res.json({
      vendaDia: vendaDiaResult._sum.valor_total || 0,
      vendaMes: vendaMesResult._sum.valor_total || 0,
      clientesCadastrados: clientesCount,
      produtosCadastrados: produtosCount,
      ultimasVendas,
      estoqueBaixo: estoqueBaixoList,
      maisVendidos: maisVendidosFormatado
    });

  } catch (error) {
    console.error("Erro no dashboard:", error);
    res.status(500).json({ error: "Erro ao buscar métricas do dashboard." });
  }
};

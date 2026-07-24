import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getDashboardMetrics = async (req, res) => {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

    // Venda do dia
    const vendaDiaResult = await prisma.mspedido.aggregate({
      where: {
        data_pedido: { gte: hoje },
        status: { not: "CANCELADO" },
      },
      _sum: { valor_total: true },
    });

    // Venda do mes
    const vendaMesResult = await prisma.mspedido.aggregate({
      where: {
        data_pedido: { gte: primeiroDiaMes },
        status: { not: "CANCELADO" },
      },
      _sum: { valor_total: true },
    });

    // Clientes cadastrados
    const clientesCount = await prisma.mscliente.count({
      where: { ativo: "S" },
    });

    // Produtos cadastrados
    const produtosCount = await prisma.msproduto.count({
      where: { ativo: "S" },
    });

    // Últimas vendas
    const ultimasVendas = await prisma.mspedido.findMany({
      take: 5,
      orderBy: { data_pedido: "desc" },
      include: { mscliente: { select: { nome: true } } },
    });

    // Estoque Baixo (produtos onde estoque total < estoque_minimo)
    // Para simplificar no MVP, comparamos a soma no msestoque
    const estoqueBaixoList = await prisma.$queryRaw`
      SELECT p.uuid, p.descricao, p.estoque_minimo, COALESCE(SUM(e.quantidade), 0) as saldo
      FROM msproduto p
      LEFT JOIN msestoque e ON p.codproduto = e.codproduto
      WHERE p.ativo = 'S'
      GROUP BY p.codproduto
      HAVING saldo <= p.estoque_minimo
      LIMIT 10
    `;

    // Produtos mais vendidos (Mês atual)
    const maisVendidos = await prisma.mspedido_item.groupBy({
      by: ['codproduto'],
      where: {
        mspedido: {
          data_pedido: { gte: primeiroDiaMes },
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

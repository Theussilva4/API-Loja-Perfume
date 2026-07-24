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
              valor_total: item.quantidade * item.custo_unitario
            }))
          }
        }
      });

      // 2. Se finalizada, movimenta estoque
      if (status === "FINALIZADA") {
        for (const item of itens) {
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
          
          // Atualiza custo do produto
          await tx.msproduto.update({
            where: { codproduto: item.codproduto },
            data: { custo: item.custo_unitario }
          });
        }
      }

      return compra;
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao criar compra." });
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
  // Lógica de update de status... (Omitida para o MVP já criar finalizada)
  res.json({ message: "Not implemented yet" });
};

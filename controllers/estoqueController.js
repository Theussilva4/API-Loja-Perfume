import prisma from "../prismaClient.js"



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

import prisma from "../prismaClient.js"



export async function listarProdutos(req, res) {
  try {
    const produtos = await prisma.msproduto.findMany({
      include: {
        mstabela_preco: {
          where: { ativo: 'S' },
          orderBy: { codpreco: 'desc' },
          take: 1
        }
      }
    });

    // Se o produto tiver um preço na tabela de preços, sobrepõe o preco_normal original
    const produtosFormatados = produtos.map(p => {
      let precoFinal = Number(p.preco_normal || 0);
      
      if (p.mstabela_preco && p.mstabela_preco.length > 0) {
        precoFinal = Number(p.mstabela_preco[0].preco_venda);
      }
      
      // Remove a propriedade mstabela_preco para não poluir o JSON
      const { mstabela_preco, ...resto } = p;
      
      return {
        ...resto,
        preco_normal: precoFinal
      };
    });

    res.json(produtosFormatados);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao buscar produtos" });
  }
}

export async function criarProdutos(req, res) {
  try {
    const produto = await prisma.msproduto.create({
      data: {
        descricao: req.body.descricao ? req.body.descricao.toUpperCase() : "",
        marca: req.body.marca || "",
        codcategoria: Number(req.body.codcategoria),
        codigo_barras: req.body.codigo_barras || null,
        volume_ml: req.body.volume_ml || null,
        preco_normal: Number(req.body.preco_normal || 0),
        preco_promocao: Number(req.body.preco_promocao || 0),
        custo: req.body.custo ? Number(req.body.custo) : 0,
        estoque_minimo: req.body.estoque_minimo ? Number(req.body.estoque_minimo) : 0,
        codfornecedor: req.body.codfornecedor ? Number(req.body.codfornecedor) : null,
        ativo: req.body.ativo || "S",
        data_cadastro: new Date(),
        resumo: req.body.resumo || ""
      }
    })
    res.json(produto)
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: "Erro ao criar produtos" })
  }
}

export async function alterarProdutos(req, res) {
  const { codproduto } = req.params;
  const { ...dados } = req.body;

  if (!codproduto) {
    return res.status(400).json({ erro: "O código do produto é obrigatório" });
  }
  // Remover campos que não devem ser atualizados
  const camposProibidos = ["data_cadastro", "ativo"];
  camposProibidos.forEach(campo => delete dados[campo]);
  if (dados.descricao) {
    dados.descricao = dados.descricao.toUpperCase();
  }
  try {
    const produtoAtualizado = await prisma.msproduto.update({
      where: { codproduto: Number(codproduto) },
      data: dados,

    })
    res.json(produtoAtualizado)
  } catch (error) {
    res.status(500).json({ erro: "Erro ao alterar produto" })
  }
}
export async function alterarStatusProduto(req, res) {
  const { codproduto } = req.params;
  const { ativo } = req.body; // espera { "ativo": "S" } ou { "ativo": "N" }

  if (!codproduto) {
    return res.status(400).json({ erro: "O código do produto é obrigatório" });
  }

  if (ativo !== "S" && ativo !== "N") {
    return res.status(400).json({ erro: "O campo 'ativo' deve ser 'S' ou 'N'" });
  }

  try {
    const produtoAtualizado = await prisma.msproduto.update({
      where: { codproduto: Number(codproduto) },
      data: { ativo }, // atualiza apenas o campo ativo
    });
    res.json(produtoAtualizado);
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ erro: "Produto não encontrado" });
    }
    console.error(error);
    res.status(500).json({ erro: "Erro ao alterar status do produto" });
  }
}

import prisma from "../prismaClient.js"
import { uploadImageToCloudinary, deleteImageFromCloudinary } from "../utils/cloudinary.js"



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
    if (req.body.codigo_barras) {
      const existeEan = await prisma.msproduto.findFirst({
        where: { codigo_barras: req.body.codigo_barras }
      });
      if (existeEan) {
        return res.status(400).json({ erro: "Já existe um produto cadastrado com este código de barras." });
      }
    }

    let imagem_url = null;
    let imagem_public_id = null;

    if (req.file) {
      const result = await uploadImageToCloudinary(req.file.buffer);
      imagem_url = result.secure_url;
      imagem_public_id = result.public_id;
    }

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
        resumo: req.body.resumo || "",
        imagem_url,
        imagem_public_id
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

  // Converter campos numéricos vindos do FormData
  if (dados.codcategoria !== undefined) dados.codcategoria = Number(dados.codcategoria);
  if (dados.estoque_minimo !== undefined) dados.estoque_minimo = Number(dados.estoque_minimo);
  if (dados.codfornecedor !== undefined) dados.codfornecedor = Number(dados.codfornecedor);
  if (dados.volume_ml !== undefined) dados.volume_ml = Number(dados.volume_ml);

  try {
    if (dados.codigo_barras) {
      const existeEan = await prisma.msproduto.findFirst({
        where: { 
          codigo_barras: dados.codigo_barras,
          codproduto: { not: Number(codproduto) }
        }
      });
      if (existeEan) {
        return res.status(400).json({ erro: "Já existe outro produto cadastrado com este código de barras." });
      }
    }

    const produtoAtual = await prisma.msproduto.findUnique({
      where: { codproduto: Number(codproduto) }
    });

    if (!produtoAtual) {
      return res.status(404).json({ erro: "Produto não encontrado." });
    }

    let imagem_url = produtoAtual.imagem_url;
    let imagem_public_id = produtoAtual.imagem_public_id;

    if (req.file) {
      if (imagem_public_id) {
        await deleteImageFromCloudinary(imagem_public_id).catch(() => {});
      }
      const result = await uploadImageToCloudinary(req.file.buffer);
      imagem_url = result.secure_url;
      imagem_public_id = result.public_id;
    } else if (req.body.remover_imagem === 'true') {
      if (imagem_public_id) {
        await deleteImageFromCloudinary(imagem_public_id).catch(() => {});
      }
      imagem_url = null;
      imagem_public_id = null;
    }

    // Limpar remover_imagem de 'dados' para não dar erro no Prisma
    delete dados.remover_imagem;
    
    dados.imagem_url = imagem_url;
    dados.imagem_public_id = imagem_public_id;

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

import prisma from "../prismaClient.js"
import { uploadImageToCloudinary, deleteImageFromCloudinary } from "../utils/cloudinary.js"
import { logAuditoria, logAlteracoes } from "../services/auditService.js"



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

    const estoques = await prisma.msestoque.groupBy({
      by: ['codproduto'],
      _sum: { quantidade: true }
    });
    
    const estoqueMap = estoques.reduce((acc, e) => {
      acc[e.codproduto] = e._sum.quantidade || 0;
      return acc;
    }, {});


    // Se o produto tiver um preÃ§o na tabela de preÃ§os, sobrepÃµe. SenÃ£o, vai 0.
    const produtosFormatados = produtos.map(p => {
      let precoFinal = 0;
      let precoCartaoFinal = 0;
      let custoFinal = 0;
      
      if (p.mstabela_preco && p.mstabela_preco.length > 0) {
        precoFinal = Number(p.mstabela_preco[0].preco_venda);
        precoCartaoFinal = Number(p.mstabela_preco[0].preco_cartao || 0);
        custoFinal = Number(p.mstabela_preco[0].preco_custo || 0);
      }
      
      // Remove a propriedade mstabela_preco para nÃ£o poluir o JSON
      const { mstabela_preco, ...resto } = p;
      
      return {
        ...resto,
        preco_normal: precoFinal,
        preco_cartao: precoCartaoFinal,
        custo: custoFinal,
        msestoque: [{ quantidade: estoqueMap[p.codproduto] || 0 }]
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
      req.body.codigo_barras = String(req.body.codigo_barras).replace(/\D/g, "");
      if (req.body.codigo_barras === "") req.body.codigo_barras = null;
    }

    if (req.body.codigo_barras) {
      const existeEan = await prisma.msproduto.findFirst({
        where: { codigo_barras: req.body.codigo_barras }
      });
      if (existeEan) {
        return res.status(400).json({ erro: "JÃ¡ existe um produto cadastrado com este cÃ³digo de barras." });
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
        volume_ml: req.body.volume_ml ? Number(req.body.volume_ml) : null,
        estoque_minimo: req.body.estoque_minimo ? Number(req.body.estoque_minimo) : 0,
        codfornecedor: req.body.codfornecedor ? Number(req.body.codfornecedor) : null,
        ativo: req.body.ativo || "S",
        controla_validade: req.body.controla_validade || "S",
        data_cadastro: new Date(),
        resumo: req.body.resumo || "",
        imagem_url,
        imagem_public_id
      }
    })

    await logAuditoria({
      acao: "CRIAR",
      tabela: "msproduto",
      registro_id: produto.codproduto,
      campo: null,
      valor_antigo: null,
      valor_novo: JSON.stringify(produto)
    })

    res.json(produto)
  } catch (error) {
    console.error("Erro completo ao criar produto:", error)
    res.status(500).json({ 
      erro: "Erro ao criar produtos", 
      detalhe: error.message || String(error)
    })
  }
}

export async function alterarProdutos(req, res) {
  const { codproduto } = req.params;
  const { ...dados } = req.body;

  if (!codproduto) {
    return res.status(400).json({ erro: "O cÃ³digo do produto Ã© obrigatÃ³rio" });
  }
  // Remover campos que nÃ£o devem ser atualizados
  const camposProibidos = ["data_cadastro", "ativo"];
  camposProibidos.forEach(campo => delete dados[campo]);
  if (dados.descricao) {
    dados.descricao = dados.descricao.toUpperCase();
  }

  // Converter campos numÃ©ricos vindos do FormData
  if (dados.codcategoria !== undefined) dados.codcategoria = Number(dados.codcategoria);
  if (dados.estoque_minimo !== undefined) dados.estoque_minimo = Number(dados.estoque_minimo);
  if (dados.codfornecedor !== undefined) dados.codfornecedor = Number(dados.codfornecedor);
  if (dados.volume_ml !== undefined) dados.volume_ml = Number(dados.volume_ml);

  try {
    if (dados.codigo_barras !== undefined) {
      if (dados.codigo_barras) {
        dados.codigo_barras = String(dados.codigo_barras).replace(/\D/g, "");
      }
      if (!dados.codigo_barras) {
        dados.codigo_barras = null;
      }
    }

    if (dados.codigo_barras) {
      const existeEan = await prisma.msproduto.findFirst({
        where: { 
          codigo_barras: dados.codigo_barras,
          codproduto: { not: Number(codproduto) }
        }
      });
      if (existeEan) {
        return res.status(400).json({ erro: "JÃ¡ existe outro produto cadastrado com este cÃ³digo de barras." });
      }
    }

    const produtoAtual = await prisma.msproduto.findUnique({
      where: { codproduto: Number(codproduto) }
    });

    if (!produtoAtual) {
      return res.status(404).json({ erro: "Produto nÃ£o encontrado." });
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

    // Limpar remover_imagem de 'dados' para nÃ£o dar erro no Prisma
    delete dados.remover_imagem;
    
    // Se o produto estava em revisÃ£o ('R'), ao salvar ele passa a ser ativo ('S')
    if (produtoAtual.ativo === 'R') {
      dados.ativo = 'S';
    }
    
    dados.imagem_url = imagem_url;
    dados.imagem_public_id = imagem_public_id;
    if (dados.controla_validade) {
      dados.controla_validade = dados.controla_validade === "S" ? "S" : "N";
    }

    const produtoAtualizado = await prisma.msproduto.update({
      where: { codproduto: Number(codproduto) },
      data: dados,

    })

    await logAlteracoes("msproduto", codproduto, produtoAtual, produtoAtualizado);

    res.json(produtoAtualizado)
  } catch (error) {
    console.error("Erro completo ao alterar produto:", error)
    res.status(500).json({ 
      erro: "Erro ao alterar produto", 
      detalhe: error.message || String(error) 
    })
  }
}
export async function alterarStatusProduto(req, res) {
  const { codproduto } = req.params;
  const { ativo } = req.body; // espera { "ativo": "S" } ou { "ativo": "N" }

  if (!codproduto) {
    return res.status(400).json({ erro: "O cÃ³digo do produto Ã© obrigatÃ³rio" });
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
      return res.status(404).json({ erro: "Produto nÃ£o encontrado" });
    }
    console.error(error);
    res.status(500).json({ erro: "Erro ao alterar status do produto" });
  }
}


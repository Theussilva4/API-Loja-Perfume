import prisma from "../prismaClient.js"



export async function listarcategorias(req, res) {
  try {
    const categorias = await prisma.mscategoria.findMany()
    res.json(categorias)
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: "Erro ao buscar categorias" })
  }
}

export async function criarcategorias(req, res) {
  const { categoria, ativo } = req.body;
  if (!categoria) {
    return res.status(400).json({ erro: "O nome da categoria é obrigatório" });
  }

  try {
    const novaCategoria = await prisma.mscategoria.create({
      data: {
        categoria,
        ativo: ativo || "S"
      }
    });
    res.status(201).json(novaCategoria);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao criar categoria" });
  }
}

export async function alterarcategorias(req, res) {
  const{codcategoria} = req.params;
  const {...dados} = req.body;

 if (!codcategoria) {
    return res.status(400).json({ erro: "O código do categoria é obrigatório" });
  }
  // Remover campos que não devem ser atualizados
  const camposProibidos = ["data_cadastro", "ativo"];
  camposProibidos.forEach(campo => delete dados[campo]);
  try {
    const categoriaAtualizado = await prisma.mscategoria.update({
      where: { codcategoria: Number(codcategoria) },
      data: dados,
      
    })
    res.json(categoriaAtualizado)
  } catch (error) {
    res.status(500).json({ erro: "Erro ao alterar categoria" })
  }
}
export async function alterarStatuscategoria(req, res) {
  const { codcategoria } = req.params;
  const { ativo } = req.body; // espera { "ativo": "S" } ou { "ativo": "N" }

  if (!codcategoria) {
    return res.status(400).json({ erro: "O código da categoria é obrigatório" });
  }

  if (ativo !== "S" && ativo !== "N") {
    return res.status(400).json({ erro: "O campo 'ativo' deve ser 'S' ou 'N'" });
  }

  try {
    const categoriaAtualizado = await prisma.mscategoria.update({
      where: { codcategoria: Number(codcategoria) },
      data: { ativo }, // atualiza apenas o campo ativo
    });
    res.json(categoriaAtualizado);
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ erro: "categoria não encontrado" });
    }
    console.error(error);
    res.status(500).json({ erro: "Erro ao alterar status do categoria" });
  }
}

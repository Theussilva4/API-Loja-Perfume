import prisma from "../prismaClient.js"



export async function listarMarca(req, res) {
  try {
    const marca = await prisma.msmarca.findMany()
    res.json(marca)
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: "Erro ao buscar marca" })
  }
}

export async function criarMarca(req, res) {
  const { marca, ativo } = req.body;
  if (!marca) {
    return res.status(400).json({ erro: "O nome da marca Ã© obrigatÃ³rio" });
  }

  try {
    const novaMarca = await prisma.msmarca.create({
      data: {
        marca,
        ativo: ativo || "S"
      }
    });
    res.status(201).json(novaMarca);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao criar marca" });
  }
}

export async function alterarMarca(req, res) {
  const{codmarca} = req.params;
  const {...dados} = req.body;

 if (!codmarca) {
    return res.status(400).json({ erro: "O cÃ³digo do marca Ã© obrigatÃ³rio" });
  }
  // Remover campos que nÃ£o devem ser atualizados
  const camposProibidos = ["data_cadastro", "ativo"];
  camposProibidos.forEach(campo => delete dados[campo]);
  try {
    const marcaAtualizado = await prisma.msmarca.update({
      where: { codmarca: Number(codmarca) },
      data: dados,
      
    })
    res.json(marcaAtualizado)
  } catch (error) {
    res.status(500).json({ erro: "Erro ao alterar marca" })
  }
}
export async function alterarStatusMarca(req, res) {
  const { codmarca } = req.params;
  const { ativo } = req.body; // espera { "ativo": "S" } ou { "ativo": "N" }

  if (!codmarca) {
    return res.status(400).json({ erro: "O cÃ³digo da marca Ã© obrigatÃ³rio" });
  }

  if (ativo !== "S" && ativo !== "N") {
    return res.status(400).json({ erro: "O campo 'ativo' deve ser 'S' ou 'N'" });
  }

  try {
    const marcaAtualizado = await prisma.msmarca.update({
      where: { codmarca: Number(codmarca) },
      data: { ativo }, // atualiza apenas o campo ativo
    });
    res.json(marcaAtualizado);
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ erro: "marca nÃ£o encontrado" });
    }
    console.error(error);
    res.status(500).json({ erro: "Erro ao alterar status do marca" });
  }
}

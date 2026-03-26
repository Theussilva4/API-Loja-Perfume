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


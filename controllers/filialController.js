import prisma from "../prismaClient.js"



export async function listarFilial(req, res) {
  try {
    const filial = await prisma.msfilial.findMany({
      where: { ativo: 'S' }
    })
    res.json(filial)
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: "Erro ao buscar filials" })
  }
}

export async function alterarFilial(req, res) {
  const{codfilial} = req.params;
  const {...dados} = req.body;

 if (!codfilial) {
    return res.status(400).json({ erro: "O cÃ³digo do filial Ã© obrigatÃ³rio" });
  }
  // Remover campos que nÃ£o devem ser atualizados
  const camposProibidos = ["data_cadastro", "ativo"];
  camposProibidos.forEach(campo => delete dados[campo]);
  try {
    const filialAtualizado = await prisma.msfilial.update({
      where: { codfilial: Number(codfilial) },
      data: dados,
      
    })
    res.json(filialAtualizado)
  } catch (error) {
    res.status(500).json({ erro: "Erro ao alterar filial" })
  }
}


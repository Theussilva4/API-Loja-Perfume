import prisma from "../prismaClient.js"



export async function listarVendedor(req, res) {
  try {
    const vendedor = await prisma.msvendedor.findMany()
    res.json(vendedor)
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: "Erro ao buscar Vendedor" })
  }
}

export async function criarVendedor(req, res) {
  try {
    const vendedor = await prisma.msvendedor.create({
      data: {
        nome: req.body.nome,
        cpf: req.body.cpf_cnpj || "",
        telefone: req.body.telefone,
        ativo: req.body.ativo || "S",
        data_cadastro: new Date(),
       
       
      }
    })
    res.json(Vendedor)
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: "Erro ao criar Vendedor" })
  }
}

export async function alterarVendedor(req, res) {
  const { codvendedor } = req.params;
  const { ...dados } = req.body;

  if (!codVendedor) {
    return res.status(400).json({ erro: "O código do Vendedor é obrigatório" });
  }
  // Remover campos que não devem ser atualizados
  const camposProibidos = ["data_cadastro", "ativo"];
  camposProibidos.forEach(campo => delete dados[campo]);
  try {
    const VendedorAtualizado = await prisma.msVendedor.update({
      where: { codvendedor: Number(codvendedor) },
      data: dados,

    })
    res.json(vendedorAtualizado)
  } catch (error) {
    res.status(500).json({ erro: "Erro ao alterar Vendedor" })
  }
}
export async function alterarStatusVendedor(req, res) {
  const { codvendedor } = req.params;
  const { ativo } = req.body; // espera { "ativo": "S" } ou { "ativo": "N" }

  if (!codvendedor) {
    return res.status(400).json({ erro: "O código do Vendedor é obrigatório" });
  }

  if (ativo !== "S" && ativo !== "N") {
    return res.status(400).json({ erro: "O campo 'ativo' deve ser 'S' ou 'N'" });
  }

  try {
    const vendedorAtualizado = await prisma.msvendedor.update({
      where: { codVendedor: Number(codVendedor) },
      data: { ativo }, // atualiza apenas o campo ativo
    });
    res.json(vendedorAtualizado);
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ erro: "Vendedor não encontrado" });
    }
    console.error(error);
    res.status(500).json({ erro: "Erro ao alterar status do Vendedor" });
  }
}

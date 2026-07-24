import prisma from "../prismaClient.js"



export async function listarClientes(req, res) {
  try {
    const clientes = await prisma.mscliente.findMany()
    res.json(clientes)
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: "Erro ao buscar clientes" })
  }
}

export async function criarClientes(req, res) {
  try {
    const cliente = await prisma.mscliente.create({
      data: {
        nome: req.body.nome,
        cpf_cnpj: req.body.cpf_cnpj || "",
        telefone: req.body.telefone,
        email: req.body.email || null,
        endereco: req.body.endereco || null,
        numero: req.body.numero || 0,
        bairro: req.body.bairro || "",
        whatsapp: req.body.whatsapp || null,
        observacoes: req.body.observacoes || null,
        ativo: req.body.ativo || "S",
        data_cadastro: new Date(),
        cidade: req.body.cidade || "",
        cep: req.body.cep || ""
      }
    })
    res.json(cliente)
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: "Erro ao criar clientes" })
  }
}

export async function alterarclientes(req, res) {
  const { codcliente } = req.params;
  const { ...dados } = req.body;

  if (!codcliente) {
    return res.status(400).json({ erro: "O código do cliente é obrigatório" });
  }
  // Remover campos que não devem ser atualizados
  const camposProibidos = ["data_cadastro", "ativo"];
  camposProibidos.forEach(campo => delete dados[campo]);
  try {
    const clienteAtualizado = await prisma.mscliente.update({
      where: { codcliente: Number(codcliente) },
      data: dados,

    })
    res.json(clienteAtualizado)
  } catch (error) {
    res.status(500).json({ erro: "Erro ao alterar cliente" })
  }
}
export async function alterarStatusCliente(req, res) {
  const { codcliente } = req.params;
  const { ativo } = req.body; // espera { "ativo": "S" } ou { "ativo": "N" }

  if (!codcliente) {
    return res.status(400).json({ erro: "O código do cliente é obrigatório" });
  }

  if (ativo !== "S" && ativo !== "N") {
    return res.status(400).json({ erro: "O campo 'ativo' deve ser 'S' ou 'N'" });
  }

  try {
    const clienteAtualizado = await prisma.mscliente.update({
      where: { codcliente: Number(codcliente) },
      data: { ativo }, // atualiza apenas o campo ativo
    });
    res.json(clienteAtualizado);
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ erro: "cliente não encontrado" });
    }
    console.error(error);
    res.status(500).json({ erro: "Erro ao alterar status do cliente" });
  }
}

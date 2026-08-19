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
        telefone: req.body.telefone || "",
        email: req.body.email || null,
        endereco: req.body.endereco || null,
        numero: req.body.numero ? String(req.body.numero) : "",
        bairro: req.body.bairro || "",
        whatsapp: req.body.whatsapp || null,
        observacoes: req.body.observacoes || null,
        data_nascimento: req.body.data_nascimento ? new Date(req.body.data_nascimento) : null,
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
    return res.status(400).json({ erro: "O cÃ³digo do cliente Ã© obrigatÃ³rio" });
  }
  // Remover campos que nÃ£o devem ser atualizados
  const camposProibidos = ["data_cadastro", "ativo", "codcliente", "uuid", "created_at", "updated_at"];
  camposProibidos.forEach(campo => delete dados[campo]);

  // Formatar data_nascimento
  if (dados.data_nascimento === "") {
    dados.data_nascimento = null;
  } else if (dados.data_nascimento) {
    dados.data_nascimento = new Date(dados.data_nascimento);
  }

  try {
    const clienteAtualizado = await prisma.mscliente.update({
      where: { codcliente: Number(codcliente) },
      data: dados,
    });
    res.json(clienteAtualizado);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao alterar cliente" });
  }
}
export async function alterarStatusCliente(req, res) {
  const { codcliente } = req.params;
  const { ativo } = req.body; // espera { "ativo": "S" } ou { "ativo": "N" }

  if (!codcliente) {
    return res.status(400).json({ erro: "O cÃ³digo do cliente Ã© obrigatÃ³rio" });
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
      return res.status(404).json({ erro: "cliente nÃ£o encontrado" });
    }
    console.error(error);
    res.status(500).json({ erro: "Erro ao alterar status do cliente" });
  }
}

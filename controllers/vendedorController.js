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
    const {
      nome, cpf, ativo, codfilial, telefone, email,
      comissao_padrao, meta_vendas, data_nascimento,
      endereco, cidade, uf
    } = req.body;

    if (!nome) {
      return res.status(400).json({ erro: "Nome é obrigatório" });
    }

    const vendedor = await prisma.msvendedor.create({
      data: {
        nome,
        cpf: cpf ? cpf.replace(/\D/g, '') : null,
        ativo: ativo || "S",
        codfilial: codfilial ? Number(codfilial) : null,
        telefone: telefone || null,
        email: email || null,
        comissao_padrao: comissao_padrao ? Number(comissao_padrao) : null,
        meta_vendas: meta_vendas ? Number(meta_vendas) : null,
        data_nascimento: data_nascimento ? new Date(data_nascimento) : null,
        endereco: endereco || null,
        cidade: cidade || null,
        uf: uf || null,
        data_criacao: new Date()
      }
    })
    res.json(vendedor)
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: "Erro ao criar Vendedor" })
  }
}

export async function alterarVendedor(req, res) {
  const { codvendedor } = req.params;
  const { ...dados } = req.body;

  if (!codvendedor) {
    return res.status(400).json({ erro: "O código do Vendedor é obrigatório" });
  }
  
  // Remover campos que não devem ser atualizados
  const camposProibidos = ["data_criacao", "ativo", "codvendedor", "uuid", "created_at", "updated_at"];
  camposProibidos.forEach(campo => delete dados[campo]);
  
  if (dados.cpf) dados.cpf = dados.cpf.replace(/\D/g, '');
  if (dados.data_nascimento) dados.data_nascimento = new Date(dados.data_nascimento);
  if (dados.codfilial) dados.codfilial = Number(dados.codfilial);
  if (dados.comissao_padrao) dados.comissao_padrao = Number(dados.comissao_padrao);
  if (dados.meta_vendas) dados.meta_vendas = Number(dados.meta_vendas);

  try {
    const vendedorAtualizado = await prisma.msvendedor.update({
      where: { codvendedor: Number(codvendedor) },
      data: dados,
    })
    res.json(vendedorAtualizado)
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: "Erro ao alterar Vendedor" })
  }
}

export async function alterarStatusVendedor(req, res) {
  const { codvendedor } = req.params;
  const { ativo } = req.body;

  if (!codvendedor) {
    return res.status(400).json({ erro: "O código do Vendedor é obrigatório" });
  }

  if (ativo !== "S" && ativo !== "N") {
    return res.status(400).json({ erro: "O campo 'ativo' deve ser 'S' ou 'N'" });
  }

  try {
    const vendedorAtualizado = await prisma.msvendedor.update({
      where: { codvendedor: Number(codvendedor) },
      data: { ativo },
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


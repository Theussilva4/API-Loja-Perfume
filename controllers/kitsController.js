import prisma from "../prismaClient.js";

// Listar kits com seus itens
export async function listarKits(req, res) {
  try {
    const kits = await prisma.mskit.findMany({
      orderBy: { id: "desc" },
      include: {
        itens: {
          include: {
            produto: {
              select: {
                codproduto: true,
                descricao: true,
                codigo_barras: true,
                marca: true,
                imagem_url: true,
                mstabela_preco: {
                  where: { ativo: 'S' },
                  orderBy: { codpreco: 'desc' },
                  take: 1
                }
              }
            }
          }
        },
        _count: {
          select: { pedidos: true }
        }
      }
    });

    // Calcular valores dinÃ¢micos
    const kitsCalculados = kits.map(kit => {
      let precoProdutos = 0;
      kit.itens.forEach(item => {
        const tabela = item.produto.mstabela_preco;
        const precoItem = (tabela && tabela.length > 0) ? Number(tabela[0].preco_venda) : 0;
        precoProdutos += precoItem * item.quantidade;
        delete item.produto.mstabela_preco; // Limpa o payload
      });

      const precoKit = Number(kit.preco_kit);
      const economia = precoProdutos - precoKit;
      const percentual = precoProdutos > 0 ? (economia / precoProdutos) * 100 : 0;

      return {
        ...kit,
        preco_produtos: precoProdutos,
        economia: economia > 0 ? economia : 0,
        economia_percentual: percentual > 0 ? percentual : 0,
        tem_vendas: kit._count.pedidos > 0
      };
    });

    res.json(kitsCalculados);
  } catch (error) {
    console.error("Erro ao listar kits:", error);
    res.status(500).json({ error: "Erro interno ao listar kits" });
  }
}

// Criar um novo Kit
export async function criarKit(req, res) {
  try {
    const { nome, descricao, preco_kit, data_inicio, data_fim, ativo, itens, created_by } = req.body;

    if (!nome || !preco_kit || !itens || itens.length === 0) {
      return res.status(400).json({ error: "Nome, preÃ§o e itens sÃ£o obrigatÃ³rios." });
    }

    const kit = await prisma.mskit.create({
      data: {
        nome,
        descricao,
        preco_kit: Number(preco_kit),
        data_inicio: data_inicio ? new Date(data_inicio) : null,
        data_fim: data_fim ? new Date(data_fim) : null,
        ativo: ativo || "S",
        created_by: created_by ? Number(created_by) : null,
        itens: {
          create: itens.map(i => ({
            produto_id: Number(i.produto_id),
            quantidade: Number(i.quantidade || 1)
          }))
        }
      },
      include: {
        itens: true
      }
    });

    res.status(201).json(kit);
  } catch (error) {
    console.error("Erro ao criar kit:", error);
    res.status(500).json({ error: "Erro interno ao criar kit" });
  }
}

// Atualizar um Kit
export async function atualizarKit(req, res) {
  try {
    const { id } = req.params;
    const { nome, descricao, preco_kit, data_inicio, data_fim, ativo, itens, updated_by } = req.body;

    // Verificar se kit existe
    const kitAtual = await prisma.mskit.findUnique({
      where: { id: Number(id) },
      include: {
        _count: {
          select: { pedidos: true }
        }
      }
    });

    if (!kitAtual) {
      return res.status(404).json({ error: "Kit nÃ£o encontrado." });
    }

    const temVendas = kitAtual._count.pedidos > 0;

    // AtualizaÃ§Ã£o usando transaÃ§Ã£o
    const kitAtualizado = await prisma.$transaction(async (tx) => {
      // 1. Atualizar dados cadastrais do Kit
      const updatedKit = await tx.mskit.update({
        where: { id: Number(id) },
        data: {
          nome,
          descricao,
          preco_kit: Number(preco_kit),
          data_inicio: data_inicio ? new Date(data_inicio) : null,
          data_fim: data_fim ? new Date(data_fim) : null,
          ativo: ativo || "S",
          updated_by: updated_by ? Number(updated_by) : null,
        }
      });

      // 2. Se nÃ£o tiver vendas, podemos alterar os itens
      if (!temVendas && itens) {
        // Deletar os itens antigos
        await tx.mskit_item.deleteMany({
          where: { kit_id: Number(id) }
        });
        
        // Criar os novos
        if (itens.length > 0) {
          await tx.mskit_item.createMany({
            data: itens.map(i => ({
              kit_id: Number(id),
              produto_id: Number(i.produto_id),
              quantidade: Number(i.quantidade || 1)
            }))
          });
        }
      }

      return updatedKit;
    });

    // Se o usuÃ¡rio tentou enviar itens mas o kit jÃ¡ tinha vendas
    if (temVendas && itens) {
      return res.json({
        ...kitAtualizado,
        aviso: "Os dados do kit foram atualizados, mas os PRODUTOS nÃ£o foram alterados porque este kit jÃ¡ possui vendas registradas. Crie um novo kit se precisar mudar a composiÃ§Ã£o."
      });
    }

    res.json(kitAtualizado);
  } catch (error) {
    console.error("Erro ao atualizar kit:", error);
    res.status(500).json({ error: "Erro interno ao atualizar kit" });
  }
}

// Inativar um Kit (ExclusÃ£o LÃ³gica)
export async function excluirKit(req, res) {
  try {
    const { id } = req.params;

    const kit = await prisma.mskit.update({
      where: { id: Number(id) },
      data: { ativo: "N" }
    });

    res.json({ mensagem: "Kit inativado com sucesso", kit });
  } catch (error) {
    console.error("Erro ao inativar kit:", error);
    res.status(500).json({ error: "Erro interno ao inativar kit" });
  }
}

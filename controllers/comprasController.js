import { PrismaClient } from "@prisma/client";
import { XMLParser } from "fast-xml-parser";
import { creditarEstoque, debitarEstoque } from "../services/estoqueService.js";

const prisma = new PrismaClient();

// FunÃ§Ã£o auxiliar para gerar numero CMP-XXXXXX
const generateCompraCode = async () => {
  const lastCompra = await prisma.mscompra.findFirst({
    orderBy: { codcompra: 'desc' }
  });
  const nextId = lastCompra ? lastCompra.codcompra + 1 : 1;
  return `CMP-${nextId.toString().padStart(6, '0')}`;
};

export const importarXml = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo XML enviado." });
    }

    const xmlData = req.file.buffer.toString("utf8");

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_"
    });
    const parsedData = parser.parse(xmlData);

    // Navegar atÃ© a tag principal (nfeproc -> NFe -> infNFe)
    const nfe = parsedData.nfeProc?.NFe?.infNFe || parsedData.NFe?.infNFe;
    if (!nfe) {
      return res.status(400).json({ error: "XML invÃ¡lido. NÃ£o Ã© uma NF-e reconhecida." });
    }

    const emitente = nfe.emit;
    if (!emitente) {
      return res.status(400).json({ error: "Dados do emitente nÃ£o encontrados no XML." });
    }

    const cnpjEmitente = emitente.CNPJ ? emitente.CNPJ.toString() : "";
    const nomeEmitente = emitente.xNome || "FORNECEDOR XML";

    // 1. Procurar ou criar fornecedor
    let fornecedor = await prisma.msfornecedor.findFirst({
      where: {
        OR: [
          { cnpj: cnpjEmitente },
          { nome: nomeEmitente }
        ]
      }
    });

    if (!fornecedor) {
      fornecedor = await prisma.msfornecedor.create({
        data: {
          nome: nomeEmitente,
          cnpj: cnpjEmitente,
          cidade: emitente.enderEmit?.xMun || null,
          telefone: emitente.enderEmit?.fone ? emitente.enderEmit.fone.toString() : null
        }
      });
    }

    // 2. Verificar se a nota jÃ¡ foi importada e nÃ£o estÃ¡ cancelada
    const dataEmissao = nfe.ide?.dhEmi ? new Date(nfe.ide.dhEmi) : new Date();
    const numeroNFe = nfe.ide?.nNF || "";
    const valorTotalNF = nfe.total?.ICMSTot?.vNF || 0;

    if (numeroNFe) {
      const notaExistente = await prisma.mscompra.findFirst({
        where: {
          numero_documento: numeroNFe.toString(),
          codfornecedor: fornecedor.codfornecedor,
          status: {
            not: "CANCELADA"
          }
        }
      });

      if (notaExistente) {
        return res.status(400).json({ error: `A nota fiscal ${numeroNFe} jÃ¡ foi importada anteriormente e encontra-se no status ${notaExistente.status}. Cancele-a antes de importar novamente.` });
      }
    }

    const codigoCompra = await generateCompraCode();

    const compra = await prisma.mscompra.create({
      data: {
        codfornecedor: fornecedor.codfornecedor,
        data_compra: dataEmissao,
        numero_documento: numeroNFe.toString(),
        valor_total: parseFloat(valorTotalNF),
        status: "EM_CONFERENCIA",
        codfilial: 1,
        ativo: "S",
        codigo_compra: codigoCompra
      }
    });

    // 3. Processar Produtos
    let det = nfe.det;
    if (!Array.isArray(det)) {
      det = [det];
    }

    const resultadosProdutos = {
      existentes: 0,
      novos: 0
    };

    const compraItems = [];

    for (const item of det) {
      const prod = item.prod;
      const cEAN = prod.cEAN !== "SEM GTIN" && prod.cEAN ? prod.cEAN : null;
      const xProd = prod.xProd || "Produto Desconhecido";
      const qCom = parseFloat(prod.qCom || 1);
      const vUnCom = parseFloat(prod.vUnCom || 0);
      const vProd = parseFloat(prod.vProd || 0);
      
      let eanNumber = cEAN ? Number(cEAN) : null;
      if (isNaN(eanNumber)) eanNumber = null;

      let produtoDb = null;

      // Tenta achar pelo EAN
      if (eanNumber) {
        produtoDb = await prisma.msproduto.findFirst({
          where: { codigo_barras: eanNumber }
        });
      }

      if (produtoDb) {
        resultadosProdutos.existentes++;
      } else {
        // Criar prÃ©-cadastro
        produtoDb = await prisma.msproduto.create({
          data: {
            descricao: xProd,
            codigo_barras: eanNumber,
            ativo: "R", // "R" = RevisÃ£o Pendente
            codcategoria: 1, // Fixando categoria padrÃ£o
            codmarca: 1 // Fixando marca padrÃ£o
          }
        });

        // Criar tabela de preco para o produto
        await prisma.mstabela_preco.create({
          data: {
            codproduto: produtoDb.codproduto,
            preco_custo: vUnCom,
            preco_venda: vUnCom * 2, // SugestÃ£o
          }
        });
        
        // Criar saldo 0 no msestoque
        const filiais = await prisma.msfilial.findMany();
        for (const f of filiais) {
          await prisma.msestoque.create({
            data: {
              codproduto: produtoDb.codproduto,
              codfilial: f.codfilial,
              quantidade: 0
            }
          });
        }
        
        resultadosProdutos.novos++;
      }

      compraItems.push({
        codcompra: compra.codcompra,
        codproduto: produtoDb.codproduto,
        quantidade: qCom,
        custo_unitario: vUnCom,
        valor_total: vProd,
        lote: null,
        validade: null
      });
    }

    if (compraItems.length > 0) {
      await prisma.mscompra_item.createMany({
        data: compraItems
      });
    }

    return res.status(200).json({
      message: "XML importado com sucesso!",
      compraId: compra.codcompra,
      resumo: {
        fornecedor: nomeEmitente,
        totalItens: det.length,
        produtosExistentes: resultadosProdutos.existentes,
        produtosPreCadastrados: resultadosProdutos.novos
      }
    });

  } catch (error) {
    console.error("Erro ao importar XML:", error);
    return res.status(500).json({ error: "Erro interno ao processar o XML." });
  }
};

export const finalizarConferencia = async (req, res) => {
  try {
    const { uuid } = req.params;
    const { itens, codfilial } = req.body; // itens = [{ codproduto, quantidade, lote, validade, cEAN (novo) }]

    if (!uuid || !itens) {
      return res.status(400).json({ error: "Dados incompletos para finalizaÃ§Ã£o." });
    }

    const filialId = codfilial || 1;

    // Buscar compra
    const compra = await prisma.mscompra.findFirst({
      where: { uuid }
    });

    if (!compra) return res.status(404).json({ error: "Compra nÃ£o encontrada." });

    if (compra.status !== "EM_CONFERENCIA") {
      return res.status(400).json({ error: "A compra jÃ¡ foi processada anteriormente." });
    }

    await prisma.$transaction(async (tx) => {
      for (const item of itens) {
        // Atualizar produto se enviaram cEAN
        if (item.cEAN) {
          const eanNumber = Number(item.cEAN);
          if (!isNaN(eanNumber)) {
            await tx.msproduto.update({
              where: { codproduto: item.codproduto },
              data: { 
                codigo_barras: eanNumber
              }
            });
          }
        }

        // Atualizar item da compra
        await tx.mscompra_item.updateMany({
          where: { 
            codcompra: compra.codcompra,
            codproduto: item.codproduto
          },
          data: {
            quantidade: item.quantidade,
            lote: item.lote || null,
            validade: item.validade ? new Date(item.validade) : null
          }
        });

        // Adicionar lote ao msestoque_lote se tiver lote e validade
        if (item.lote && item.validade) {
          await tx.msestoque_lote.create({
            data: {
              codproduto: item.codproduto,
              codfilial: filialId,
              lote: item.lote,
              validade: new Date(item.validade),
              quantidade: item.quantidade
            }
          });
        }

        // Atualizar msestoque (somar quantidade)
        const estoqueAtual = await tx.msestoque.findUnique({
          where: {
            codproduto_codfilial: {
              codproduto: item.codproduto,
              codfilial: filialId
            }
          }
        });

        if (estoqueAtual) {
          await tx.msestoque.update({
            where: {
              codproduto_codfilial: {
                codproduto: item.codproduto,
                codfilial: filialId
              }
            },
            data: {
              quantidade: { increment: item.quantidade },
              atualizado_em: new Date()
            }
          });
        } else {
          await tx.msestoque.create({
            data: {
              codproduto: item.codproduto,
              codfilial: filialId,
              quantidade: item.quantidade
            }
          });
        }
      }

      // Finaliza a compra
      await tx.mscompra.update({
        where: { codcompra: compra.codcompra },
        data: { status: "CONCLUIDA" }
      });
    });

    return res.status(200).json({ message: "ConferÃªncia finalizada com sucesso! Estoque atualizado." });

  } catch (error) {
    console.error("Erro na conferÃªncia:", error);
    return res.status(500).json({ error: "Erro ao finalizar a conferÃªncia." });
  }
};


export const getCompras = async (req, res) => {
  try {
    const compras = await prisma.mscompra.findMany({
      include: {
        msfornecedor: { select: { nome: true } },
        _count: { select: { mscompra_item: true } }
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(compras);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar compras." });
  }
};

export const createCompra = async (req, res) => {
  try {
    const { codfornecedor, numero_documento, observacao, itens, codfilial, atualizacoesCusto } = req.body;
    
    // Calcula total
    const valor_total = itens.reduce((acc, item) => acc + (item.quantidade * item.custo_unitario), 0);
    const codigo_compra = await generateCompraCode();
    const status = "FINALIZADA"; // Para simplificar o MVP, vamos iniciar jÃ¡ finalizando e atualizando estoque. Pode ser ABERTA no futuro.

    // Busca configuracao para saber como tratar o custo
    const config = await prisma.msconfiguracao_empresa.findFirst();
    const atualizacaoConfig = config?.atualizacao_custo_compra || "PERGUNTAR";

    const result = await prisma.$transaction(async (tx) => {
      // 1. Cria Compra
      const compra = await tx.mscompra.create({
        data: {
          codigo_compra,
          codfornecedor,
          numero_documento,
          observacao,
          valor_total,
          status,
          codfilial: codfilial || 1, // Default filial 1
          mscompra_item: {
            create: itens.map(item => ({
              codproduto: item.codproduto,
              quantidade: item.quantidade,
              custo_unitario: item.custo_unitario,
              valor_total: item.quantidade * item.custo_unitario,
              lote: item.lote ? String(item.lote) : null,
              validade: item.validade ? new Date(item.validade) : null
            }))
          }
        }
      });

      // 2. Se finalizada, movimenta estoque
      if (status === "FINALIZADA") {
        for (const item of itens) {
          // Busca informaÃ§Ãµes atuais do produto antes de alterar o estoque
          const [tabelaPreco, estoqueAtual] = await Promise.all([
            tx.mstabela_preco.findFirst({
              where: { codproduto: item.codproduto, ativo: 'S' }
            }),
            tx.msestoque.findUnique({
              where: {
                codproduto_codfilial: {
                  codproduto: item.codproduto,
                  codfilial: codfilial || 1
                }
              }
            })
          ]);

          // Adiciona estoque, lote e movimento
          await creditarEstoque(tx, item.codproduto, codfilial || 1, item.quantidade, "COMPRA", compra.codcompra, item.lote, item.validade, item.custo_unitario);
          
          // LÃ³gica de AtualizaÃ§Ã£o de Custo
          if (tabelaPreco) {
            let novoCusto = null;

            // Se o frontend enviou atualizaÃ§Ãµes explÃ­citas (Ex: a opÃ§Ã£o "PERGUNTAR" gerou um modal)
            if (atualizacoesCusto && Array.isArray(atualizacoesCusto)) {
              const explicitUpdate = atualizacoesCusto.find(a => String(a.codproduto) === String(item.codproduto));
              if (explicitUpdate && explicitUpdate.metodo !== "MANTER" && explicitUpdate.novo_custo) {
                novoCusto = explicitUpdate.novo_custo;
              }
            } else if (atualizacaoConfig !== "MANTER") {
              // Comportamento automÃ¡tico de acordo com a configuraÃ§Ã£o
              if (atualizacaoConfig === "ULTIMO_CUSTO") {
                novoCusto = item.custo_unitario;
              } else if (atualizacaoConfig === "CUSTO_MEDIO" || atualizacaoConfig === "PERGUNTAR") {
                // OBS: Se for PERGUNTAR e nÃ£o veio 'atualizacoesCusto', significa que nÃ£o houve variaÃ§Ã£o 
                // e o frontend ignorou, mas se o custo unitÃ¡rio for diferente do atual, podemos nÃ£o fazer nada ou forÃ§ar mÃ©dio.
                // Mas geralmente, se for CUSTO_MEDIO, faz a matemÃ¡tica:
                const currentQuantity = estoqueAtual?.quantidade || 0;
                const currentCost = Number(tabelaPreco.preco_custo || 0);
                
                if (currentQuantity > 0) {
                  const totalEmEstoqueAtual = currentQuantity * currentCost;
                  const totalNovaEntrada = item.quantidade * item.custo_unitario;
                  novoCusto = (totalEmEstoqueAtual + totalNovaEntrada) / (currentQuantity + item.quantidade);
                } else {
                  novoCusto = item.custo_unitario;
                }
              }
            }

            if (novoCusto !== null) {
              // Fecha a vigÃªncia atual e abre nova para manter histÃ³rico
              await tx.mstabela_preco.update({
                where: { codpreco: tabelaPreco.codpreco },
                data: { data_fim: new Date() }
              });

              await tx.mstabela_preco.create({
                data: {
                  codproduto: item.codproduto,
                  preco_custo: Number(Number(novoCusto).toFixed(2)),
                  preco_venda: tabelaPreco.preco_venda,
                  preco_cartao: tabelaPreco.preco_cartao,
                  desconto_maximo: tabelaPreco.desconto_maximo,
                  data_inicio: new Date(),
                  created_by: req.user?.id || null
                }
              });
            }
          }
        }
      }

      return compra;
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao criar compra.", details: error.message });
  }
};

export const getCompraById = async (req, res) => {
  try {
    const { uuid } = req.params;
    const compra = await prisma.mscompra.findFirst({
      where: { uuid },
      include: {
        msfornecedor: true,
        mscompra_item: {
          include: { msproduto: { select: { descricao: true } } }
        }
      }
    });
    if(!compra) return res.status(404).json({ error: "NÃ£o encontrado" });
    res.json(compra);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar compra." });
  }
};

export const updateCompraStatus = async (req, res) => {
  try {
    const { uuid } = req.params;
    const { status, motivo_cancelamento } = req.body;

    if (status !== "CANCELADA") {
      return res.status(400).json({ error: "Apenas o status 'CANCELADA' Ã© suportado para atualizaÃ§Ã£o no momento." });
    }

    if (!motivo_cancelamento || motivo_cancelamento.trim().length < 15) {
      return res.status(400).json({ error: "O motivo do cancelamento deve ter pelo menos 15 caracteres." });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Busca a compra
      const compra = await tx.mscompra.findFirst({
        where: { uuid },
        include: { mscompra_item: true }
      });

      if (!compra) {
        throw new Error("Compra nÃ£o encontrada.");
      }

      if (compra.status === "CANCELADA") {
        throw new Error("Esta compra jÃ¡ estÃ¡ cancelada.");
      }

      // 2. Se a compra estava finalizada/concluÃ­da, estorna o estoque
      if (compra.status === "FINALIZADA" || compra.status === "CONCLUIDA") {
        for (const item of compra.mscompra_item) {
          // Cria movimento de estorno e atualiza lote/saldo
          await debitarEstoque(tx, item.codproduto, compra.codfilial || 1, item.quantidade, "CANCELAMENTO_COMPRA", compra.codcompra, item.lote);
          // Nota: O custo do produto (msproduto.custo) nÃ£o Ã© revertido para o valor anterior (conforme MVP).
        }
      }

      const novaObservacao = (compra.observacao ? compra.observacao + "\n\n" : "") + "Cancelamento: " + motivo_cancelamento;

      // 3. Atualiza o status
      const compraAtualizada = await tx.mscompra.update({
        where: { codcompra: compra.codcompra },
        data: { 
          status: "CANCELADA",
          observacao: novaObservacao
        }
      });

      return compraAtualizada;
    });

    res.json({ message: "Compra cancelada com sucesso", compra: result });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message || "Erro ao atualizar status da compra." });
  }
};

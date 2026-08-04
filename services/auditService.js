import prisma from "../prismaClient.js";

/**
 * Registra uma ação na tabela ms_log_auditoria
 * @param {Object} params
 * @param {number} params.codusuario - ID do usuário que fez a ação
 * @param {string} params.nome_usuario - Nome do usuário (opcional)
 * @param {string} params.acao - "CRIAR", "ALTERAR", "EXCLUIR", "CANCELAR"
 * @param {string} params.tabela - Nome da tabela, ex: "msproduto"
 * @param {string|number} params.registro_id - ID do registro
 * @param {string} params.campo - Nome do campo alterado
 * @param {any} params.valor_antigo - Valor anterior
 * @param {any} params.valor_novo - Novo valor
 * @param {string} params.motivo - Motivo/Justificativa (para cancelamentos)
 */
export async function logAuditoria({
  codusuario,
  nome_usuario,
  acao,
  tabela,
  registro_id,
  campo,
  valor_antigo,
  valor_novo,
  motivo
}) {
  try {
    await prisma.ms_log_auditoria.create({
      data: {
        codusuario: codusuario ? Number(codusuario) : null,
        nome_usuario: nome_usuario || null,
        acao,
        tabela,
        registro_id: registro_id ? String(registro_id) : null,
        campo: campo || null,
        valor_antigo: valor_antigo !== undefined && valor_antigo !== null ? String(valor_antigo) : null,
        valor_novo: valor_novo !== undefined && valor_novo !== null ? String(valor_novo) : null,
        motivo: motivo || null
      }
    });
  } catch (error) {
    console.error("Erro ao registrar log de auditoria:", error);
  }
}

/**
 * Compara dois objetos e registra as diferenças no log
 */
export async function logAlteracoes(tabela, registro_id, objetoAntigo, objetoNovo, codusuario = null, nome_usuario = null) {
  if (!objetoAntigo || !objetoNovo) return;

  const campos = Object.keys(objetoNovo);

  for (const campo of campos) {
    const valorAntigo = objetoAntigo[campo];
    const valorNovo = objetoNovo[campo];

    // Evitar loop infinito e ignorar campos de controle
    if (campo === "updated_at" || campo === "atualizado_em") continue;

    // Se os valores são diferentes, registra o log
    if (String(valorAntigo) !== String(valorNovo)) {
      await logAuditoria({
        codusuario,
        nome_usuario,
        acao: "ALTERAR",
        tabela,
        registro_id,
        campo,
        valor_antigo: valorAntigo,
        valor_novo: valorNovo
      });
    }
  }
}

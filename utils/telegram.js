// native fetch is available

/**
 * Envia uma mensagem de texto para um chat no Telegram.
 * 
 * Requer as variáveis de ambiente:
 * - TELEGRAM_BOT_TOKEN
 * - TELEGRAM_CHAT_ID
 * 
 * @param {string} message - A mensagem a ser enviada.
 */
export async function sendTelegramAlert(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID ausentes. Alerta não enviado.');
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Falha ao enviar alerta para o Telegram:', errorText);
    }
  } catch (error) {
    console.error('Erro de rede ao enviar alerta para o Telegram:', error);
  }
}

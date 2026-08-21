import "dotenv/config"
import express from "express"
import cors from "cors"
import path from "path"
import { fileURLToPath } from "url"

import produtosRoutes from "./routes/produtos.js"
import categoriaRoutes from "./routes/categoria.js"
import estoqueRoutes from "./routes/estoque.js"
import filialRoutes from "./routes/filial.js"
import marcaRoutes from "./routes/marca.js"
import clienteRoutes from "./routes/cliente.js"
import vendedorRoutes from "./routes/vendedor.js"
import usuarioRoutes from "./routes/usuario.js"
import loginRoutes from "./routes/login.js"
import pedidoRoutes from "./routes/pedido.js"
import kitsRoutes from "./routes/kits.js"
import planopagamentoRoutes from "./routes/planopagamento.js"

import fornecedorRoutes from "./routes/fornecedor.js"
import compraRoutes from "./routes/compra.js"
import dashboardRoutes from "./routes/dashboard.js"
import precificacaoRoutes from "./routes/precificacao.js"
import configuracaoRoutes from "./routes/configuracao.js"
import relatoriosRoutes from "./routes/relatorios.js"
import caixaRoutes from "./routes/caixa.js"
import contasReceberRoutes from "./routes/contasReceber.js"
import { sendTelegramAlert } from "./utils/telegram.js"
import { auth } from "./middlewares/authMiddleware.js"

import helmet from "helmet";

const app = express()
app.set('trust proxy', 1) // Confia no proxy reverso para identificar o IP corretamente (Evita o erro ERR_ERL_UNEXPECTED_X_FORWARDED_FOR)

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }))
app.use(cors({
  origin: function (origin, callback) {
    callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"]
}))

app.use(express.json())

// Middleware para forÃ§ar uppercase em dados de cadastro (POST, PUT, PATCH)
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    // Rotas que nÃ£o devem sofrer alteraÃ§Ã£o de caixa
    if (req.originalUrl.includes('/api/login')) return next();
    
    // Chaves que nÃ£o devem ser convertidas para maiÃºsculo
    const skipKeys = [
      'email', 'senha', 'password', 'login', 'id', 'uuid', 'token', 
      'url', 'imagem', 'foto', 'chave_pix', 'codigo', 'cod', 'codproduto',
      'telefone', 'celular', 'whatsapp', 'cpf', 'cnpj', 'rg', 'cep', 'cor', 'icone'
    ];

    const uppercaseObj = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const keyLower = key.toLowerCase();
          if (skipKeys.some(skip => keyLower.includes(skip))) {
            continue;
          }
          
          if (typeof obj[key] === 'string') {
            obj[key] = obj[key].toUpperCase();
          } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            uppercaseObj(obj[key]);
          }
        }
      }
    };

    if (req.body) {
      uppercaseObj(req.body);
    }
  }
  next();
});

// AutenticaÃ§Ã£o Global para todas as rotas da API (exceto pÃºblicas)
app.use("/api", (req, res, next) => {
  const publicRoutes = ['/api/login', '/api/teste-erro'];
  if (publicRoutes.some(route => req.originalUrl.includes(route))) {
    return next();
  }
  return auth(req, res, next);
});

// Middleware para interceptar respostas com erro 500+ e enviar para o Telegram
app.use((req, res, next) => {
  const originalJson = res.json;
  const originalSend = res.send;
  
  const handleIntercept = (body) => {
    if (res.statusCode >= 500) {
      let errorMessage = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
      // Trunca a mensagem caso ela seja muito grande para o telegram (limite ~4096 caracteres)
      if (errorMessage.length > 2000) {
        errorMessage = errorMessage.substring(0, 2000) + '... [TRUNCATED]';
      }

      const mensagem = `ð¨ <b>ERRO NA API</b> ð¨\n\n` +
        `<b>Rota:</b> ${req.method} ${req.originalUrl}\n` +
        `<b>Status:</b> ${res.statusCode}\n\n` +
        `<b>Detalhes:</b>\n<pre>${errorMessage}</pre>`;
        
      sendTelegramAlert(mensagem);
    }
  };

  res.json = function (body) {
    handleIntercept(body);
    if (res.statusCode >= 500 && (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'producao')) {
      return originalJson.call(this, { erro: "Ocorreu um erro interno no servidor." });
    }
    return originalJson.apply(this, arguments);
  };
  
  res.send = function (body) {
    handleIntercept(body);
    if (res.statusCode >= 500 && (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'producao')) {
      this.type('json');
      return originalSend.call(this, JSON.stringify({ erro: "Ocorreu um erro interno no servidor." }));
    }
    return originalSend.apply(this, arguments);
  };

  next();
});

// Rotas da API
app.use("/api/produtos", produtosRoutes)
app.use("/api/categorias", categoriaRoutes)
app.use("/api/estoque", estoqueRoutes)
app.use("/api/filial", filialRoutes)
app.use("/api/marcas", marcaRoutes)
app.use("/api/cliente", clienteRoutes)
app.use("/api/vendedor", vendedorRoutes)
app.use("/api/usuario", usuarioRoutes)
app.use("/api/login", loginRoutes)
app.use("/api/pedidos", pedidoRoutes)
app.use("/api/kits", kitsRoutes)
app.use("/api/planopagamento", planopagamentoRoutes)
app.use("/api/fornecedores", fornecedorRoutes)
app.use("/api/compras", compraRoutes)
app.use("/api/dashboard", dashboardRoutes)
app.use("/api/comercial", precificacaoRoutes)
app.use("/api/configuracoes", configuracaoRoutes)
app.use("/api/relatorios", relatoriosRoutes)
app.use("/api/caixa", caixaRoutes)
app.use("/api/contas-receber", contasReceberRoutes)

// Rota de teste para validar o Telegram
app.get("/api/teste-erro", (req, res) => {
  res.status(500).json({
    erro: "Este Ã© um erro de teste disparado propositalmente para validar a integraÃ§Ã£o com o Telegram.",
    details: "Se vocÃª recebeu isso no seu Telegram, a integraÃ§Ã£o estÃ¡ funcionando perfeitamente ð"
  });
});

// Fallback para rotas /api inexistentes (evita retornar o HTML do frontend)
app.use("/api", (req, res) => {
  res.status(404).json({ erro: "Rota da API não encontrada." });
});

// Tratamento de erros globais da /api (evita retornar HTML de stack trace do Express)
app.use("/api", (err, req, res, next) => {
  console.error("ERRO GLOBAL NA API:", err);
  if (!res.headersSent) {
    res.status(500).json({ erro: err.message || "Ocorreu um erro interno no servidor." });
  }
});

// Servir o frontend buildado
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
app.use(express.static(path.join(__dirname, '../perfume-store-dashboard/dist')))
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../perfume-store-dashboard/dist/index.html'))
})

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API rodando na porta ${PORT}`)
})
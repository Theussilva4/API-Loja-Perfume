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
import planopagamentoRoutes from "./routes/planopagamento.js"

import fornecedorRoutes from "./routes/fornecedor.js"
import compraRoutes from "./routes/compra.js"
import dashboardRoutes from "./routes/dashboard.js"
import precificacaoRoutes from "./routes/precificacao.js"

const app = express()

app.use(cors({
  origin: [
    "http://localhost:8081",
    "http://localhost:5173",
    "https://deassisdev-site-matheus.bwb8as.easypanel.host"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"]
}))

app.use(express.json())

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
app.use("/api/planopagamento", planopagamentoRoutes)
app.use("/api/fornecedores", fornecedorRoutes)
app.use("/api/compras", compraRoutes)
app.use("/api/dashboard", dashboardRoutes)
app.use("/api/comercial", precificacaoRoutes)




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
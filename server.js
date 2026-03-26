import "dotenv/config"
import express from "express"
import cors from "cors"

import produtosRoutes from "./routes/produtos.js"
import categoriaRoutes from "./routes/categoria.js"
import estoqueRoutes from "./routes/estoque.js"
import filialRoutes from "./routes/filial.js"
import marcaRoutes from "./routes/marca.js"
import clienteRoutes from "./routes/cliente.js"
import vendedorRoutes from "./routes/vendedor.js"

const app = express()
app.use(cors())
app.use(express.json())
app.use("/produtos", produtosRoutes)
app.use("/categorias", categoriaRoutes)
app.use("/estoque", estoqueRoutes)
app.use("/filial", filialRoutes)
app.use("/marcas", marcaRoutes)
app.use("/cliente", clienteRoutes)
app.use("/vendedor", vendedorRoutes)


app.listen(3001,"0.0.0.0", () => {
  console.log("API rodando em http://192.168.2.167:3001")
})
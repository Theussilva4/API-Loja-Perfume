const fs = require('fs');

let schema = fs.readFileSync('C:/Users/matheus.miguel/Documents/Node_projetos/Projeto_Perfume/API/prisma/schema.prisma', 'utf-8');

// Update msusuario
if (!schema.includes('sessoes_abertas')) {
    schema = schema.replace(
        '  mspedido_mspedido_codusur_cancelouTomsusuario mspedido[] @relation("mspedido_codusur_cancelouTomsusuario")',
        '  mspedido_mspedido_codusur_cancelouTomsusuario mspedido[] @relation("mspedido_codusur_cancelouTomsusuario")\n  sessoes_abertas                               mscaixa_sessao[] @relation("sessao_abertura")\n  sessoes_fechadas                              mscaixa_sessao[] @relation("sessao_fechamento")\n  movimentos_caixa                              mscaixa_movimento[]'
    );
}

// Update mspedido
if (!schema.includes('pagamentos_multiplos')) {
    schema = schema.replace(
        '  mspedido_kit                                   mspedido_kit[]',
        '  mspedido_kit                                   mspedido_kit[]\n  pagamentos_multiplos                           mspedido_pagamento[]\n  movimentos_caixa                               mscaixa_movimento[]'
    );
}

// Update MSPLANOPAGAMENTO
if (!schema.includes('pagamentos_pedido')) {
    schema = schema.replace(
        '  updated_at           DateTime? @updatedAt @db.DateTime(0)\n}',
        '  updated_at           DateTime? @updatedAt @db.DateTime(0)\n  pagamentos_pedido    mspedido_pagamento[]\n  movimentos_caixa     mscaixa_movimento[]\n}'
    );
}

const newModels = `
model mscaixa {
  codcaixa    Int       @id @default(autoincrement())
  nome        String    @db.VarChar(100)
  codfilial   Int
  ativo       Boolean   @default(true)
  created_at  DateTime? @default(now()) @db.DateTime(0)
  updated_at  DateTime? @updatedAt @db.DateTime(0)

  sessoes     mscaixa_sessao[]
}

model mscaixa_sessao {
  codsessao          Int       @id @default(autoincrement())
  codcaixa           Int
  codusur_abertura   Int
  codusur_fechamento Int?
  data_abertura      DateTime  @default(now()) @db.DateTime(0)
  data_fechamento    DateTime? @db.DateTime(0)
  valor_abertura     Decimal   @default(0) @db.Decimal(12, 2)
  valor_fechamento   Decimal?  @db.Decimal(12, 2)
  diferenca          Decimal?  @db.Decimal(12, 2)
  motivo_diferenca   String?   @db.Text
  status             String    @default("ABERTO") @db.VarChar(20)
  created_at         DateTime? @default(now()) @db.DateTime(0)
  updated_at         DateTime? @updatedAt @db.DateTime(0)

  caixa              mscaixa              @relation(fields: [codcaixa], references: [codcaixa])
  usuario_abertura   msusuario            @relation("sessao_abertura", fields: [codusur_abertura], references: [codusur])
  usuario_fechamento msusuario?           @relation("sessao_fechamento", fields: [codusur_fechamento], references: [codusur])
  movimentos         mscaixa_movimento[]
}

model mscaixa_movimento {
  codmovimento       Int       @id @default(autoincrement())
  codsessao          Int
  codusur            Int
  data_movimento     DateTime  @default(now()) @db.DateTime(0)
  tipo               String    @db.VarChar(10) // ENTRADA, SAIDA
  categoria          String    @db.VarChar(50) // VENDA, SUPRIMENTO, SANGRIA, DESPESA
  valor              Decimal   @db.Decimal(12, 2)
  codplano_pagamento Int
  numpedido          Int?
  observacao         String?   @db.Text
  created_at         DateTime? @default(now()) @db.DateTime(0)

  sessao             mscaixa_sessao       @relation(fields: [codsessao], references: [codsessao])
  usuario            msusuario            @relation(fields: [codusur], references: [codusur])
  pedido             mspedido?            @relation(fields: [numpedido], references: [numpedido])
  plano_pagamento    MSPLANOPAGAMENTO     @relation(fields: [codplano_pagamento], references: [CODPLPAG])
}

model mspedido_pagamento {
  codpedpag          Int       @id @default(autoincrement())
  numpedido          Int
  codplano_pagamento Int
  valor              Decimal   @db.Decimal(12, 2)
  created_at         DateTime? @default(now()) @db.DateTime(0)

  pedido             mspedido             @relation(fields: [numpedido], references: [numpedido])
  plano_pagamento    MSPLANOPAGAMENTO     @relation(fields: [codplano_pagamento], references: [CODPLPAG])
}
`;

if (!schema.includes('model mscaixa {')) {
    schema += newModels;
}

fs.writeFileSync('C:/Users/matheus.miguel/Documents/Node_projetos/Projeto_Perfume/API/prisma/schema.prisma', schema);
console.log('Done!');

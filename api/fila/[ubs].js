/*
  PegaSenha - API de Filas por Unidade
  Arquivo: api/fila/[ubs].js
  Versão: 0.5.0
  Data: 18/11/2025
  Descrição:
    - Mantém a fila em memória por unidade (UBS, governo, comércio).
    - Suporta:
        • GET    /api/fila/{ubs}           → lista fila
        • POST   /api/fila/{ubs}           → cria nova senha
        • PATCH  /api/fila/{ubs}           → atualiza status de uma senha
    - Usa CONFIG_UNIDADES para segmentar:
        • segmento: "ubs" | "governo" | "comercial"
        • recursos: mesas, itens_pedido, multi_atendente, preferencial
        • regras_fila: prefixo, inicio_visivel, embaralhar_visivel
    - Integração:
        • Global store: global._pegasenhaStore = { filas: {}, mesas: {} }
        • Mesas são gerenciadas em api/mesas/[ubs].js.
*/

//
// 1. Configuração por unidade (UBS, governo, comércio)
//
const CONFIG_UNIDADES = {
  "pb-carolina": {
    nome: "UBS PB Carolina",
    segmento: "ubs",

    recursos: {
      mesas: false,
      itens_pedido: false,
      multi_atendente: false,
      preferencial: true,
    },

    regras_fila: {
      reset_diario: true,
      horario_reset: "18:00",
      prefixo: "A",
      inicio_visivel: 1,
      embaralhar_visivel: false,
    },
  },

  // Unidade comercial de teste (modo restaurante)
  "restaurante-teste": {
    nome: "Restaurante de Teste",
    segmento: "comercial",

    recursos: {
      mesas: true,           // usa filas para MESAS
      itens_pedido: false,   // itens de pedido ainda não ativados
      multi_atendente: true,
      preferencial: false,
    },

    regras_fila: {
      reset_diario: true,
      horario_reset: "23:59",
      prefixo: "R",
      inicio_visivel: 50,    // começa em R050
      embaralhar_visivel: false,
    },
  },
};

// Config padrão caso a unidade não esteja listada explicitamente
const CONFIG_PADRAO = {
  nome: "Unidade Padrão",
  segmento: "comercial",
  recursos: {
    mesas: false,
    itens_pedido: false,
    multi_atendente: false,
    preferencial: false,
  },
  regras_fila: {
    reset_diario: true,
    horario_reset: "18:00",
    prefixo: "A",
    inicio_visivel: 1,
    embaralhar_visivel: false,
  },
};

function getConfigUnidade(ubs) {
  return CONFIG_UNIDADES[ubs] || CONFIG_PADRAO;

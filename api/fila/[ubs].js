/*
  PegaSenha - API de Filas por Unidade
  Arquivo: api/fila/[ubs].js

  Versão: 0.6.0
  Data: 19/11/2025

  Histórico de versões (resumo):
  - 0.4.x / 0.5.x – Estrutura básica de filas por unidade (UBS, governo, comércio),
    suporte a status, tipo_senha, qtd_pessoas, mesas, etc.
  - 0.6.0 – Ajuste no formato do número visível da senha para modo restaurante:
    • Senha simples (sem mesa): RNNN (ex.: R035)
    • Senha com mesa (qtd_pessoas > 0): {lugares}RNNN (ex.: 4R052)

  Descrição:
    - Mantém a fila em memória por unidade (UBS, governo, comércio).
    - Endpoints:
        • GET    /api/fila/{ubs}           → lista fila
        • POST   /api/fila/{ubs}           → cria nova senha
        • PATCH  /api/fila/{ubs}           → atualiza status de uma senha
    - Usa CONFIG_UNIDADES para segmentar:
        • segmento: "ubs" | "governo" | "comercial"
        • recursos: mesas, itens_pedido, multi_atendente, preferencial
        • regras_fila: prefixo, inicio_visivel, embaralhar_visivel
    - Integra:
        • global._pegasenhaStore = { filas: {}, mesas: {} }
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
}

//
// 2. Store global em memória: { filas: { [ubs]: {...} }, mesas: { [ubs]: {...} } }
//
function getStore() {
  if (!global._pegasenhaStore) {
    global._pegasenhaStore = {
      filas: {},
      mesas: {},
    };
  } else {
    if (!global._pegasenhaStore.filas) {
      global._pegasenhaStore.filas = {};
    }
    if (!global._pegasenhaStore.mesas) {
      global._pegasenhaStore.mesas = {};
    }
  }
  return global._pegasenhaStore;
}

//
// 3. Garante que a fila de uma unidade exista
//
function ensureFila(ubs) {
  const store = getStore();
  if (!store.filas[ubs]) {
    store.filas[ubs] = {
      contador: 0,
      senhas: [],
      ultimasChamadas: [],
    };
  }
  return store.filas[ubs];
}

//
// 4. Gera o número visível (A001, R050, 4R052 etc.)
//    Regra confirmada pelo Paulo:
//    - Senha simples (sem mesa): RNNN (ex.: R035)
//    - Senha com mesa (qtd_pessoas > 0 em unidade comercial com mesas): {lugares}RNNN (ex.: 4R052)
//
function gerarNumeroVisivel(ubs, contadorInterno, qtdPessoas) {
  const cfg = getConfigUnidade(ubs);
  const regras = cfg.regras_fila || {};
  const recursos = cfg.recursos || {};

  const prefixo = regras.prefixo || "A";
  const inicio =
    typeof regras.inicio_visivel === "number" ? regras.inicio_visivel : 1;

  // Offset simples → número sequencial
  const numeroBase = inicio + contadorInterno - 1;
  const numeroSequencial = String(numeroBase).padStart(3, "0");

  // Verifica se esta unidade é "comercial" com mesas ativas
  const podeUsarMesa =
    cfg.segmento === "comercial" &&
    recursos.mesas === true &&
    typeof qtdPessoas === "number" &&
    qtdPessoas > 0;

  // Se for mesa (qtd_pessoas > 0): {lugares}{prefixo}{NNN}, ex.: 4R052

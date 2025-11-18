/*
  PegaSenha - API de Filas por Unidade
  Arquivo: api/fila/[ubs].js
  Versão: 0.3.1
  Data: 18/11/2025
  Descrição:
    - Mantém a fila em memória por unidade (UBS, governo, comércio).
    - Suporta:
        • GET  /api/fila/{ubs} → lista fila
        • POST /api/fila/{ubs} → cria nova senha
    - CONFIG_UNIDADES:
        • segmento: "ubs" | "governo" | "comercial"
        • recursos: mesas, itens_pedido, multi_atendente, preferencial
        • regras_fila: prefixo, inicio_visivel, embaralhar_visivel, reset (futuro)
    - Nesta versão:
        • Unidade comercial de teste "restaurante-teste" com prefixo R e início 50.
        • POST aceita e armazena campos opcionais de mesa:
          tipo_senha, qtd_pessoas, mesas_solicitadas, mesa_atribuida.
        • PB Carolina permanece com comportamento idêntico (A001, A002...).
*/

//
// 1. Configuração por unidade (UBS, governo, comércio)
//
const CONFIG_UNIDADES = {
  "pb-carolina": {
    nome: "UBS PB Carolina",
    segmento: "ubs", // "ubs" | "governo" | "comercial"

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

  // Unidade comercial de teste (para futura evolução do modo "comércio")
  "restaurante-teste": {
    nome: "Restaurante de Teste",
    segmento: "comercial",

    recursos: {
      mesas: true,           // esta unidade usa filas para MESAS
      itens_pedido: false,   // itens de pedido ainda não ativados
      multi_atendente: true,
      preferencial: false,
    },

    regras_fila: {
      reset_diario: true,
      horario_reset: "23:59",
      prefixo: "R",
      inicio_visivel: 50,    // deve começar em R050
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
// 2. Armazena estado global em memória da função serverless
//
function getStore() {
  if (!global._pegasenhaStore) {
    global._pegasenhaStore = {
      filas: {}, // { [ubs]: { contador: number, senhas: [], ultimasChamadas: [] } }
    };
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
// 4. Gera o número visível (A001, R050 etc.) baseado na config da unidade
//
function gerarNumeroVisivel(ubs, contadorInterno) {
  const cfg = getConfigUnidade(ubs);
  const regras = cfg.regras_fila || {};

  const prefixo = regras.prefixo || "A";
  const inicio =
    typeof regras.inicio_visivel === "number" ? regras.inicio_visivel : 1;

  // Offset simples → número visível != id interno
  const numeroBase = inicio + contadorInterno - 1;

  // Futuro: se regras.embaralhar_visivel === true, aplicar algoritmo de embaralhamento
  const numeroVisivel = numeroBase;

  return prefixo + String(numeroVisivel).padStart(3, "0");
}

//
// 5. Calcula estatísticas simples da fila
//
function calcularStats(senhas) {
  const stats = {
    total: senhas.length,
    aguardando: 0,
    atendidas: 0,
    ausentes: 0,
  };

  for (const s of senhas) {
    if (s.status === "aguardando") stats.aguardando++;
    else if (s.status === "atendida") stats.atendidas++;
    else if (s.status === "ausente") stats.ausentes++;
  }

  return stats;
}

//
// 6. Handler principal (GET lista fila, POST cria senha)
//
export default function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { ubs } = req.query;

  if (!ubs) {
    return res
      .status(400)
      .json({ ok: false, mensagem: "Parâmetro 'ubs' é obrigatório" });
  }

  const fila = ensureFila(ubs);
  const cfg = getConfigUnidade(ubs);
  const recursos = cfg.recursos || {};

  //
  // GET → retorna situação atual da fila
  //
  if (req.method === "GET") {
    const stats = calcularStats(fila.senhas);

    return res.status(200).json({
      ok: true,
      ubs,
      fila: fila.senhas,
      stats,
      ultimas_chamadas: fila.ultimasChamadas,
    });
  }

  //
  // POST → cria nova senha
  //
  if (req.method === "POST") {
    let body = {};
    try {
      body = req.body || {};
      if (typeof body === "string") {
        body = JSON.parse(body);
      }
    } catch (e) {
      body = {};
    }

    const servicoNome = body.servico_nome || "Atendimento Geral";
    const preferencial = !!body.preferencial;

    // Campos comerciais opcionais (por enquanto só armazenados)
    const tipoSenhaBody = body.tipo_senha || null;
    const qtdPessoasBody =
      typeof body.qtd_pessoas === "number" ? body.qtd_pessoas : null;
    const mesasSolicitadasBody = Array.isArray(body.mesas_solicitadas)
      ? body.mesas_solicitadas
      : null;

    // Definição inicial de tipo_senha:
    // - se unidade comercial com mesas ativadas e qtd_pessoas presente → "mesa"
    // - caso contrário, usa valor enviado ou "simples"
    let tipoSenha = tipoSenhaBody;
    if (!tipoSenha) {
      if (cfg.segmento === "comercial" && recursos.mesas && qtdPessoasBody) {
        tipoSenha = "mesa";
      } else {
        tipoSenha = "simples";
      }
    }

    // Incrementa contador interno
    fila.contador += 1;
    const idInterno = fila.contador;

    // Gera número visível baseado nas regras da unidade
    const numero = gerarNumeroVisivel(ubs, idInterno);
    const agora = new Date();

    const novaSenha = {
      id: String(idInterno),
      id_interno: idInterno,
      numero,
      servico_nome: servicoNome,
      status: "aguardando",
      preferencial,
      criado_em: agora.toISOString(),

      // Campos extras para modo comercial (usados apenas se unidade exigir)
      tipo_senha: tipoSenha,
      qtd_pessoas: qtdPessoasBody,
      mesas_solicitadas: mesasSolicitadasBody,
      mesa_atribuida: null, // será preenchido futuramente pelo host/garçom
    };

    fila.senhas.push(novaSenha);

    const stats = calcularStats(fila.senhas);

    return res.status(201).json({
      ok: true,
      mensagem: "Senha criada com sucesso",
      ubs,
      senha: novaSenha,
      stats,
    });
  }

  //
  // Demais métodos não são permitidos por enquanto
  //
  return res
    .status(405)
    .json({ ok: false, mensagem: "Método não permitido" });
}

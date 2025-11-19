/*
  PegaSenha - API de Filas por Unidade
  Arquivo: api/fila/[ubs].js

  Versão: 0.6.1
  Data: 19/11/2025

  Histórico de versões (resumo):
  - 0.4.x / 0.5.x – Estrutura básica de filas por unidade (UBS, governo, comércio),
    suporte a status, tipo_senha, qtd_pessoas, etc.
  - 0.6.0 – Tentativa de refatoração maior (incluindo PATCH e store separado).
  - 0.6.1 – Retorno à estrutura simplificada e estável (GET/POST), mantendo:
      • Formato do número visível:
          - Senha simples (sem mesa): RNNN (ex.: R035)
          - Senha com mesa (qtd_pessoas > 0 em unidade restaurante): {lugares}RNNN (ex.: 4R052)
*/

function getStore() {
  // Usamos uma variável global em memória para guardar as filas e config
  if (!global._pegasenhaStore) {
    global._pegasenhaStore = {
      filas: {}, // { [ubs]: { contador: number, senhas: [], ultimasChamadas: [] } }
      configPorUnidade: {
        // UBS / órgãos públicos
        "pb-carolina": {
          prefixo: "A",
          inicio_visivel: 1,
          embaralhar_visivel: false,
          segmento: "ubs",
          recursos: {
            mesas: false,
            preferencial: true,
          },
        },

        // Unidade comercial de teste (restaurante)
        "restaurante-teste": {
          prefixo: "R",
          inicio_visivel: 50,   // começa do 50 (R050)
          embaralhar_visivel: false,
          segmento: "comercial",
          recursos: {
            mesas: true,        // usa mesas
            preferencial: false,
          },
        },
      },
    };
  }
  return global._pegasenhaStore;
}

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

// Gera o número visível da senha
// Regra confirmada:
// - Senha simples (sem mesa): RNNN (ex.: R035)
// - Senha com mesa (qtd_pessoas > 0 em unidade comercial com mesas): {lugares}RNNN (ex.: 4R052)
function gerarNumeroVisivel(ubs, contadorInterno, qtdPessoas) {
  const store = getStore();
  const cfgBase = store.configPorUnidade[ubs] || {
    prefixo: "A",
    inicio_visivel: 1,
    embaralhar_visivel: false,
    segmento: "comercial",
    recursos: { mesas: false },
  };

  const prefixo = cfgBase.prefixo || "A";
  const inicio = cfgBase.inicio_visivel || 1;

  const numeroBase = inicio + contadorInterno - 1;
  const numeroSequencial = String(numeroBase).padStart(3, "0");

  const recursos = cfgBase.recursos || {};
  const segmento = cfgBase.segmento || "comercial";

  const podeUsarMesa =
    segmento === "comercial" &&
    recursos.mesas === true &&
    typeof qtdPessoas === "number" &&
    qtdPessoas > 0;

  if (podeUsarMesa) {
    // Ex.: 4R052
    return String(qtdPessoas) + prefixo + numeroSequencial;
  }

  // Simples: ex.: R035
  return prefixo + numeroSequencial;
}

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

export default function handler(req, res) {
  // CORS básico
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

  // GET: retorna a fila atual
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

  // POST: cria nova senha
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

    // Campos comerciais opcionais
    const qtdPessoasBody =
      typeof body.qtd_pessoas === "number" ? body.qtd_pessoas : null;

    // tipo_senha:
    // - se qtd_pessoas > 0 em unidade restaurante → "mesa"
    // - senão → "simples"
    const store = getStore();
    const cfgBase = store.configPorUnidade[ubs] || {};
    const recursos = cfgBase.recursos || {};
    const segmento = cfgBase.segmento || "comercial";

    let tipoSenha = "simples";
    if (
      segmento === "comercial" &&
      recursos.mesas === true &&
      typeof qtdPessoasBody === "number" &&
      qtdPessoasBody > 0
    ) {
      tipoSenha = "mesa";
    }

    // Incrementa contador interno
    fila.contador += 1;
    const idInterno = fila.contador;

    // Número visível com a nova regra
    const numero = gerarNumeroVisivel(ubs, idInterno, qtdPessoasBody);
    const agora = new Date();

    const novaSenha = {
      id: String(idInterno),
      id_interno: idInterno,
      numero,
      servico_nome: servicoNome,
      status: "aguardando",
      preferencial,
      criado_em: agora.toISOString(),

      tipo_senha: tipoSenha,
      qtd_pessoas: qtdPessoasBody,
      mesas_solicitadas: null,
      mesa_atribuida: null,
      observacao_cliente: null,
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

  // Outros métodos não permitidos neste momento
  return res
    .status(405)
    .json({ ok: false, mensagem: "Método não permitido" });
}

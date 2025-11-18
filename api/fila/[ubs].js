/*
  PegaSenha - API de Filas por Unidade
  Arquivo: api/fila/[ubs].js
  Versão: 0.1.0
  Data: 16/11/2025
  Descrição:
    - Implementa a fila em memória por unidade (UBS ou comércio).
    - Suporta:
        • GET  /api/fila/{ubs} → lista fila
        • POST /api/fila/{ubs} → cria nova senha
    - Configuração por unidade: prefixo, início visível e opção futura de embaralhamento.
    - Mantém contador interno e número visível (com offset configurável).
    - Estatísticas calculadas dinamicamente.
    - Suporte a CORS.
*/

//
// 1. Armazena estado global em memória da função serverless
//
function getStore() {
  if (!global._pegasenhaStore) {
    global._pegasenhaStore = {
      filas: {}, // { [ubs]: { contador: number, senhas: [], ultimasChamadas: [] } }

      // Configuração específica por unidade
      configPorUnidade: {
        // UBS (padrão) → numeração começa limpa (A001, A002…)
        "pb-carolina": {
          prefixo: "A",
          inicio_visivel: 1,
          embaralhar_visivel: false,
        },

        // Exemplo futuro para comércio (mantido apenas como referência)
        "praca-exemplo": {
          prefixo: "B",
          inicio_visivel: 50,    // Exemplo: começa em B050
          embaralhar_visivel: true, // Embaralhar será tratado futuramente
        },
      },
    };
  }
  return global._pegasenhaStore;
}

//
// 2. Garante que a fila de uma unidade exista
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
// 3. Gera o número visível (A001, A051 etc.) baseado na config da unidade
//
function gerarNumeroVisivel(ubs, contadorInterno) {
  const store = getStore();
  const cfgBase = store.configPorUnidade[ubs] || {
    prefixo: "A",
    inicio_visivel: 1,
    embaralhar_visivel: false,
  };

  const prefixo = cfgBase.prefixo || "A";
  const inicio = cfgBase.inicio_visivel || 1;

  // Offset simples → número visível != id interno
  const numeroBase = inicio + contadorInterno - 1;

  // Futuro: se embaralhar_visivel=true, aplicar algoritmo de embaralhamento
  const numeroVisivel = numeroBase;

  return prefixo + String(numeroVisivel).padStart(3, "0");
}

//
// 4. Calcula estatísticas simples da fila
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
// 5. Handler principal (GET lista fila, POST cria senha)
//
export default function handler(req, res) {
  // Permite acesso de qualquer origem (importante para o front)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Pré-flight request (CORS)
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

    // Incrementa contador interno
    fila.contador += 1;
    const idInterno = fila.contador;

    // Gera número visível (A001, B050...)
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

// api/fila/[ubs].js
// GET /api/fila/{ubs} → lista fila
// POST /api/fila/{ubs} → cria nova senha

function getStore() {
  // Usamos uma variável global em memória para guardar as filas
  if (!global._pegasenhaStore) {
    global._pegasenhaStore = {
      filas: {}, // { [ubs]: { contador: number, senhas: [], ultimasChamadas: [] } }
      configPorUnidade: {
        // UBS / órgão público → começa do 1, padrão "limpo"
        "pb-carolina": {
          prefixo: "A",
          inicio_visivel: 1,
          embaralhar_visivel: false,
        },

        // EXEMPLO: comércio/praça de alimentação (pode editar/apagar)
        // Aqui a unidade pode querer "começar do 50" para não ficar óbvio o volume
        "praca-exemplo": {
          prefixo: "B",
          inicio_visivel: 50,   // começa mostrando B050
          embaralhar_visivel: true, // reservado pra futura lógica de embaralhar
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

function gerarNumeroVisivel(ubs, contadorInterno) {
  const store = getStore();
  const cfgBase = store.configPorUnidade[ubs] || {
    prefixo: "A",
    inicio_visivel: 1,
    embaralhar_visivel: false,
  };

  const prefixo = cfgBase.prefixo || "A";
  const inicio = cfgBase.inicio_visivel || 1;

  // Aqui entra o "offset": número visível ≠ contador interno
  const numeroBase = inicio + contadorInterno - 1;

  // Futuro: se embaralhar_visivel === true, podemos aplicar mais lógica aqui
  const numeroVisivel = numeroBase;

  return prefixo + String(numeroVisivel).padStart(3, "0");
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

  // 👉 GET: apenas lista a fila
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

  // 👉 POST: cria nova senha
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

    // aumenta o contador interno da unidade
    fila.contador += 1;
    const idInterno = fila.contador;

    // gera o número visível conforme config da unidade
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

  // Qualquer outro método não é permitido
  return res
    .status(405)
    .json({ ok: false, mensagem: "Método não permitido" });
}

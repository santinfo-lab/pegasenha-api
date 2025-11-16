// api/fila/[ubs].js

// Configuração por unidade (UBS, comércio, etc.)
// Aqui definimos o "offset" do número visível da senha.
const CONFIG_UBS = {
  "pb-carolina": { offsetNumero: 0 }, // UBS pública -> numeração normal A001, A002...
  // Exemplo futuro (não usado agora):
  // "lanchonete-x": { offsetNumero: 50 }, // 1ª senha visível: A051
};

// Estado em memória, compartilhado entre chamadas (enquanto a função estiver viva)
function getEstadoFila(ubs) {
  if (!globalThis._pegasenhaFilas) {
    globalThis._pegasenhaFilas = {};
  }

  if (!globalThis._pegasenhaFilas[ubs]) {
    globalThis._pegasenhaFilas[ubs] = {
      proximoIdInterno: 1,
      fila: [],
      stats: {
        total: 0,
        aguardando: 0,
        atendidas: 0,
        ausentes: 0,
      },
      ultimas_chamadas: [],
    };
  }

  return globalThis._pegasenhaFilas[ubs];
}

export default function handler(req, res) {
  const { method, query } = req;
  const ubs = query.ubs; // vindo da rota /api/fila/[ubs]

  if (!ubs) {
    return res.status(400).json({
      ok: false,
      mensagem: "UBS não informada na rota.",
    });
  }

  const estado = getEstadoFila(ubs);
  const configUBS = CONFIG_UBS[ubs] || { offsetNumero: 0 };
  const offsetNumero = Number(configUBS.offsetNumero || 0);

  // -------------------------------------------------------------------
  // GET /api/fila/[ubs]  -> retorna situação atual da fila
  // -------------------------------------------------------------------
  if (method === "GET") {
    return res.status(200).json({
      ok: true,
      ubs,
      fila: estado.fila,
      stats: estado.stats,
      ultimas_chamadas: estado.ultimas_chamadas,
    });
  }

  // -------------------------------------------------------------------
  // POST /api/fila/[ubs] -> cria nova senha (simples, para teste)
  // -------------------------------------------------------------------
  if (method === "POST") {
    // No futuro podemos receber servico_nome, preferencial, etc. do body.
    // Por enquanto, mantém fixo "Atendimento Geral", preferencial false.
    const servicoNome =
      (req.body && req.body.servico_nome) || "Atendimento Geral";
    const preferencial =
      req.body && typeof req.body.preferencial !== "undefined"
        ? !!req.body.preferencial
        : false;

    const idInterno = estado.proximoIdInterno++;

    // AQUI entra a lógica do offset:
    const valorVisivel = offsetNumero + idInterno; // ex.: 0 + 1 = 1  -> A001
    const numeroVisivel = "A" + String(valorVisivel).padStart(3, "0");

    const agora = new Date().toISOString();

    const senha = {
      id: String(idInterno), // id externo em string
      id_interno: idInterno,
      numero: numeroVisivel,
      servico_nome: servicoNome,
      status: "aguardando",
      preferencial,
      criado_em: agora,
    };

    estado.fila.push(senha);

    // Atualiza estatísticas simples
    estado.stats.total++;
    estado.stats.aguardando++;

    return res.status(201).json({
      ok: true,
      mensagem: "Senha criada com sucesso",
      ubs,
      senha,
      stats: estado.stats,
    });
  }

  // -------------------------------------------------------------------
  // Outros métodos não suportados por enquanto
  // -------------------------------------------------------------------
  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({
    ok: false,
    mensagem: `Método ${method} não suportado nesta rota.`,
  });
}

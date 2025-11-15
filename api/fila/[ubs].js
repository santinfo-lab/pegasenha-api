// api/fila/[ubs].js

// "Banco" em memória por UBS (para testes)
const filas = {};

// Cria (se não existir) a estrutura da UBS
function getFila(ubs) {
  if (!filas[ubs]) {
    const fila = {
      ubs,
      tickets: [],
      ultimasChamadas: [],
      contador: 0,
    };

    // Seed de teste: 3 senhas aguardando
    for (let i = 1; i <= 3; i++) {
      fila.contador++;
      fila.tickets.push({
        id: String(fila.contador),
        numero: `A${String(i).padStart(3, "0")}`,
        servico_nome: "Atendimento Geral",
        status: "aguardando", // aguardando | em_atendimento | espera | atendida | ausente
        preferencial: false,
        criado_em: new Date().toISOString(),
      });
    }

    filas[ubs] = fila;
  }
  return filas[ubs];
}

function calcularStats(fila) {
  const stats = {
    total: fila.tickets.length,
    aguardando: 0,
    atendidas: 0,
    ausentes: 0,
  };

  fila.tickets.forEach((t) => {
    if (t.status === "aguardando" || t.status === "em_atendimento" || t.status === "espera") {
      stats.aguardando++;
    } else if (t.status === "atendida") {
      stats.atendidas++;
    } else if (t.status === "ausente") {
      stats.ausentes++;
    }
  });

  return stats;
}

function registrarUltima(fila, ticket, tipo) {
  const agora = new Date();
  fila.ultimasChamadas.unshift({
    numero: ticket.numero,
    servico_nome: ticket.servico_nome || "",
    hora: agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    tipo, // "Chamada", "Atendida", "Ausente", "Espera", "Retomada"
  });
  fila.ultimasChamadas = fila.ultimasChamadas.slice(0, 10);
}

export default function handler(req, res) {
  const { ubs } = req.query;
  const url = new URL(req.url, "http://localhost");
  const acao = url.searchParams.get("acao") || null;
  const ticketId = url.searchParams.get("id") || null;

  if (!ubs) {
    return res.status(400).json({
      ok: false,
      mensagem: "UBS não informada.",
    });
  }

  const fila = getFila(ubs);

  // GET /api/fila/:ubs  -> painel carrega listagem
  if (req.method === "GET") {
    const stats = calcularStats(fila);
    return res.status(200).json({
      ok: true,
      ubs,
      fila: fila.tickets,
      stats,
      ultimas_chamadas: fila.ultimasChamadas,
    });
  }

  // A partir daqui: POST com ações
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      mensagem: "Método não permitido. Use GET ou POST.",
    });
  }

  // POST /api/fila/:ubs?acao=chamar-proximo
  if (acao === "chamar-proximo") {
    const proximo = fila.tickets.find(
      (t) => t.status === "aguardando" || t.status === "espera"
    );

    if (!proximo) {
      return res.status(400).json({
        ok: false,
        mensagem: "Nenhuma senha aguardando ou em espera.",
      });
    }

    proximo.status = "em_atendimento";
    registrarUltima(fila, proximo, "Chamada");

    return res.status(200).json({
      ok: true,
      mensagem: "Próxima senha chamada.",
      ticket: proximo,
    });
  }

  // Ações que precisam de ticketId
  const ticket = fila.tickets.find((t) => t.id === ticketId);

  if (!ticket) {
    return res.status(404).json({
      ok: false,
      mensagem: "Ticket não encontrado.",
    });
  }

  // POST /api/fila/:ubs?acao=chamar&id=...
  if (acao === "chamar") {
    if (ticket.status === "atendida" || ticket.status === "ausente") {
      return res.status(400).json({
        ok: false,
        mensagem: "Não é possível chamar um ticket já finalizado.",
      });
    }
    ticket.status = "em_atendimento";
    registrarUltima(fila, ticket, "Chamada");
    return res.status(200).json({
      ok: true,
      mensagem: "Senha chamada.",
      ticket,
    });
  }

  // POST /api/fila/:ubs?acao=atendida&id=...
  if (acao === "atendida") {
    ticket.status = "atendida";
    registrarUltima(fila, ticket, "Atendida");
    return res.status(200).json({
      ok: true,
      mensagem: "Senha marcada como atendida.",
      ticket,
    });
  }

  // POST /api/fila/:ubs?acao=ausente&id=...
  if (acao === "ausente") {
    ticket.status = "ausente";
    registrarUltima(fila, ticket, "Ausente");
    return res.status(200).json({
      ok: true,
      mensagem: "Senha marcada como ausente.",
      ticket,
    });
  }

  // POST /api/fila/:ubs?acao=espera&id=...
  if (acao === "espera") {
    ticket.status = "espera";
    registrarUltima(fila, ticket, "Espera");
    return res.status(200).json({
      ok: true,
      mensagem: "Senha colocada em espera.",
      ticket,
    });
  }

  // POST /api/fila/:ubs?acao=retornar&id=...
  if (acao === "retornar") {
    ticket.status = "em_atendimento";
    registrarUltima(fila, ticket, "Retomada");
    return res.status(200).json({
      ok: true,
      mensagem: "Senha retomada da espera.",
      ticket,
    });
  }

  return res.status(400).json({
    ok: false,
    mensagem: "Ação inválida ou não informada (?acao=...).",
  });
}

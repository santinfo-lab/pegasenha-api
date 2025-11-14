// "Banco de dados" em memória (para testes)
// Em produção real teremos banco externo, mas por enquanto serve bem.
const unidades = {};

// Gera um ID incremental por unidade
function gerarId(unidade) {
  unidade.contador = (unidade.contador || 0) + 1;
  return String(unidade.contador);
}

// Retorna (ou cria) a unidade pela slug
function getUnidade(slug) {
  if (!unidades[slug]) {
    const unidade = {
      slug,
      tickets: [],
      ultimasChamadas: [],
      contador: 0,
    };

    // 🔹 Seed de teste: cria 3 senhas aguardando
    for (let i = 1; i <= 3; i++) {
      const id = gerarId(unidade);
      unidade.tickets.push({
        id,
        numero: `A${String(i).padStart(3, "0")}`,
        servico_nome: "Atendimento Geral",
        status: "aguardando", // aguardando | em_atendimento | espera | atendida | ausente
        preferencial: false,
        criado_em: new Date().toISOString(),
      });
    }

    unidades[slug] = unidade;
  }
  return unidades[slug];
}

// Monta estatísticas da fila
function calcularStats(unidade) {
  const stats = {
    total: unidade.tickets.length,
    aguardando: 0,
    atendidas: 0,
    ausentes: 0,
  };

  unidade.tickets.forEach((t) => {
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

// Registra entrada em "últimas chamadas"
function registrarUltima(unidade, ticket, tipo) {
  const agora = new Date();
  unidade.ultimasChamadas.unshift({
    numero: ticket.numero,
    servico_nome: ticket.servico_nome || "",
    hora: agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    tipo, // "Chamada", "Atendida", "Ausente", "Espera", "Retomada"
  });

  // Mantém só as 10 últimas
  unidade.ultimasChamadas = unidade.ultimasChamadas.slice(0, 10);
}

export default async function handler(req, res) {
  try {
    // Parse básico da URL para pegar querystring
    const url = new URL(req.url, "http://localhost");
    const slug = url.searchParams.get("slug");
    const acao = url.searchParams.get("acao");
    const ticketId = url.searchParams.get("id");

    if (!slug) {
      return res.status(400).json({
        ok: false,
        mensagem: "Parâmetro 'slug' obrigatório (?slug=pb-carolina).",
      });
    }

    const unidade = getUnidade(slug);

    // 🔹 GET /api/filas?slug=pb-carolina
    if (req.method === "GET") {
      const stats = calcularStats(unidade);
      return res.status(200).json({
        ok: true,
        unidade: slug,
        fila: unidade.tickets,
        stats,
        ultimas_chamadas: unidade.ultimasChamadas,
      });
    }

    // A partir daqui, só POST (ações)
    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        mensagem: "Método não permitido. Use GET ou POST.",
      });
    }

    // 🔹 POST /api/filas?slug=...&acao=chamar-proximo
    if (acao === "chamar-proximo") {
      const proximo = unidade.tickets.find(
        (t) => t.status === "aguardando" || t.status === "espera"
      );

      if (!proximo) {
        return res.status(400).json({
          ok: false,
          mensagem: "Nenhuma senha aguardando ou em espera.",
        });
      }

      proximo.status = "em_atendimento";
      registrarUltima(unidade, proximo, "Chamada");

      return res.status(200).json({
        ok: true,
        mensagem: "Próxima senha chamada.",
        ticket: proximo,
      });
    }

    // Ações que exigem ticketId
    const ticket = unidade.tickets.find((t) => t.id === ticketId);

    if (!ticket) {
      return res.status(404).json({
        ok: false,
        mensagem: "Ticket não encontrado.",
      });
    }

    // 🔹 POST /api/filas?slug=...&acao=chamar&id=...
    if (acao === "chamar") {
      if (ticket.status === "atendida" || ticket.status === "ausente") {
        return res.status(400).json({
          ok: false,
          mensagem: "Não é possível chamar um ticket já finalizado.",
        });
      }
      ticket.status = "em_atendimento";
      registrarUltima(unidade, ticket, "Chamada");
      return res.status(200).json({
        ok: true,
        mensagem: "Senha chamada.",
        ticket,
      });
    }

    // 🔹 POST /api/filas?slug=...&acao=atendida&id=...
    if (acao === "atendida") {
      ticket.status = "atendida";
      registrarUltima(unidade, ticket, "Atendida");
      return res.status(200).json({
        ok: true,
        mensagem: "Senha marcada como atendida.",
        ticket,
      });
    }

    // 🔹 POST /api/filas?slug=...&acao=ausente&id=...
    if (acao === "ausente") {
      ticket.status = "ausente";
      registrarUltima(unidade, ticket, "Ausente");
      return res.status(200).json({
        ok: true,
        mensagem: "Senha marcada como ausente.",
        ticket,
      });
    }

    // 🔹 POST /api/filas?slug=...&acao=espera&id=...
    if (acao === "espera") {
      ticket.status = "espera";
      registrarUltima(unidade, ticket, "Espera");
      return res.status(200).json({
        ok: true,
        mensagem: "Senha colocada em espera.",
        ticket,
      });
    }

    // 🔹 POST /api/filas?slug=...&acao=retornar&id=...
    if (acao === "retornar") {
      ticket.status = "em_atendimento";
      registrarUltima(unidade, ticket, "Retomada");
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
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      ok: false,
      mensagem: "Erro interno na API de filas.",
    });
  }
}

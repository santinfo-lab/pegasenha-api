// "Banco de dados" em memória (só para demo)
// Em ambiente serverless pode zerar às vezes, mas serve bem para testes.
const unidades = {};

// Gera um ID simples
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

    // 🔹 SEED automático APENAS para testes:
    // cria 3 senhas aguardando assim que a unidade é usada pela 1ª vez.
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

// Registra uma entrada em "últimas chamadas"
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

function handleFilas(req, res, partes) {
  const metodo = req.method;
  const unidadeSlug = partes[0];

  if (!unidadeSlug) {
    return res.status(400).json({
      ok: false,
      mensagem: "Informe a unidade na URL: /api/filas/{slug}",
    });
  }

  const unidade = getUnidade(unidadeSlug);

  // GET /api/filas/{slug}
  if (metodo === "GET" && partes.length === 1) {
    const stats = calcularStats(unidade);

    return res.status(200).json({
      ok: true,
      unidade: unidadeSlug,
      fila: unidade.tickets,
      stats,
      ultimas_chamadas: unidade.ultimasChamadas,
    });
  }

  // POST /api/filas/{slug}/chamar-proximo
  if (metodo === "POST" && partes[1] === "chamar-proximo") {
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

  // Demais ações em tickets:
  // POST /api/filas/{slug}/tickets/{id}/{acao}
  if (metodo === "POST" && partes[1] === "tickets") {
    const ticketId = partes[2];
    const acao = partes[3]; // chamar | atendida | ausente | espera | retornar

    const ticket = unidade.tickets.find((t) => t.id === ticketId);

    if (!ticket) {
      return res.status(404).json({
        ok: false,
        mensagem: "Ticket não encontrado.",
      });
    }

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

    if (acao === "atendida") {
      ticket.status = "atendida";
      registrarUltima(unidade, ticket, "Atendida");
      return res.status(200).json({
        ok: true,
        mensagem: "Senha marcada como atendida.",
        ticket,
      });
    }

    if (acao === "ausente") {
      ticket.status = "ausente";
      registrarUltima(unidade, ticket, "Ausente");
      return res.status(200).json({
        ok: true,
        mensagem: "Senha marcada como ausente.",
        ticket,
      });
    }

    if (acao === "espera") {
      ticket.status = "espera";
      registrarUltima(unidade, ticket, "Espera");
      return res.status(200).json({
        ok: true,
        mensagem: "Senha colocada em espera.",
        ticket,
      });
    }

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
      mensagem: "Ação inválida para o ticket.",
    });
  }

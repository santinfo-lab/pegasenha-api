// API PegaSenha - simples, em memória, com CORS liberado
// Arquivo: api/[...slug].js

let nextTicketId = 1;

// locais cadastrados (por enquanto só Carolina Ramos)
const locais = {
  "pb-carolina": {
    slug: "pb-carolina",
    nome: "UBS Carolina Ramos (Perequê)",
    servicos: [
      { id: "clinica", nome: "Atendimento clínico geral" },
      { id: "enfermagem", nome: "Procedimentos de enfermagem" },
      { id: "farmacia", nome: "Farmácia / renovação de receita" }
    ]
  }
};

// filas em memória
const filas = {};

function getFila(slugLocal) {
  if (!filas[slugLocal]) {
    filas[slugLocal] = {
      lastNumero: 0,
      tickets: [],
      ultimasChamadas: [] // { numero, servico_nome, hora, tipo }
    };
  }
  return filas[slugLocal];
}

function agoraHora() {
  const d = new Date();
  return d.toTimeString().slice(0, 5); // HH:MM
}

function addUltimaChamada(fila, ticket, tipo) {
  fila.ultimasChamadas.push({
    numero: ticket.numero,
    servico_nome: ticket.servico_nome || "",
    hora: agoraHora(),
    tipo
  });
  if (fila.ultimasChamadas.length > 20) {
    fila.ultimasChamadas.shift();
  }
}

function countByStatus(tickets, status) {
  return tickets.filter(t => t.status === status).length;
}

function buildStats(fila) {
  const t = fila.tickets;
  return {
    total: t.length,
    aguardando: countByStatus(t, "aguardando"),
    em_atendimento: countByStatus(t, "em_atendimento"),
    espera: countByStatus(t, "espera"),
    atendidas: countByStatus(t, "atendida"),
    ausentes: countByStatus(t, "ausente")
  };
}

function sendJson(res, statusCode, data) {
  res.status(statusCode);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.json(data);
}

export default function handler(req, res) {
  // CORS pré-flight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  const slugArr = Array.isArray(req.query.slug)
    ? req.query.slug
    : (req.query.slug ? [req.query.slug] : []);

  // Rota raiz: /api
  if (slugArr.length === 0) {
    return sendJson(res, 200, {
      ok: true,
      mensagem: "PegaSenha API ativa"
    });
  }

  const [resource, ...rest] = slugArr;

  // -------- LOCAIS --------
  if (resource === "locais") {
    if (req.method === "GET" && rest.length === 1) {
      const slugLocal = rest[0];
      const local = locais[slugLocal];
      if (!local) {
        return sendJson(res, 404, { erro: "Local não encontrado" });
      }
      return sendJson(res, 200, local);
    }
    return sendJson(res, 404, { erro: "Rota de locais não encontrada" });
  }

  // -------- FILAS --------
  if (resource === "filas") {
    const slugLocal = rest[0];
    if (!slugLocal) {
      return sendJson(res, 400, { erro: "Local da fila não informado" });
    }
    const local = locais[slugLocal];
    if (!local) {
      return sendJson(res, 404, { erro: "Local não encontrado" });
    }
    const fila = getFila(slugLocal);

    // GET /api/filas/:local  -> retorna fila + stats
    if (req.method === "GET" && rest.length === 1) {
      const ativos = fila.tickets.filter(
        t => t.status !== "atendida" && t.status !== "ausente"
      ).sort((a, b) => a.numero - b.numero);

      return sendJson(res, 200, {
        fila: ativos,
        stats: buildStats(fila),
        ultimas_chamadas: fila.ultimasChamadas.slice(-5).reverse()
      });
    }

    // POST /api/filas/:local/senha  -> gera nova senha
    if (req.method === "POST" && rest.length === 2 && rest[1] === "senha") {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
      }
      const { nome, telefone, servico_id, preferencial } = body || {};
      if (!nome || !telefone || !servico_id) {
        return sendJson(res, 400, { erro: "Dados incompletos para gerar senha" });
      }

      const servico = (local.servicos || []).find(s => s.id === servico_id);
      if (!servico) {
        return sendJson(res, 400, { erro: "Serviço inválido para este local" });
      }

      fila.lastNumero += 1;
      const ticket = {
        id: String(nextTicketId++),
        numero: fila.lastNumero,
        nome,
        telefone,
        servico_id,
        servico_nome: servico.nome,
        preferencial: !!preferencial,
        status: "aguardando", // aguardando | em_atendimento | espera | atendida | ausente
        criado_em: new Date().toISOString()
      };
      fila.tickets.push(ticket);

      return sendJson(res, 201, {
        mensagem: "Senha gerada com sucesso",
        id: ticket.id,
        senha: ticket.numero
      });
    }

    // POST /api/filas/:local/chamar-proximo
    if (req.method === "POST" && rest.length === 2 && rest[1] === "chamar-proximo") {
      // prioridade para preferenciais aguardando
      let proximo = fila.tickets.find(
        t => t.status === "aguardando" && t.preferencial
      );
      if (!proximo) {
        proximo = fila.tickets.find(t => t.status === "aguardando");
      }
      if (!proximo) {
        return sendJson(res, 400, { erro: "Nenhuma senha aguardando na fila" });
      }
      proximo.status = "em_atendimento";
      proximo.ultima_chamada = new Date().toISOString();
      addUltimaChamada(fila, proximo, "automático");

      return sendJson(res, 200, {
        mensagem: "Senha chamada",
        ticket: proximo
      });
    }

    // POST /api/filas/:local/tickets/:id/:acao
    if (
      req.method === "POST" &&
      rest.length === 4 &&
      rest[1] === "tickets"
    ) {
      const ticketId = rest[2];
      const acao = rest[3]; // chamar | atendida | ausente | espera | retornar

      const ticket = fila.tickets.find(t => t.id === ticketId);
      if (!ticket) {
        return sendJson(res, 404, { erro: "Senha não encontrada na fila" });
      }

      if (acao === "chamar") {
        ticket.status = "em_atendimento";
        ticket.ultima_chamada = new Date().toISOString();
        addUltimaChamada(fila, ticket, "manual");
        return sendJson(res, 200, { mensagem: "Senha chamada", ticket });
      }

      if (acao === "atendida") {
        ticket.status = "atendida";
        ticket.concluida_em = new Date().toISOString();
        addUltimaChamada(fila, ticket, "atendida");
        return sendJson(res, 200, { mensagem: "Senha marcada como atendida", ticket });
      }

      if (acao === "ausente") {
        ticket.status = "ausente";
        ticket.concluida_em = new Date().toISOString();
        addUltimaChamada(fila, ticket, "ausente");
        return sendJson(res, 200, { mensagem: "Senha marcada como ausente", ticket });
      }

      if (acao === "espera") {
        ticket.status = "espera";
        addUltimaChamada(fila, ticket, "espera");
        return sendJson(res, 200, { mensagem: "Senha colocada em espera", ticket });
      }

      if (acao === "retornar") {
        ticket.status = "aguardando";
        addUltimaChamada(fila, ticket, "retorno_espera");
        return sendJson(res, 200, { mensagem: "Senha retornou da espera", ticket });
      }

      return sendJson(res, 400, { erro: "Ação inválida para a senha" });
    }

    return sendJson(res, 404, { erro: "Rota de filas não encontrada" });
  }

  // Se chegou aqui, não encontrou rota
  return sendJson(res, 404, { erro: "Rota não encontrada" });
}

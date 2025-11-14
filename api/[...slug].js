// api/[...slug].js
// API serverless do PegaSenha para Vercel

// ------------------- Dados em memória -------------------
const locais = [
  {
    id: "loc_pb_carolina",
    slug: "pb-carolina",
    nome: "UBS Carolina Ramos",
    tipo_local: "SUS",
    endereco: { cidade: "Porto Belo", uf: "SC" },
    status: "ativo",
    exibe_painel: true,
    permite_preferencial: true,
    geolocalizacao: {
      usa_geofence: true,
      latitude: -27.12345,
      longitude: -48.54321,
      raio_metros: 150
    },
    servicos: [
      { id: "medico", nome: "Atendimento Médico", fila_independente: false },
      { id: "enfermagem", nome: "Enfermagem", fila_independente: false },
      { id: "farmacia", nome: "Farmácia", fila_independente: false },
      { id: "outro", nome: "Outro atendimento na UBS", fila_independente: false }
    ],
    config_fila: {
      modo: "padrao",
      ordem: "preferencial_intercalado",
      reset_diario: "00:00",
      permite_pular_senha: true,
      permite_colocar_em_espera: true
    },
    horarios: { abre: "07:00", fecha: "17:00" }
  }
];

const filasPorLocal = {};

function getFilaDoLocal(slug) {
  if (!filasPorLocal[slug]) {
    filasPorLocal[slug] = {
      seq: 0,
      tickets: [],
      ultimasChamadas: []
    };
  }
  return filasPorLocal[slug];
}

function horaAtual() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}

function sendJSON(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function notFound(res, mensagem) {
  sendJSON(res, 404, { erro: "nao_encontrado", mensagem });
}

function findLocal(slug, res) {
  const local = locais.find(l => l.slug === slug);
  if (!local) {
    notFound(res, "Nenhum local encontrado com este identificador.");
    return null;
  }
  if (local.status === "pendente") {
    sendJSON(res, 403, {
      erro: "local_pendente",
      mensagem: "Este local ainda não está ativo no PegaSenha."
    });
    return null;
  }
  if (local.status === "suspenso") {
    sendJSON(res, 403, {
      erro: "local_suspenso",
      mensagem: "Este local está temporariamente indisponível."
    });
    return null;
  }
  return local;
}

function findTicket(filaLocal, id, res) {
  const t = filaLocal.tickets.find(t => t.id === id);
  if (!t) {
    notFound(res, "Senha não encontrada.");
    return null;
  }
  return t;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        const json = JSON.parse(data);
        resolve(json);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

// ------------------- Handler principal -------------------
module.exports = async (req, res) => {
  // CORS básico para funcionar a partir de fila.pegasenha.com.br
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  const rawSlug = req.query.slug || [];
  const segments = Array.isArray(rawSlug) ? rawSlug : [rawSlug];

  // Ex.: /api  → []
  // /api/locais/pb-carolina → ['locais','pb-carolina']
  // /api/filas/pb-carolina/senha → ['filas','pb-carolina','senha']

  if (segments.length === 0) {
    return sendJSON(res, 200, {
      status: "ok",
      mensagem: "API PegaSenha rodando (Vercel)."
    });
  }

  const [resource, slugLocal, sub1, sub2, sub3] = segments;

  try {
    // ----------------- LOCAIS -----------------
    if (resource === "locais" && slugLocal && !sub1 && req.method === "GET") {
      const local = findLocal(slugLocal, res);
      if (!local) return;
      return sendJSON(res, 200, local);
    }

    // ----------------- FILAS ------------------
    if (resource === "filas") {
      const localSlug = slugLocal;
      if (!localSlug) return notFound(res, "Local não informado.");
      const local = findLocal(localSlug, res);
      if (!local) return;
      const filaLocal = getFilaDoLocal(localSlug);

      // GET /api/filas/:slug  (fila para atendente)
      if (!sub1 && req.method === "GET") {
        const fila = filaLocal.tickets.map(t => ({
          id: t.id,
          numero: t.numero,
          servico_id: t.servico_id,
          servico_nome: t.servico_nome,
          preferencial: t.preferencial,
          tipo_preferencial: t.tipo_preferencial,
          status: t.status
        }));

        const total = filaLocal.tickets.length;
        const aguardando = filaLocal.tickets.filter(t => t.status === "aguardando").length;
        const atendidas = filaLocal.tickets.filter(t => t.status === "atendida").length;
        const ausentes = filaLocal.tickets.filter(t => t.status === "ausente").length;

        return sendJSON(res, 200, {
          local_slug: localSlug,
          fila,
          ultimas_chamadas: filaLocal.ultimasChamadas || [],
          stats: { total, aguardando, atendidas, ausentes }
        });
      }

      // POST /api/filas/:slug/senha  (cliente gera senha)
      if (sub1 === "senha" && req.method === "POST") {
        const body = await parseBody(req);
        const {
          nome,
          telefone,
          servico_id,
          preferencial = false,
          tipo_preferencial = null,
          geo = null
        } = body || {};

        if (!nome || !telefone || !servico_id) {
          return sendJSON(res, 400, {
            erro: "dados_invalidos",
            mensagem: "Informe nome, telefone e serviço desejado."
          });
        }

        const servico = local.servicos.find(s => s.id === servico_id);
        if (!servico) {
          return sendJSON(res, 400, {
            erro: "servico_invalido",
            mensagem: "Serviço informado não está disponível neste local."
          });
        }

        if (local.tipo_local === "SUS" && local.geolocalizacao?.usa_geofence) {
          if (!geo) {
            return sendJSON(res, 400, {
              erro: "fora_da_area",
              mensagem: "É necessário permitir localização para gerar a senha nesta unidade."
            });
          }
        }

        filaLocal.seq += 1;
        const numeroSenha = filaLocal.seq;
        const ticketId = `tck_${localSlug}_${Date.now()}`;

        const novoTicket = {
          id: ticketId,
          numero: numeroSenha,
          local_slug: localSlug,
          servico_id,
          servico_nome: servico.nome,
          nome,
          telefone,
          preferencial: !!preferencial,
          tipo_preferencial: preferencial ? tipo_preferencial : null,
          status: "aguardando",
          criada_em: new Date().toISOString()
        };

        filaLocal.tickets.push(novoTicket);
        const posicao = filaLocal.tickets.filter(t => t.status === "aguardando").length;

        return sendJSON(res, 201, {
          id: novoTicket.id,
          senha: novoTicket.numero,
          status: novoTicket.status,
          posicao,
          servico_id: novoTicket.servico_id,
          servico_nome: novoTicket.servico_nome
        });
      }

      // POST /api/filas/:slug/chamar-proximo
      if (sub1 === "chamar-proximo" && req.method === "POST") {
        const preferenciais = filaLocal.tickets.filter(t => t.status === "aguardando" && t.preferencial);
        const normais = filaLocal.tickets.filter(t => t.status === "aguardando" && !t.preferencial);

        let proximo = null;
        const totalChamadas = filaLocal.ultimasChamadas.length;
        const devePuxarPref = (totalChamadas % 3 === 0);

        if (devePuxarPref && preferenciais.length > 0) {
          proximo = preferenciais[0];
        } else if (normais.length > 0) {
          proximo = normais[0];
        } else if (preferenciais.length > 0) {
          proximo = preferenciais[0];
        }

        if (!proximo) {
          return sendJSON(res, 200, { status: "fila_vazia" });
        }

        proximo.status = "em_atendimento";

        filaLocal.ultimasChamadas.unshift({
          numero: proximo.numero,
          servico_nome: proximo.servico_nome,
          hora: horaAtual(),
          tipo: "auto"
        });
        filaLocal.ultimasChamadas = filaLocal.ultimasChamadas.slice(0, 10);

        return sendJSON(res, 200, { status: "ok", ticket: proximo });
      }

      // GET /api/filas/:slug/espera  (lista de espera)
      if (sub1 === "espera" && req.method === "GET") {
        const fila_espera = filaLocal.tickets
          .filter(t => t.status === "espera")
          .map(t => ({
            id: t.id,
            numero: t.numero,
            nome: t.nome,
            preferencial: t.preferencial
          }));
        return sendJSON(res, 200, { fila_espera });
      }

      // Ações em tickets: /api/filas/:slug/tickets/:id/acao
      if (sub1 === "tickets" && sub2) {
        const ticketId = sub2;
        const acao = sub3;

        const t = findTicket(filaLocal, ticketId, res);
        if (!t) return;

        if (acao === "chamar" && req.method === "POST") {
          if (t.status !== "aguardando" && t.status !== "espera") {
            return sendJSON(res, 400, { erro: "nao_disponivel" });
          }
          t.status = "em_atendimento";
          filaLocal.ultimasChamadas.unshift({
            numero: t.numero,
            servico_nome: t.servico_nome,
            hora: horaAtual(),
            tipo: "manual"
          });
          filaLocal.ultimasChamadas = filaLocal.ultimasChamadas.slice(0, 10);
          return sendJSON(res, 200, { status: "ok", ticket: t });
        }

        if (acao === "atendida" && req.method === "POST") {
          t.status = "atendida";
          return sendJSON(res, 200, { status: "ok", ticket_id: ticketId, numero: t.numero });
        }

        if (acao === "ausente" && req.method === "POST") {
          t.status = "ausente";
          return sendJSON(res, 200, { status: "ok", ticket_id: ticketId, numero: t.numero });
        }

        if (acao === "espera" && req.method === "POST") {
          if (t.status !== "em_atendimento" && t.status !== "aguardando") {
            return sendJSON(res, 400, { erro: "nao_permitido" });
          }
          t.status = "espera";
          return sendJSON(res, 200, { status: "ok", ticket_id: ticketId });
        }

        if (acao === "retornar" && req.method === "POST") {
          if (t.status !== "espera") {
            return sendJSON(res, 400, { erro: "nao_esta_em_espera" });
          }
          t.status = "aguardando";
          return sendJSON(res, 200, { status: "ok", ticket_id: ticketId });
        }
      }
    }

    // Se nada bateu:
    notFound(res, "Rota não encontrada.");
  } catch (e) {
    console.error(e);
    sendJSON(res, 500, { erro: "erro_interno", mensagem: e.message });
  }
};

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ====================== DADOS DO LOCAL (mock) ======================
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

// ========================== ENDPOINTS ===============================

// Info do local
app.get('/api/locais/:slug', (req, res) => {
  const slug = req.params.slug;
  const local = locais.find(l => l.slug === slug);

  if (!local) {
    return res.status(404).json({
      erro: "local_nao_encontrado",
      mensagem: "Nenhum local encontrado com este identificador."
    });
  }

  if (local.status === "pendente") {
    return res.status(403).json({
      erro: "local_pendente",
      mensagem: "Este local ainda não está ativo no PegaSenha."
    });
  }

  if (local.status === "suspenso") {
    return res.status(403).json({
      erro: "local_suspenso",
      mensagem: "Este local está temporariamente indisponível."
    });
  }

  return res.json(local);
});

// Usuário gera senha
app.post('/api/filas/:slug/senha', (req, res) => {
  const slug = req.params.slug;
  const local = locais.find(l => l.slug === slug);

  if (!local) {
    return res.status(404).json({
      erro: "local_nao_encontrado",
      mensagem: "Nenhum local encontrado com este identificador."
    });
  }

  if (local.status !== "ativo") {
    return res.status(403).json({
      erro: "local_indisponivel",
      mensagem: "Este local não está aceitando senhas no momento."
    });
  }

  const { nome, telefone, servico_id, preferencial = false, tipo_preferencial = null, geo = null } = req.body || {};

  if (!nome || !telefone || !servico_id) {
    return res.status(400).json({
      erro: "dados_invalidos",
      mensagem: "Informe nome, telefone e serviço desejado."
    });
  }

  const servico = local.servicos.find(s => s.id === servico_id);
  if (!servico) {
    return res.status(400).json({
      erro: "servico_invalido",
      mensagem: "Serviço informado não está disponível neste local."
    });
  }

  if (local.tipo_local === "SUS" && local.geolocalizacao?.usa_geofence) {
    if (!geo) {
      return res.status(400).json({
        erro: "fora_da_area",
        mensagem: "É necessário permitir localização para gerar a senha nesta unidade."
      });
    }
  }

  const filaLocal = getFilaDoLocal(slug);
  filaLocal.seq += 1;
  const numeroSenha = filaLocal.seq;
  const ticketId = `tck_${slug}_${Date.now()}`;

  const novoTicket = {
    id: ticketId,
    numero: numeroSenha,
    local_slug: slug,
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

  return res.status(201).json({
    id: novoTicket.id,
    senha: novoTicket.numero,
    status: novoTicket.status,
    posicao,
    servico_id: novoTicket.servico_id,
    servico_nome: novoTicket.servico_nome
  });
});

// Fila para o atendente
app.get('/api/filas/:slug', (req, res) => {
  const slug = req.params.slug;
  const local = locais.find(l => l.slug === slug);
  if (!local) {
    return res.status(404).json({ erro: "local_nao_encontrado" });
  }

  const filaLocal = getFilaDoLocal(slug);

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

  res.json({
    local_slug: slug,
    fila,
    ultimas_chamadas: filaLocal.ultimasChamadas || [],
    stats: { total, aguardando, atendidas, ausentes }
  });
});

// Chamar próximo
app.post('/api/filas/:slug/chamar-proximo', (req, res) => {
  const slug = req.params.slug;
  const filaLocal = getFilaDoLocal(slug);

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
    return res.json({ status: "fila_vazia" });
  }

  proximo.status = "em_atendimento";

  filaLocal.ultimasChamadas.unshift({
    numero: proximo.numero,
    servico_nome: proximo.servico_nome,
    hora: horaAtual(),
    tipo: "auto"
  });
  filaLocal.ultimasChamadas = filaLocal.ultimasChamadas.slice(0, 10);

  res.json({ status: "ok", ticket: proximo });
});

// Ações por ticket
function findTicket(slug, id, res) {
  const filaLocal = getFilaDoLocal(slug);
  const t = filaLocal.tickets.find(t => t.id === id);
  if (!t) {
    res.status(404).json({ erro: "ticket_nao_encontrado" });
    return null;
  }
  return { filaLocal, t };
}

app.post('/api/filas/:slug/tickets/:id/chamar', (req, res) => {
  const { slug, id } = req.params;
  const found = findTicket(slug, id, res);
  if (!found) return;
  const { filaLocal, t } = found;

  if (t.status !== "aguardando" && t.status !== "espera") {
    return res.status(400).json({ erro: "nao_disponivel" });
  }

  t.status = "em_atendimento";

  filaLocal.ultimasChamadas.unshift({
    numero: t.numero,
    servico_nome: t.servico_nome,
    hora: horaAtual(),
    tipo: "manual"
  });
  filaLocal.ultimasChamadas = filaLocal.ultimasChamadas.slice(0, 10);

  res.json({ status: "ok", ticket: t });
});

app.post('/api/filas/:slug/tickets/:id/atendida', (req, res) => {
  const { slug, id } = req.params;
  const found = findTicket(slug, id, res);
  if (!found) return;
  const { t } = found;
  t.status = "atendida";
  res.json({ status: "ok", ticket_id: id, numero: t.numero });
});

app.post('/api/filas/:slug/tickets/:id/ausente', (req, res) => {
  const { slug, id } = req.params;
  const found = findTicket(slug, id, res);
  if (!found) return;
  const { t } = found;
  t.status = "ausente";
  res.json({ status: "ok", ticket_id: id, numero: t.numero });
});

app.post('/api/filas/:slug/tickets/:id/espera', (req, res) => {
  const { slug, id } = req.params;
  const found = findTicket(slug, id, res);
  if (!found) return;
  const { t } = found;

  if (t.status !== "em_atendimento" && t.status !== "aguardando") {
    return res.status(400).json({ erro: "nao_permitido" });
  }
  t.status = "espera";
  res.json({ status: "ok", ticket_id: id });
});

app.post('/api/filas/:slug/tickets/:id/retornar', (req, res) => {
  const { slug, id } = req.params;
  const found = findTicket(slug, id, res);
  if (!found) return;
  const { t } = found;

  if (t.status !== "espera") {
    return res.status(400).json({ erro: "nao_esta_em_espera" });
  }
  t.status = "aguardando";
  res.json({ status: "ok", ticket_id: id });
});

// teste rápido
app.get('/', (req, res) => {
  res.json({ status: "ok", mensagem: "API PegaSenha rodando" });
});

app.listen(PORT, () => {
  console.log(`PegaSenha API ouvindo na porta ${PORT}`);
});

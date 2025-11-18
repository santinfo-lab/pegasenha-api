/*
  PegaSenha - API de Mesas por Unidade (modo comercial)
  Arquivo: api/mesas/[ubs].js
  Versão: 0.1.0
  Data: 18/11/2025
  Descrição:
    - Gerencia "mesas livres" por unidade comercial.
    - Ações:
        • GET  /api/mesas/{ubs}
            → lista mesas livres registradas
        • POST /api/mesas/{ubs}
            → registrar mesa livre (lugares + observação)
            → ou atribuir mesa a uma senha (acao: "atribuir")
    - Integração com filas:
        • Atualiza a senha (mesa_atribuida, status)
        • Registra chamada em ultimas_chamadas da fila
*/

function getStore() {
  if (!global._pegasenhaStore) {
    global._pegasenhaStore = {
      filas: {},
      mesas: {},
    };
  } else {
    if (!global._pegasenhaStore.filas) {
      global._pegasenhaStore.filas = {};
    }
    if (!global._pegasenhaStore.mesas) {
      global._pegasenhaStore.mesas = {};
    }
  }
  return global._pegasenhaStore;
}

// Mesas: { [ubs]: { proximoIdMesa: number, mesasLivres: [] } }
function ensureMesas(ubs) {
  const store = getStore();
  if (!store.mesas[ubs]) {
    store.mesas[ubs] = {
      proximoIdMesa: 1,
      mesasLivres: [],
    };
  }
  return store.mesas[ubs];
}

// Fila: { [ubs]: { contador, senhas, ultimasChamadas } }
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

export default async function handler(req, res) {
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

  const mesas = ensureMesas(ubs);
  const fila = ensureFila(ubs);

  //
  // GET → lista mesas livres
  //
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      ubs,
      mesas_livres: mesas.mesasLivres,
    });
  }

  //
  // POST → registra mesa ou atribui mesa a uma senha
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

    const acao = body.acao || "registrar";

    // 1) Registrar mesa livre
    if (acao === "registrar") {
      const lugares = Number(body.lugares || 0);
      const observacao =
        typeof body.observacao === "string" ? body.observacao.trim() : "";

      if (!lugares || lugares <= 0) {
        return res.status(400).json({
          ok: false,
          mensagem: "Campo 'lugares' deve ser um número maior que zero.",
        });
      }

      const idMesa = mesas.proximoIdMesa++;
      const agora = new Date().toISOString();

      const mesa = {
        id: idMesa,
        lugares,
        observacao,
        criado_em: agora,
      };

      mesas.mesasLivres.push(mesa);

      return res.status(201).json({
        ok: true,
        mensagem: "Mesa registrada como disponível.",
        ubs,
        mesa,
      });
    }

    // 2) Atribuir mesa a uma senha
    if (acao === "atribuir") {
      const mesaId = Number(body.mesa_id || 0);
      const senhaId = Number(body.senha_id || 0);

      if (!mesaId || !senhaId) {
        return res.status(400).json({
          ok: false,
          mensagem: "Campos 'mesa_id' e 'senha_id' são obrigatórios.",
        });
      }

      // Procura a mesa
      const idxMesa = mesas.mesasLivres.findIndex((m) => m.id === mesaId);
      if (idxMesa === -1) {
        return res.status(404).json({
          ok: false,
          mensagem: "Mesa não encontrada ou já utilizada.",
        });
      }
      const mesa = mesas.mesasLivres[idxMesa];

      // Procura a senha na fila
      const senha = fila.senhas.find(
        (s) => Number(s.id_interno) === Number(senhaId)
      );
      if (!senha) {
        return res.status(404).json({
          ok: false,
          mensagem: "Senha não encontrada na fila.",
        });
      }

      // Atualiza a senha com a mesa atribuída
      const descricaoMesa =
        mesa.observacao && mesa.observacao.trim().length > 0
          ? mesa.observacao.trim()
          : `Mesa ${mesa.id} (${mesa.lugares} lugares)`;

      senha.mesa_atribuida = descricaoMesa;
      senha.status = "chamada"; // ou "na_mesa" se preferir

      // Remove a mesa da lista de mesas livres
      mesas.mesasLivres.splice(idxMesa, 1);

      // Registra em ultimasChamadas
      const agora = new Date().toISOString();
      if (!Array.isArray(fila.ultimasChamadas)) {
        fila.ultimasChamadas = [];
      }
      fila.ultimasChamadas.unshift({
        numero_senha: senha.numero,
        mesa: descricaoMesa,
        hora: agora,
      });

      return res.status(200).json({
        ok: true,
        mensagem: "Mesa atribuída à senha com sucesso.",
        ubs,
        mesa_atribuida: mesa,
        senha,
      });
    }

    // Ação desconhecida
    return res.status(400).json({
      ok: false,
      mensagem: "Ação inválida. Use 'registrar' ou 'atribuir'.",
    });
  }

  //
  // Demais métodos não são permitidos
  //
  return res
    .status(405)
    .json({ ok: false, mensagem: "Método não permitido" });
}

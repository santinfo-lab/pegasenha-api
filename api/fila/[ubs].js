// api/fila/[ubs].js

export default function handler(req, res) {
  // --- CORS: libera acesso a partir do front em outro domínio ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Responde rápido a pré-flight OPTIONS
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // --- Pega o slug da UBS da URL /api/fila/[ubs] ---
  const { ubs } = req.query || {};
  const slug = Array.isArray(ubs) ? ubs[0] : (ubs || "pb-carolina");

  // --- Fila fake só para teste (pode trocar depois) ---
  const agora = new Date();
  const criadoEm = agora.toISOString();

  const fila = [
    {
      id: "1",
      numero: "A001",
      servico_nome: "Atendimento Geral",
      status: "aguardando",
      preferencial: false,
      criado_em: criadoEm,
    },
    {
      id: "2",
      numero: "A002",
      servico_nome: "Atendimento Geral",
      status: "aguardando",
      preferencial: false,
      criado_em: criadoEm,
    },
    {
      id: "3",
      numero: "A003",
      servico_nome: "Atendimento Geral",
      status: "aguardando",
      preferencial: false,
      criado_em: criadoEm,
    },
  ];

  const stats = {
    total: fila.length,
    aguardando: fila.length,
    atendidas: 0,
    ausentes: 0,
  };

  // --- Resposta final ---
  res.status(200).json({
    ok: true,
    ubs: slug,
    fila,
    stats,
  });
}

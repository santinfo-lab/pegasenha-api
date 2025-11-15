// api/fila/[ubs].js

// Fila de exemplo só para testes
const filasFake = {
  "pb-carolina": [
    {
      id: 1,
      numero: "A001",
      servico_nome: "Atendimento Geral",
      status: "aguardando",
      preferencial: false,
      criado_em: new Date().toISOString()
    },
    {
      id: 2,
      numero: "A002",
      servico_nome: "Atendimento Geral",
      status: "aguardando",
      preferencial: false,
      criado_em: new Date().toISOString()
    },
    {
      id: 3,
      numero: "A003",
      servico_nome: "Atendimento Geral",
      status: "aguardando",
      preferencial: false,
      criado_em: new Date().toISOString()
    }
  ]
};

export default function handler(req, res) {
  // 🔐 CORS – permite chamadas do seu site
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Responde rápido às requisições de preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { ubs } = req.query; // vem da URL /api/fila/pb-carolina
  const fila = filasFake[ubs] || [];

  const stats = {
    total: fila.length,
    aguardando: fila.filter(f => f.status === "aguardando").length,
    atendidas: fila.filter(f => f.status === "atendida").length,
    ausentes: fila.filter(f => f.status === "ausente").length,
    ultimas_chamadas: [] // por enquanto vazio
  };

  return res.status(200).json({
    ok: true,
    ubs,
    fila,
    stats
  });
}

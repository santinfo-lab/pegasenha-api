export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const url = new URL(req.url, "http://localhost");
  const ubs = url.pathname.split("/").pop();

  const fila = [
    {
      id: "1",
      numero: "A001",
      servico_nome: "Atendimento Geral",
      status: "aguardando",
      preferencial: false,
      criado_em: new Date().toISOString()
    },
    {
      id: "2",
      numero: "A002",
      servico_nome: "Atendimento Geral",
      status: "aguardando",
      preferencial: false,
      criado_em: new Date().toISOString()
    },
    {
      id: "3",
      numero: "A003",
      servico_nome: "Atendimento Geral",
      status: "aguardando",
      preferencial: false,
      criado_em: new Date().toISOString()
    }
  ];

  res.status(200).json({
    ok: true,
    ubs,
    fila,
    stats: {
      total: fila.length,
      aguardando: fila.length,
      atendidas: 0,
      ausentes: 0
    }
  });
}

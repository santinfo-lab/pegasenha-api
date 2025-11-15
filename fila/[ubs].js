export default function handler(req, res) {
  // Pega o parâmetro dinâmico da URL: /api/fila/pb-carolina
  const { ubs } = req.query;

  // Aqui futuramente vamos buscar as senhas da UBS no banco / memória
  // Por enquanto, só devolve algo simples pra testar
  res.status(200).json({
    ok: true,
    mensagem: "Rota de fila funcionando",
    ubs
  });
}

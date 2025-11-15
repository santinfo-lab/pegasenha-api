// api/fila/[ubs].js

export default function handler(req, res) {
  // pega o valor depois de /api/fila/
  const { ubs } = req.query;

  return res.status(200).json({
    ok: true,
    mensagem: "Rota de fila funcionando (mínimo)",
    ubs
  });
}

export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    mensagem: "PegaSenha API ativa",
    endpoint: req.query.slug || null
  });
}

export default function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const slug = url.searchParams.get("slug") || "sem-slug";

  res.status(200).json({
    ok: true,
    mensagem: "Rota /api/filas funcionando",
    slugRecebido: slug
  });
}

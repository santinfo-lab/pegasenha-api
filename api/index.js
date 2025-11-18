/*
  PegaSenha - API Principal
  Arquivo: api/index.js
  Versão: 0.1.0
  Data: 16/11/2025
  Descrição:
    - Endpoint raiz da API do PegaSenha.
    - Usado apenas como teste de disponibilidade ("heartbeat").
    - Retorna o status da API e o caminho acessado.
*/

export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    mensagem: "PegaSenha API ativa",
    endpoint: req.url || null
  });
}

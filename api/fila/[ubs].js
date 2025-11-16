<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>PegaSenha – UBS PB Carolina</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f3f4f6;
      margin: 0;
      padding: 16px;
    }
    .app {
      max-width: 480px;
      margin: 0 auto;
    }
    h1 {
      font-size: 1.3rem;
      margin-bottom: 8px;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
      margin-bottom: 16px;
    }
    button {
      width: 100%;
      padding: 12px;
      font-size: 1rem;
      border-radius: 999px;
      border: none;
      cursor: pointer;
      background: #2563eb;
      color: #fff;
      font-weight: 600;
    }
    button:disabled {
      opacity: 0.6;
      cursor: wait;
    }
    .senha-grande {
      font-size: 2.4rem;
      font-weight: 700;
      text-align: center;
      margin: 12px 0 4px;
    }
    .sucesso {
      color: #16a34a;
      font-size: 0.9rem;
      text-align: center;
    }
    .erro {
      color: #b91c1c;
      font-size: 0.9rem;
      text-align: center;
    }
    .info {
      font-size: 0.85rem;
      color: #4b5563;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="app">
    <div class="card">
      <h1>Retirada de Senha – UBS PB Carolina</h1>
      <p class="info">
        Toque no botão abaixo para gerar sua senha digital.
      </p>
      <button id="btn-pegar-senha" onclick="pegarSenha()">
        Pegar senha
      </button>

      <div id="resultado" style="margin-top:16px;">
        <!-- aqui aparece a senha -->
      </div>
    </div>
  </div>

  <script>
    const API_BASE = "https://pegasenha-api.vercel.app/api";
    const UBS_SLUG = "pb-carolina";

    async function pegarSenha() {
      const btn = document.getElementById("btn-pegar-senha");
      const resultadoEl = document.getElementById("resultado");

      // limpa mensagens anteriores
      resultadoEl.innerHTML = "";
      btn.disabled = true;
      btn.textContent = "Gerando senha...";

      try {
        const resp = await fetch(`${API_BASE}/fila/${UBS_SLUG}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            servico_nome: "Atendimento Geral",
            preferencial: false
          }),
        });

        if (!resp.ok) {
          throw new Error("Falha ao gerar senha. Código " + resp.status);
        }

        const data = await resp.json();
        if (!data.ok || !data.senha) {
          throw new Error("Resposta inesperada da API");
        }

        const senha = data.senha;

        resultadoEl.innerHTML = `
          <div class="senha-grande">${senha.numero}</div>
          <div class="sucesso">Sua senha foi gerada com sucesso.</div>
          <div class="info">
            Aguarde ser chamado pelo atendente.
          </div>
        `;
      } catch (erro) {
        console.error(erro);
        resultadoEl.innerHTML = `
          <div class="erro">
            Não foi possível gerar sua senha agora. Tente novamente em instantes.
          </div>
        `;
      } finally {
        btn.disabled = false;
        btn.textContent = "Pegar senha";
      }
    }
  </script>
</body>
</html>

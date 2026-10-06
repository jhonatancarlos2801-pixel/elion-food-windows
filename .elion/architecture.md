# Arquitetura

- Electron com `contextIsolation`, sandbox e Node desabilitado no conteúdo remoto.
- Preload mínimo intercepta a impressão dos recibos `srcdoc` já produzidos pelo painel.
- Processo principal lista impressoras e imprime silenciosamente por `deviceName`.
- Fila persistente por destino mantém cozinha e balcão independentes e retoma falhas.
- Configurações e fila ficam em `app.getPath("userData")` no computador do restaurante.

# Mudanças

## 2026-10-06 — v1.0.2

- Aplicativo Electron maximizado para o painel principal.
- Configuração de impressoras Windows 58/80 mm, cozinha e balcão.
- Impressão silenciosa, teste e fila persistente.
- Autostart do Windows, atalhos NSIS e atualização automática.
- Logo oficial fornecida preservada como fonte dos ícones.
- Validação local: 14 testes, verificação sintática, auditoria de produção e NSIS x64.
- Publicação confirmada pelo GitHub Actions run `37517188627`; EXE, blockmap e `latest.yml` respondem publicamente.
- SHA-256 do instalador publicado: `6a17c3ae78c1f5810f59613deaa21bd4db34850e298373522fdf3e43da31e7ef`.

## 2026-10-06 — Pipeline de release

- Permite que a tag use a mesma versão já declarada no pacote; corrige o primeiro workflow, que parava em `npm version` antes do build.
- Publica EXE, blockmap e `latest.yml` explicitamente com GitHub CLI; corrige a publicação assíncrona incompleta do `electron-builder` observada em `v1.0.1`.

# Infraestrutura

- Repositório público dedicado aos binários do wrapper; o código privado do sistema principal não é incluído.
- GitHub Actions em `windows-latest` gera NSIS x64 em tags `v*`.
- GitHub Releases hospeda `ELION-FOOD-Setup.exe`, blockmap e `latest.yml`.
- `electron-updater` consulta este feed público e instala atualizações NSIS.
- Rollback: publicar uma versão corretiva; remover uma Release interrompe novas instalações, mas não desinstala clientes existentes.

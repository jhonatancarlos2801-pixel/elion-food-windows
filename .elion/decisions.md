# Decisões

## 2026-10-06 — Feed público separado

O repositório do sistema principal é privado e não pode ser consultado com segurança pelo updater instalado. O wrapper e seus binários ficam neste repositório público separado, sem código-fonte do sistema principal, credenciais ou dados do backend.

## 2026-10-06 — Fila local durável

Cada destino é persistido antes do spool. Sucessos são removidos individualmente; falhas usam tentativas rápidas, backoff e retomada após reinício.

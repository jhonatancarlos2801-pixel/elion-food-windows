# ELION FOOD para Windows

Aplicativo desktop oficial do painel do restaurante ELION FOOD.

## Instalação

Baixe `ELION-FOOD-Setup.exe` na seção **Releases**, execute o instalador e abra o atalho **ELION FOOD**. O aplicativo carrega exclusivamente o painel de produção em `https://restaurante.grupoelion.com.br`.

## Impressão térmica

Abra **ELION FOOD > Configurações de impressão** para escolher uma impressora Windows de 58 mm ou 80 mm. É possível configurar um segundo destino para o balcão, imprimir um teste e ativar a inicialização junto com o Windows.

As comandas solicitadas pelo painel são enviadas com `webContents.print({ silent: true, deviceName })`. A fila local é persistente: trabalhos pendentes sobrevivem ao reinício do aplicativo e são retomados por destino.

## Releases

Tags `v*` acionam o workflow Windows, que testa, gera o NSIS x64, publica a Release e envia os metadados consumidos pelo `electron-updater`.

> O instalador ainda não possui assinatura Authenticode. O Windows pode mostrar o aviso “Editor desconhecido”.

'use strict';

let availablePrinters = [];

const element = (id) => document.getElementById(id);
const showMessage = (text, kind = 'success') => {
  const message = element('message');
  message.textContent = text;
  message.className = `visible ${kind}`;
};

function fillPrinters(id, selected) {
  const select = element(`${id}-printer`);
  select.replaceChildren();
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = availablePrinters.length ? 'Selecione uma impressora' : 'Nenhuma impressora encontrada';
  select.append(empty);
  for (const printer of availablePrinters) {
    const option = document.createElement('option');
    option.value = printer.name;
    option.textContent = `${printer.displayName}${printer.isDefault ? ' (padrão)' : ''}`;
    option.selected = printer.name === selected;
    select.append(option);
  }
}

function setDestination(id, value) {
  element(`${id}-enabled`).checked = value.enabled;
  fillPrinters(id, value.deviceName);
  const width = document.querySelector(`input[name="${id}-width"][value="${value.paperWidthMm}"]`);
  if (width) width.checked = true;
  updateDestination(id);
}

function updateDestination(id) {
  const enabled = element(`${id}-enabled`).checked;
  element(`${id}-printer`).disabled = !enabled;
  document.querySelectorAll(`input[name="${id}-width"]`).forEach((input) => { input.disabled = !enabled; });
  document.querySelector(`[data-test="${id}"]`).disabled = !enabled;
}

function readDestination(id) {
  return {
    enabled: element(`${id}-enabled`).checked,
    deviceName: element(`${id}-printer`).value,
    paperWidthMm: Number(document.querySelector(`input[name="${id}-width"]:checked`)?.value || 80),
  };
}

async function load() {
  try {
    const data = await window.elionSettings.load();
    availablePrinters = data.printers;
    setDestination('kitchen', data.settings.kitchen);
    setDestination('counter', data.settings.counter);
    element('launch-at-login').checked = data.settings.launchAtLogin;
    element('version').textContent = `ELION FOOD v${data.version}`;
    if (!availablePrinters.length) showMessage('O Windows não informou nenhuma impressora. Instale ou conecte a impressora e abra esta tela novamente.', 'error');
  } catch (error) {
    showMessage(error.message || 'Não foi possível carregar as configurações.', 'error');
  }
}

for (const id of ['kitchen', 'counter']) {
  element(`${id}-enabled`).addEventListener('change', () => updateDestination(id));
}

element('save').addEventListener('click', async () => {
  const button = element('save');
  button.disabled = true;
  try {
    await window.elionSettings.save({
      launchAtLogin: element('launch-at-login').checked,
      kitchen: readDestination('kitchen'),
      counter: readDestination('counter'),
    });
    showMessage('Configurações salvas. As próximas comandas usarão estas impressoras.');
  } catch (error) {
    showMessage(error.message || 'Não foi possível salvar.', 'error');
  } finally {
    button.disabled = false;
  }
});

document.querySelectorAll('[data-test]').forEach((button) => {
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await window.elionSettings.save({
        launchAtLogin: element('launch-at-login').checked,
        kitchen: readDestination('kitchen'),
        counter: readDestination('counter'),
      });
      await window.elionSettings.printTest(button.dataset.test);
      showMessage('Teste enviado para a impressora.');
    } catch (error) {
      showMessage(error.message || 'Falha no teste de impressão.', 'error');
    } finally {
      button.disabled = false;
    }
  });
});

load();

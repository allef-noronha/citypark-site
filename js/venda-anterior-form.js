(function (root) {
  'use strict';
  root.CityParkPreviousSaleForm = {create(form) {
    const $ = id => form.querySelector('#' + id);
    const plan = root.CityParkPaymentPlan;
    const groups = $('previousPayments');
    const cents = node => plan.currencyToCents(node.value) || 0;
    function row(signal = false) {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'previous-payment';
      fieldset.dataset.signal = String(signal);
      fieldset.innerHTML = `<legend>${signal ? 'Sinal (opcional)' : 'Grupo de parcelas'}</legend>
        ${signal ? '' : '<label>Tipo de parcela<select data-field="periodicidade"><option value="mensal">Mensal</option><option value="semestral">Semestral</option><option value="anual">Anual</option><option value="outra">Outra (parcela única)</option></select></label><label data-description hidden>Descrição<input data-field="descricao" maxlength="300" disabled></label>'}
        <label>Quantidade<input data-field="quantidade" type="number" min="${signal ? 0 : 1}" max="${signal ? 3 : 240}" step="1" value="${signal ? 0 : 1}" required></label>
        <label>Valor unitário<input data-field="valor" data-currency inputmode="decimal" placeholder="R$ 0,00"></label>
        <label>Mês do primeiro vencimento<input data-field="mes" type="month"></label>
        <label>Dia do vencimento<select data-field="dia"><option value="15">15</option><option value="30">30 (último dia em fevereiro)</option></select></label>
        <label>Subtotal<input data-subtotal readonly tabindex="-1" value="R$ 0,00"></label>
        <label>% da proposta<input data-share readonly tabindex="-1" value="0,00%"></label>
        ${signal ? '' : '<button type="button" data-remove>Remover grupo</button>'}`;
      return fieldset;
    }
    const getRows = () => [...form.querySelectorAll('.previous-payment')];
    function sync() {
      const legal = $('previousClientType').value === 'PJ';
      $('previousPF').hidden = legal; $('previousPJ').hidden = !legal;
      for (const [id, active] of [['previousPF', !legal], ['previousPJ', legal]]) for (const node of $(id).querySelectorAll('input')) { node.disabled = !active; node.required = active; }
      let total = cents($('previousFinancing'));
      const subtotals = [];
      for (const row of getRows()) {
        const field = name => row.querySelector(`[data-field="${name}"]`);
        const signal = row.dataset.signal === 'true';
        const type = signal ? 'mensal' : field('periodicidade').value;
        if (!signal) {
          const other = type === 'outra';
          row.querySelector('[data-description]').hidden = !other;
          field('descricao').disabled = !other; field('descricao').required = other;
          field('quantidade').max = {mensal:240,semestral:60,anual:30,outra:1}[type];
          if (other) field('quantidade').value = '1';
          field('quantidade').readOnly = other;
        }
        const active = !signal || Number(field('quantidade').value) > 0 || cents(field('valor')) > 0;
        field('valor').required = active; field('mes').required = active;
        const subtotal = Math.round(Number(field('quantidade').value) || 0) * cents(field('valor'));
        subtotals.push(subtotal); total += subtotal;
        row.querySelector('[data-subtotal]').value = plan.formatMoney(subtotal);
      }
      getRows().forEach((row, index) => row.querySelector('[data-share]').value = share(subtotals[index], total));
      $('previousFinancingShare').value = share(cents($('previousFinancing')), total);
      $('previousValue').value = plan.formatMoney(total);
      $('previousDifference').value = plan.formatMoney(cents($('previousTableValue')) - total);
      $('previousAddPayment').disabled = groups.children.length >= plan.MAX_PAYMENT_GROUPS;
    }
    const share = (value, total) => (total > 0 ? value / total * 100 : 0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}) + '%';
    form.addEventListener('input', event => {
      if (event.target.matches('[data-currency]')) {
        const digits = event.target.value.replace(/\D/g, '');
        event.target.value = digits ? plan.formatMoney(Number(digits)) : '';
      }
      sync();
    });
    form.addEventListener('change', sync);
    form.addEventListener('click', event => {
      if (event.target.closest('[data-remove]')) { event.target.closest('.previous-payment').remove(); sync(); }
    });
    $('previousAddPayment').addEventListener('click', () => { if (groups.children.length < plan.MAX_PAYMENT_GROUPS) { groups.append(row()); sync(); } });
    function reset() {
      groups.replaceChildren();
      $('previousSignal').replaceChildren(row(true));
      $('previousDate').max = plan.todayInput();
      sync();
    }
    function readRow(row) {
      const value = name => row.querySelector(`[data-field="${name}"]`)?.value;
      return {periodicidade:value('periodicidade') || 'mensal', quantidade:Number(value('quantidade')), valorUnitarioCentavos:plan.currencyToCents(value('valor')) || 0, mes:value('mes'), dia:Number(value('dia')), descricao:value('descricao') || ''};
    }
    function read() {
      const legal = $('previousClientType').value === 'PJ';
      return {
        cliente:legal ? {tipoCliente:'PJ', razaoSocial:$('previousCompany').value, cnpj:$('previousCnpj').value, telefoneComercial:$('previousCompanyPhone').value, emailComercial:$('previousCompanyEmail').value} : {tipoCliente:'PF', nomeCompleto:$('previousClient').value, cpf:$('previousCpf').value, telefone:$('previousClientPhone').value, email:$('previousClientEmail').value},
        corretorSnapshot:{nome:$('previousBroker').value, creci:$('previousCreci').value, telefone:$('previousBrokerPhone').value, email:$('previousBrokerEmail').value, imobiliaria:$('previousRealEstate').value},
        condicao:{valorTabelaCentavos:cents($('previousTableValue')), sinal:readRow($('previousSignal').firstElementChild), parcelas:[...groups.children].map(readRow), financiamentoCentavos:cents($('previousFinancing'))},
        dataVenda:$('previousDate').value, condicoes:$('previousConditions').value, referencia:$('previousReference').value, confirmado:$('previousChecked').checked
      };
    }
    reset();
    return {reset, read};
  }};
})(globalThis);

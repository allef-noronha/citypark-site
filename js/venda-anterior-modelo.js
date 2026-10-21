(function (root, factory) {
  const api = typeof module === 'object' && module.exports
    ? factory(require('./condicao-venda.js'), require('./cpf.js'))
    : factory(root.CityParkPaymentPlan, root.CityParkCpf);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CityParkPreviousSaleModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (plan, cpf) {
  'use strict';
  const limits = {mensal:240, semestral:60, anual:30, outra:1};
  const labels = {mensal:'Mensais', semestral:'Semestrais', anual:'Anuais', outra:'Outro'};
  const empty = () => ({ativo:false, quantidade:0, valorUnitarioCentavos:0, totalCentavos:0, periodicidade:'outra', primeiroVencimento:null, vencimentos:[], descricao:''});
  const text = (value, label, max = 200) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Preencha ${label}.`);
    return value.trim();
  };
  const phone = (value, label) => {
    const digits = text(value, label, 30).replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 13) throw new Error(`Informe ${label} válido.`);
    return digits;
  };
  const email = (value, label) => {
    const result = text(value, label, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new Error(`Informe ${label} válido.`);
    return result;
  };
  const money = (value, label, allowZero = false) => {
    if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > 100000000000) throw new Error(`Informe ${label} válido.`);
    return value;
  };
  function snapshots(input) {
    const broker = input.corretorSnapshot || {};
    const corretorSnapshot = {nome:text(broker.nome, 'nome do corretor'), creci:text(broker.creci, 'CRECI', 50), telefone:phone(broker.telefone, 'telefone do corretor'), email:email(broker.email, 'e-mail do corretor'), imobiliaria:typeof broker.imobiliaria === 'string' && broker.imobiliaria.trim() ? text(broker.imobiliaria, 'imobiliária') : null};
    const client = input.cliente || {};
    let cliente;
    if (client.tipoCliente === 'PF') {
      const document = String(client.cpf || '').replace(/\D/g, '');
      if (!cpf.isValidCpf(document)) throw new Error('Informe um CPF válido para o cliente.');
      cliente = {tipoCliente:'PF', nomeCompleto:text(client.nomeCompleto, 'nome do cliente'), cpf:document, telefone:phone(client.telefone, 'telefone do cliente'), email:email(client.email, 'e-mail do cliente'), razaoSocial:null, cnpj:null, telefoneComercial:null, emailComercial:null};
    } else if (client.tipoCliente === 'PJ') {
      const document = String(client.cnpj || '').replace(/\D/g, '');
      if (document.length !== 14) throw new Error('Informe o CNPJ com 14 dígitos.');
      const name = text(client.razaoSocial, 'razão social');
      cliente = {tipoCliente:'PJ', nomeCompleto:name, cpf:null, telefone:null, email:null, razaoSocial:name, cnpj:document, telefoneComercial:phone(client.telefoneComercial, 'telefone comercial'), emailComercial:email(client.emailComercial, 'e-mail comercial')};
    } else throw new Error('Selecione pessoa física ou jurídica.');
    return {cliente, corretorSnapshot};
  }
  function component(row, signal = false) {
    const quantity = Number(row.quantidade);
    if (signal && quantity === 0) {
      if (row.valorUnitarioCentavos) throw new Error('Informe a quantidade do sinal ou apague seu valor.');
      return empty();
    }
    const periodicity = signal ? 'mensal' : row.periodicidade;
    if (!Object.hasOwn(limits, periodicity) || !Number.isInteger(quantity) || quantity < 1 || quantity > (signal ? 3 : limits[periodicity])) throw new Error('Confira o tipo e a quantidade de parcelas.');
    const value = money(row.valorUnitarioCentavos, 'valor unitário');
    const total = money(quantity * value, 'subtotal');
    const date = plan.buildAllowedDueDate(row.mes, Number(row.dia));
    if (!date) throw new Error('Informe o mês e o dia do primeiro vencimento de cada parcela.');
    const dates = plan.buildScheduleWithDueDay(date, quantity, periodicity, Number(row.dia));
    if (dates.length !== quantity) throw new Error('Não foi possível montar os vencimentos.');
    return {ativo:true, quantidade:quantity, valorUnitarioCentavos:value, totalCentavos:total, periodicidade:periodicity, primeiroVencimento:dates[0], vencimentos:dates, descricao:signal ? 'Sinal' : periodicity === 'outra' ? text(row.descricao, 'descrição da parcela única', 300) : labels[periodicity]};
  }
  function buildCondition(input) {
    const table = money(input.valorTabelaCentavos, 'valor de tabela original');
    if (!Array.isArray(input.parcelas) || input.parcelas.length > plan.MAX_PAYMENT_GROUPS) throw new Error('Use até 12 grupos de parcelas.');
    const signal = component(input.sinal || {quantidade:0, valorUnitarioCentavos:0}, true);
    const slots = Object.fromEntries(Array.from({length:12}, (_, index) => ['grupo' + String(index + 1).padStart(2, '0'), input.parcelas[index] ? component(input.parcelas[index]) : empty()]));
    const keys = money(input.financiamentoCentavos || 0, 'financiamento', true);
    const financing = keys ? {ativo:true, quantidade:1, valorUnitarioCentavos:keys, totalCentavos:keys, periodicidade:'unica', primeiroVencimento:null, vencimentos:[], descricao:'Financiamento'} : empty();
    const active = [signal, ...Object.values(slots), financing].filter(item => item.ativo);
    const total = money(active.reduce((sum, item) => sum + item.totalCentavos, 0), 'total da proposta');
    return {schemaVersao:3, tipo:'personalizada', descricao:active.map(item => `${item.descricao}: ${item.quantidade} × ${plan.formatMoney(item.valorUnitarioCentavos)}`).join(' · ').slice(0, 1000), valorTabelaCentavos:table, totalCalculadoCentavos:total, diferencaCentavos:table - total, componentes:{sinal:signal, parcelas:slots, chaves:financing}};
  }
  return {snapshots, buildCondition};
});

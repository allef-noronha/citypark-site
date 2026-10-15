module.exports = function previousSale(overrides = {}) {
  return {id:'u1', uid:'admin-test', dataVenda:'2025-10-10', referencia:'Contrato 123', confirmado:true, condicoes:'Entrada e saldo conforme contrato',
    cliente:{tipoCliente:'PF', nomeCompleto:'Cliente anterior', cpf:'52998224725', telefone:'11999999999', email:'cliente@example.test'},
    corretorSnapshot:{nome:'Corretor anterior', creci:'12345-F', telefone:'11988888888', email:'corretor@example.test', imobiliaria:'Imobiliária da época'},
    condicao:{valorTabelaCentavos:15000000, sinal:{quantidade:1, valorUnitarioCentavos:2000000, mes:'2025-10', dia:15}, parcelas:[{periodicidade:'mensal', quantidade:10, valorUnitarioCentavos:100000, mes:'2025-11', dia:30}], financiamentoCentavos:9345678},
    ...overrides};
};

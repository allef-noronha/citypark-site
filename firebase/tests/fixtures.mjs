export const UNIT_ID = "2208-A";
export const COMMERCIAL_ID = "2208A";
export const PRICE = 108551038;
const date = s => new Date(s + "T15:00:00.000Z");
const addMonths = (year, month, count, day = 15) => {
  const d = new Date(Date.UTC(year, month - 1 + count, 1));
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day, 15));
};
export function component(quantity, unitValue, periodicidade, first = null, descricao = "") {
  const active = quantity > 0;
  const schedule = active && first
    ? Array.from({length: quantity}, (_, i) => {
        if (periodicidade === "unica" || periodicidade === "outra") return date(first);
        const [y,m,d] = first.split("-").map(Number);
        return addMonths(y,m,i * ({mensal:1,semestral:6,anual:12}[periodicidade] || 1),d);
      }) : [];
  return {
    ativo: active, quantidade: active ? quantity : 0,
    valorUnitarioCentavos: active ? unitValue : 0,
    totalCentavos: active ? quantity * unitValue : 0,
    periodicidade: active ? periodicidade : "outra",
    primeiroVencimento: schedule[0] || null,
    vencimentos: schedule, descricao: active ? descricao : ""
  };
}
export function inactive() { return component(0,0,"outra"); }
export function slots() {
  return Object.fromEntries(Array.from({length:12},(_,i) =>
    ["grupo" + String(i+1).padStart(2,"0"), inactive()]));
}
export function standard() {
  const parcelas = slots();
  parcelas.grupo01 = component(39,556672,"mensal","2026-10-15","Parcelas mensais");
  parcelas.grupo02 = component(5,4342042,"semestral","2027-03-15","Parcelas semestrais");
  const sinal = component(1,16282656,"mensal","2026-09-15","Sinal");
  const chaves = component(1,48847964,"unica",null,"Financiamento");
  const total = sinal.totalCentavos + chaves.totalCentavos +
    Object.values(parcelas).reduce((s,c)=>s+c.totalCentavos,0);
  return {
    schemaVersao:4, tipo:"padrao", descricao:"Condição padrão de teste",
    tipologia:"Loft", valorTabelaCentavos:PRICE,
    totalCalculadoCentavos:total, diferencaCentavos:0,
    condicaoComercialSnapshot:{schemaVersao:2,quantidades:{sinal:1,mensais:39,intercaladas:5,chaves:1}},
    resumoPublicado:{sinalCentavos:16282656,parcelaMensalCentavos:556672,intercaladaCentavos:4342042,chavesCentavos:48847964},
    componentes:{sinal,parcelas,chaves},
    diaVencimentoPadrao:15, dataBasePadrao:"2026-09-15",
    calendarioPadrao:{sinal:"2026-09-15",mensalPrimeira:"2026-10-15",semestralPrimeira:"2027-03-15"}
  };
}
export function custom() {
  const parcelas = slots();
  parcelas.grupo01 = component(10,5000000,"mensal","2026-10-15","Mensal");
  return {
    schemaVersao:3, tipo:"personalizada", descricao:"Condição personalizada de teste",
    valorTabelaCentavos:PRICE,totalCalculadoCentavos:103000000,
    diferencaCentavos:PRICE-103000000,
    componentes:{
      sinal:component(1,5000000,"mensal","2026-09-15","Sinal"),
      parcelas,chaves:component(1,48000000,"unica",null,"Financiamento")
    }
  };
}
export function seedUnit() {
  return {unidade:"2208 A",tipologia:"Loft",status:"disponivel",
    propostaAtualId:null,expiraEm:null,vendidoEm:null,atualizadoEm:date("2026-09-07")};
}
export function seedCommercial() {
  return {unidade:"2208 A",tipologia:"Loft",precoVista:PRICE/100,
    versaoTabela:"fixture-local",atualizadoEm:date("2026-09-07")};
}
export function proposal(condition, actor = "broker-fixture", broker = "broker-fixture") {
  return {adminId:actor==="admin-fixture"?actor:null,corretorId:broker,
    corretorSnapshot:{nome:"Corretor de teste"},cliente:{nome:"Cliente de teste"},
    unidadeId:UNIT_ID,commercialUnitId:COMMERCIAL_ID,
    condicaoProposta:condition,declaracaoAceita:true,statusProposta:"reservada",
    statusAnalise:condition.tipo==="personalizada"?"pendente":"dispensada",
    criadoEm:date("2026-09-07"),atualizadoEm:date("2026-09-07"),
    expiraEm:date("2026-09-14"),vendidoEm:null};
}

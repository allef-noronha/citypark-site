import {test} from "node:test";
import assert from "node:assert/strict";
import {standard,custom,PRICE,slots,inactive} from "./fixtures.mjs";
const sum = c => c.componentes.sinal.totalCentavos + c.componentes.chaves.totalCentavos +
  Object.values(c.componentes.parcelas).reduce((s,p)=>s+p.totalCentavos,0);
test("condição padrão fecha em centavos",()=>{const c=standard();assert.equal(sum(c),PRICE);assert.equal(c.totalCalculadoCentavos,PRICE);assert.equal(c.schemaVersao,4);});
test("personalizada respeita os limites",()=>{const c=custom();assert.equal(sum(c),c.totalCalculadoCentavos);assert.ok(c.totalCalculadoCentavos*100>=PRICE*85);assert.ok(c.componentes.chaves.totalCentavos*100<=c.totalCalculadoCentavos*60);});
test("12 slots e componentes inativos",()=>{assert.equal(Object.keys(slots()).length,12);assert.deepEqual(inactive().vencimentos,[]);assert.equal(inactive().periodicidade,"outra");});

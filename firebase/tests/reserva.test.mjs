import {wrapInventoryTransaction} from './inventory-wrapper.mjs';
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync, writeFileSync} from "node:fs";
import {initializeTestEnvironment, assertSucceeds} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, writeBatch, runTransaction, updateDoc, serverTimestamp
} from "firebase/firestore";
import {
  standard, custom, component, inactive, PRICE, UNIT_ID, COMMERCIAL_ID,
  seedUnit, seedCommercial, proposal
} from "./fixtures.mjs";

const PROJECT = "demo-citypark-reserva";
const EMULATOR_HOST = "127.0.0.1";
const EMULATOR_PORT = 8080;

function assertLocalEmulator() {
  if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROJECT) {
    throw new Error("Projeto inesperado. Testes cancelados.");
  }
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw new Error("FIRESTORE_EMULATOR_HOST ausente. Use npm run test:emulator.");
  const match = address.match(/^(127\.0\.0\.1|localhost|\[::1\]):(\d+)$/);
  if (!match || Number(match[2]) !== EMULATOR_PORT) {
    throw new Error("O emulador deve estar em localhost:8080. Testes cancelados.");
  }
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST &&
      !/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST)) {
    throw new Error("Emulador Auth não local. Testes cancelados.");
  }
}

async function seed(env) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, "admins", "admin-fixture"), {ativo: true, tipo: "admin"});
    batch.set(doc(db, "corretores", "broker-fixture"), {aprovado: true, email: "broker-fixture@example.test"});
    batch.set(doc(db, "corretores", "other-fixture"), {aprovado: true, email: "other-fixture@example.test"});
    batch.set(doc(db, "corretores", "unapproved-fixture"), {aprovado: false, email: "unapproved-fixture@example.test"});
    batch.set(doc(db, "unidades", UNIT_ID), seedUnit());
    batch.set(doc(db,"disponibilidade_publica","estoque"),{schemaVersao:2,unidades:{},ultimaUnidade:"",atualizadoEm:new Date()});
    batch.set(doc(db, "site_units_test", COMMERCIAL_ID), seedCommercial());
    await batch.commit();
  });
}

function context(env, actor) {
  return actor === null
    ? env.unauthenticatedContext().firestore()
    : env.authenticatedContext(actor, {email: `${actor}@example.test`}).firestore();
}

async function send(db, condition, actor = "broker-fixture",
                    broker = "broker-fixture", id = "proposal-fixture", options = {}) {
  return runTransaction(db, async nativeTx => {
    const tx = wrapInventoryTransaction(nativeTx, db);
    const unitRef = doc(db, "unidades", UNIT_ID);
    const commercialRef = doc(db, "site_units_test", COMMERCIAL_ID);
    const proposalRef = doc(db, "propostas", id);
    const [unitSnapshot, commercialSnapshot] = await Promise.all([
      tx.get(unitRef), tx.get(commercialRef)
    ]);
    if (!unitSnapshot.exists() || !commercialSnapshot.exists()) {
      throw new Error("Fixture ausente");
    }
    if (unitSnapshot.data().status !== "disponivel") {
      throw new Error("Unidade não disponível");
    }

    const stamp = serverTimestamp();
    if (!options.omit?.includes('proposal')) tx.set(proposalRef, proposal(condition, actor, broker));
    if (!options.omit?.includes('unit')) tx.update(unitRef, {
      status: "reservada", propostaAtualId: id, atualizadoEm: stamp,
      expiraEm: new Date("2026-09-14T15:00:00Z"), vendidoEm: null
    });
    const common = {
      adminId: actor === "admin-fixture" ? actor : null,
      ano: 2026, corretorId: broker, data: stamp, propostaId: id,
      unidade: "2208 A", unidadeId: UNIT_ID,
      statusAnterior: "disponivel", statusNovo: "reservada"
    };
    if (!options.omit?.includes('unitHistory')) tx.set(doc(db, "historico_unidades", id), {
      ...common, acao: "unidade reservada",
      observacao: "Unidade reservada após o envio da proposta."
    });
    if (!options.omit?.includes('proposalHistory')) tx.set(doc(db, "historico_propostas", id), {
      ...common, acao: "proposta criada", statusAnterior: null,
      tags: ["Comercial em Análise"], observacao: "Proposta criada em teste."
    });
  });
}

async function inspect(env, id = "proposal-fixture") {
  let result;
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const refs = [
      doc(db, "unidades", UNIT_ID),
      doc(db, "propostas", id),
      doc(db, "historico_unidades", id),
      doc(db, "historico_propostas", id)
    ];
    const [unit, proposalDoc, unitHistory, proposalHistory] =
      await Promise.all(refs.map(ref => getDoc(ref)));
    result = {unit, proposalDoc, unitHistory, proposalHistory};
  });
  return result;
}

async function verifyReserved(env, id = "proposal-fixture") {
  const {unit, proposalDoc, unitHistory, proposalHistory} = await inspect(env, id);
  assert.equal(unit.data().status, "reservada");
  assert.equal(unit.data().propostaAtualId, id);
  assert.equal(proposalDoc.data().statusProposta, "reservada");
  assert.equal(proposalDoc.data().commercialUnitId, COMMERCIAL_ID);
  assert.equal(proposalDoc.data().unidadeId, UNIT_ID);
  assert.ok(unitHistory.exists(), "Histórico da unidade ausente");
  assert.ok(proposalHistory.exists(), "Histórico da proposta ausente");
  assert.equal(unitHistory.data().propostaId, id);
  assert.equal(proposalHistory.data().propostaId, id);
  assert.equal(unitHistory.data().acao, "unidade reservada");
  assert.equal(proposalHistory.data().acao, "proposta criada");
}

async function verifyNoWrite(env, id = "proposal-fixture") {
  const {unit, proposalDoc, unitHistory, proposalHistory} = await inspect(env, id);
  assert.equal(unit.data().status, "disponivel");
  assert.equal(unit.data().propostaAtualId, null);
  assert.equal(unit.data().expiraEm, null);
  assert.equal(proposalDoc.exists(), false);
  assert.equal(unitHistory.exists(), false);
  assert.equal(proposalHistory.exists(), false);
}

async function expectPermissionDenied(operation) {
  await assert.rejects(operation, error => {
    assert.equal(error?.code, "permission-denied",
      `Era esperada uma negativa das Rules, não: ${error?.message}`);
    assert.doesNotMatch(error.message, /maximum of 1000|maximum.*(?:calls|expressions)|too many.*(?:calls|expressions)/i,
      'Um limite de execução não comprova o bloqueio comercial esperado.');
    return true;
  });
}

async function accepted(t, env, label, condition, actor = "broker-fixture",
                        broker = "broker-fixture") {
  await t.test(label, async () => {
    await seed(env);
    await assertSucceeds(send(context(env, actor), condition, actor, broker));
    await verifyReserved(env);
  });
}

async function denied(t, env, label, condition, actor = "broker-fixture",
                      broker = "broker-fixture", setup = null) {
  await t.test(label, async () => {
    await seed(env);
    if (setup) await setup();
    await expectPermissionDenied(send(context(env, actor), condition, actor, broker));
    await verifyNoWrite(env);
  });
}

test("Contrato de reserva no emulador isolado", {concurrency: false}, async t => {
  assertLocalEmulator();
  const env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      host: EMULATOR_HOST, port: EMULATOR_PORT,
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8")
    }
  });

  try {
    const full = custom();
    full.componentes.sinal = component(1, 5000000, 'mensal', '2026-09-15', 'Sinal');
    full.componentes.chaves = component(1, 48000000, 'unica', null, 'Financiamento');
    for (let i = 1; i <= 12; i++) {
      const periodicity = ['mensal', 'semestral', 'anual', 'outra'][(i - 1) % 4];
      full.componentes.parcelas[`grupo${String(i).padStart(2, '0')}`] =
        component(1, i === 12 ? 4166674 : 4166666, periodicity, '2026-10-15', 'Parcela');
    }
    await accepted(t, env, '14 doze grupos ativos e todas as periodicidades', full);
    await accepted(t, env, '15 administrador com doze grupos ativos', full, 'admin-fixture');
    const fullStandard = {...standard(), componentes: structuredClone(full.componentes)};
    fullStandard.componentes.parcelas.grupo12.valorUnitarioCentavos += PRICE - full.totalCalculadoCentavos;
    fullStandard.componentes.parcelas.grupo12.totalCentavos = fullStandard.componentes.parcelas.grupo12.valorUnitarioCentavos;
    await accepted(t, env, '16 padrão com doze grupos ativos', fullStandard);
    await accepted(t, env, '17 administrador com padrão completo', fullStandard, 'admin-fixture');
    const allOther = structuredClone(full);
    Object.values(allOther.componentes.parcelas).forEach(p => { p.periodicidade = 'outra'; });
    await accepted(t, env, '18 administrador com doze negociações especiais', allOther, 'admin-fixture');
    for (const slot of ['grupo01', 'grupo12']) {
      const invalid = structuredClone(full);
      invalid.componentes.parcelas[slot].periodicidade = 'invalida';
      await denied(t, env, `administrador não ignora validação de ${slot}`, invalid, 'admin-fixture');
    }

    // Todos os grupos precisam ser verificados, em ambas as metades dos históricos.
    for (let i = 1; i <= 12; i++) {
      const invalid = structuredClone(full);
      invalid.componentes.parcelas[`grupo${String(i).padStart(2, '0')}`].periodicidade = 'invalida';
      await denied(t, env, `grupo ${i}: periodicidade inválida`, invalid);
    }
    const malformed = [
      ['campo extra ativo', p => { p.componentes.parcelas.grupo01.extra = true; }],
      ['campo ausente ativo', p => { delete p.componentes.parcelas.grupo01.descricao; }],
      ['ativo não booleano', p => { p.componentes.parcelas.grupo01.ativo = 1; }],
      ['quantidade fracionária', p => { p.componentes.parcelas.grupo01.quantidade = 1.5; }],
      ['valor fracionário', p => { p.componentes.parcelas.grupo01.valorUnitarioCentavos = 5000000.5; }],
      ['total inconsistente', p => { p.componentes.parcelas.grupo01.totalCentavos++; }],
      ['vencimento ausente', p => { p.componentes.parcelas.grupo01.primeiroVencimento = null; }],
      ['calendário incompleto', p => { p.componentes.parcelas.grupo01.vencimentos.pop(); }],
      ['campo extra inativo', p => { p.componentes.parcelas.grupo12.extra = true; }],
      ['campo ausente inativo', p => { delete p.componentes.parcelas.grupo12.descricao; }],
      ['inativo com valor', p => { p.componentes.parcelas.grupo12.valorUnitarioCentavos = 1; }],
      ['inativo com calendário', p => { p.componentes.parcelas.grupo12.vencimentos = [new Date()]; }],
      ['grupo ausente', p => { delete p.componentes.parcelas.grupo12; }],
      ['grupo extra', p => { p.componentes.parcelas.grupo13 = inactive(); }],
      ['grupo trocado por desconhecido', p => { delete p.componentes.parcelas.grupo12; p.componentes.parcelas.grupo13 = inactive(); }],
      ['componente extra', p => { p.componentes.extra = inactive(); }],
      ['condição com campo extra', p => { p.extra = true; }],
      ['descrição longa', p => { p.componentes.parcelas.grupo01.descricao = 'x'.repeat(301); }],
      ['sinal acima de três parcelas', p => { p.componentes.sinal.quantidade = 4; }],
      ['financiamento recorrente', p => { p.componentes.chaves.periodicidade = 'mensal'; }],
    ];
    for (const [label, mutate] of malformed) {
      const invalid = custom();
      mutate(invalid);
      await denied(t, env, label, invalid);
    }
    for (const [periodicity, maximum] of [['mensal', 240], ['semestral', 60], ['anual', 30], ['outra', 1]]) {
      const invalid = custom();
      invalid.componentes.parcelas.grupo01 = component(maximum + 1, Math.ceil(50000000 / (maximum + 1)), periodicity, '2026-10-15', 'Parcela');
      invalid.componentes.chaves = component(1, 98000000 - invalid.componentes.parcelas.grupo01.totalCentavos, 'unica', null, 'Financiamento');
      await denied(t, env, `${periodicity}: quantidade acima do limite`, invalid);
    }
    const noDescription = structuredClone(full);
    noDescription.componentes.parcelas.grupo12.descricao = '';
    await denied(t, env, 'negociação especial exige descrição', noDescription);
    const singleSignal = custom();
    singleSignal.componentes.sinal.periodicidade = 'unica';
    await accepted(t, env, 'sinal único legado continua aceito', singleSignal);

    for (const actor of ['broker-fixture', 'admin-fixture']) {
      for (const omit of ['proposal', 'unit', 'unitHistory', 'proposalHistory']) {
        await t.test(`${actor}: transação sem ${omit} não grava nada`, async () => {
          await seed(env);
          await expectPermissionDenied(send(context(env, actor), custom(), actor, 'broker-fixture', 'proposal-fixture', {omit: [omit]}));
          await verifyNoWrite(env);
        });
      }
    }
    await t.test('históricos preexistentes não substituem validação na transação', async () => {
      await seed(env);
      await env.withSecurityRulesDisabled(async ctx => {
        const db = ctx.firestore();
        const batch = writeBatch(db);
        batch.set(doc(db, 'historico_unidades', 'proposal-fixture'), {propostaId: 'proposal-fixture', acao: 'unidade reservada'});
        batch.set(doc(db, 'historico_propostas', 'proposal-fixture'), {propostaId: 'proposal-fixture', acao: 'proposta criada'});
        await batch.commit();
      });
      await expectPermissionDenied(send(context(env, 'admin-fixture'), custom(), 'admin-fixture', 'broker-fixture', 'proposal-fixture', {omit: ['unitHistory', 'proposalHistory']}));
      const saved = await inspect(env);
      assert.equal(saved.unit.data().status, 'disponivel');
      assert.equal(saved.proposalDoc.exists(), false);
    });
    await accepted(t, env, "01 corretor aprovado: padrão e quatro escritas", standard());
    await accepted(t, env, "02 corretor aprovado: personalizada schema 3", custom());
    await accepted(t, env, "03 administrador em nome de corretor aprovado",
      standard(), "admin-fixture");

    const without = custom();
    without.componentes.sinal = inactive();
    without.componentes.chaves = inactive();
    without.componentes.parcelas.grupo01 =
      component(10, 10000000, "mensal", "2026-10-15", "Mensal");
    without.totalCalculadoCentavos = 100000000;
    without.diferencaCentavos = PRICE - 100000000;
    await accepted(t, env, "04 personalizada sem sinal e financiamento", without);

    await denied(t, env, "05 usuário não autenticado", standard(), null);
    await denied(t, env, "06 corretor não aprovado", standard(),
      "unapproved-fixture", "unapproved-fixture");
    await denied(t, env, "07 corretor não pode criar proposta para outro",
      standard(), "broker-fixture", "other-fixture");

    const low = custom();
    low.componentes.parcelas.grupo01 =
      component(10, 3700000, "mensal", "2026-10-15", "Mensal");
    low.totalCalculadoCentavos = 90000000;
    low.diferencaCentavos = PRICE - 90000000;
    await denied(t, env, "08 desconto acima de 15% com soma correta", low);

    const finance = custom();
    finance.componentes.chaves = component(1, 70000000, "unica", null, "Financiamento");
    finance.componentes.parcelas.grupo01 =
      component(10, 2800000, "mensal", "2026-10-15", "Mensal");
    finance.totalCalculadoCentavos = 103000000;
    finance.diferencaCentavos = PRICE - 103000000;
    await denied(t, env, "09 financiamento superior a 60% com soma correta", finance);

    await denied(t, env, "10 preço comercial desatualizado", standard(),
      "broker-fixture", "broker-fixture",
      async () => env.withSecurityRulesDisabled(async context =>
        updateDoc(doc(context.firestore(), "site_units_test", COMMERCIAL_ID), {precoVista: 1085511.38})));

    await denied(t, env, "11 unidade comercial de outro apartamento", standard(),
      "broker-fixture", "broker-fixture",
      async () => env.withSecurityRulesDisabled(async context =>
        updateDoc(doc(context.firestore(), "site_units_test", COMMERCIAL_ID), {unidade: "2209 A"})));

    const invalidSchema = standard();
    invalidSchema.schemaVersao = 3;
    await denied(t, env, "12 schema padrão inválido", invalidSchema);

    await t.test("13 segunda reserva não substitui a primeira", async () => {
      await seed(env);
      const db = context(env, "broker-fixture");
      await assertSucceeds(send(db, standard()));
      await assert.rejects(
        send(db, standard(), "broker-fixture", "broker-fixture", "second-fixture"),
        {message: "Unidade não disponível"}
      );
      await verifyReserved(env);
      const second = await inspect(env, "second-fixture");
      assert.equal(second.proposalDoc.exists(), false);
      assert.equal(second.unitHistory.exists(), false);
      assert.equal(second.proposalHistory.exists(), false);
      assert.equal(second.unit.data().propostaAtualId, "proposal-fixture");
    });
    await t.test('reservas concorrentes geram uma única proposta e seus históricos', async () => {
      await seed(env);
      const results = await Promise.allSettled([
        send(context(env, 'broker-fixture'), custom(), 'broker-fixture', 'broker-fixture', 'race-a'),
        send(context(env, 'other-fixture'), custom(), 'other-fixture', 'other-fixture', 'race-b'),
      ]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      const winner = results[0].status === 'fulfilled' ? 'race-a' : 'race-b';
      const loser = winner === 'race-a' ? 'race-b' : 'race-a';
      await verifyReserved(env, winner);
      const rejected = await inspect(env, loser);
      assert.equal(rejected.proposalDoc.exists(), false);
      assert.equal(rejected.unitHistory.exists(), false);
      assert.equal(rejected.proposalHistory.exists(), false);
    });
  } finally {
    try {
      const coverage = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_PORT}/emulator/v1/projects/${PROJECT}:ruleCoverage`);
      if (!coverage.ok) throw new Error(`Falha ao obter cobertura: ${coverage.status}`);
      writeFileSync(new URL('../rule-coverage.json', import.meta.url), await coverage.text());
    } finally {
      await env.cleanup();
    }
  }
});

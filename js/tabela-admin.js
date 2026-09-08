import { registerPreviousSale } from './venda-anterior.js';
import { auth, db } from "./firebase.js";
import { ADMINISTRATION_UNITS, unitCode, destination, destinationLabel, inInventoryScope } from './estoque.js';
import { adjustUnit } from './ajuste-unidade.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
const elements = {
  filter: $("typologyFilter"),
  loading: $("unitLoading"),
  content: $("unitContent"),
  empty: $("unitEmpty"),
  towerA: $("towerAUnits"),
  towerB: $("towerBUnits"),
  toast: $("adminToast"),
  totalCount: $("totalUnitCount"),
  visibleLabel: $("visibleUnitLabel"),
  updatedAt: $("unitLastUpdated"),
  availableCount: $("availableCount"),
  availablePercentage: $("availablePercentage"),
  reservedCount: $("reservedCount"),
  reservedPercentage: $("reservedPercentage"),
  soldCount: $("soldCount"),
  soldPercentage: $("soldPercentage")
};
const state = { units: [], toastTimer: null, uid: null, selectedUnit: null, visible: [] };

onAuthStateChanged(auth, async user => {
  if (!user) return location.replace("vendas.html");
  try {
    const adminSnapshot = await getDoc(doc(db, "admins", user.uid));
    const admin = adminSnapshot.exists() ? adminSnapshot.data() : null;
    if (!admin || admin.ativo !== true || admin.tipo !== "admin") {
      window.alert("Acesso restrito a administradores ativos.");
      return location.replace("vendas.html");
    }
    document.documentElement.classList.add("page-authorized");
    state.uid = user.uid;
    elements.filter.addEventListener("change", render);
    $('inventoryScope').addEventListener('change', render);
    $('exportInventory').addEventListener('click', exportInventory);
    $('classifyAdministration').addEventListener('click', reviewAdministration);
    $('previousSaleForm').addEventListener('submit', savePreviousSale);
    $('saveUnitAdjustment').addEventListener('submit', saveUnitAdjustment);
    elements.content.addEventListener('click', event => {
      const button = event.target.closest('[data-unit-id]');
      if (button) openUnit(button.dataset.unitId);
    });
    $('closeUnitDialog').addEventListener('click', () => $('unitDialog').close());
    $('refreshUnits').addEventListener('click', () => loadUnits().catch(error => showToast(error.message, true)));
    await loadUnits();
  } catch (error) {
    console.error("[tabela-admin] inicialização:", error);
    document.documentElement.classList.add("page-authorized");
    elements.loading.textContent = "Não foi possível carregar as unidades.";
    showToast(error.message || "Falha ao carregar unidades.", true);
  }
});

async function loadUnits() {
  state.stopUnits?.();
  return new Promise((resolve, reject) => {
    state.stopUnits = onSnapshot(collection(db, 'unidades'), snapshot => {
      state.units = snapshot.docs.map(item => ({ id:item.id, ...item.data() }));
      elements.updatedAt.textContent = `Atualizado em: ${new Intl.DateTimeFormat('pt-BR', {dateStyle:'short',timeStyle:'short'}).format(new Date())}`;
      render(); resolve();
    }, error => { showToast('Conexão com o estoque interrompida. Atualize antes de operar.', true); reject(error); });
  });
}

function render() {
  const selected = elements.filter.value;
  const visible = state.units.filter(unit => (selected === "all" || typologyKey(unit.tipologia) === selected) && inInventoryScope(unit, $('inventoryScope').value));
  state.visible = visible;
  $('scopeDescription').textContent = `${$('inventoryScope').selectedOptions[0].textContent}: ${visible.length} unidades; ${visible.filter(unit => destination(unit) === 'nao_classificada').length} sem destinação cadastrada. Permutas só ficam de fora na visão Venda comercial classificada.`;
  $('blockedCount').textContent = String(visible.filter(unit => unit.status === 'bloqueada').length);
  renderSummary(visible);
  const towerA = visible.filter(unit => unitTower(unit) === "A").sort(sortUnits);
  const towerB = visible.filter(unit => unitTower(unit) === "B").sort(sortUnits);
  elements.towerA.innerHTML = towerA.map(renderUnit).join("");
  elements.towerB.innerHTML = towerB.map(renderUnit).join("");
  elements.loading.hidden = true;
  elements.empty.hidden = visible.length > 0;
  elements.content.hidden = visible.length === 0;
}

function renderSummary(units) {
  const counts = { available: 0, reserved: 0, sold: 0 };
  units.forEach(unit => {
    const group = statusGroup(unit.status);
    if (group in counts) counts[group] += 1;
  });
  const total = units.length;
  elements.totalCount.textContent = String(total);
  elements.visibleLabel.textContent = total === 1 ? "unidade" : "unidades";
  for (const key of Object.keys(counts)) {
    elements[`${key}Count`].textContent = String(counts[key]);
    elements[`${key}Percentage`].textContent = total ? `${((counts[key] / total) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% do total` : "0% do total";
  }
}

function renderUnit(unit) {
  const label = unit.unidade || unit.numero || unit.id;
  const group = statusGroup(unit.status);
  const status = statusLabel(unit.status);
  return `<button type="button" class="unit-card" data-unit-id="${escapeHtml(unit.id)}" data-status="${group}" title="${escapeHtml(status)} — abrir unidade" aria-label="Unidade ${escapeHtml(label)}, ${escapeHtml(status)}. Abrir ações e histórico">${escapeHtml(label)}</button>`;
}

let unitRequest = 0;
async function openUnit(id) {
  const request = ++unitRequest;
  const dialog = $('unitDialog');
  $('unitDialogTitle').textContent = 'Carregando unidade…';
  $('unitDialogBody').textContent = '';
  $('saveUnitAdjustment').hidden = true;
  $('previousSaleForm').hidden = true;
  if (!dialog.open) dialog.showModal();
  try {
    const [unitSnapshot, proposals, history] = await Promise.all([
      getDoc(doc(db, 'unidades', id)),
      getDocs(query(collection(db, 'propostas'), where('unidadeId', '==', id))),
      getDocs(query(collection(db, 'historico_unidades'), where('unidadeId', '==', id)))
    ]);
    if (request !== unitRequest || !dialog.open) return;
    if (!unitSnapshot.exists()) throw new Error('Unidade não encontrada.');
    const unit = unitSnapshot.data();
    $('previousSaleForm').reset();
    $('previousError').textContent = '';
    $('previousSaleForm').hidden = !(unit.status === 'vendida' && !unit.propostaAtualId && !unit.propostaId && ['venda','nao_classificada'].includes(unit.destinacao || 'nao_classificada'));

    state.selectedUnit = { id, ...unit };
    const links = [...new Set([unit.propostaAtualId, unit.propostaId].filter(Boolean))];
    const current = links.length === 1 ? proposals.docs.find(item => item.id === links[0]) : null;
    const millis = value => {
      if (!value) return 0;
      if (value.toMillis) return value.toMillis();
      const seconds = value.seconds ?? value._seconds;
      return seconds != null ? Number(seconds) * 1000 : (Date.parse(value) || 0);
    };
    const date = value => millis(value) ? new Date(millis(value)).toLocaleString('pt-BR') : 'Data não informada';
    const labels = { reservada: 'Reservada', aprovada: 'Aprovada', vendida: 'Vendida', recusada: 'Recusada', cancelada: 'Cancelada', distratada: 'Distratada', expirada: 'Expirada', teste_invalidado:'Teste invalidado', pendente_correcao:'Legada — pendente de correção' };
    const proposalLink = item => `<a href="detalhes-proposta.html?id=${encodeURIComponent(item.id)}">Proposta ${escapeHtml(item.id)} — ${escapeHtml(labels[item.data().statusProposta] || item.data().statusProposta)}</a>`;
    $('unitDialogTitle').textContent = `Unidade ${unit.unidade || id} — ${statusLabel(unit.status)} — ${destinationLabel(destination(unit))}`;
    const actions = current ? `<p>${proposalLink(current)}</p><p>${unit.status === 'vendida' ? 'Abra a proposta e escolha Registrar distrato para liberar a unidade com justificativa.' : 'Abra a proposta para analisar, aprovar, recusar ou cancelar conforme a etapa atual.'}</p>`
      : unit.status === 'disponivel' && (!unit.destinacao || unit.destinacao === 'venda') && !links.length ? `<p><a href="formulario.html?unidade=${encodeURIComponent(id)}&admin=1">Criar nova proposta</a></p>`
      : links.length ? '<p>O vínculo com a proposta precisa ser conferido antes de alterar a disponibilidade.</p>' : '<p>Sem proposta vinculada. Use o ajuste administrativo abaixo com motivo e referência; propostas legadas pendentes impedem a alteração.</p>';
    const proposalRows = [...proposals.docs].sort((a, b) => millis(b.data().criadoEm) - millis(a.data().criadoEm));
    const events = [...history.docs].sort((a, b) => millis(b.data().data) - millis(a.data().data));
    $('unitDialogBody').innerHTML = `${actions}<h3>Propostas desta unidade</h3>${proposalRows.length ? `<ul>${proposalRows.map(item => `<li>${proposalLink(item)}<br><small>${escapeHtml(date(item.data().criadoEm))}</small></li>`).join('')}</ul>` : '<p>Nenhuma proposta registrada.</p>'}<h3>Histórico da unidade</h3>${events.length ? `<ul>${events.map(item => { const data = item.data(); return `<li><strong>${escapeHtml(data.acao)}</strong> — ${escapeHtml(date(data.data))}<p>${escapeHtml(data.observacao || '')}</p></li>`; }).join('')}</ul>` : '<p>Nenhum evento registrado.</p>'}`;
    if (!links.length) {
      $('saveUnitAdjustment').hidden = false;
      $('adjustDestination').value = unit.destinacao || 'venda';
      $('adjustStatus').value = ['disponivel','reservada','vendida','bloqueada'].includes(unit.status) ? unit.status : 'bloqueada';
      $('adjustReason').value = ''; $('adjustReference').value = ''; $('adjustChecked').checked = false;
      $('adjustError').textContent = '';
    }
  } catch (error) {
    if (request === unitRequest) $('unitDialogBody').textContent = error.message || 'Falha ao consultar unidade.';
  }
}

function typologyKey(value) {
  const text = normalize(value).replace(/\s+/g, " ");
  if (text.includes("3 quarto")) return "3-quartos";
  if (text.includes("2 quarto")) return "2-quartos";
  if (text.includes("studio")) return "studio";
  if (text.includes("quarto/sala") || text.includes("quarto e sala") || text.includes("quarto sala")) return "quarto-sala";
  if (text.includes("loft")) return "loft";
  return text.replace(/\s+/g, "-");
}
function statusGroup(value) {
  const text = normalize(value);
  if (text === 'bloqueada') return 'blocked';
  if (text.includes("vend")) return "sold";
  if (text.includes("reserv") || text.includes("aprov")) return "reserved";
  if (text === "disponivel") return "available";
  return "unknown";
}
function statusLabel(value) { return { available: "Disponível", reserved: "Reservada", sold: "Vendida", blocked: 'Bloqueada', unknown: "Status não informado" }[statusGroup(value)]; }

async function saveUnitAdjustment(event) {
  event.preventDefault();
  const unit = state.selectedUnit;
  const button = $('adjustSubmit');
  if (!unit || !$('adjustChecked').checked) return;
  button.disabled = true;
  try {
    await adjustUnit({ id:unit.id, expectedStatus:unit.status, expectedDestination:destination(unit), nextStatus:$('adjustStatus').value,
      nextDestination:$('adjustDestination').value, reason:$('adjustReason').value, reference:$('adjustReference').value, uid:state.uid });
    await loadUnits(); await openUnit(unit.id);
    showToast('Ajuste salvo com histórico. O resumo público refletirá a mudança na próxima atualização.');
  } catch (error) { $('adjustError').textContent = error.message; }
  finally { button.disabled = false; }
}

async function reviewAdministration() {
  const units = state.units.filter(unit => ADMINISTRATION_UNITS.includes(unitCode(unit.unidade || unit.id)));
  if (units.length !== ADMINISTRATION_UNITS.length || new Set(units.map(unit => unitCode(unit.unidade || unit.id))).size !== 9) return showToast('Não foram encontradas exatamente as nove unidades informadas. Confira o estoque.', true);
  const list = units.map(unit => `${unit.unidade || unit.id}: ${statusLabel(unit.status)} → Administração / Bloqueada`).join('\n');
  if (!window.confirm(`Classificar as nove unidades informadas?\n\n${list}\n\nCada alteração será registrada no histórico. Unidades com proposta pendente serão recusadas.`)) return;
  $('classifyAdministration').disabled = true;
  const results = [];
  for (const unit of units) {
    if (unit.destinacao === 'administracao' && unit.status === 'bloqueada') { results.push(`${unit.unidade}: já classificada`); continue; }
    try {
      await adjustUnit({id:unit.id,expectedStatus:unit.status,expectedDestination:destination(unit),nextStatus:'bloqueada',nextDestination:'administracao',
        reason:'Unidade destinada à Administração, sem venda comercial.',reference:'Relação de nove unidades informada pelo responsável em 08/09/2026',uid:state.uid});
      results.push(`${unit.unidade}: classificada`);
    } catch (error) { results.push(`${unit.unidade}: ${error.message}`); }
  }
  $('classificationResult').textContent = results.join('\n');
  await loadUnits(); $('classifyAdministration').disabled = false;
}

function exportInventory() {
  const escapeCell = value => '"' + String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g,'""') + '"';
  const rows = [['Unidade','Destinação','Situação','Tipologia','Visão'], ...state.visible.map(unit => [unit.unidade || unit.id,destinationLabel(destination(unit)),statusLabel(unit.status),unit.tipologia,$('inventoryScope').selectedOptions[0].textContent])];
  const blob = new Blob(['\uFEFF' + rows.map(row => row.map(escapeCell).join(';')).join('\r\n')], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href=url; link.download=`estoque-${$('inventoryScope').value}.csv`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function unitTower(unit) {
  const text = String(unit.torre || unit.bloco || unit.unidade || unit.numero || unit.id).trim().toUpperCase();
  if (/TORRE\s*B/.test(text) || /(?:^|[^A-Z])B(?:[^A-Z]|$)/.test(text) || /\dB$/.test(text)) return "B";
  return "A";
}
function unitNumber(unit) { return Number(String(unit.unidade || unit.numero || unit.id).match(/\d+/)?.[0] || 0); }
function sortUnits(a, b) { return unitNumber(a) - unitNumber(b) || String(a.unidade || a.id).localeCompare(String(b.unidade || b.id), "pt-BR", { numeric: true }); }
function normalize(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function showToast(message, isError = false) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.classList.add("visible");
  state.toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 4200);
}

async function savePreviousSale(event) {
  event.preventDefault();
  if (!state.selectedUnit) return;
  const button=$('previousSubmit'); button.disabled=true;
  try {
    const value=Number($('previousValue').value);
    await registerPreviousSale({id:state.selectedUnit.id,uid:state.uid,cliente:$('previousClient').value,corretor:$('previousBroker').value,dataVenda:$('previousDate').value,valorCentavos:Math.round(value*100),condicoes:$('previousConditions').value,referencia:$('previousReference').value,confirmado:$('previousChecked').checked});
    await openUnit(state.selectedUnit.id);
    showToast('Venda anterior cadastrada. A unidade continua vendida.');
  } catch(error) { $('previousError').textContent=error.message; }
  finally { button.disabled=false; }
}

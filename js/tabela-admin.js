import { registerPreviousSale } from './venda-anterior.js?v=20261015-parcelas';
import { linkExistingSale } from './vinculo-proposta.js?v=20261015-vinculos';
import { auth, db } from "./firebase.js";
import { ADMINISTRATION_UNITS, unitCode, destination, destinationLabel, inInventoryScope } from './estoque.js';
import { adjustUnit } from './ajuste-unidade.js?v=20260910-estoque';
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
const state = { units: [], toastTimer: null, uid: null, selectedUnit: null, visible: [],
  unitAction: null, allowedActions: {}, dirtyForms: new Set(), formBaselines: new Map(), saving: false };
const unitActions = {
  previous: { form: 'previousSaleForm', button: 'choosePreviousSale', label: 'cadastro da venda anterior' },
  link: { form: 'linkProposalForm', button: 'chooseExistingProposal', label: 'vínculo da proposta' },
  adjust: { form: 'saveUnitAdjustment', button: 'chooseUnitAdjustment', label: 'situação e destinação' }
};

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
    state.previousSaleEditor = window.CityParkPreviousSaleForm.create($('previousSaleForm'));
    $('previousSaleForm').addEventListener('submit', savePreviousSale);
    $('linkProposalForm').addEventListener('submit', saveExistingSaleLink);
    $('linkProposalSelect').addEventListener('change', updateProposalPreview);
    $('saveUnitAdjustment').addEventListener('submit', saveUnitAdjustment);
    elements.content.addEventListener('click', event => {
      const button = event.target.closest('[data-unit-id]');
      if (button) openUnit(button.dataset.unitId);
    });
    $('closeUnitDialog').addEventListener('click', closeUnit);
    $('unitDialog').addEventListener('cancel', event => { event.preventDefault(); closeUnit(); });
    for (const [action, config] of Object.entries(unitActions)) {
      $(config.button).addEventListener('click', () => selectUnitAction(action));
      for (const event of ['input', 'change', 'click']) {
        $(config.form).addEventListener(event, () => trackUnitDraft(config.form));
      }
    }
    $('discardUnitAction').addEventListener('click', discardUnitAction);
    window.addEventListener('beforeunload', event => {
      refreshUnitDrafts();
      if (state.saving || state.dirtyForms.size) { event.preventDefault(); event.returnValue = ''; }
    });
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
      state.units = snapshot.docs.map(item => ({ ...item.data(), id:item.id }));
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
function unitFormValue(formId) {
  return JSON.stringify([...$(formId).querySelectorAll('input, select, textarea')]
    .filter(field => !field.readOnly)
    .map(field => [field.id, field.type, field.type === 'checkbox' ? field.checked : field.value]));
}
function trackUnitDraft(formId) {
  if (!state.selectedUnit || state.saving) return;
  if (unitFormValue(formId) === state.formBaselines.get(formId)) state.dirtyForms.delete(formId);
  else state.dirtyForms.add(formId);
  renderUnitDraftNotice();
}
function refreshUnitDrafts() {
  for (const config of Object.values(unitActions)) trackUnitDraft(config.form);
}
function markUnitDraftsSaved() {
  for (const config of Object.values(unitActions)) state.formBaselines.set(config.form, unitFormValue(config.form));
  state.dirtyForms.clear();
  renderUnitDraftNotice();
}
function renderUnitDraftNotice() {
  const pending = Object.values(unitActions).filter(config => state.dirtyForms.has(config.form));
  $('unitDraftNotice').hidden = !pending.length;
  $('unitDraftMessage').textContent = pending.length ? `Dados ainda não salvos: ${pending.map(config => config.label).join(' e ')}. Trocar de ação mantém os campos preenchidos. Conclua pelo botão de salvar da ação correspondente.` : '';
  $('discardUnitAction').hidden = !state.unitAction || !state.dirtyForms.has(unitActions[state.unitAction].form);
}
function selectUnitAction(action) {
  if (state.saving || !state.allowedActions[action]) return;
  refreshUnitDrafts();
  state.unitAction = action;
  for (const [key, config] of Object.entries(unitActions)) {
    $(config.form).hidden = key !== action;
    $(config.button).setAttribute('aria-pressed', String(key === action));
  }
  renderUnitDraftNotice();
}
function resetUnitForm(action) {
  const config = unitActions[action];
  $(config.form).reset();
  if (action === 'previous') state.previousSaleEditor?.reset();
  if (action === 'link') updateProposalPreview();
  if (action === 'adjust') {
    const unit = state.selectedUnit;
    $('adjustDestination').value = unit.destinacao || 'venda';
    $('adjustStatus').value = ['disponivel','reservada','vendida','bloqueada'].includes(unit.status) ? unit.status : 'bloqueada';
  }
  $({previous:'previousError', link:'linkProposalError', adjust:'adjustError'}[action]).textContent = '';
  state.formBaselines.set(config.form, unitFormValue(config.form));
  state.dirtyForms.delete(config.form);
  renderUnitDraftNotice();
}
function discardUnitAction() {
  if (state.saving || !state.unitAction || !state.dirtyForms.has(unitActions[state.unitAction].form)) return;
  if (window.confirm(`Descartar os dados não salvos de ${unitActions[state.unitAction].label}?`)) resetUnitForm(state.unitAction);
}
function confirmLeavingUnit() {
  refreshUnitDrafts();
  return !state.saving && (!state.dirtyForms.size || window.confirm('Há dados não salvos nesta unidade. Deseja sair e descartar esses dados?'));
}
function closeUnit() {
  if (!confirmLeavingUnit()) return;
  ++unitRequest;
  state.dirtyForms.clear();
  state.selectedUnit = null;
  $('unitDialog').close();
}
function setUnitSaving(saving) {
  state.saving = saving;
  $('closeUnitDialog').disabled = saving;
  $('discardUnitAction').disabled = saving;
  for (const [action, config] of Object.entries(unitActions)) {
    $(config.button).disabled = saving || !state.allowedActions[action];
    $(config.form).inert = saving;
    $(config.form).setAttribute('aria-busy', String(saving));
  }
}
function canSaveUnitAction(action, errorId) {
  if (state.saving || !state.selectedUnit || state.unitAction !== action || !state.allowedActions[action]) return false;
  refreshUnitDrafts();
  const pending = Object.values(unitActions).filter(config => config.form !== unitActions[action].form && state.dirtyForms.has(config.form));
  if (pending.length) {
    $(errorId).textContent = `Há dados não salvos em ${pending.map(config => config.label).join(' e ')}. Volte a essa ação para concluir ou descartar os dados antes de salvar aqui.`;
    return false;
  }
  return true;
}
const proposalStatusLabels = { reservada: 'Reservada', aprovada: 'Aprovada', vendida: 'Vendida', recusada: 'Recusada', cancelada: 'Cancelada', distratada: 'Distratada', expirada: 'Expirada', teste_invalidado: 'Teste invalidado', pendente_correcao: 'Legada — pendente de correção' };
function proposalHref(id) {
  const encodedId = encodeURIComponent(id);
  return `detalhes-proposta.html?id=${encodedId}#proposta=${encodedId}`;
}
function proposalClient(proposal) {
  const client = proposal.cliente || {};
  return (client.tipoCliente === 'PJ' ? client.razaoSocial || client.nomeCompleto : client.nomeCompleto || client.razaoSocial) || 'Cliente não informado';
}
function proposalLink(item) {
  const proposal = item.data();
  return `<a href="${proposalHref(item.id)}">Proposta ${escapeHtml(item.id)} — ${escapeHtml(proposalStatusLabels[proposal.statusProposta] || proposal.statusProposta || 'Status não informado')}</a>`;
}
function linkedProposalCard(item) {
  const proposal = item.data();
  return `<section class="linked-proposal" aria-label="Proposta vinculada"><h3>Proposta vinculada</h3><p>${escapeHtml(proposalClient(proposal))} · ${escapeHtml(proposalStatusLabels[proposal.statusProposta] || proposal.statusProposta || '')}</p><small>${escapeHtml(item.id)}</small><p><a class="proposal-detail-link" href="${proposalHref(item.id)}">Abrir proposta vinculada</a></p></section>`;
}
async function openUnit(id, {afterSave = false} = {}) {
  if (!afterSave && !confirmLeavingUnit()) return;
  const request = ++unitRequest;
  const dialog = $('unitDialog');
  $('unitDialogTitle').textContent = 'Carregando unidade…';
  $('unitDialogBody').textContent = '';
  $('saveUnitAdjustment').hidden = true;
  $('previousSaleForm').hidden = true;
  $('linkProposalForm').hidden = true;
  $('unitActionChooser').hidden = true;
  $('unitDialogHistory').hidden = true;
  $('unitDialogHistory').open = false;
  state.unitAction = null;
  state.allowedActions = {};
  state.dirtyForms.clear();
  state.formBaselines.clear();
  renderUnitDraftNotice();
  state.selectedUnit = null;
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
    const links = [...new Set([unit.propostaAtualId, unit.propostaId].filter(Boolean))];
    const proposalRows = [...proposals.docs];
    // Resolve explicit document references even when a legacy record is absent from the unit query.
    const missingLinks = links.filter(link => !proposalRows.some(item => item.id === link));
    const linkedSnapshots = await Promise.all(missingLinks.map(link => getDoc(doc(db, 'propostas', link))));
    if (request !== unitRequest || !dialog.open) return;
    proposalRows.push(...linkedSnapshots.filter(item => item.exists()));
    const current = links.length === 1 ? proposalRows.find(item => item.id === links[0]) : null;
    const canRegisterSale = unit.status === 'vendida' && !links.length && ['venda','nao_classificada'].includes(unit.destinacao || 'nao_classificada');
    const candidates = proposalRows.filter(item => item.data().unidadeId === id && item.data().statusProposta === 'vendida');
    $('linkProposalSelect').innerHTML = '<option value="">Selecione a proposta</option>' + candidates.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(proposalClient(item.data()))} — ${escapeHtml(item.id)}</option>`).join('');
    $('linkProposalSelect').disabled = !candidates.length;
    $('linkProposalSubmit').disabled = !candidates.length;
    $('linkProposalFields').hidden = !candidates.length;
    $('linkProposalEmpty').hidden = candidates.length > 0;
    const hasActiveProposal = proposalRows.some(item => !['recusada','cancelada','expirada','distratada','teste_invalidado'].includes(item.data().statusProposta));
    state.allowedActions = { previous: canRegisterSale && !hasActiveProposal, link: canRegisterSale && candidates.length > 0, adjust: !links.length && !hasActiveProposal };
    $('unitActionChooser').hidden = !canRegisterSale;
    $('existingProposalHint').textContent = candidates.length ? `${candidates.length === 1 ? '1 proposta vendida disponível' : `${candidates.length} propostas vendidas disponíveis`} para esta unidade.` : 'Nenhuma proposta vendida disponível. Cadastre a venda anterior.';
    $('previousSaleConflict').hidden = !hasActiveProposal;
    $('previousSubmit').disabled = hasActiveProposal;
    updateProposalPreview();

    state.selectedUnit = { ...unit, id };
    const millis = value => {
      if (!value) return 0;
      if (value.toMillis) return value.toMillis();
      const seconds = value.seconds ?? value._seconds;
      return seconds != null ? Number(seconds) * 1000 : (Date.parse(value) || 0);
    };
    const date = value => millis(value) ? new Date(millis(value)).toLocaleString('pt-BR') : 'Data não informada';
    $('unitDialogTitle').textContent = `Unidade ${unit.unidade || id} — ${statusLabel(unit.status)} — ${destinationLabel(destination(unit))}`;
    const actions = current ? `${linkedProposalCard(current)}${current.data().unidadeId !== id ? '<p role="alert">Confira o vínculo: a proposta aponta para outra unidade ou está sem identificação de unidade.</p>' : ''}`
      : unit.status === 'disponivel' && (!unit.destinacao || unit.destinacao === 'venda') && !links.length && !hasActiveProposal ? `<p><a href="formulario.html?unidade=${encodeURIComponent(id)}&admin=1">Criar nova proposta</a></p>`
      : links.length ? '<p role="alert">A proposta vinculada não foi encontrada ou há vínculos conflitantes. Confira os registros antes de alterar a unidade.</p>'
      : canRegisterSale ? `<div class="unit-sale-notice"><strong>Venda sem proposta vinculada</strong><p>${hasActiveProposal && !candidates.length ? 'Há uma proposta ativa ou legada pendente. Consulte as propostas e o histórico antes de continuar.' : 'Registre os dados da venda anterior ou selecione uma proposta existente para completar o cadastro.'}</p></div>`
      : hasActiveProposal ? '<p role="alert">Há uma proposta ativa ou legada pendente. Consulte as propostas e o histórico antes de alterar a unidade.</p>'
      : '<p>Sem proposta vinculada. Altere a situação ou a destinação abaixo, informando o motivo e a referência documental.</p>';
    proposalRows.sort((a, b) => millis(b.data().criadoEm) - millis(a.data().criadoEm));
    const events = [...history.docs].sort((a, b) => millis(b.data().data) - millis(a.data().data));
    $('unitDialogBody').innerHTML = actions;
    $('unitHistoryContent').innerHTML = `<h3>Propostas desta unidade</h3>${proposalRows.length ? `<ul>${proposalRows.map(item => `<li>${proposalLink(item)}<br><small>${escapeHtml(date(item.data().criadoEm))}</small></li>`).join('')}</ul>` : '<p>Nenhuma proposta registrada.</p>'}<h3>Histórico da unidade</h3>${events.length ? `<ul>${events.map(item => { const data = item.data(); return `<li><strong>${escapeHtml(data.acao)}</strong> — ${escapeHtml(date(data.data))}<p>${escapeHtml(data.observacao || '')}</p></li>`; }).join('')}</ul>` : '<p>Nenhum evento registrado.</p>'}`;
    $('unitDialogHistory').hidden = false;
    $('unitDialogHistory').open = hasActiveProposal && !current;
    for (const action of Object.keys(unitActions)) {
      resetUnitForm(action);
      $(unitActions[action].button).setAttribute('aria-pressed', 'false');
    }
    setUnitSaving(state.saving);
    // Selection after a successful save also runs while the dialog is locked.
    const initialAction = state.allowedActions.link ? 'link' : state.allowedActions.previous ? 'previous' : state.allowedActions.adjust ? 'adjust' : null;
    if (initialAction) {
      state.unitAction = initialAction;
      $(unitActions[initialAction].form).hidden = false;
      $(unitActions[initialAction].button).setAttribute('aria-pressed', 'true');
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
  if (!canSaveUnitAction('adjust', 'adjustError') || !$('adjustChecked').checked) return;
  $('adjustError').textContent = '';
  if ($('adjustStatus').value === unit.status && $('adjustDestination').value === destination(unit)) {
    $('adjustError').textContent = 'A situação e a destinação já estão assim. ' + (state.allowedActions.previous ? 'Para registrar cliente e contrato de uma venda anterior, selecione Cadastrar venda anterior.' : 'Escolha uma situação ou destinação diferente para salvar o ajuste.');
    return;
  }
  setUnitSaving(true);
  button.disabled = true;
  try {
    await adjustUnit({ id:unit.id, expectedStatus:unit.status, expectedDestination:destination(unit), nextStatus:$('adjustStatus').value,
      nextDestination:$('adjustDestination').value, reason:$('adjustReason').value, reference:$('adjustReference').value, uid:state.uid });
    state.dirtyForms.clear();
    await openUnit(unit.id, {afterSave: true});
    showToast('Situação e destinação salvas com histórico. Este ajuste não cadastra uma proposta.');
  } catch (error) { $('adjustError').textContent = error.message; }
  finally { button.disabled = false; setUnitSaving(false); }
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
  $('classifyAdministration').disabled = false;
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
  if (!canSaveUnitAction('previous', 'previousError')) return;
  const unitId = state.selectedUnit.id;
  const button=$('previousSubmit'); button.disabled=true;
  $('previousError').textContent = '';
  setUnitSaving(true);
  try {
    const proposalId = await registerPreviousSale({id:unitId,uid:state.uid,...state.previousSaleEditor.read()});
    markUnitDraftsSaved();
    setUnitSaving(false);
    if ($('unitDialog').open && state.selectedUnit?.id === unitId) {
      window.location.assign(proposalHref(proposalId));
      return;
    }
    showToast('Venda anterior cadastrada e proposta vinculada. O detalhamento está disponível na unidade.');
  } catch(error) { $('previousError').textContent=error.message; }
  finally { button.disabled=false; setUnitSaving(false); }
}

function updateProposalPreview() {
  const id = $('linkProposalSelect').value;
  $('linkProposalPreview').hidden = !id;
  if (id) $('linkProposalPreview').href = proposalHref(id);
  else $('linkProposalPreview').removeAttribute('href');
}

async function saveExistingSaleLink(event) {
  event.preventDefault();
  if (!canSaveUnitAction('link', 'linkProposalError')) return;
  const unitId = state.selectedUnit.id;
  const button = $('linkProposalSubmit'); button.disabled = true;
  $('linkProposalError').textContent = '';
  setUnitSaving(true);
  try {
    await linkExistingSale({ id: unitId, proposalId: $('linkProposalSelect').value, uid: state.uid,
      reason: $('linkProposalReason').value, reference: $('linkProposalReference').value, confirmed: $('linkProposalChecked').checked });
    state.dirtyForms.clear();
    if ($('unitDialog').open && state.selectedUnit?.id === unitId) await openUnit(unitId, {afterSave: true});
    showToast('Proposta vinculada. O detalhamento está disponível na unidade.');
  } catch (error) { $('linkProposalError').textContent = error.message; }
  finally { button.disabled = $('linkProposalSelect').disabled; setUnitSaving(false); }
}

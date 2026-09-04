/* BETA 14L · MODO REAL SINCRONIZADO + VALIDAÇÃO DA FONTE COMERCIAL */
/* BETA 14K · SINAL UNIFICADO ÀS PARCELAS + FINANCIAMENTO OPCIONAL */
/* BETA 14G · SINAL COMO PARCELA */
/* BETA 14F · QTD + DATA */
/* BETA 14E · ALINHAMENTO DO SINAL */
/* BETA 14D · SINAL ZERO E FORMATAÇÃO */
/* BETA 14C · CALENDÁRIO ÂNCORA E SINAL OPCIONAL */
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, query, where, runTransaction, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

const PaymentPlan = window.CityParkPaymentPlan;
const MAX_PAYMENT_GROUPS = PaymentPlan?.MAX_PAYMENT_GROUPS ?? 12;
const PAYMENT_LABELS = {
  mensal: "Mensal", semestral: "Semestral", anual: "Anual",
  outra: "Outro / negociação especial", unica: "Parcela única"
};
const PAYMENT_LIMITS = { mensal: 240, semestral: 60, anual: 30, outra: 1 };

let currentStep = 1;
const totalSteps = 3;
const form = document.getElementById("proposalForm");
const formMessage = document.getElementById("formMessage");
const submitButton = form.querySelector("button[type='submit']");
let currentUser = null;
let brokerData = null;
let proposalBrokerId = null;
let adminMode = false;
let approvedBrokers = new Map();
let currentUnit = null;
let currentTableValueCents = null;
let paymentGroupSequence = 0;
let reservationSettings = {
  prazoReservaDias: 7,
  modoEnvioTeste: true
};
let reservationSettingsLoaded = false;

let currentCommercialCondition = null;
let currentPricingUnit = null;
const SHEETS_COMMERCIAL_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwD1zCtYAD_UMaFv9rF63QWJ-RYqZbTv5RbRSVCoUqpZB8WFnOqJAhdqCmd_kxhneewoA/exec";

let commercialConfig = PaymentPlan?.mergeCommercialConfig?.() || {
  descontoMaximoPercentual: 15,
  alertaChavesPercentual: 60,
  diasVencimento: [15, 30],
  limites: { mensal: "2029-12", semestral: "2029-09", anual: "2029-09", outra: "2029-09" }
};

document.addEventListener("DOMContentLoaded", () => {
  fillUnitFromUrl();
  setupNavigation();
  setupToggles();
  setupSignalQuantityControl();
  setupStandardDueDayControl();
  setupInputCleanup();
  setupCalculator();
  lockBrokerFields();
  updateProgress();
  loadUnitData();
});

onAuthStateChanged(auth, async user => {
  if (!user) {
    alert("Você precisa fazer login para enviar uma proposta.");
    window.location.replace("vendas.html");
    return;
  }
  try {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryParams = new URLSearchParams(window.location.search);
    const requestedAdminMode = hashParams.get("admin") === "1" || queryParams.get("admin") === "1";
    const adminSnapshot = requestedAdminMode ? await getDoc(doc(db, "admins", user.uid)) : null;
    const admin = adminSnapshot?.exists() ? adminSnapshot.data() : null;
    if (requestedAdminMode && admin?.ativo === true && admin?.tipo === "admin") {
      currentUser = user;
      adminMode = true;
      await setupAdminBrokerPicker();
      return;
    }
    const brokerSnapshot = await getDoc(doc(db, "corretores", user.uid));
    if (!brokerSnapshot.exists() || brokerSnapshot.data().aprovado !== true) {
      alert("Seu cadastro de corretor ainda não está aprovado.");
      window.location.replace("vendas.html");
      return;
    }
    currentUser = user;
    brokerData = brokerSnapshot.data();
    proposalBrokerId = user.uid;
    fillBrokerData();
  } catch (error) {
    console.error("[formulario] autenticação:", error);
    alert("Não foi possível validar seu cadastro agora.");
    window.location.replace("vendas.html");
  }
});

async function setupAdminBrokerPicker() {
    // BETA 15D - CACHE DE CORRETORES
  const cacheKey = "citypark:admin:approved-brokers:v1";
  const cacheTtlMs = 20 * 60 * 1000;
  let brokers = [];

  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
    if (
      cached &&
      Number.isFinite(cached.savedAt) &&
      Array.isArray(cached.items) &&
      Date.now() - cached.savedAt < cacheTtlMs
    ) {
      brokers = cached.items;
      console.info(`[BETA 15D] approved brokers from cache: ${brokers.length}`);
    }
  } catch (error) {
    console.warn("[BETA 15D] broker cache ignored:", error);
  }

  if (!brokers.length) {
    const snapshot = await getDocs(
      query(collection(db, "corretores"), where("aprovado", "==", true))
    );

    brokers = snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) =>
        String(a.nome ?? a.email ?? "").localeCompare(
          String(b.nome ?? b.email ?? ""),
          "pt-BR"
        )
      );

    try {
      sessionStorage.setItem(
        cacheKey,
        JSON.stringify({ savedAt: Date.now(), items: brokers })
      );
    } catch (error) {
      console.warn("[BETA 15D] could not save broker cache:", error);
    }

    console.info(`[BETA 15D] approved brokers queried from Firestore: ${brokers.length}`);
  }

  approvedBrokers = new Map(brokers.map(item => [item.id, item]));
  const picker = document.getElementById("adminBrokerPicker");
  const select = document.getElementById("adminBrokerSelect");
  picker.classList.remove("hidden");
  select.required = true;
  select.innerHTML = `<option value="">Selecione um corretor aprovado</option>${brokers.map(item => (
    `<option value="${escapeHtml(item.id)}">${escapeHtml(item.nome ?? "Sem nome")} — ${escapeHtml(item.creci ?? "CRECI não informado")} — ${escapeHtml(item.email ?? "")}</option>`
  )).join("")}`;
  select.addEventListener("change", () => {
    proposalBrokerId = select.value || null;
    brokerData = proposalBrokerId ? approvedBrokers.get(proposalBrokerId) ?? null : null;
    fillBrokerData();
  });
}

function unitDocumentId(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function fillUnitFromUrl() {
  const queryParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const unit = queryParams.get("unidade") || hashParams.get("unidade") || "";
  document.getElementById("unit").value = unit;
  document.getElementById("unitPreview").textContent = unit || "Não informada";
}

async function loadUnitData() {
  const id = unitDocumentId(document.getElementById("unit").value);
  if (!id) {
    currentUnit = null;
    currentPricingUnit = null;
    currentCommercialCondition = null;
    renderStandardConditionSummary();
    return updateValueSummary();
  }

  try {
    const optionalGet = async reference => {
      try { return await getDoc(reference); }
      catch (error) {
        console.warn("[formulario] configuração opcional indisponível:", error?.message || error);
        return null;
      }
    };

    const [snapshot, configSnapshot, fallbackConditionSnapshot] = await Promise.all([
      getDoc(doc(db, "unidades", id)),
      optionalGet(doc(db, "configuracoes_comerciais", "propostas")),
      optionalGet(doc(db, "condicoes_comerciais", "atual"))
    ]);

    if (!snapshot.exists()) throw new Error("Unidade não encontrada.");
    currentUnit = { id: snapshot.id, ...snapshot.data() };
    commercialConfig = PaymentPlan.mergeCommercialConfig(configSnapshot?.exists?.() ? configSnapshot.data() : {});

    let commercial = { unit: null, condition: null };
    try {
      commercial = await loadCommercialSnapshotFromFirebaseTest(id);
    } catch (error) {
      console.warn("[formulario] consulta comercial ao Firebase TESTE falhou por completo:", error);
    }

    // PREÇOS: Sheets quando disponível; Firestore operacional apenas como fallback.
    currentPricingUnit = commercial.unit || pricingSnapshotFromFirestoreUnit(currentUnit);

    // CONDIÇÃO: não é descartada só porque preço falhou.
    // Sheets é prioritário; documento Firestore é fallback futuro/produção.
    currentCommercialCondition = commercial.condition ||
      (fallbackConditionSnapshot?.exists?.() ? normalizeCommercialCondition(fallbackConditionSnapshot.data()) : null);

    currentTableValueCents = currentPricingUnit?.precoVistaCentavos ?? null;
    if (!Number.isInteger(currentTableValueCents)) throw new Error("A unidade não possui um valor de tabela válido.");

    if (!currentCommercialCondition) {
      console.warn("[formulario] nenhuma condição comercial vigente pôde ser carregada.");
    }

    renderStandardConditionSummary();
    updateValueSummary();
    recalculateCustomPlan();
  } catch (error) {
    currentUnit = null;
    currentPricingUnit = null;
    currentTableValueCents = null;
    currentCommercialCondition = null;
    renderStandardConditionSummary();
    updateValueSummary();
    showMessage(error.message || "Não foi possível carregar os valores da unidade.", "error");
  }
}

function lockBrokerFields() {
  ["brokerName", "brokerCreci", "brokerPhone", "brokerEmail", "brokerRealEstate"].forEach(id => {
    const field = document.getElementById(id);
    field.readOnly = true;
    field.setAttribute("aria-readonly", "true");
  });
}

function fillBrokerData() {
  const values = {
    brokerName: brokerData?.nome, brokerCreci: brokerData?.creci,
    brokerPhone: brokerData?.telefone,
    brokerEmail: brokerData?.email || (adminMode ? "" : currentUser?.email),
    brokerRealEstate: brokerData?.imobiliaria
  };
  Object.entries(values).forEach(([id, value]) => { document.getElementById(id).value = value || ""; });
}

function setupNavigation() {
  document.querySelectorAll("[data-next]").forEach(button => button.addEventListener("click", nextStep));
  document.querySelectorAll("[data-previous]").forEach(button => button.addEventListener("click", previousStep));
}

function setupToggles() {
  document.querySelectorAll("input[name='clientType']").forEach(input => input.addEventListener("change", updateClientFields));
  document.querySelectorAll("input[name='proposalType']").forEach(input => input.addEventListener("change", updateProposalFields));
  updateClientFields();
  updateProposalFields();
}

function updateClientFields() {
  const type = document.querySelector("input[name='clientType']:checked").value;
  document.getElementById("physicalPersonFields").classList.toggle("hidden", type !== "fisica");
  document.getElementById("legalPersonFields").classList.toggle("hidden", type !== "juridica");
}

function selectedProposalType() {
  return document.querySelector("input[name='proposalType']:checked")?.value === "outro" ? "personalizada" : "padrao";
}

function updateProposalFields() {
  const proposalType = selectedProposalType();

  document.getElementById("customProposalWrap")
    ?.classList.toggle("hidden", proposalType !== "personalizada");

  document.getElementById("standardConditionSummary")
    ?.classList.toggle("hidden", proposalType !== "padrao");

  updateValueSummary();
  recalculateCustomPlan();
  toggleStandardDueDayControl();
  syncOptionalSignalFields(); // Beta 14c
}

function setupInputCleanup() {
  form.querySelectorAll("input, textarea, select").forEach(field => {
    field.addEventListener("input", () => field.classList.remove("invalid"));
    field.addEventListener("change", () => field.classList.remove("invalid"));
  });
}

function setupCalculator() {
  if (!PaymentPlan) return showMessage("A calculadora financeira não pôde ser carregada. Atualize a página.", "error");
  applyDateMinimums();
  const modal = document.getElementById("paymentTypeModal");
  const openButton = document.getElementById("openPaymentModal");
  const closeButton = document.getElementById("closePaymentModal");
  openButton.addEventListener("click", openPaymentTypeModal);
  closeButton.addEventListener("click", () => closePaymentTypeModal());
  modal.addEventListener("click", event => {
    if (event.target === modal) closePaymentTypeModal();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) closePaymentTypeModal();
  });
  document.getElementById("addPaymentButton").addEventListener("click", () => {
    const row = addPaymentGroup(document.getElementById("paymentTypeSelect").value);
    if (!row) return;
    closePaymentTypeModal({ restoreFocus: false });
    row.querySelector("[data-field='value']")?.focus();
  });
  document.getElementById("paymentGrid").addEventListener("input", event => {
    if (event.target.classList.contains("currency-input")) formatCurrencyField(event.target);
    event.target.classList.remove("invalid");
    const row = event.target.closest("[data-payment-id]");
    if (row && ["month", "day"].includes(event.target.dataset.field)) refreshPaymentQuantity(row);
    recalculateCustomPlan();
  });
  document.getElementById("paymentGrid").addEventListener("change", event => {
    event.target.classList.remove("invalid");
    const row = event.target.closest("[data-payment-id]");
    if (row && ["month", "day"].includes(event.target.dataset.field)) refreshPaymentQuantity(row);
    recalculateCustomPlan();
  });
  document.getElementById("dynamicPayments").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-payment]");
    if (!button) return;
    button.closest("[data-payment-id]")?.remove();
    updateAddPaymentButton();
    recalculateCustomPlan();
  });
}

function openPaymentTypeModal() {
  if (document.getElementById("openPaymentModal").disabled) return;
  document.getElementById("paymentTypeModal").classList.remove("hidden");
  document.body.classList.add("modal-open");
  document.getElementById("paymentTypeSelect").focus();
}

function closePaymentTypeModal({ restoreFocus = true } = {}) {
  document.getElementById("paymentTypeModal").classList.add("hidden");
  document.body.classList.remove("modal-open");
  if (restoreFocus) document.getElementById("openPaymentModal").focus();
}

function addPaymentGroup(periodicity) {
  const container = document.getElementById("dynamicPayments");
  if (container.children.length >= MAX_PAYMENT_GROUPS) return null;
  const id = `payment-${++paymentGroupSequence}`;
  const isSpecial = periodicity === "outra";
  const row = document.createElement("article");
  row.className = `payment-row dynamic-payment-row enabled${isSpecial ? " is-special" : ""}`;
  row.dataset.paymentId = id;
  row.dataset.periodicity = periodicity;
  row.innerHTML = `
    <div class="payment-name"><strong>${escapeHtml(PAYMENT_LABELS[periodicity])}</strong>
      ${isSpecial ? `<small>Negociação especial</small>` : `<small>${paymentHelp(periodicity)}</small>`}
    </div>
    <label class="payment-value-field"><span>Valor da parcela</span><input data-field="value" class="currency-input" type="text" inputmode="decimal" placeholder="R$ 0,00"></label>
    <label class="payment-month-field"><span>Mês do 1º vencimento</span><input data-field="month" type="month" min="${PaymentPlan.currentMonthInput()}"></label>
    <label class="payment-day-field"><span>Dia</span><select data-field="day"><option value="">Selecione</option><option value="15">15</option><option value="30">30</option></select></label>
    <label class="payment-quantity-field"><span>Qtd.</span><select data-field="quantity" disabled><option value="">Informe o vencimento</option></select><small class="quantity-hint" data-quantity-hint>—</small></label>
    <div class="payment-subtotal"><span>Subtotal</span><strong data-payment-total>R$ 0,00</strong></div>
    <div class="payment-percent-wrap"><span>% da proposta</span><strong data-payment-percent>0,00%</strong></div>
    <button type="button" class="payment-remove" data-remove-payment="${id}" aria-label="Remover parcela">×</button>
    ${isSpecial ? `<label class="special-description special-description-wide"><span>Descrição da negociação</span><input data-field="description" type="text" maxlength="300" placeholder="Descreva de forma objetiva a negociação especial"></label>` : ""}`;
  container.appendChild(row);
  updateAddPaymentButton();
  recalculateCustomPlan();
  return row;
}

function refreshDueDayOptions(row) {
  const monthField = row.querySelector("[data-field='month']");
  const dayField = row.querySelector("[data-field='day']");
  if (!monthField || !dayField) return;
  const month = monthField.value;
  [...dayField.options].forEach(option => {
    if (!option.value) return;
    const effectiveDate = PaymentPlan.buildAllowedDueDate(month, Number(option.value), commercialConfig);
    option.disabled = !!month && (!effectiveDate || !PaymentPlan.isDateOnOrAfter(effectiveDate));
  });
  const selected = dayField.options[dayField.selectedIndex];
  if (selected?.disabled) dayField.value = "";
}

function refreshPaymentQuantity(row) {
  const periodicity = row.dataset.periodicity;
  const monthField = row.querySelector("[data-field='month']");
  const dayField = row.querySelector("[data-field='day']");
  const quantityField = row.querySelector("[data-field='quantity']");
  const hint = row.querySelector("[data-quantity-hint]");
  if (!monthField || !dayField || !quantityField) return;

  monthField.min = PaymentPlan.currentMonthInput();
  refreshDueDayOptions(row);

  const day = Number(dayField.value);
  const date = PaymentPlan.buildAllowedDueDate(monthField.value, day, commercialConfig);
  const isFutureOrToday = !!date && PaymentPlan.isDateOnOrAfter(date);
  const maximum = isFutureOrToday
    ? PaymentPlan.maxQuantityForDate(date, periodicity, commercialConfig, day)
    : 0;
  const previous = Number(quantityField.value);

  quantityField.innerHTML = maximum > 0
    ? Array.from({ length: maximum }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")
    : `<option value="">Sem parcelas possíveis</option>`;
  quantityField.disabled = maximum < 1;

  if (maximum > 0) {
    quantityField.value = Number.isInteger(previous) && previous >= 1 && previous <= maximum
      ? String(previous)
      : String(maximum);
    if (hint) hint.textContent = `Máx.: ${maximum}`;
  } else if (hint) {
    hint.textContent = monthField.value && dayField.value ? "Vencimento inválido" : "Informe mês e dia";
  }

  row.dataset.firstDate = isFutureOrToday ? date : "";
  row.dataset.maxQuantity = String(maximum || 0);
}

function paymentHelp(periodicity) {
  return { mensal: "Repetição a cada mês", semestral: "Repetição a cada 6 meses", anual: "Repetição a cada 12 meses" }[periodicity] ?? "";
}

function updateAddPaymentButton() {
  const count = document.getElementById("dynamicPayments").children.length;
  const button = document.getElementById("addPaymentButton");
  const openButton = document.getElementById("openPaymentModal");
  const reachedLimit = count >= MAX_PAYMENT_GROUPS;
  button.disabled = reachedLimit;
  openButton.disabled = reachedLimit;
  openButton.title = reachedLimit ? `Limite de ${MAX_PAYMENT_GROUPS} grupos atingido` : "Adicionar parcela";
  button.textContent = reachedLimit ? `Limite de ${MAX_PAYMENT_GROUPS} grupos` : "+ Adicionar parcela";
}

function formatCurrencyField(field) {
  const digits = field.value.replace(/\D/g, "");
  field.value = digits ? formatMoney(Number(digits)) : "";
}

function applyDateMinimums() {
  const signalMonth = document.getElementById("paymentSinalMonth");
  if (signalMonth) {
    signalMonth.min = PaymentPlan.currentMonthInput();
    refreshSignalDueDayOptions();
  }

  document.querySelectorAll("[data-field='month']").forEach(field => {
    field.min = PaymentPlan.currentMonthInput();
  });
}

function formatProposalPercent(partCents, totalCents) {
  const part = Number(partCents);
  const total = Number(totalCents);
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0 || part < 0) return "0,00%";
  return `${((part / total) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function nextStep() { if (validateCurrentStep() && currentStep < totalSteps) showStep(currentStep + 1); }
function previousStep() { if (currentStep > 1) showStep(currentStep - 1); }

function showStep(step) {
  currentStep = step;
  document.querySelectorAll(".form-step").forEach(section => section.classList.toggle("active", Number(section.dataset.step) === step));
  clearMessage();
  updateProgress();
  document.querySelector(".form-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateProgress() {
  document.getElementById("progressFill").style.width = `${((currentStep - 1) / (totalSteps - 1)) * 100}%`;
  document.querySelectorAll("[data-progress-step]").forEach(item => {
    const step = Number(item.dataset.progressStep);
    item.classList.toggle("active", step === currentStep);
    item.classList.toggle("complete", step < currentStep);
  });
}

function requiredFieldIds() {
  if (currentStep === 1) return adminMode
    ? ["adminBrokerSelect", "brokerName", "brokerCreci", "brokerPhone", "brokerEmail"]
    : ["brokerName", "brokerCreci", "brokerPhone", "brokerEmail"];
  if (currentStep === 2) return document.querySelector("input[name='clientType']:checked").value === "fisica"
    ? ["clientName", "clientCpf", "clientPhone", "clientEmail"]
    : ["companyName", "companyCnpj", "companyPhone", "companyEmail"];
  return ["unit"];
}

function validateCurrentStep() {
  let firstInvalid = null;
  for (const id of requiredFieldIds()) {
    const field = document.getElementById(id);
    const invalid = !field.value.trim() || !field.checkValidity();
    field.classList.toggle("invalid", invalid);
    if (invalid && !firstInvalid) firstInvalid = field;
  }
  if (firstInvalid) {
    firstInvalid.focus();
    showMessage("Preencha corretamente todos os campos obrigatórios para continuar.", "error");
    return false;
  }
  clearMessage();
  return true;
}

function showMessage(message, type) { formMessage.textContent = message; formMessage.className = `form-message ${type}`; }
function clearMessage() { formMessage.textContent = ""; formMessage.className = "form-message"; }

function buildClient() {
  const type = document.querySelector("input[name='clientType']:checked").value;
  if (type === "fisica") return {
    tipoCliente: "PF", nomeCompleto: value("clientName"), cpf: digits("clientCpf"),
    telefone: digits("clientPhone"), email: value("clientEmail").toLowerCase(),
    razaoSocial: null, cnpj: null, telefoneComercial: null, emailComercial: null
  };
  return {
    tipoCliente: "PJ", nomeCompleto: value("companyName"), cpf: null, telefone: null, email: null,
    razaoSocial: value("companyName"), cnpj: digits("companyCnpj"), telefoneComercial: digits("companyPhone"),
    emailComercial: value("companyEmail").toLowerCase()
  };
}

function value(id) { return document.getElementById(id).value.trim(); }
function digits(id) { return document.getElementById(id).value.replace(/\D/g, ""); }

function tableValueFromUnit(unit) {
  return moneyValue(unit?.valores, ["precoAVistaCentavos", "precoAVista", "precoVistaCentavos", "precoVista"]);
}

function moneyValue(source = {}, keys = []) {
  for (const key of keys) if (Number.isInteger(source?.[key])) return source[key];
  return null;
}

function readCurrencyInput(id) { return PaymentPlan?.currencyToCents(document.getElementById(id)?.value); }

function inactivePaymentComponent() {
  return { ativo: false, quantidade: 0, valorUnitarioCentavos: 0, totalCentavos: 0, periodicidade: "outra", primeiroVencimento: null, vencimentos: [], descricao: "" };
}

function paymentComponent({ quantity, unitValue, periodicity, date = null, description }) {
  const dates = date ? PaymentPlan.buildSchedule(date, quantity, periodicity) : [];
  return {
    ativo: true, quantidade: quantity, valorUnitarioCentavos: unitValue, totalCentavos: quantity * unitValue,
    periodicidade: periodicity, primeiroVencimento: dates.length ? Timestamp.fromDate(dates[0]) : null,
    vencimentos: dates.map(item => Timestamp.fromDate(item)), descricao: description
  };
}

function emptyPaymentSlots() {
  return Object.fromEntries(Array.from({ length: MAX_PAYMENT_GROUPS }, (_, index) => [
    `grupo${String(index + 1).padStart(2, "0")}`, inactivePaymentComponent()
  ]));
}

function normalizeCommercialUnitId(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeLookupKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function centsFromCommercialNumber(value) {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) : null;
}

function sheetField(row, names) {
  for (const name of names) {
    if (row?.[name] !== undefined && row?.[name] !== null && row?.[name] !== "") return row[name];
  }
  return null;
}

function pricingSnapshotFromSheetRow(row) {
  if (!row) return null;
  return {
    unidade: sheetField(row, ["UNIDADE", "Unidade", "unidade"]),
    tipologia: sheetField(row, ["TIPOLOGIA", "Tipologia", "tipologia"]),
    precoVistaCentavos: centsFromCommercialNumber(sheetField(row, ["PREÇO À VISTA", "PRECO A VISTA", "Preço à vista"])),
    sinalCentavos: centsFromCommercialNumber(sheetField(row, ["SINAL", "Sinal"])),
    parcelaMensalCentavos: centsFromCommercialNumber(sheetField(row, ["PARCELA MENSAL", "40 PARC. MENSAIS"])),
    intercaladaCentavos: centsFromCommercialNumber(sheetField(row, ["INTERCALADA", "6 INTERCAL. SEMESTRAIS"])),
    chavesCentavos: centsFromCommercialNumber(sheetField(row, ["CHAVES", "Chaves"])),
    versaoTabela: sheetField(row, ["VERSAO TABELA", "versaoTabela"]) || null,
    fonte: "sheets-webapp"
  };
}

function pricingSnapshotFromFirestoreUnit(unit) {
  if (!unit) return null;
  const values = unit.valores || {};
  return {
    unidade: unit.unidade || unit.id,
    tipologia: unit.tipologia || "",
    precoVistaCentavos: moneyValue(values, ["precoAVistaCentavos", "precoVistaCentavos", "precoAVista", "precoVista"]),
    sinalCentavos: moneyValue(values, ["sinalCentavos", "sinal"]),
    parcelaMensalCentavos: moneyValue(values, ["parcelasMensaisCentavos", "parcelaMensaisCentavos", "parcelasMensais", "parcelaMensais"]),
    intercaladaCentavos: moneyValue(values, ["intercaladasSemestraisCentavos", "intercaladasSemestrais"]),
    chavesCentavos: moneyValue(values, ["chavesCentavos", "chaves"]),
    versaoTabela: unit.versaoTabela || null,
    fonte: "firestore-fallback"
  };
}


function normalizePercentValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return number > 1 ? number / 100 : number;
}

function normalizeCommercialCondition(payload) {
  const quantities = payload?.quantidades || {};
  const normalized = {
    schemaVersao: Number(payload?.schemaVersao || 1),
    quantidades: {
      sinal: Number(quantities.sinal ?? payload?.sinalQuantidade ?? 1),
      mensais: Number(quantities.mensais ?? payload?.parcelasMensais),
      intercaladas: Number(quantities.intercaladas ?? payload?.intercaladas),
      chaves: Number(quantities.chaves ?? payload?.chavesQuantidade ?? 1)
    },
    tipologias: payload?.tipologias && typeof payload.tipologias === "object" ? payload.tipologias : {},
    consultadoEm: payload?.consultadoEm || null,
    fonte: payload?.fonte || "FIREBASE_CONDITIONS"
  };

  if (![normalized.quantidades.sinal, normalized.quantidades.mensais, normalized.quantidades.intercaladas, normalized.quantidades.chaves]
      .every(value => Number.isInteger(value) && value >= 1)) {
    throw new Error("As quantidades da condição comercial vigente estão incompletas.");
  }
  return normalized;
}

function commercialPercentagesForTipology(condition, tipology) {
  const entries = Object.entries(condition?.tipologias || {});
  const wanted = normalizeLookupKey(tipology);
  const match = entries.find(([name]) => normalizeLookupKey(name) === wanted);
  if (!match) throw new Error(`A tipologia “${tipology || "não informada"}” não possui condição padrão publicada.`);

  const raw = match[1] || {};
  const percentages = {
    sinal: normalizePercentValue(raw.sinal),
    mensais: normalizePercentValue(raw.mensais ?? raw.parcelasMensais),
    intercaladas: normalizePercentValue(raw.intercaladas),
    chaves: normalizePercentValue(raw.chaves)
  };
  if (!Object.values(percentages).every(value => Number.isFinite(value) && value >= 0)) {
    throw new Error(`Os percentuais publicados para ${match[0]} estão incompletos.`);
  }
  const sum = Object.values(percentages).reduce((acc, value) => acc + value, 0);
  if (Math.abs(sum - 1) > 0.001) {
    throw new Error(`Os percentuais de ${match[0]} não totalizam 100%.`);
  }
  return { nome: match[0], ...percentages };
}

/* BETA 9 · FIREBASE TESTE COMO FONTE COMERCIAL */
async function loadCommercialSnapshotFromFirebaseTest(unitId) {
  const id = normalizeCommercialUnitId(unitId);
  if (!id) throw new Error("Unidade inválida para consulta comercial.");

  const [unitSnapshot, conditionSnapshot] = await Promise.all([
    getDoc(doc(db, "site_units_test", id)),
    getDoc(doc(db, "site_conditions_test", "current"))
  ]);

  if (!unitSnapshot.exists()) {
    throw new Error(`A unidade ${id} ainda não foi publicada em site_units_test.`);
  }
  if (!conditionSnapshot.exists()) {
    throw new Error("A condição comercial ainda não foi publicada em site_conditions_test/current.");
  }

  const rawUnit = unitSnapshot.data() || {};
  const unit = {
    unidade: rawUnit.unidade || id,
    tipologia: rawUnit.tipologia || "",
    precoVistaCentavos: centsFromCommercialNumber(rawUnit.precoVista),
    sinalCentavos: centsFromCommercialNumber(rawUnit.sinal),
    parcelaMensalCentavos: centsFromCommercialNumber(rawUnit.parcelaMensal),
    intercaladaCentavos: centsFromCommercialNumber(rawUnit.intercalada),
    chavesCentavos: centsFromCommercialNumber(rawUnit.chaves),
    versaoTabela: rawUnit.versaoTabela || null,
    fonte: "firestore-site-test"
  };

  if (!Number.isInteger(unit.precoVistaCentavos)) {
    throw new Error(`Preço vigente inválido em site_units_test/${id}.`);
  }

  const condition = normalizeCommercialCondition(conditionSnapshot.data() || {});
  commercialPercentagesForTipology(condition, unit.tipologia);

  console.info("[formulario] preço vigente carregado do Firebase TESTE:", unit.unidade, unit.precoVistaCentavos);
  console.info("[formulario] condição vigente carregada do Firebase TESTE:", condition);

  return { unit, condition };
}

function formatConditionPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${(number * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function buildStandardConditionBeta14Base(unit = currentPricingUnit || pricingSnapshotFromFirestoreUnit(currentUnit)) {
  if (!unit) throw new Error("Aguarde o carregamento dos dados da unidade.");
  if (!currentCommercialCondition) throw new Error("A condição comercial vigente ainda não está disponível.");

  const tableValue = unit.precoVistaCentavos;
  const signal = unit.sinalCentavos;
  const monthly = unit.parcelaMensalCentavos;
  const semiannual = unit.intercaladaCentavos;
  const storedKeys = unit.chavesCentavos;
  const condition = normalizeCommercialCondition(currentCommercialCondition);
  const percentages = commercialPercentagesForTipology(condition, unit.tipologia);
  const monthlyCount = condition.quantidades.mensais;
  const semiannualCount = condition.quantidades.intercaladas;
  const signalCount = condition.quantidades.sinal;
  const keysCount = condition.quantidades.chaves;

  if (![tableValue, signal, monthly, semiannual, storedKeys].every(Number.isInteger)) {
    throw new Error("A condição padrão desta unidade está incompleta na Tabela de Vendas publicada.");
  }

  const monthlySubtotal = monthlyCount * monthly;
  const semiannualSubtotal = semiannualCount * semiannual;
  const publishedComponentsTotal = signal + monthlySubtotal + semiannualSubtotal + storedKeys;
  const roundingDifference = tableValue - publishedComponentsTotal;

  // Os valores monetários são SEMPRE os publicados pela Tabela de Vendas.
  // Percentuais servem para contrato/visualização; não recalculamos dinheiro no navegador.
  if (Math.abs(roundingDifference) > 100) {
    throw new Error("A condição padrão não fecha com a tabela publicada. Revise a sincronização antes de enviar propostas.");
  }
  const payloadKeys = storedKeys + roundingDifference;

  const slots = emptyPaymentSlots();
  slots.grupo01 = paymentComponent({ quantity: monthlyCount, unitValue: monthly, periodicity: "mensal", description: "Parcelas mensais" });
  slots.grupo02 = paymentComponent({ quantity: semiannualCount, unitValue: semiannual, periodicity: "semestral", description: "Parcelas semestrais" });

  return {
    schemaVersao: 4,
    tipo: "padrao",
    descricao: `Condição padrão vigente · ${monthlyCount} mensais · ${semiannualCount} intercaladas`,
    tipologia: percentages.nome,
    valorTabelaCentavos: tableValue,
    totalCalculadoCentavos: tableValue,
    diferencaCentavos: 0,
    condicaoComercialSnapshot: {
      schemaVersao: condition.schemaVersao,
      fonte: condition.fonte,
      consultadoEm: condition.consultadoEm,
      quantidades: { ...condition.quantidades },
      percentuais: {
        sinal: percentages.sinal,
        mensais: percentages.mensais,
        intercaladas: percentages.intercaladas,
        chaves: percentages.chaves
      }
    },
    resumoPublicado: {
      sinalCentavos: signal,
      parcelaMensalCentavos: monthly,
      intercaladaCentavos: semiannual,
      chavesCentavos: storedKeys,
      sinalQuantidade: signalCount,
      mensalQuantidade: monthlyCount,
      intercaladaQuantidade: semiannualCount,
      chavesQuantidade: keysCount,
      diferencaArredondamentoCentavos: roundingDifference
    },
    componentes: {
      sinal: paymentComponent({ quantity: signalCount, unitValue: signal, periodicity: "unica", description: "Sinal" }),
      parcelas: slots,
      chaves: paymentComponent({ quantity: keysCount, unitValue: payloadKeys, periodicity: "unica", description: "Financiamento" })
    }
  };
}

function renderStandardConditionSummary() {
  const target = document.getElementById("standardConditionSummary");
  if (!target) return;
  if (!currentPricingUnit || !Number.isInteger(currentTableValueCents)) {
    target.textContent = "Carregando condição vigente da tabela…";
    return;
  }

  try {
    const condition = buildStandardCondition();
    const published = condition.resumoPublicado;
    const monthlySubtotal = published.mensalQuantidade * published.parcelaMensalCentavos;
    const semiannualSubtotal = published.intercaladaQuantidade * published.intercaladaCentavos;

    const row = (label, quantity, unitValue, subtotal) => `
      <span class="standard-condition-row">
        <span class="standard-condition-name">${label}</span>
        <span>${quantity}</span>
        <span>${formatMoney(unitValue)}</span>
        <span>${formatMoney(subtotal)}</span>
      </span>`;

    target.innerHTML = `
      <span class="standard-condition-grid" role="table" aria-label="Condição padrão vigente">
        <span class="standard-condition-head" role="row">
          <span>Componente</span><span>Qtd.</span><span>Valor</span><span>Subtotal</span>
        </span>
        ${row("Sinal", published.sinalQuantidade, published.sinalCentavos, published.sinalCentavos)}
        ${row("Mensais", published.mensalQuantidade, published.parcelaMensalCentavos, monthlySubtotal)}
        ${row("Intercaladas", published.intercaladaQuantidade, published.intercaladaCentavos, semiannualSubtotal)}
        ${row("Financiamento", published.chavesQuantidade, published.chavesCentavos, published.chavesCentavos)}
        <span class="standard-condition-total"><span>Total da tabela</span><strong>${formatMoney(condition.valorTabelaCentavos)}</strong></span>
      </span>`;
  } catch (error) {
    target.textContent = error.message || "Condição padrão indisponível.";
  }
}


/* BETA 14B · CONTROLES E CALENDÁRIO */
const STANDARD_PAYMENT_LIMITS = {
  mensal: { year: 2029, month: 12, intervalMonths: 1 },
  semestral: { year: 2029, month: 9, intervalMonths: 6 },
  anual: { year: 2029, month: 9, intervalMonths: 12 }
};


function setupSignalQuantityControl() {
  const quantityEl = document.getElementById("paymentSinalQuantity");
  const monthEl = document.getElementById("paymentSinalMonth");
  const dayEl = document.getElementById("paymentSinalDay");
  const valueEl = document.getElementById("paymentSinalValue");

  if (!quantityEl || !monthEl || !dayEl || !valueEl) {
    console.warn("[formulario] campos do sinal não foram encontrados.");
    return;
  }

  monthEl.min = PaymentPlan.currentMonthInput();

  const syncAndRecalculate = () => {
    syncOptionalSignalFields();
    recalculateCustomPlan();
  };

  quantityEl.addEventListener("change", syncAndRecalculate);
  monthEl.addEventListener("change", () => {
    refreshSignalDueDayOptions();
    recalculateCustomPlan();
  });
  dayEl.addEventListener("change", () => {
    refreshSignalDueDayOptions();
    recalculateCustomPlan();
  });

  syncOptionalSignalFields();
}

function refreshSignalDueDayOptions() {
  const monthEl = document.getElementById("paymentSinalMonth");
  const dayEl = document.getElementById("paymentSinalDay");
  if (!monthEl || !dayEl) return;

  monthEl.min = PaymentPlan.currentMonthInput();

  [...dayEl.options].forEach(option => {
    if (!option.value) return;
    const effectiveDate = PaymentPlan.buildAllowedDueDate(
      monthEl.value,
      Number(option.value),
      commercialConfig
    );
    option.disabled = !!monthEl.value && (!effectiveDate || !PaymentPlan.isDateOnOrAfter(effectiveDate));
  });

  const selected = dayEl.options[dayEl.selectedIndex];
  if (selected?.disabled) dayEl.value = "";
}

function syncOptionalSignalFields() {
  const quantityEl = document.getElementById("paymentSinalQuantity");
  const monthEl = document.getElementById("paymentSinalMonth");
  const dayEl = document.getElementById("paymentSinalDay");
  const valueEl = document.getElementById("paymentSinalValue");
  const quantity = Number(quantityEl?.value ?? 0);
  const disabled = quantity === 0;

  [monthEl, dayEl, valueEl].forEach(el => {
    if (!el) return;
    el.disabled = disabled;
    el.required = false;
    el.classList.remove("invalid");
  });

  document.querySelector("[data-payment-row='sinal']")
    ?.classList.toggle("signal-fields-disabled", disabled);

  refreshSignalDueDayOptions();

  if (disabled) {
    const subtotal = document.querySelector("[data-signal-subtotal]");
    if (subtotal) subtotal.textContent = formatMoney(0);
    const percent = document.querySelector("[data-payment-percent='sinal']");
    if (percent) percent.textContent = "0,00%";
  }
}

function selectedStandardDueDay() {
  return Number(document.getElementById("standardDueDay")?.value || 15) === 30 ? 30 : 15;
}

function toggleStandardDueDayControl() {
  document.getElementById("standardDueDayControl")
    ?.classList.toggle("hidden", selectedProposalType() !== "padrao");
}

function setupStandardDueDayControl() {
  if (document.getElementById("standardDueDayControl")) {
    toggleStandardDueDayControl();
    return;
  }

  const radio = document.querySelector('input[name="proposalType"][value="padrao"]');
  const card = radio?.closest(".choice-card");
  if (!card) return;

  const control = document.createElement("div");
  control.id = "standardDueDayControl";
  control.className = "standard-due-day-control";
  control.innerHTML = `
    <span class="standard-due-day-copy">
      <strong>Vencimento da condição padrão</strong>
      <small>Escolha o dia de vencimento. O calendário é calculado automaticamente a partir do sinal.</small>
      <em>Se o dia escolhido já tiver passado no mês atual, o primeiro vencimento será no mês seguinte.</em>
    </span>
    <label>Dia
      <select id="standardDueDay">
        <option value="15">15</option>
        <option value="30">30</option>
      </select>
    </label>`;

  card.insertAdjacentElement("afterend", control);
  control.querySelector("select").addEventListener("change", () => {
    renderStandardConditionSummary?.();
    updateValueSummary?.();
  });

  toggleStandardDueDayControl();
}

function beta14DateOnly(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function beta14Today() {
  return beta14DateOnly(new Date());
}

function beta14cSafeDueDate(year, zeroBasedMonth, dueDay) {
  const lastDay = new Date(year, zeroBasedMonth + 1, 0).getDate();
  return new Date(year, zeroBasedMonth, dueDay === 30 ? Math.min(30, lastDay) : 15, 12, 0, 0, 0);
}

function beta14cStandardAnchor(dueDay = selectedStandardDueDay()) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  let anchor = beta14cSafeDueDate(now.getFullYear(), now.getMonth(), dueDay);
  if (anchor < today) anchor = beta14cSafeDueDate(now.getFullYear(), now.getMonth() + 1, dueDay);
  return beta14DateOnly(anchor);
}

function beta14cAddMonths(dateOnly, months, dueDay = selectedStandardDueDay()) {
  const [year, month] = String(dateOnly).split("-").map(Number);
  const base = new Date(year, month - 1 + Number(months), 1, 12, 0, 0, 0);
  return beta14DateOnly(beta14cSafeDueDate(base.getFullYear(), base.getMonth(), dueDay));
}

function beta14StandardFirstDueDate(quantity, periodicity, dueDay = selectedStandardDueDay()) {
  const anchor = beta14cStandardAnchor(dueDay);
  if (periodicity === "mensal") return beta14cAddMonths(anchor, 1, dueDay);
  if (periodicity === "semestral") return beta14cAddMonths(anchor, 6, dueDay);
  if (periodicity === "anual") return beta14cAddMonths(anchor, 12, dueDay);
  return anchor;
}

function beta14AssignSchedule(component, firstDate, periodicity = component?.periodicidade) {
  if (!component?.ativo || !firstDate) return component;
  const dates = PaymentPlan.buildSchedule(firstDate, component.quantidade, periodicity);
  component.periodicidade = periodicity;
  component.primeiroVencimento = Timestamp.fromDate(dates[0]);
  component.vencimentos = dates.map(date => Timestamp.fromDate(date));
  return component;
}

function beta14ApplyStandardDates(condition) {
  if (!condition || condition.tipo !== "padrao") return condition;
  const dueDay = selectedStandardDueDay();
  const anchor = beta14cStandardAnchor(dueDay);

  if (condition.componentes?.sinal?.ativo) {
    beta14AssignSchedule(condition.componentes.sinal, anchor,
      condition.componentes.sinal.quantidade > 1 ? "mensal" : "unica");
  }

  Object.values(condition.componentes?.parcelas || {}).forEach(component => {
    if (!component?.ativo) return;
    const first = beta14StandardFirstDueDate(component.quantidade, component.periodicidade, dueDay);
    if (first) beta14AssignSchedule(component, first, component.periodicidade);
  });

  condition.diaVencimentoPadrao = dueDay;
  condition.dataBasePadrao = anchor;
  condition.calendarioPadrao = {
    sinal: anchor,
    mensalPrimeira: beta14cAddMonths(anchor, 1, dueDay),
    semestralPrimeira: beta14cAddMonths(anchor, 6, dueDay),
    mensaisAte: "2029-12",
    intercaladasEAnuaisAte: "2029-09"
  };
  return condition;
}

function collectDynamicPayments({ validate = false } = {}) {
  let firstInvalid = null;
  const groups = [...document.querySelectorAll("#dynamicPayments [data-payment-id]")].map(row => {
    const periodicity = row.dataset.periodicity;
    const quantityField = row.querySelector("[data-field='quantity']");
    const valueField = row.querySelector("[data-field='value']");
    const monthField = row.querySelector("[data-field='month']");
    const dayField = row.querySelector("[data-field='day']");
    const descriptionField = row.querySelector("[data-field='description']");
    refreshPaymentQuantity(row);
    const quantity = Number(quantityField.value);
    const maximum = Number(row.dataset.maxQuantity || 0);
    const unitValue = PaymentPlan.currencyToCents(valueField.value);
    const day = Number(dayField.value);
    const date = row.dataset.firstDate || "";
    const description = descriptionField?.value.trim() || PAYMENT_LABELS[periodicity];
    const schedule = date && Number.isInteger(quantity)
      ? PaymentPlan.buildScheduleWithDueDay(date, quantity, periodicity, day)
      : [];
    const invalidFields = [];
    if (!Number.isInteger(unitValue) || unitValue <= 0) invalidFields.push(valueField);
    if (!monthField.value) invalidFields.push(monthField);
    if (![15, 30].includes(day)) invalidFields.push(dayField);
    if (!date || !PaymentPlan.isDateOnOrAfter(date)) invalidFields.push(monthField);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maximum) invalidFields.push(quantityField);
    if (!date || schedule.length !== quantity) invalidFields.push(monthField);
    if (periodicity === "outra" && !descriptionField.value.trim()) invalidFields.push(descriptionField);
    if (validate) invalidFields.forEach(field => field.classList.add("invalid"));
    if (!firstInvalid && invalidFields.length) firstInvalid = invalidFields[0];
    return { row, periodicity, quantity, maximum, unitValue, date, day, description };
  });
  return { groups, firstInvalid };
}


function buildStandardCondition(unit = currentPricingUnit || pricingSnapshotFromFirestoreUnit(currentUnit)) {
  return beta14ApplyStandardDates(buildStandardConditionBeta14Base(unit));
}

function buildCustomCondition({ validate = true } = {}) {
  if (!currentUnit || !Number.isInteger(currentTableValueCents)) {
    throw new Error("Aguarde o carregamento dos dados da unidade.");
  }

  const invalid = [];

  const signalQuantity = Number(document.getElementById("paymentSinalQuantity")?.value ?? 0);
  const signalValueRaw = readCurrencyInput("paymentSinalValue");
  const signalValue = Number.isInteger(signalValueRaw) ? signalValueRaw : 0;
  const signalMonth = value("paymentSinalMonth");
  const signalDay = Number(document.getElementById("paymentSinalDay")?.value || 0);
  const signalDate = signalQuantity > 0
    ? PaymentPlan.buildAllowedDueDate(signalMonth, signalDay, commercialConfig)
    : null;
  const signalSchedule = signalDate && signalQuantity > 0
    ? PaymentPlan.buildScheduleWithDueDay(signalDate, signalQuantity, "mensal", signalDay)
    : [];

  if (!Number.isInteger(signalQuantity) || signalQuantity < 0 || signalQuantity > 3) {
    invalid.push(document.getElementById("paymentSinalQuantity"));
  }

  if (signalQuantity > 0) {
    if (!Number.isInteger(signalValue) || signalValue <= 0) {
      invalid.push(document.getElementById("paymentSinalValue"));
    }
    if (!signalMonth) {
      invalid.push(document.getElementById("paymentSinalMonth"));
    }
    if (![15, 30].includes(signalDay)) {
      invalid.push(document.getElementById("paymentSinalDay"));
    }
    if (!signalDate || !PaymentPlan.isDateOnOrAfter(signalDate) || signalSchedule.length !== signalQuantity) {
      invalid.push(document.getElementById("paymentSinalMonth"));
    }
  }

  const keysValueRaw = readCurrencyInput("paymentChavesValue");
  const keysValue = Number.isInteger(keysValueRaw) ? keysValueRaw : 0;
  if (!Number.isInteger(keysValue) || keysValue < 0) {
    invalid.push(document.getElementById("paymentChavesValue"));
  }

  const { groups, firstInvalid } = collectDynamicPayments({ validate });

  if (validate) {
    invalid.filter(Boolean).forEach(field => field.classList.add("invalid"));
  }

  const firstError = invalid.find(Boolean) || firstInvalid;
  if (firstError) {
    firstError.focus();
    throw new Error("Preencha corretamente os valores e vencimentos. Nenhuma data pode ser anterior ao dia de envio da proposta.");
  }

  const total =
    signalQuantity * signalValue +
    keysValue +
    PaymentPlan.sumPaymentGroups(
      groups.map(group => ({
        quantidade: group.quantity,
        valorUnitarioCentavos: group.unitValue
      }))
    );

  const difference = currentTableValueCents - total;
  const slots = emptyPaymentSlots();

  groups.forEach((group, index) => {
    const component = paymentComponent({
      quantity: group.quantity,
      unitValue: group.unitValue,
      periodicity: group.periodicity,
      date: group.date,
      description: group.description
    });

    const dates = PaymentPlan.buildScheduleWithDueDay(
      group.date,
      group.quantity,
      group.periodicity,
      group.day
    );

    component.primeiroVencimento = dates.length ? Timestamp.fromDate(dates[0]) : null;
    component.vencimentos = dates.map(item => Timestamp.fromDate(item));
    slots[`grupo${String(index + 1).padStart(2, "0")}`] = component;
  });

  let signalComponent = inactivePaymentComponent();
  if (signalQuantity > 0) {
    signalComponent = paymentComponent({
      quantity: signalQuantity,
      unitValue: signalValue,
      periodicity: "mensal",
      date: signalDate,
      description: "Sinal"
    });
    signalComponent.primeiroVencimento = signalSchedule.length ? Timestamp.fromDate(signalSchedule[0]) : null;
    signalComponent.vencimentos = signalSchedule.map(item => Timestamp.fromDate(item));
  }

  const financingComponent = keysValue > 0
    ? paymentComponent({
        quantity: 1,
        unitValue: keysValue,
        periodicity: "unica",
        description: "Financiamento"
      })
    : inactivePaymentComponent();

  const descriptionParts = [
    signalQuantity > 0 ? `Sinal ${signalQuantity}x ${formatMoney(signalValue)}` : "Sem sinal",
    ...groups.map(group =>
      `${group.quantity}x ${PAYMENT_LABELS[group.periodicity].toLowerCase()} de ${formatMoney(group.unitValue)}${group.periodicity === "outra" ? ` (${group.description})` : ""}`
    ),
    keysValue > 0 ? `Financiamento ${formatMoney(keysValue)}` : "Sem financiamento"
  ];

  return {
    schemaVersao: 3,
    tipo: "personalizada",
    descricao: descriptionParts.join(" · ").slice(0, 1000),
    valorTabelaCentavos: currentTableValueCents,
    totalCalculadoCentavos: total,
    diferencaCentavos: difference,
    componentes: {
      sinal: signalComponent,
      parcelas: slots,
      chaves: financingComponent
    }
  };
}

function buildPaymentCondition(options) {
  return selectedProposalType() === "personalizada" ? buildCustomCondition(options) : buildStandardCondition();
}

function recalculateCustomPlan() {
  if (!PaymentPlan) return;

  applyDateMinimums();

  const signalQuantity = Number(document.getElementById("paymentSinalQuantity")?.value ?? 0);
  const rawSignalUnitValue = readCurrencyInput("paymentSinalValue");
  const signalUnitValue = Number.isInteger(rawSignalUnitValue) ? rawSignalUnitValue : 0;
  const signal = signalQuantity > 0 ? signalQuantity * signalUnitValue : 0;

  const keysRaw = readCurrencyInput("paymentChavesValue");
  const keys = Number.isInteger(keysRaw) ? keysRaw : 0;

  let installmentTotal = 0;
  const { groups } = collectDynamicPayments();

  groups.forEach(group => {
    const subtotal =
      Number.isInteger(group.quantity) && Number.isInteger(group.unitValue)
        ? group.quantity * group.unitValue
        : 0;

    group.subtotal = subtotal;
    installmentTotal += subtotal;

    const subtotalEl = group.row.querySelector("[data-payment-total]");
    if (subtotalEl) subtotalEl.textContent = formatMoney(subtotal);
  });

  const total = signal + keys + installmentTotal;

  const signalSubtotal = document.querySelector("[data-signal-subtotal]");
  if (signalSubtotal) signalSubtotal.textContent = formatMoney(signal);

  const signalPercent = document.querySelector("[data-payment-percent='sinal']");
  if (signalPercent) signalPercent.textContent = formatProposalPercent(signal, total);

  const keysPercent = document.querySelector("[data-payment-percent='chaves']");
  if (keysPercent) keysPercent.textContent = formatProposalPercent(keys, total);

  groups.forEach(group => {
    const percentEl = group.row.querySelector("[data-payment-percent]");
    if (percentEl) percentEl.textContent = formatProposalPercent(group.subtotal, total);
  });

  const keysWrap = document.querySelector("[data-keys-percent-wrap]");
  const keysPercentNumber = total > 0 ? (keys / total) * 100 : 0;
  keysWrap?.classList.toggle(
    "warning",
    keys > 0 && keysPercentNumber > commercialConfig.alertaChavesPercentual
  );

  const difference = Number.isInteger(currentTableValueCents)
    ? currentTableValueCents - total
    : null;

  updateCustomBalance(total, difference);
  updateValueSummary(total, difference);
}

function updateCustomBalance(total, difference) {
  const status = document.getElementById("proposalBalanceStatus");
  const message = document.getElementById("calculatorMessage");

  if (status) {
    status.textContent = "";
    status.className = "balance-status";
    status.hidden = true;
  }

  message.className = "calculator-message";

  if (!Number.isInteger(currentTableValueCents)) {
    message.textContent = "Aguarde o carregamento do valor da tabela.";
    return;
  }

  if (!total) {
    message.textContent = "Preencha os valores para montar a proposta.";
    return;
  }

  if (difference === 0) {
    message.textContent = "A condição corresponde ao valor da tabela.";
    message.classList.add("success");
    return;
  }

  message.textContent = difference > 0
    ? `${formatMoney(difference)} abaixo do valor da tabela.`
    : `${formatMoney(Math.abs(difference))} acima do valor da tabela.`;
  message.classList.add("error");
}

function updateValueSummary(customTotal = null, customDifference = null) {
  document.getElementById("proposalTableValue").textContent = Number.isInteger(currentTableValueCents) ? formatMoney(currentTableValueCents) : "Carregando…";
  let total = customTotal;
  let difference = customDifference;
  if (selectedProposalType() === "padrao" && currentUnit) {
    try {
      const condition = buildStandardCondition();
      total = condition.totalCalculadoCentavos;
      difference = condition.diferencaCentavos;
    } catch { total = null; difference = null; }
  }
  document.getElementById("proposalFilledValue").textContent = Number.isInteger(total) ? formatMoney(total) : "—";
  document.getElementById("proposalDifferenceValue").textContent = Number.isInteger(difference) ? formatMoney(difference) : "—";
  const box = document.getElementById("proposalDifferenceBox");
  box.classList.toggle("balanced", difference === 0 && Number.isInteger(total));
  box.classList.toggle("unbalanced", Number.isInteger(difference) && difference !== 0);
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!validateCurrentStep()) return;
  if (!currentUser || !brokerData || !proposalBrokerId) return showMessage("Aguarde a validação do seu cadastro de corretor.", "error");

  const declaration = document.getElementById("declaration");
  if (!declaration.checked) {
    showMessage("Confirme a declaração para enviar a proposta.", "error");
    declaration.focus();
    return;
  }

  // Beta 14L: antes de qualquer tentativa de envio, releia a configuração
  // administrativa. Isso evita manter o fallback local de modo de teste quando
  // o administrador já habilitou o envio real. É apenas 1 leitura por tentativa.
  await ensureReservationSettings({ force: true });

  let condition;
  try {
    condition = buildPaymentCondition({ validate: true });
  } catch (error) {
    showMessage(error.message, "error");
    return;
  }

  const keysCents = condition.componentes?.chaves?.totalCentavos || 0;
  const analysis = PaymentPlan.analyzeCommercialProposal({
    tableValueCents: condition.valorTabelaCentavos,
    totalCents: condition.totalCalculadoCentavos,
    keysCents,
    config: commercialConfig
  });

  if (analysis.blocked) {
    clearMessage();
    await showCommercialBlock(analysis);
    return;
  }

  clearMessage();

  if (condition.tipo === "personalizada" && Number(condition.diferencaCentavos) > 0) {
    if (!await showBelowTableNotice()) return;
  }

if (!await showPaymentReview(condition)) return;
  if (!await showFinalConfirmation(condition)) return;

  submitButton.disabled = true;
  submitButton.textContent = "Enviando…";

  try {
    const submitResult = await submitProposal(condition, analysis);
    clearMessage();

    if (submitResult?.testMode) {
      await showTestPayload(submitResult.payload);
      submitButton.disabled = false;
      submitButton.textContent = "Enviar proposta";
      return;
    }

    showSuccessPopup();
  } catch (error) {
    console.error("[formulario] envio:", error);
    showMessage(error.message || "Não foi possível enviar a proposta.", "error");
    submitButton.disabled = false;
    submitButton.textContent = "Enviar proposta";
  }
});

function showCommercialBlock(analysis) {
  const result = openReviewModal({
    title: "Esta proposta não pode ser enviada",
    subtitle: "Ajuste as condições informadas antes de continuar. Em caso de dúvida, consulte a condição padrão.",
    confirmText: "Voltar e editar",
    content: `
      <section class="review-section">
        ${Number(analysis?.discountPercent) > 0
          ? '<p class="commercial-context-note">O valor total da proposta está abaixo do valor da tabela.</p>'
          : ''}
        <p class="commercial-context-note">A condição informada não atende aos parâmetros comerciais para envio.</p>
      </section>`
  });

  requestAnimationFrame(() => {
    const matches = [...document.querySelectorAll("button")].filter(button =>
      button.offsetParent !== null && button.textContent.trim() === "Voltar e editar"
    );
    if (matches.length > 1) matches.slice(0, -1).forEach(button => button.style.display = "none");
  });

  return result.then(() => false);
}

function showBelowTableNotice() {
  return openReviewModal({
    title: "Proposta abaixo do valor da tabela",
    subtitle: "A condição será encaminhada para avaliação comercial.",
    confirmText: "Continuar para avaliação",
    content: `
      <section class="review-section">
        <p class="commercial-context-note">O valor total da proposta está abaixo do valor da tabela.</p>
        <p class="commercial-context-note">Qualquer condição personalizada passa por análise e aprovação do setor comercial.</p>
      </section>`
  });
}

function activeConditionComponents(condition) {
  return [
    condition.componentes.sinal,
    ...Object.values(condition.componentes.parcelas || {}),
    condition.componentes.chaves
  ].filter(item => item?.ativo === true);
}


async function ensureReservationSettings({ force = false } = {}) {
  if (reservationSettingsLoaded && !force) return reservationSettings;

  try {
    const snapshot = await getDoc(doc(db, "configuracoes", "comercial"));
    if (!snapshot.exists()) {
      throw new Error("Configuração comercial ainda não foi salva no Firebase.");
    }

    const data = snapshot.data() || {};
    const days = Number(data.prazoReservaDias);

    reservationSettings = {
      prazoReservaDias: Number.isInteger(days) && days >= 1 && days <= 90 ? days : 7,
      // Só há envio real quando o documento disser explicitamente false.
      // Qualquer ausência/erro continua no modo seguro de teste.
      modoEnvioTeste: data.modoEnvioTeste !== false
    };

    if (typeof commercialConfig === "object" && commercialConfig) {
      if (Number.isFinite(Number(data.descontoMaximoPercentual))) {
        commercialConfig.descontoMaximoPercentual = Number(data.descontoMaximoPercentual);
      }
      if (Number.isFinite(Number(data.alertaChavesPercentual))) {
        commercialConfig.alertaChavesPercentual = Number(data.alertaChavesPercentual);
      }
    }

    console.info(
      "[formulario] configuração comercial atualizada:",
      reservationSettings.modoEnvioTeste ? "MODO TESTE" : "ENVIO REAL",
      `reserva=${reservationSettings.prazoReservaDias}d`
    );
  } catch (error) {
    // Fail-safe: uma falha de leitura nunca pode virar reserva real por engano.
    reservationSettings = {
      prazoReservaDias: Number.isInteger(reservationSettings?.prazoReservaDias)
        ? reservationSettings.prazoReservaDias
        : 7,
      modoEnvioTeste: true
    };
    console.warn(
      "[formulario] não foi possível confirmar a configuração comercial; envio real bloqueado e modo de teste mantido.",
      error
    );
  }

  reservationSettingsLoaded = true;
  return reservationSettings;
}

function timestampToDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function formatReviewDate(value) {
  const date = timestampToDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function reviewScheduleLabel(component) {
  const first = formatReviewDate(component?.primeiroVencimento);
  const periodicity = component?.periodicidade;

  if (!first) {
    return periodicity === "unica"
      ? "Parcela única"
      : (PAYMENT_LABELS[periodicity] || "Condição de pagamento");
  }

  if (periodicity === "unica") {
    return `Vencimento: ${first}`;
  }

  return `${PAYMENT_LABELS[periodicity] || "Parcelas"} - 1º vencimento: ${first}`;
}

function serializeForPreview(value) {
  if (value == null) return value;

  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeForPreview);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeForPreview(item)])
    );
  }

  return value;
}

function buildTestPayload(condition, analysis) {
  return {
    modo: "TESTE_SEM_GRAVACAO",
    proposta: {
      corretorId: proposalBrokerId,
      corretorSnapshot: {
        nome: brokerData?.nome || null,
        creci: brokerData?.creci || null,
        telefone: brokerData?.telefone || null,
        email: brokerData?.email || currentUser?.email || null,
        imobiliaria: brokerData?.imobiliaria || null
      },
      cliente: buildClient(),
      unidadeId: unitDocumentId(value("unit")),
      commercialUnitId: normalizeCommercialUnitId(value("unit")),
      unidade: value("unit"),
      condicaoProposta: serializeForPreview(condition),
      declaracaoAceita: true,
      statusPropostaSeEnviado: "reservada",
      statusAnaliseSeEnviado: condition.tipo === "personalizada" ? "pendente" : "dispensada",
      prazoReservaDias: reservationSettings.prazoReservaDias,
      expiraEmSeEnviado: new Date(
        Date.now() + reservationSettings.prazoReservaDias * 24 * 60 * 60 * 1000
      ).toISOString()
    },
    validacaoComercial: {
      descontoPercentual: analysis?.discountPercent ?? null,
      chavesPercentual: analysis?.keysPercent ?? null,
      bloqueado: Boolean(analysis?.blocked),
      violacoes: analysis?.violations || []
    }
  };
}

function showTestPayload(payload) {
  const serialized = JSON.stringify(payload, null, 2);

  return openReviewModal({
    title: "Payload de teste gerado",
    subtitle: "Nenhuma proposta foi gravada e a unidade não foi reservada.",
    confirmText: "Concluir teste",
    content: `
      <section class="review-section">
        <p class="review-description">
          Confira abaixo a fotografia que será usada no envio real.
        </p>
        <pre class="proposal-test-payload">${escapeHtml(serialized)}</pre>
      </section>`
  });
}

function showPaymentReview(condition) {
  const client = buildClient();

  const rows = activeConditionComponents(condition).map(component => `
    <article>
      <div>
        <strong>${escapeHtml(component.descricao || PAYMENT_LABELS[component.periodicidade])}</strong>
        <small>${escapeHtml(reviewScheduleLabel(component))}</small>
      </div>
      <span>${component.quantidade} × ${formatMoney(component.valorUnitarioCentavos)}</span>
      <strong>${formatMoney(component.totalCentavos)}</strong>
    </article>`).join("");

  return openReviewModal({
    title: "Confirme a condição de pagamento",
    subtitle: "Confira valores, quantidades e vencimentos antes de avançar para o envio.",
    confirmText: "Confirmar pagamento",
    content: `
      <section class="review-section">
        <h3>Proposta</h3>
        <div class="review-details">
          <div><span>Unidade</span><strong>${escapeHtml(value("unit"))}</strong></div>
          <div><span>Cliente</span><strong>${escapeHtml(client.nomeCompleto || client.razaoSocial)}</strong></div>
          <div><span>Corretor</span><strong>${escapeHtml(brokerData.nome || "Não informado")}</strong></div>
        </div>
      </section>

      <section class="review-section">
        <div class="review-section-heading">
          <h3>Condição de pagamento</h3>
          <span>Valores conferidos</span>
        </div>

        <div class="review-finance-summary">
          <div><span>Valor da tabela</span><strong>${formatMoney(condition.valorTabelaCentavos)}</strong></div>
          <div><span>Total da proposta</span><strong>${formatMoney(condition.totalCalculadoCentavos)}</strong></div>
          <div><span>Diferença</span><strong>${formatMoney(condition.diferencaCentavos)}</strong></div>
        </div>

        <div class="review-installments">${rows}</div>
      </section>`
  });
}

function showFinalConfirmation(condition) {
  const client = buildClient();
  const testMode = reservationSettings.modoEnvioTeste === true;
  const days = reservationSettings.prazoReservaDias;

  const description = testMode
    ? "Modo de teste ativo: nenhuma proposta será gravada e a unidade não será reservada."
    : `Ao confirmar, a unidade será reservada por ${days} ${days === 1 ? "dia" : "dias"} e todas as informações serão enviadas ao Ambiente Comercial.`;

  return openReviewModal({
    title: testMode ? "Gerar envio de teste?" : "Enviar esta proposta?",
    subtitle: testMode
      ? "Esta etapa permite conferir o payload antes da primeira reserva real."
      : "Esta é a confirmação final do cadastro.",
    confirmText: testMode ? "Gerar payload de teste" : "Sim, enviar proposta",
    content: `
      <section class="review-section">
        <div class="review-details">
          <div><span>Unidade</span><strong>${escapeHtml(value("unit"))}</strong></div>
          <div><span>Cliente</span><strong>${escapeHtml(client.nomeCompleto || client.razaoSocial)}</strong></div>
          <div><span>Valor</span><strong>${formatMoney(condition.totalCalculadoCentavos)}</strong></div>
        </div>
        <p class="review-description">${escapeHtml(description)}</p>
      </section>`
  });
}

function openReviewModal({ title, subtitle, content, confirmText }) {
  return new Promise(resolve => {
    const modal = document.createElement("div");
    modal.className = "review-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `<div class="review-modal-card"><header class="review-modal-header"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div><button type="button" class="review-modal-close" aria-label="Fechar">×</button></header>
      <div class="review-modal-content">${content}</div><footer class="review-modal-actions"><button type="button" class="button button-secondary" data-modal-cancel>Voltar e editar</button><button type="button" class="button button-primary" data-modal-confirm>${escapeHtml(confirmText)}</button></footer></div>`;
    document.body.appendChild(modal);
    document.body.classList.add("modal-open");
    const finish = result => {
      document.removeEventListener("keydown", onKeydown);
      modal.remove();
      document.body.classList.remove("modal-open");
      resolve(result);
    };
    const onKeydown = event => { if (event.key === "Escape") finish(false); };
    modal.querySelector("[data-modal-confirm]").addEventListener("click", () => finish(true));
    modal.querySelector("[data-modal-cancel]").addEventListener("click", () => finish(false));
    modal.querySelector(".review-modal-close").addEventListener("click", () => finish(false));
    modal.addEventListener("click", event => { if (event.target === modal) finish(false); });
    document.addEventListener("keydown", onKeydown);
    modal.querySelector("[data-modal-confirm]").focus();
  });
}


// BETA 15D - PREFLIGHT LOCAL
// No extra Firebase read/write is performed by this function.
const BETA15D_DIAGNOSTIC_ONLY = true; // BETA 15F: diagnostico sem escrita

function beta15DPreflight(condition, analysis) {
  const checks = [];

  const add = (code, ok, detail) => {
    checks.push({
      code,
      ok: Boolean(ok),
      detail: String(detail ?? "")
    });
  };

  const parts = condition?.componentes || {};
  const signal = parts.sinal || {};
  const keys = parts.chaves || {};
  const slots = Object.values(parts.parcelas || {});

  const tableValue = Number(condition?.valorTabelaCentavos ?? 0);
  const totalValue = Number(condition?.totalCalculadoCentavos ?? 0);
  const currentPrice = Number(currentTableValueCents ?? 0);
  const financingValue = Number(keys?.totalCentavos ?? 0);
  const signalQty = Number(signal?.quantidade ?? 0);

  const commercialId = normalizeCommercialUnitId(value("unit"));
  const operationalId = unitDocumentId(value("unit"));

  const partsTotal =
    Number(signal?.totalCentavos ?? 0) +
    slots.reduce((sum, item) => sum + Number(item?.totalCentavos ?? 0), 0) +
    financingValue;

  const actorOk = Boolean(
    currentUser &&
    proposalBrokerId &&
    (adminMode === true || brokerData?.aprovado === true)
  );

  const unitStatus = String(currentUnit?.status ?? "").trim().toLowerCase();

  add(
    "AUTH_ATOR",
    actorOk,
    adminMode ? "admin + broker selected" : "approved authenticated broker"
  );

  add(
    "UNIDADE_OPERACIONAL_ID",
    Boolean(operationalId),
    operationalId || "missing"
  );

  add(
    "UNIDADE_COMERCIAL_ID",
    Boolean(commercialId),
    commercialId || "missing"
  );

  add(
    "STATUS_UNIDADE",
    unitStatus === "disponivel",
    unitStatus || "not loaded"
  );

  add(
    "VALOR_TABELA_INTEIRO",
    Number.isInteger(tableValue) && tableValue > 0,
    tableValue
  );

  add(
    "PRECO_VIGENTE_CONFERE",
    Number.isInteger(currentPrice) &&
      Math.abs(currentPrice - tableValue) <= 1,
    `form=${tableValue}; current=${currentPrice}; delta=${Math.abs(currentPrice - tableValue)}`
  );

  add(
    "TOTAL_MINIMO_85",
    Number.isInteger(totalValue) &&
      totalValue > 0 &&
      totalValue * 100 >= tableValue * 85,
    `total=${totalValue}; min=${Math.ceil(tableValue * 0.85)}`
  );

  add(
    "FINANCIAMENTO_MAX_60",
    financingValue * 100 <= totalValue * 60,
    `fin=${financingValue}; total=${totalValue}`
  );

  add(
    "SINAL_QTD_0_A_3",
    Number.isInteger(signalQty) &&
      signalQty >= 0 &&
      signalQty <= 3,
    signalQty
  );

  const signalPeriodicityOk =
    signal?.ativo !== true ||
    signal?.periodicidade === "mensal" ||
    (signalQty === 1 && signal?.periodicidade === "unica");

  add(
    "SINAL_PERIODICIDADE",
    signalPeriodicityOk,
    signal?.ativo === true ? signal?.periodicidade : "inactive"
  );

  add(
    "SOMA_COMPONENTES",
    Number.isInteger(totalValue) &&
      Math.abs(partsTotal - totalValue) <= 1,
    `parts=${partsTotal}; total=${totalValue}; delta=${Math.abs(partsTotal - totalValue)}`
  );

  add(
    "ANALISE_NAO_BLOQUEADA",
    analysis?.blocked !== true,
    analysis?.blocked === true
      ? JSON.stringify(analysis?.violations || [])
      : "ok"
  );

  const failed = checks
    .filter(item => !item.ok)
    .map(item => item.code);

  const result = {
    ok: failed.length === 0,
    failed,
    checks,
    snapshot: {
      adminMode,
      operationalId,
      commercialId,
      unitStatus,
      tableValue,
      currentPrice,
      totalValue,
      financingValue,
      signalQty,
      conditionType: condition?.tipo ?? null
    }
  };

  window.__CITYPARK_BETA15D_PREFLIGHT__ = result;

  console.group("[BETA 15D] local preflight - no extra Firebase operation");
  console.table(checks);
  console.log("Summary:", result);
  console.groupEnd();

  return result;
}
/* BETA 15F · DIAGNOSTICO ESPELHO DAS RULES — SEM ESCRITA */
function beta15FIsMap(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function beta15FIsTimestamp(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    (
      typeof value.toDate === "function" ||
      (Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds))
    )
  );
}

function beta15FExactKeys(value, expected) {
  if (!beta15FIsMap(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function beta15FPaymentComponent(component, periodicity, requireDates, maxQuantity) {
  const keys = [
    "ativo", "quantidade", "valorUnitarioCentavos", "totalCentavos",
    "periodicidade", "primeiroVencimento", "vencimentos", "descricao"
  ];
  const reasons = [];
  const okMap = beta15FIsMap(component);
  if (!okMap) return { ok: false, reasons: ["not-map"] };
  if (!beta15FExactKeys(component, keys)) reasons.push(`keys=${Object.keys(component).sort().join(",")}`);
  if (typeof component.ativo !== "boolean") reasons.push("ativo-not-bool");
  if (!Number.isInteger(component.quantidade)) reasons.push("quantidade-not-int");
  if (!Number.isInteger(component.valorUnitarioCentavos)) reasons.push("valor-not-int");
  if (!Number.isInteger(component.totalCentavos)) reasons.push("total-not-int");
  if (component.periodicidade !== periodicity) reasons.push(`periodicidade=${String(component.periodicidade)} expected=${periodicity}`);
  if (!Array.isArray(component.vencimentos)) reasons.push("vencimentos-not-list");
  if (typeof component.descricao !== "string") reasons.push("descricao-not-string");
  if (typeof component.descricao === "string" && component.descricao.length > 300) reasons.push("descricao>300");

  if (component.ativo === true) {
    if (!(component.quantidade > 0 && component.quantidade <= maxQuantity)) reasons.push(`qtd=${component.quantidade} max=${maxQuantity}`);
    if (!(component.valorUnitarioCentavos > 0)) reasons.push("valor<=0");
    if (component.totalCentavos !== component.quantidade * component.valorUnitarioCentavos) reasons.push("subtotal-mismatch");
    if (requireDates === true) {
      if (!beta15FIsTimestamp(component.primeiroVencimento)) reasons.push("primeiroVencimento-not-timestamp");
      if (!Array.isArray(component.vencimentos) || component.vencimentos.length !== component.quantidade) reasons.push("vencimentos-size!=quantidade");
    } else if (!(component.primeiroVencimento == null || beta15FIsTimestamp(component.primeiroVencimento))) {
      reasons.push("primeiroVencimento-invalid");
    }
  } else if (component.ativo === false) {
    if (component.quantidade !== 0) reasons.push("inactive-quantidade!=0");
    if (component.valorUnitarioCentavos !== 0) reasons.push("inactive-valor!=0");
    if (component.totalCentavos !== 0) reasons.push("inactive-total!=0");
    if (component.primeiroVencimento !== null) reasons.push("inactive-primeiroVencimento!=null");
    if (!Array.isArray(component.vencimentos) || component.vencimentos.length !== 0) reasons.push("inactive-vencimentos-not-empty");
    if (component.descricao !== "") reasons.push("inactive-descricao-not-empty");
  }

  return { ok: reasons.length === 0, reasons };
}

function beta15FOptionalFixed(component, periodicity, requireDates, maxQuantity) {
  if (!beta15FIsMap(component)) return { ok: false, reasons: ["not-map"] };
  if (component.ativo === false) return beta15FPaymentComponent(component, "outra", requireDates, 1);
  if (component.ativo === true) return beta15FPaymentComponent(component, periodicity, requireDates, maxQuantity);
  return { ok: false, reasons: ["ativo-invalid"] };
}

function beta15FSignal(component, requireDates) {
  if (!beta15FIsMap(component)) return { ok: false, reasons: ["not-map"] };
  if (component.ativo === false) return beta15FPaymentComponent(component, "outra", requireDates, 1);
  if (component.ativo !== true) return { ok: false, reasons: ["ativo-invalid"] };

  const monthly = beta15FPaymentComponent(component, "mensal", requireDates, 3);
  if (monthly.ok) return monthly;

  if (component.quantidade === 1) {
    const unique = beta15FPaymentComponent(component, "unica", requireDates, 1);
    if (unique.ok) return unique;
    return { ok: false, reasons: [`mensal:${monthly.reasons.join("|")}`, `unica:${unique.reasons.join("|")}`] };
  }
  return monthly;
}

function beta15FFlexible(component, requireDates) {
  if (!beta15FIsMap(component)) return { ok: false, reasons: ["not-map"] };
  if (component.ativo === false) return beta15FPaymentComponent(component, "outra", requireDates, 1);
  if (component.ativo !== true) return { ok: false, reasons: ["ativo-invalid"] };

  const attempts = [
    beta15FPaymentComponent(component, "mensal", requireDates, 240),
    beta15FPaymentComponent(component, "semestral", requireDates, 60),
    beta15FPaymentComponent(component, "anual", requireDates, 30),
    beta15FPaymentComponent(component, "outra", requireDates, 1)
  ];

  if (attempts[0].ok || attempts[1].ok || attempts[2].ok) return { ok: true, reasons: [] };
  if (attempts[3].ok && typeof component.descricao === "string" && component.descricao.length > 0) return { ok: true, reasons: [] };
  return { ok: false, reasons: [`periodicidade=${String(component.periodicidade)}`, `qtd=${String(component.quantidade)}`] };
}

function beta15FConditionShape(condition) {
  if (!beta15FIsMap(condition)) return { ok: false, detail: "not-map" };

  const customKeys = [
    "schemaVersao", "tipo", "descricao", "valorTabelaCentavos",
    "totalCalculadoCentavos", "diferencaCentavos", "componentes"
  ];
  const standardKeys = [
    "schemaVersao", "tipo", "descricao", "tipologia",
    "valorTabelaCentavos", "totalCalculadoCentavos", "diferencaCentavos",
    "condicaoComercialSnapshot", "resumoPublicado", "componentes",
    "diaVencimentoPadrao", "dataBasePadrao", "calendarioPadrao"
  ];

  if (condition.tipo === "personalizada") {
    const ok = condition.schemaVersao === 3 && beta15FExactKeys(condition, customKeys);
    return { ok, detail: `tipo=personalizada schema=${condition.schemaVersao} keys=${Object.keys(condition).sort().join(",")}` };
  }

  if (condition.tipo === "padrao") {
    const ok =
      condition.schemaVersao === 4 &&
      beta15FExactKeys(condition, standardKeys) &&
      typeof condition.tipologia === "string" &&
      beta15FIsMap(condition.condicaoComercialSnapshot) &&
      beta15FIsMap(condition.resumoPublicado) &&
      [15, 30].includes(condition.diaVencimentoPadrao) &&
      typeof condition.dataBasePadrao === "string" &&
      beta15FIsMap(condition.calendarioPadrao);
    return { ok, detail: `tipo=padrao schema=${condition.schemaVersao} keys=${Object.keys(condition).sort().join(",")}` };
  }

  return { ok: false, detail: `tipo=${String(condition.tipo)} schema=${String(condition.schemaVersao)}` };
}

function beta15FPreflight(condition, analysis) {
  const checks = [];
  const add = (code, ok, detail = "") => checks.push({ code, ok: Boolean(ok), detail: String(detail ?? "") });

  const operationalId = unitDocumentId(value("unit"));
  const commercialId = normalizeCommercialUnitId(value("unit"));
  const operationalLabel = currentUnit?.unidade;
  const commercialLabel = currentPricingUnit?.unidade;
  const tableValue = condition?.valorTabelaCentavos;
  const totalValue = condition?.totalCalculadoCentavos;
  const difference = condition?.diferencaCentavos;
  const parts = condition?.componentes;
  const signal = parts?.sinal;
  const financing = parts?.chaves;
  const slots = parts?.parcelas;
  const requireDates = condition?.tipo === "personalizada";
  const currentPrice = currentPricingUnit?.precoVistaCentavos;

  add("AUTH_USER", Boolean(currentUser?.uid), currentUser?.uid || "missing");
  add("BROKER_ID", typeof proposalBrokerId === "string" && proposalBrokerId.length > 0, proposalBrokerId || "missing");
  add("BROKER_APPROVED", brokerData?.aprovado === true, `aprovado=${String(brokerData?.aprovado)}`);

  if (adminMode === true) {
    add("ADMIN_FRONTEND_VALIDATED", true, "adminMode=true only after admins/{uid}: ativo=true, tipo=admin");
  } else {
    add("BROKER_SELF", currentUser?.uid === proposalBrokerId, `auth=${currentUser?.uid || ""}; broker=${proposalBrokerId || ""}`);
  }

  add("UNIDADE_OPERACIONAL_ID", typeof operationalId === "string" && operationalId.length > 0, operationalId || "missing");
  add("UNIDADE_COMERCIAL_ID", typeof commercialId === "string" && commercialId.length > 0, commercialId || "missing");
  add("STATUS_ANTES_EXATO", currentUnit?.status === "disponivel", `status=${String(currentUnit?.status)}`);
  add("UNIDADE_LABEL_TIPOS", typeof operationalLabel === "string" && typeof commercialLabel === "string", `operacional=${JSON.stringify(operationalLabel)}; comercial=${JSON.stringify(commercialLabel)}`);
  add("UNIDADE_LABEL_EXATO", commercialLabel === operationalLabel, `operacional=${JSON.stringify(operationalLabel)}; comercial=${JSON.stringify(commercialLabel)}`);

  const shape = beta15FConditionShape(condition);
  add("CONDICAO_SHAPE", shape.ok, shape.detail);
  add("CONDICAO_DESCRICAO", typeof condition?.descricao === "string" && condition.descricao.length > 0 && condition.descricao.length <= 1000, `len=${typeof condition?.descricao === "string" ? condition.descricao.length : -1}`);
  add("VALOR_TABELA_INT", Number.isInteger(tableValue), tableValue);
  add("TOTAL_INT", Number.isInteger(totalValue), totalValue);
  add("DIFERENCA_INT", Number.isInteger(difference), difference);
  add("PRECO_COMERCIAL_INT", Number.isInteger(currentPrice) && currentPrice > 0, currentPrice);
  add("PRECO_REGRA_CONFERE", Number.isInteger(tableValue) && Number.isInteger(currentPrice) && Math.abs(tableValue - currentPrice) <= 0.5, `condicao=${tableValue}; comercial=${currentPrice}; delta=${Math.abs(Number(tableValue) - Number(currentPrice))}`);
  add("TOTAL_POSITIVO", Number.isInteger(totalValue) && totalValue > 0, totalValue);

  if (condition?.tipo === "padrao") {
    add("PADRAO_TOTAL_IGUAL_TABELA", totalValue === tableValue, `total=${totalValue}; tabela=${tableValue}`);
    add("PADRAO_DIFERENCA_ZERO", difference === 0, difference);
  } else if (condition?.tipo === "personalizada") {
    add("PERSONALIZADA_MIN_85", Number.isInteger(totalValue) && Number.isInteger(tableValue) && totalValue * 100 >= tableValue * 85, `total=${totalValue}; min=${Math.ceil(Number(tableValue) * 0.85)}`);
    add("PERSONALIZADA_DIFERENCA", difference === tableValue - totalValue, `dif=${difference}; esperado=${Number(tableValue) - Number(totalValue)}`);
  } else {
    add("TIPO_CONDICAO", false, String(condition?.tipo));
  }

  add("COMPONENTES_MAP", beta15FIsMap(parts), beta15FIsMap(parts) ? Object.keys(parts).sort().join(",") : "not-map");
  add("COMPONENTES_KEYS", beta15FExactKeys(parts, ["sinal", "parcelas", "chaves"]), beta15FIsMap(parts) ? Object.keys(parts).sort().join(",") : "not-map");

  const signalRule = beta15FSignal(signal, requireDates);
  add("SINAL_RULE", signalRule.ok, signalRule.ok ? `qtd=${signal?.quantidade}; periodicidade=${signal?.periodicidade}` : signalRule.reasons.join("; "));

  const financingRule = beta15FOptionalFixed(financing, "unica", false, 1);
  add("FINANCIAMENTO_RULE", financingRule.ok, financingRule.ok ? `ativo=${financing?.ativo}; qtd=${financing?.quantidade}; periodicidade=${financing?.periodicidade}` : financingRule.reasons.join("; "));

  const expectedSlots = Array.from({ length: 12 }, (_, index) => `grupo${String(index + 1).padStart(2, "0")}`);
  add("SLOTS_KEYS", beta15FExactKeys(slots, expectedSlots), beta15FIsMap(slots) ? Object.keys(slots).sort().join(",") : "not-map");

  if (beta15FIsMap(slots)) {
    expectedSlots.forEach(key => {
      const result = beta15FFlexible(slots[key], requireDates);
      add(`SLOT_${key.toUpperCase()}`, result.ok, result.ok ? `ativo=${slots[key]?.ativo}; periodicidade=${slots[key]?.periodicidade}; qtd=${slots[key]?.quantidade}` : result.reasons.join("; "));
    });
  }

  const financingTotal = Number(financing?.totalCentavos ?? 0);
  add("FINANCIAMENTO_MAX_60", Number.isInteger(totalValue) && financingTotal * 100 <= totalValue * 60, `fin=${financingTotal}; total=${totalValue}`);

  const slotsTotal = beta15FIsMap(slots)
    ? expectedSlots.reduce((sum, key) => sum + Number(slots[key]?.totalCentavos ?? 0), 0)
    : NaN;
  const partsTotal = Number(signal?.totalCentavos ?? 0) + slotsTotal + financingTotal;
  add("SOMA_COMPONENTES_EXATA", Number.isInteger(totalValue) && Number.isFinite(partsTotal) && totalValue === partsTotal, `parts=${partsTotal}; total=${totalValue}; delta=${partsTotal - Number(totalValue)}`);

  add("PROPOSTA_STATUS_RESERVADA", true, "submitProposal writes statusProposta='reservada'");
  add("DECLARACAO_TRUE", document.getElementById("declaration")?.checked === true, `checked=${String(document.getElementById("declaration")?.checked)}`);
  add("COMMERCIAL_ID_PAYLOAD", typeof commercialId === "string" && commercialId.length > 0, `commercialUnitId=${commercialId}`);
  add("UNIDADE_AFTER_PLANEJADA", currentUnit?.status === "disponivel", "transaction changes only disponivel -> reservada");
  add("ANALISE_NAO_BLOQUEADA", analysis?.blocked !== true, analysis?.blocked === true ? JSON.stringify(analysis?.violations || []) : "ok");

  const failed = checks.filter(item => !item.ok).map(item => item.code);

  // Estimativa deliberadamente conservadora: conta chamadas escritas nas Rules sem assumir cache.
  // O Firestore pode cachear leituras repetidas; portanto isto e um indicador de risco, nao uma prova.
  const rawRuleAccessUpperBound = adminMode === true ? 20 : 17;
  const budget = {
    mode: adminMode === true ? "admin" : "broker",
    rawUpperBound: rawRuleAccessUpperBound,
    transactionRequestLimit: 20,
    proposalOperationLimit: 10,
    note: "Upper bound sem cache; se todos os predicados acima passarem, o orçamento de access calls/getAfter vira o principal suspeito."
  };

  const result = {
    ok: failed.length === 0,
    failed,
    checks,
    budget,
    snapshot: {
      adminMode,
      authUid: currentUser?.uid || null,
      proposalBrokerId,
      brokerApproved: brokerData?.aprovado ?? null,
      operationalId,
      commercialId,
      operationalLabel,
      commercialLabel,
      operationalStatus: currentUnit?.status ?? null,
      tableValue,
      currentPrice,
      totalValue,
      difference,
      conditionType: condition?.tipo ?? null,
      schemaVersao: condition?.schemaVersao ?? null
    }
  };

  window.__CITYPARK_BETA15F_PREFLIGHT__ = result;

  console.group("[BETA 15F] espelho local das Firestore Rules - ZERO escrita");
  console.table(checks);
  console.table([budget]);
  console.log("Summary:", result);
  console.log("Copy object:", window.__CITYPARK_BETA15F_PREFLIGHT__);
  console.groupEnd();

  return result;
}

async function submitProposal(condition, analysis) {
  const beta15F = beta15FPreflight(condition, analysis);

  if (!beta15F.ok) {
    throw new Error(
      `Beta 15F local rule mirror blocked the send: ${beta15F.failed.join(", ")}. ` +
      "No write was performed. Check window.__CITYPARK_BETA15F_PREFLIGHT__ in the Console."
    );
  }

  if (BETA15D_DIAGNOSTIC_ONLY === true) {
    console.warn("[BETA 15D] DIAGNOSTIC_ONLY active: runTransaction was NOT executed.");
    throw new Error(
      "Beta 15D diagnostic completed. No write was performed. " +
      "Send the Console table before the next real test."
    );
  }
  if (reservationSettings.modoEnvioTeste === true) {
    return {
      testMode: true,
      payload: buildTestPayload(condition, analysis)
    };
  }

  const id = unitDocumentId(value("unit"));
  const commercialId = normalizeCommercialUnitId(value("unit"));
  if (!id || !commercialId) throw new Error("Unidade inválida.");

  // O documento operacional controla disponibilidade/reserva.
  // O documento site_units_test é somente a fotografia comercial vigente
  // (preço/tabela) e nunca é alterado por este fluxo.
  const unitRef = doc(db, "unidades", id);
  const commercialUnitRef = doc(db, "site_units_test", commercialId);
  const proposalRef = doc(collection(db, "propostas"));
  const unitHistoryRef = doc(collection(db, "historico_unidades"));
  const proposalHistoryRef = doc(collection(db, "historico_propostas"));
  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + reservationSettings.prazoReservaDias * 24 * 60 * 60 * 1000)
  );

  await runTransaction(db, async transaction => {
    // Todas as leituras acontecem antes das escritas.
    const unitSnapshot = await transaction.get(unitRef);
    const commercialSnapshot = await transaction.get(commercialUnitRef);

    if (!unitSnapshot.exists()) throw new Error("Unidade não encontrada.");
    if (!commercialSnapshot.exists()) {
      throw new Error("A tabela comercial desta unidade não está disponível. Atualize a página antes de enviar.");
    }

    const unit = unitSnapshot.data();
    const commercialUnit = commercialSnapshot.data() || {};

    if (unit.status !== "disponivel") {
      throw new Error("Essa unidade não está mais disponível.");
    }

    const liveTableValueCents = centsFromCommercialNumber(commercialUnit.precoVista);
    if (!Number.isInteger(liveTableValueCents)) {
      throw new Error("O valor comercial atual da unidade é inválido. Não foi feita nenhuma reserva.");
    }
    if (liveTableValueCents !== condition.valorTabelaCentavos) {
      throw new Error("O valor da unidade foi atualizado. Reabra o formulário e confira a nova condição.");
    }

    const liveTableVersion = commercialUnit.versaoTabela || currentPricingUnit?.versaoTabela || unit.versaoTabela || null;

    transaction.set(proposalRef, {
      adminId: adminMode ? currentUser.uid : null,
      corretorId: proposalBrokerId,
      corretorSnapshot: {
        nome: brokerData.nome || null,
        creci: brokerData.creci || null,
        telefone: brokerData.telefone || null,
        email: brokerData.email || (adminMode ? null : currentUser.email) || null,
        imobiliaria: brokerData.imobiliaria || null
      },
      cliente: buildClient(),
      condicaoProposta: condition,
      analiseComercialSnapshot: {
        descontoPercentual: analysis.discountPercent,
        chavesPercentual: analysis.keysPercent,
        descontoMaximoPercentual: commercialConfig.descontoMaximoPercentual,
        alertaChavesPercentual: commercialConfig.alertaChavesPercentual,
        alertasConfirmados: analysis.warnings.map(item => item.code)
      },
      condicaoComercialSnapshot: currentCommercialCondition || null,
      versaoTabelaSnapshot: liveTableVersion,
      declaracaoAceita: true,
      unidadeId: id,
      commercialUnitId: commercialId,
      unidadeSnapshot: {
        unidade: unit.unidade,
        tipologia: unit.tipologia || null,
        areaM2: unit.areaM2 || null,
        valores: unit.valores || null,
        versaoTabela: liveTableVersion
      },
      statusProposta: "reservada",
      statusAnalise: condition.tipo === "personalizada" ? "pendente" : "dispensada",
      tagsAdmin: ["Comercial em Análise"],
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
      expiraEm: expiresAt,
      vendidoEm: null
    });

    // ÚNICA escrita de estado da unidade neste fluxo.
    transaction.update(unitRef, {
      status: "reservada",
      propostaAtualId: proposalRef.id,
      atualizadoEm: serverTimestamp(),
      expiraEm: expiresAt,
      vendidoEm: null
    });

    const commonHistory = {
      adminId: adminMode ? currentUser.uid : null,
      ano: new Date().getFullYear(),
      corretorId: proposalBrokerId,
      data: serverTimestamp(),
      propostaId: proposalRef.id,
      unidade: unit.unidade,
      unidadeId: id,
      statusAnterior: "disponivel",
      statusNovo: "reservada"
    };

    transaction.set(unitHistoryRef, {
      ...commonHistory,
      acao: "unidade reservada",
      observacao: "Unidade reservada após o envio da proposta."
    });

    transaction.set(proposalHistoryRef, {
      ...commonHistory,
      acao: "proposta criada",
      statusAnterior: null,
      tags: ["Comercial em Análise"],
      observacao: adminMode
        ? "Proposta criada pelo administrador em nome do corretor selecionado."
        : "Proposta criada pelo corretor no site."
    });
  });

  return { testMode: false, proposalId: proposalRef.id };
}

function showSuccessPopup() {
  document.querySelector(".success-popup")?.remove();
  const popup = document.createElement("div");
  popup.className = "success-popup";
  popup.setAttribute("role", "status");
  popup.setAttribute("aria-live", "polite");
  popup.innerHTML = `<div class="success-popup-card"><span class="success-popup-icon" aria-hidden="true">✓</span><h3>Proposta enviada com sucesso!</h3><p>A unidade foi reservada e a proposta completa foi encaminhada para análise.</p><div class="success-popup-actions"><a class="button button-primary" href="${adminMode ? "painel-admin.html" : "vendas.html"}">${adminMode ? "Voltar ao Ambiente Administrativo" : "Voltar para a Tabela de Vendas"}</a></div></div>`;
  document.body.appendChild(popup);
}

function formatMoney(cents) { return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

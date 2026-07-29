import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

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

document.addEventListener("DOMContentLoaded", () => {
  fillUnitFromUrl();
  setupNavigation();
  setupToggles();
  setupInputCleanup();
  lockBrokerFields();
  updateProgress();
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
  const snapshot = await getDocs(collection(db, "corretores"));
  const brokers = snapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(item => item.aprovado === true)
    .sort((a, b) => String(a.nome ?? a.email ?? "").localeCompare(String(b.nome ?? b.email ?? ""), "pt-BR"));

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
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function fillUnitFromUrl() {
  const queryParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const unit = queryParams.get("unidade") || hashParams.get("unidade") || "";
  document.getElementById("unit").value = unit;
  document.getElementById("unitPreview").textContent = unit || "Não informada";
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
    brokerName: brokerData?.nome,
    brokerCreci: brokerData?.creci,
    brokerPhone: brokerData?.telefone,
    brokerEmail: brokerData?.email || (adminMode ? "" : currentUser.email),
    brokerRealEstate: brokerData?.imobiliaria
  };
  Object.entries(values).forEach(([id, value]) => {
    document.getElementById(id).value = value || "";
  });
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

function updateProposalFields() {
  const isCustom = document.querySelector("input[name='proposalType']:checked").value === "outro";
  const input = document.getElementById("customProposal");
  document.getElementById("customProposalWrap").classList.toggle("hidden", !isCustom);
  input.required = isCustom;
  if (!isCustom) input.value = "";
}

function setupInputCleanup() {
  form.querySelectorAll("input, textarea").forEach(field => {
    field.addEventListener("input", () => field.classList.remove("invalid"));
  });
}

function nextStep() {
  if (validateCurrentStep() && currentStep < totalSteps) showStep(currentStep + 1);
}

function previousStep() {
  if (currentStep > 1) showStep(currentStep - 1);
}

function showStep(step) {
  currentStep = step;
  document.querySelectorAll(".form-step").forEach(section => {
    section.classList.toggle("active", Number(section.dataset.step) === step);
  });
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
  if (currentStep === 1) {
    return adminMode
      ? ["adminBrokerSelect", "brokerName", "brokerCreci", "brokerPhone", "brokerEmail"]
      : ["brokerName", "brokerCreci", "brokerPhone", "brokerEmail"];
  }
  if (currentStep === 2) {
    return document.querySelector("input[name='clientType']:checked").value === "fisica"
      ? ["clientName", "clientCpf", "clientPhone", "clientEmail"]
      : ["companyName", "companyCnpj", "companyPhone", "companyEmail"];
  }
  return document.querySelector("input[name='proposalType']:checked").value === "outro"
    ? ["unit", "customProposal"]
    : ["unit"];
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

function showMessage(message, type) {
  formMessage.textContent = message;
  formMessage.className = `form-message ${type}`;
}

function clearMessage() {
  formMessage.textContent = "";
  formMessage.className = "form-message";
}

function buildClient() {
  const type = document.querySelector("input[name='clientType']:checked").value;
  if (type === "fisica") {
    return {
      tipoCliente: "PF",
      nomeCompleto: document.getElementById("clientName").value.trim(),
      cpf: document.getElementById("clientCpf").value.replace(/\D/g, ""),
      telefone: document.getElementById("clientPhone").value.replace(/\D/g, ""),
      email: document.getElementById("clientEmail").value.trim().toLowerCase(),
      razaoSocial: null,
      cnpj: null,
      telefoneComercial: null,
      emailComercial: null
    };
  }
  return {
    tipoCliente: "PJ",
    nomeCompleto: document.getElementById("companyName").value.trim(),
    cpf: null,
    telefone: null,
    email: null,
    razaoSocial: document.getElementById("companyName").value.trim(),
    cnpj: document.getElementById("companyCnpj").value.replace(/\D/g, ""),
    telefoneComercial: document.getElementById("companyPhone").value.replace(/\D/g, ""),
    emailComercial: document.getElementById("companyEmail").value.trim().toLowerCase()
  };
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!validateCurrentStep()) return;
  if (!currentUser || !brokerData || !proposalBrokerId) {
    showMessage("Aguarde a validação do seu cadastro de corretor.", "error");
    return;
  }
  const declaration = document.getElementById("declaration");
  if (!declaration.checked) {
    showMessage("Confirme a declaração para enviar a proposta.", "error");
    declaration.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Enviando…";
  try {
    await submitProposal();
    clearMessage();
    showSuccessPopup();
  } catch (error) {
    console.error("[formulario] envio:", error);
    showMessage(error.message || "Não foi possível enviar a proposta.", "error");
    submitButton.disabled = false;
    submitButton.textContent = "Enviar proposta";
  }
});

async function submitProposal() {
  const requestedUnit = document.getElementById("unit").value.trim();
  const id = unitDocumentId(requestedUnit);
  if (!id) throw new Error("Unidade inválida.");

  const unitRef = doc(db, "unidades", id);
  const proposalRef = doc(collection(db, "propostas"));
  const unitHistoryRef = doc(collection(db, "historico_unidades"));
  const proposalHistoryRef = doc(collection(db, "historico_propostas"));
  const proposalType = document.querySelector("input[name='proposalType']:checked").value;
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  await runTransaction(db, async transaction => {
    const unitSnapshot = await transaction.get(unitRef);
    if (!unitSnapshot.exists()) throw new Error("Unidade não encontrada.");
    const unit = unitSnapshot.data();
    if (unit.status !== "disponivel") throw new Error("Essa unidade não está mais disponível.");

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
      condicaoProposta: {
        tipo: proposalType,
        descricao: proposalType === "padrao"
          ? "SI 20% · 80 PM 45% · 12 PS 20% · 1 CH 15%"
          : document.getElementById("customProposal").value.trim()
      },
      declaracaoAceita: true,
      unidadeId: id,
      unidadeSnapshot: {
        unidade: unit.unidade,
        tipologia: unit.tipologia || null,
        areaM2: unit.areaM2 || null,
        valores: unit.valores || null
      },
      statusProposta: "reservada",
      tagsAdmin: ["Comercial em Análise"],
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
      expiraEm: expiresAt,
      vendidoEm: null
    });

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
}

function showSuccessPopup() {
  document.querySelector(".success-popup")?.remove();
  const popup = document.createElement("div");
  popup.className = "success-popup";
  popup.setAttribute("role", "status");
  popup.setAttribute("aria-live", "polite");
  popup.innerHTML = `
    <div class="success-popup-card">
      <span class="success-popup-icon" aria-hidden="true">✓</span>
      <h3>Proposta enviada com sucesso!</h3>
      <p>A unidade foi reservada e a proposta encaminhada para análise.</p>
      <div class="success-popup-actions">
        <a class="button button-primary" href="${adminMode ? "painel-admin.html" : "vendas.html"}">${adminMode ? "Voltar ao Painel Administrativo" : "Voltar para a Tabela de Vendas"}</a>
      </div>
    </div>
  `;
  document.body.appendChild(popup);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

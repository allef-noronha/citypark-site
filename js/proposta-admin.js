import { auth, db, storage } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

import {
  getBlob,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-storage.js";

const $ = id => document.getElementById(id);

const elements = {
  loading: $("loadingState"),
  app: $("processApp"),
  logout: $("btnSair"),
  navigation: $("moduleNavigation"),
  proposalId: $("summaryProposalId"),
  createdAt: $("summaryCreatedAt"),
  unit: $("summaryUnit"),
  broker: $("summaryBroker"),
  creci: $("summaryCreci"),
  client: $("summaryClient"),
  clientDocument: $("summaryDocument"),
  informationStatus: $("informationStatus"),
  proposalInformation: $("proposalInformation"),
  brokerInformation: $("brokerInformation"),
  clientInformation: $("clientInformation"),
  conditionSummary: $("conditionSummary"),
  financeTableValue: $("financeTableValue"),
  financeProposalValue: $("financeProposalValue"),
  financeDifference: $("financeDifference"),
  financeDifferenceCard: $("financeDifferenceCard"),
  financeConditionType: $("financeConditionType"),
  financeValidation: $("financeValidation"),
  financeRows: $("financeRows"),
  financeSpecialNote: $("financeSpecialNote"),
  documentForm: $("documentForm"),
  documentList: $("documentList"),
  documentBadge: $("documentBadge"),
  requestDefaultDocuments: $("requestDefaultDocuments"),
  contractForm: $("contractForm"),
  contractList: $("contractList"),
  contractBadge: $("contractBadge"),
  messageForm: $("messageForm"),
  messageField: $("messageField"),
  messageList: $("messageList"),
  messageBadge: $("messageBadge"),
  historyTimeline: $("historyTimeline"),
  toast: $("toast")
};

const state = {
  adminUser: null,
  admin: null,
  proposalId: new URLSearchParams(window.location.search).get("id") || "",
  proposal: null,
  unit: null,
  broker: null,
  documents: [],
  contracts: [],
  messages: [],
  subscriptions: [],
  toastTimer: null
};

const DEFAULT_DOCUMENTS = [
  { titulo: "Identidade ou Carteira Nacional de Habilitação", categoria: "identificacao" },
  { titulo: "Comprovante de residência", categoria: "residencia" },
  { titulo: "Comprovante de renda", categoria: "renda" }
];

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.replace("vendas.html");
    return;
  }

  try {
    const adminSnapshot = await getDoc(doc(db, "admins", user.uid));
    const admin = adminSnapshot.exists() ? adminSnapshot.data() : null;
    if (!admin || admin.ativo !== true || admin.tipo !== "admin") {
      window.alert("Acesso restrito a administradores ativos.");
      window.location.replace("vendas.html");
      return;
    }
    if (!state.proposalId) throw new Error("A proposta não foi informada na URL.");

    state.adminUser = user;
    state.admin = admin;
    document.documentElement.classList.add("page-authorized");
    bindEvents();
    await loadProcess();
  } catch (error) {
    console.error("[proposta-admin] inicialização:", error);
    elements.loading.innerHTML = `<p>${escapeHtml(error.message || "Não foi possível abrir a proposta.")}</p><a href="painel-admin.html">Voltar ao painel</a>`;
  }
});

window.addEventListener("beforeunload", () => {
  state.subscriptions.forEach(unsubscribe => unsubscribe());
});

function bindEvents() {
  elements.logout.addEventListener("click", async () => {
    await signOut(auth);
    window.location.replace("vendas.html");
  });

  elements.navigation.addEventListener("click", event => {
    const button = event.target.closest("[data-module-target]");
    if (button) showModule(button.dataset.moduleTarget);
  });

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-go-module]");
    if (button) showModule(button.dataset.goModule);
  });

  elements.documentForm.addEventListener("submit", handleDocumentSubmit);
  elements.contractForm.addEventListener("submit", handleContractSubmit);
  elements.messageForm.addEventListener("submit", handleMessageSubmit);
  elements.requestDefaultDocuments.addEventListener("click", requestDefaultDocuments);
  elements.documentList.addEventListener("change", handleAssetStatusChange);
  elements.contractList.addEventListener("change", handleAssetStatusChange);
  elements.documentList.addEventListener("click", handleOpenFile);
  elements.contractList.addEventListener("click", handleOpenFile);
}

async function loadProcess() {
  const proposalSnapshot = await getDoc(doc(db, "propostas", state.proposalId));
  if (!proposalSnapshot.exists()) throw new Error("A proposta solicitada não foi encontrada.");
  state.proposal = { id: proposalSnapshot.id, ...proposalSnapshot.data() };

  const [unitSnapshot, brokerSnapshot] = await Promise.all([
    state.proposal.unidadeId ? getDoc(doc(db, "unidades", state.proposal.unidadeId)) : null,
    state.proposal.corretorId ? getDoc(doc(db, "corretores", state.proposal.corretorId)) : null
  ]);
  state.unit = unitSnapshot?.exists() ? { id: unitSnapshot.id, ...unitSnapshot.data() } : null;
  state.broker = brokerSnapshot?.exists() ? { id: brokerSnapshot.id, ...brokerSnapshot.data() } : null;

  renderHeader();
  renderInformation();
  renderFinance();
  await loadHistory();
  subscribeResources();

  elements.loading.hidden = true;
  elements.app.hidden = false;
  showModule(readInitialModule(), false);
}

function readInitialModule() {
  const requested = window.location.hash.replace(/^#/, "");
  return document.querySelector(`[data-module="${cssEscape(requested)}"]`) ? requested : "informacoes";
}

function showModule(moduleName, updateHash = true) {
  const panel = document.querySelector(`[data-module="${cssEscape(moduleName)}"]`);
  if (!panel) return;

  document.querySelectorAll("[data-module]").forEach(item => {
    const active = item === panel;
    item.hidden = !active;
    item.classList.toggle("active", active);
  });
  document.querySelectorAll("[data-module-target]").forEach(button => {
    const active = button.dataset.moduleTarget === moduleName;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (updateHash) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${moduleName}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHeader() {
  const proposal = state.proposal;
  const broker = brokerSnapshot();
  const client = proposal.cliente || {};
  elements.proposalId.textContent = proposal.id;
  elements.createdAt.textContent = formatDate(proposal.criadoEm);
  elements.unit.textContent = unitName();
  elements.broker.textContent = broker.nome || "Não informado";
  elements.creci.textContent = broker.creci || "Não informado";
  elements.client.textContent = clientName();
  elements.clientDocument.textContent = formatCpfCnpj(client.cpf || client.cnpj);
  document.title = `${proposal.id} - City Park`;
}

function renderInformation() {
  const proposal = state.proposal;
  const unit = state.unit || proposal.unidadeSnapshot || {};
  const broker = brokerSnapshot();
  const client = proposal.cliente || {};
  const proposalStatus = normalizeStatus(proposal.statusProposta);

  elements.informationStatus.textContent = statusLabel(proposalStatus);
  elements.informationStatus.dataset.status = proposalStatus;
  elements.proposalInformation.innerHTML = [
    detail("ID da proposta", proposal.id),
    detail("Unidade", unitName()),
    detail("Tipologia", unit.tipologia),
    detail("Área privativa", formatArea(unit.areaM2)),
    detail("Valor da unidade", formatMoney(tableValue())),
    detail("Status da proposta", statusLabel(proposalStatus)),
    detail("Status da unidade", statusLabel(normalizeStatus(state.unit?.status))),
    detail("Criação da proposta", formatDate(proposal.criadoEm)),
    detail("Expiração da proposta", proposal.expiraEm ? formatDate(proposal.expiraEm) : "Sem prazo ativo")
  ].join("");

  elements.brokerInformation.innerHTML = [
    detail("Nome", broker.nome),
    detail("CRECI", broker.creci),
    detail("Imobiliária", broker.imobiliaria),
    detail("Telefone", formatPhone(broker.telefone)),
    detail("E-mail", broker.email),
    detail("ID do corretor", proposal.corretorId)
  ].join("");

  elements.clientInformation.innerHTML = [
    detail("Tipo de cliente", client.tipoCliente),
    detail("Nome / Razão social", clientName()),
    detail("CPF / CNPJ", formatCpfCnpj(client.cpf || client.cnpj)),
    detail("Telefone", formatPhone(client.telefone || client.telefoneComercial)),
    detail("E-mail", client.email || client.emailComercial)
  ].join("");

  elements.conditionSummary.textContent = proposal.condicaoProposta?.descricao || conditionTypeLabel(proposal.condicaoProposta?.tipo);
}

function renderFinance() {
  const condition = state.proposal.condicaoProposta || {};
  const components = structuredComponents(condition);
  const value = Number.isInteger(condition.valorTabelaCentavos) ? condition.valorTabelaCentavos : tableValue();
  const rows = components.length ? components : legacyFinanceRows(condition);
  const calculated = Number.isInteger(condition.totalCalculadoCentavos)
    ? condition.totalCalculadoCentavos
    : rows.reduce((sum, row) => sum + (row.totalCentavos || 0), 0);
  const difference = Number.isInteger(condition.diferencaCentavos) ? condition.diferencaCentavos : value - calculated;
  const balanced = Number.isInteger(value) && calculated === value;

  elements.financeTableValue.textContent = formatMoney(value);
  elements.financeProposalValue.textContent = calculated ? formatMoney(calculated) : "Não estruturado";
  elements.financeDifference.textContent = Number.isInteger(value) && calculated ? formatMoney(difference) : "Não calculada";
  elements.financeDifferenceCard.classList.toggle("balanced", balanced);
  elements.financeDifferenceCard.classList.toggle("unbalanced", !balanced && Boolean(calculated));
  elements.financeConditionType.textContent = `${conditionTypeLabel(condition.tipo)}${condition.schemaVersao ? ` · estrutura v${condition.schemaVersao}` : " · registro legado"}`;
  elements.financeValidation.textContent = balanced ? "Valores conferidos" : "Conferência necessária";
  elements.financeValidation.classList.toggle("valid", balanced);
  elements.financeValidation.classList.toggle("invalid", !balanced);

  elements.financeRows.innerHTML = rows.length
    ? rows.map(row => `
      <tr>
        <td>${escapeHtml(row.label)}</td>
        <td>${escapeHtml(row.quantidade)}</td>
        <td>${formatMoney(row.valorUnitarioCentavos)}</td>
        <td>${formatMoney(row.totalCentavos)}</td>
        <td>${escapeHtml(formatDateOnly(row.primeiroVencimento))}</td>
      </tr>`).join("")
    : `<tr><td colspan="5" class="empty-table">Esta proposta foi criada antes da calculadora financeira. A descrição original foi preservada.</td></tr>`;

  const special = components.find(item => (item.key === "negociacaoEspecial" || item.periodicidade === "outra") && item.descricao);
  elements.financeSpecialNote.hidden = !special;
  elements.financeSpecialNote.innerHTML = special ? `<strong>Negociação especial:</strong> ${escapeHtml(special.descricao)}` : "";
}

function structuredComponents(condition) {
  const source = condition.componentes;
  if (!source || typeof source !== "object") return [];
  if (condition.schemaVersao >= 3 && source.parcelas && typeof source.parcelas === "object") {
    const labelsByPeriodicity = {
      mensal: "Parcelas mensais",
      semestral: "Parcelas semestrais",
      anual: "Parcelas anuais",
      outra: "Negociação especial",
      unica: "Parcela única"
    };
    const installments = Object.entries(source.parcelas)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([key, component]) => ({
        key,
        label: component?.descricao || labelsByPeriodicity[component?.periodicidade] || "Parcela",
        ...(component || {})
      }));
    return [
      { key: "sinal", label: "Sinal", ...(source.sinal || {}) },
      ...installments,
      { key: "chaves", label: "Chaves / financiamento", ...(source.chaves || {}) }
    ].filter(item => item.ativo);
  }
  const labels = {
    sinal: "Sinal",
    mensais: "Parcelas mensais",
    semestrais: "Parcelas semestrais",
    anuais: "Parcelas anuais",
    negociacaoEspecial: "Negociação especial",
    chaves: "Chaves / financiamento"
  };
  return Object.entries(labels).map(([key, label]) => ({ key, label, ...(source[key] || {}) })).filter(item => item.ativo);
}

function legacyFinanceRows(condition) {
  if (normalizeText(condition.tipo) !== "padrao") return [];
  const values = state.proposal.unidadeSnapshot?.valores || state.unit?.valores || {};
  const data = [
    ["Sinal", 1, moneyValue(values, ["sinalCentavos", "sinal"])],
    ["Parcelas mensais", 80, moneyValue(values, ["parcelasMensaisCentavos", "parcelasMensais"])],
    ["Parcelas semestrais", 12, moneyValue(values, ["intercaladasSemestraisCentavos", "intercaladasSemestrais"])],
    ["Chaves / financiamento", 1, moneyValue(values, ["chavesCentavos", "chaves"])]
  ];
  return data.filter(([, , unitValue]) => Number.isInteger(unitValue)).map(([label, quantity, unitValue]) => ({
    label,
    quantidade: quantity,
    valorUnitarioCentavos: unitValue,
    totalCentavos: quantity * unitValue,
    primeiroVencimento: null
  }));
}

function subscribeResources() {
  subscribeCollection("documentos", "criadoEm", items => {
    state.documents = items;
    renderDocuments();
  });
  subscribeCollection("contratos", "criadoEm", items => {
    state.contracts = items;
    renderContracts();
  });
  subscribeCollection("mensagens", "criadoEm", items => {
    const previousCount = state.messages.length;
    state.messages = items;
    renderMessages();
    if (items.length > previousCount && previousCount > 0) updateBadge(elements.messageBadge, items.length);
  });
}

function subscribeCollection(name, dateField, callback) {
  const resourceQuery = query(
    collection(db, "propostas", state.proposalId, name),
    orderBy(dateField, "asc")
  );
  const unsubscribe = onSnapshot(resourceQuery, snapshot => {
    callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, error => {
    console.error(`[proposta-admin] ${name}:`, error);
    showToast(`Não foi possível carregar ${name}.`, true);
  });
  state.subscriptions.push(unsubscribe);
}

async function requestDefaultDocuments() {
  if (!window.confirm("Solicitar identidade/CNH, comprovante de residência e comprovante de renda?")) return;
  const existing = new Set(state.documents.map(item => normalizeText(item.titulo)));
  const pending = DEFAULT_DOCUMENTS.filter(item => !existing.has(normalizeText(item.titulo)));
  if (!pending.length) {
    showToast("Os documentos padrão já foram solicitados.");
    return;
  }

  elements.requestDefaultDocuments.disabled = true;
  try {
    await Promise.all(pending.map(item => addDoc(resourceCollection("documentos"), {
      ...item,
      status: "solicitado",
      solicitadoEm: serverTimestamp(),
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
      criadoPor: state.adminUser.uid,
      arquivo: null
    })));
    await writeHistory("documentos solicitados", `${pending.length} documento(s) padrão solicitado(s) ao cliente.`);
    showToast("Documentos padrão solicitados.");
  } catch (error) {
    console.error("[proposta-admin] documentos padrão:", error);
    showToast(error.message || "Não foi possível solicitar os documentos.", true);
  } finally {
    elements.requestDefaultDocuments.disabled = false;
  }
}

async function handleDocumentSubmit(event) {
  event.preventDefault();
  const button = elements.documentForm.querySelector("button[type='submit']");
  const title = $("documentTitle").value.trim();
  const category = $("documentCategory").value;
  const file = $("documentFile").files[0] || null;
  if (!title) return;
  if (file) validateFile(file, ["application/pdf", "image/jpeg", "image/png"], 10);

  button.disabled = true;
  button.textContent = file ? "Enviando…" : "Salvando…";
  try {
    const resourceRef = doc(resourceCollection("documentos"));
    const uploaded = file ? await uploadResourceFile("documentos", resourceRef.id, file) : null;
    await setDoc(resourceRef, {
      titulo: title,
      categoria: category,
      status: uploaded ? "enviado" : "solicitado",
      solicitadoEm: serverTimestamp(),
      enviadoEm: uploaded ? serverTimestamp() : null,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
      criadoPor: state.adminUser.uid,
      arquivo: uploaded
    });
    await writeHistory(uploaded ? "documento enviado" : "documento solicitado", `${title}${uploaded ? " foi anexado" : " foi solicitado"}.`);
    elements.documentForm.reset();
    showToast(uploaded ? "Documento enviado com segurança." : "Solicitação registrada.");
  } catch (error) {
    console.error("[proposta-admin] documento:", error);
    showToast(error.message || "Não foi possível salvar o documento.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Salvar solicitação";
  }
}

async function handleContractSubmit(event) {
  event.preventDefault();
  const button = elements.contractForm.querySelector("button[type='submit']");
  const title = $("contractTitle").value.trim();
  const stage = $("contractStage").value;
  const file = $("contractFile").files[0];
  if (!title || !file) return;
  validateFile(file, ["application/pdf"], 15);

  button.disabled = true;
  button.textContent = "Enviando…";
  try {
    const resourceRef = doc(resourceCollection("contratos"));
    const uploaded = await uploadResourceFile("contratos", resourceRef.id, file);
    await setDoc(resourceRef, {
      titulo: title,
      etapa: stage,
      status: stage === "concluido" ? "concluido" : "enviado",
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
      criadoPor: state.adminUser.uid,
      arquivo: uploaded
    });
    await writeHistory("contrato adicionado", `${title} foi adicionado à etapa ${stageLabel(stage)}.`);
    elements.contractForm.reset();
    showToast("Contrato enviado com segurança.");
  } catch (error) {
    console.error("[proposta-admin] contrato:", error);
    showToast(error.message || "Não foi possível enviar o contrato.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Enviar contrato";
  }
}

async function handleMessageSubmit(event) {
  event.preventDefault();
  const message = elements.messageField.value.trim();
  if (!message) return;
  const button = elements.messageForm.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    await addDoc(resourceCollection("mensagens"), {
      texto: message,
      autorId: state.adminUser.uid,
      autorNome: state.admin?.nome || state.adminUser.displayName || "Administração City Park",
      autorTipo: "admin",
      criadoEm: serverTimestamp()
    });
    await writeHistory("mensagem enviada", "A administração enviou uma mensagem ao corretor responsável.");
    elements.messageField.value = "";
  } catch (error) {
    console.error("[proposta-admin] mensagem:", error);
    showToast(error.message || "Não foi possível enviar a mensagem.", true);
  } finally {
    button.disabled = false;
  }
}

async function handleAssetStatusChange(event) {
  const select = event.target.closest("[data-asset-status]");
  if (!select) return;
  const { assetStatus: collectionName, assetId, assetTitle } = select.dataset;
  const nextStatus = select.value;
  select.disabled = true;
  try {
    await updateDoc(doc(db, "propostas", state.proposalId, collectionName, assetId), {
      status: nextStatus,
      atualizadoEm: serverTimestamp(),
      revisadoEm: serverTimestamp(),
      revisadoPor: state.adminUser.uid
    });
    await writeHistory(`${collectionName === "documentos" ? "documento" : "contrato"} atualizado`, `${assetTitle}: ${statusLabel(nextStatus)}.`);
    showToast("Situação atualizada.");
  } catch (error) {
    console.error("[proposta-admin] status de arquivo:", error);
    showToast(error.message || "Não foi possível atualizar a situação.", true);
  } finally {
    select.disabled = false;
  }
}

async function handleOpenFile(event) {
  const button = event.target.closest("[data-open-file]");
  if (!button) return;
  const path = button.dataset.openFile;
  if (!path) return;
  const previewWindow = window.open("about:blank", "_blank");
  if (previewWindow) previewWindow.opener = null;
  button.disabled = true;
  button.textContent = "Abrindo…";
  try {
    const blob = await getBlob(ref(storage, path));
    const objectUrl = URL.createObjectURL(blob);
    if (previewWindow) previewWindow.location.replace(objectUrl);
    else {
      const link = document.createElement("a");
      link.href = objectUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch (error) {
    previewWindow?.close();
    console.error("[proposta-admin] abertura de arquivo:", error);
    showToast(error.message || "Não foi possível abrir o arquivo.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Abrir arquivo";
  }
}

async function uploadResourceFile(moduleName, resourceId, file) {
  const fileName = `${Date.now()}-${safeFileName(file.name)}`;
  const path = `propostas/${state.proposalId}/${moduleName}/${resourceId}/${fileName}`;
  const storageRef = ref(storage, path);
  const uploadResult = await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: { propostaId: state.proposalId, modulo: moduleName }
  });
  return {
    nome: file.name,
    caminho: uploadResult.ref.fullPath,
    tipo: file.type,
    tamanho: file.size
  };
}

function validateFile(file, allowedTypes, maxMegabytes) {
  if (!allowedTypes.includes(file.type)) throw new Error("Formato de arquivo não permitido.");
  if (file.size > maxMegabytes * 1024 * 1024) throw new Error(`O arquivo deve ter no máximo ${maxMegabytes} MB.`);
}

function renderDocuments() {
  updateBadge(elements.documentBadge, state.documents.filter(item => item.status !== "aprovado").length);
  elements.documentList.innerHTML = state.documents.length
    ? state.documents.map(item => assetTemplate(item, "documentos")).join("")
    : emptyState("Nenhum documento foi solicitado para esta proposta.");
}

function renderContracts() {
  updateBadge(elements.contractBadge, state.contracts.filter(item => item.status !== "concluido").length);
  elements.contractList.innerHTML = state.contracts.length
    ? state.contracts.map(item => assetTemplate(item, "contratos")).join("")
    : emptyState("Nenhum contrato foi adicionado a esta proposta.");
}

function assetTemplate(item, collectionName) {
  const options = collectionName === "documentos"
    ? [["solicitado", "Solicitado"], ["enviado", "Enviado"], ["em_analise", "Em análise"], ["aprovado", "Aprovado"], ["recusado", "Recusado"]]
    : [["enviado", "Enviado"], ["juridico", "Jurídico"], ["assinatura", "Assinatura"], ["concluido", "Concluído"]];
  return `
    <article class="asset-item" data-status="${escapeHtml(normalizeStatus(item.status))}">
      <div class="asset-main">
        <h3>${escapeHtml(item.titulo || "Sem título")}</h3>
        <p>${escapeHtml(collectionName === "documentos" ? categoryLabel(item.categoria) : stageLabel(item.etapa))} · ${escapeHtml(formatDate(item.atualizadoEm || item.criadoEm))}${item.arquivo?.nome ? ` · ${escapeHtml(item.arquivo.nome)}` : ""}</p>
      </div>
      <div class="asset-controls">
        ${item.arquivo?.caminho ? `<button class="asset-download" type="button" data-open-file="${escapeHtml(item.arquivo.caminho)}">Abrir arquivo</button>` : ""}
        <select class="status-select" data-asset-status="${escapeHtml(collectionName)}" data-asset-id="${escapeHtml(item.id)}" data-asset-title="${escapeHtml(item.titulo || "Arquivo")}" aria-label="Situação de ${escapeHtml(item.titulo || "arquivo")}">
          ${options.map(([value, label]) => `<option value="${value}" ${normalizeStatus(item.status) === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </div>
    </article>`;
}

function renderMessages() {
  elements.messageList.innerHTML = state.messages.length
    ? state.messages.map(item => `
      <article class="message ${item.autorId === state.adminUser.uid ? "own" : ""}">
        <p>${escapeHtml(item.texto)}</p>
        <div class="message-meta"><strong>${escapeHtml(item.autorNome || authorLabel(item.autorTipo))}</strong><time>${escapeHtml(formatDate(item.criadoEm))}</time></div>
      </article>`).join("")
    : emptyState("Ainda não existem mensagens nesta proposta.");
  elements.messageList.scrollTop = elements.messageList.scrollHeight;
}

async function loadHistory() {
  try {
    const snapshot = await getDocs(query(
      collection(db, "historico_propostas"),
      where("propostaId", "==", state.proposalId)
    ));
    const items = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => dateValue(b.data) - dateValue(a.data));
    renderHistory(items);
  } catch (error) {
    console.error("[proposta-admin] histórico:", error);
    elements.historyTimeline.innerHTML = emptyState("Não foi possível carregar o histórico desta proposta.");
  }
}

function renderHistory(items) {
  elements.historyTimeline.innerHTML = items.length
    ? items.map(item => `
      <article class="history-event">
        <time>${escapeHtml(formatDate(item.data))}</time>
        <h3>${escapeHtml(item.acao || "Ação registrada")}</h3>
        <p>${escapeHtml(item.observacao || historyStatusText(item))}</p>
      </article>`).join("")
    : emptyState("Ainda não há eventos registrados para esta proposta.");
}

async function writeHistory(action, observation) {
  await addDoc(collection(db, "historico_propostas"), {
    acao: action,
    observacao: observation,
    data: serverTimestamp(),
    ano: new Date().getFullYear(),
    adminId: state.adminUser.uid,
    corretorId: state.proposal.corretorId || null,
    propostaId: state.proposalId,
    unidadeId: state.proposal.unidadeId || null,
    unidade: unitName(),
    statusAnterior: state.proposal.statusProposta || null,
    statusNovo: state.proposal.statusProposta || null
  });
  await loadHistory();
}

function resourceCollection(name) {
  return collection(db, "propostas", state.proposalId, name);
}

function brokerSnapshot() {
  return { ...(state.broker || {}), ...(state.proposal?.corretorSnapshot || {}) };
}

function clientName() {
  const client = state.proposal?.cliente || {};
  return client.nomeCompleto || client.razaoSocial || "Não informado";
}

function unitName() {
  return state.unit?.unidade || state.proposal?.unidadeSnapshot?.unidade || state.proposal?.unidadeId || "Não informada";
}

function tableValue() {
  const values = state.proposal?.unidadeSnapshot?.valores || state.unit?.valores || {};
  return moneyValue(values, ["precoAVistaCentavos", "precoAVista", "precoVistaCentavos", "precoVista"]);
}

function moneyValue(source, keys) {
  for (const key of keys) {
    if (Number.isInteger(source?.[key])) return source[key];
  }
  return null;
}

function detail(label, value) {
  const display = value === null || value === undefined || value === "" ? "Não informado" : value;
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(display)}</dd></div>`;
}

function updateBadge(element, count) {
  element.hidden = count <= 0;
  element.textContent = String(count);
}

function conditionTypeLabel(type) {
  const normalized = normalizeText(type);
  if (normalized === "padrao") return "Condição padrão";
  if (["outro", "personalizada", "personalizado"].includes(normalized)) return "Condição personalizada";
  return "Condição não informada";
}

function normalizeStatus(value) {
  const normalized = normalizeText(value).replaceAll(" ", "_");
  const aliases = {
    reservado: "reservada", aprovada: "aprovada", aprovado: "aprovada",
    vendido: "vendida", solicitado: "solicitado", enviado: "enviado",
    em_analise: "em_analise", concluido: "concluido", concluida: "concluido"
  };
  return aliases[normalized] || normalized || "sem_status";
}

function statusLabel(value) {
  const labels = {
    disponivel: "Disponível", reservada: "Reservada", aprovada: "Aprovada", vendida: "Vendida",
    recusada: "Recusada", cancelada: "Cancelada", distratada: "Distratada", expirada: "Expirada",
    solicitado: "Solicitado", enviado: "Enviado", em_analise: "Em análise", aprovado: "Aprovado",
    recusado: "Recusado", juridico: "Jurídico", assinatura: "Assinatura", concluido: "Concluído"
  };
  const normalized = normalizeStatus(value);
  return labels[normalized] || String(value || "Não informado");
}

function categoryLabel(value) {
  return ({ identificacao: "Identificação", residencia: "Residência", renda: "Renda", civil: "Estado civil", outro: "Outro" })[value] || "Documento";
}

function stageLabel(value) {
  return ({ juridico: "Jurídico", assinatura: "Assinatura", concluido: "Concluído" })[value] || "Contrato";
}

function authorLabel(value) {
  return value === "corretor" ? "Corretor" : "Administração City Park";
}

function historyStatusText(item) {
  if (item.statusAnterior || item.statusNovo) return `${statusLabel(item.statusAnterior)} → ${statusLabel(item.statusNovo)}`;
  return "Evento registrado no processo.";
}

function formatMoney(cents) {
  if (!Number.isInteger(cents)) return "Não informado";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatArea(area) {
  return typeof area === "number" ? `${area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²` : "Não informada";
}

function formatCpfCnpj(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return value || "Não informado";
}

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return value || "Não informado";
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value) {
  const date = toDate(value);
  return date ? date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Não informado";
}

function formatDateOnly(value) {
  const date = toDate(value);
  return date ? date.toLocaleDateString("pt-BR") : "A definir";
}

function dateValue(value) {
  return toDate(value)?.getTime() || 0;
}

function safeFileName(value) {
  return String(value || "arquivo")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "arquivo";
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function cssEscape(value) {
  return window.CSS?.escape ? CSS.escape(String(value || "")) : String(value || "").replace(/[^a-z0-9_-]/gi, "");
}

function emptyState(message) {
  return `<p class="empty-state">${escapeHtml(message)}</p>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message, isError = false) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.classList.add("visible");
  state.toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 3600);
}

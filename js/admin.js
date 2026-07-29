import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";

import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

const $ = id => document.getElementById(id);

const elements = {
  refresh: $("btnCarregar"),
  logout: $("btnSairAdmin"),
  grid: $("kanbanGrid"),
  units: $("disponiveis"),
  open: $("propostas"),
  approved: $("aprovadas"),
  sold: $("vendidas"),
  searchUnits: $("searchUnits"),
  searchOpen: $("searchOpen"),
  searchApproved: $("searchApproved"),
  searchSold: $("searchSold"),
  toggleFilters: $("btnToggleUnitFilters"),
  filters: $("unitFilters"),
  statusFilter: $("unitStatusFilter"),
  typeFilter: $("unitTypeFilter"),
  soldPeriod: $("soldPeriod"),
  managerBack: $("managerBack"),
  managerSearch: $("managerSearch"),
  managerSearchButton: $("managerSearchButton"),
  managerOptions: $("managerUnitOptions"),
  managerListView: $("managerListView"),
  managerHistoryView: $("managerHistoryView"),
  managerDetailView: $("managerDetailView"),
  managerUnitList: $("managerUnitList"),
  managerUnitBadge: $("managerUnitBadge"),
  managerCurrentStatus: $("managerCurrentStatus"),
  managerYear: $("managerYear"),
  managerResultCount: $("managerResultCount"),
  managerProposalList: $("managerProposalList"),
  managerDetailHeader: $("managerDetailHeader"),
  managerDetailSummary: $("managerDetailSummary"),
  managerTimeline: $("managerProposalTimeline"),
  brokerManagerBack: $("brokerManagerBack"),
  brokerManagerSearch: $("brokerManagerSearch"),
  brokerManagerSearchButton: $("brokerManagerSearchButton"),
  brokerManagerFilter: $("brokerManagerFilter"),
  brokerManagerCount: $("brokerManagerCount"),
  brokerManagerListView: $("brokerManagerListView"),
  brokerManagerDetailView: $("brokerManagerDetailView"),
  brokerManagerList: $("brokerManagerList"),
  brokerManagerDetail: $("brokerManagerDetail"),
  confirmOverlay: $("modalConfirmacao"),
  confirmTitle: $("modalTitulo"),
  confirmContent: $("modalConteudo"),
  confirmCancel: $("modalCancelar"),
  confirmSubmit: $("modalConfirmar"),
  detailOverlay: $("detailModal"),
  detailTitle: $("detailModalTitle"),
  detailContent: $("detailModalContent"),
  detailClose: $("detailModalClose"),
  commentEditor: $("commentEditor"),
  commentEditorField: $("commentEditorField"),
  commentEditorClose: $("commentEditorClose"),
  commentEditorCancel: $("commentEditorCancel"),
  commentEditorSave: $("commentEditorSave"),
  toast: $("toast")
};

const state = {
  units: [],
  proposals: [],
  brokers: new Map(),
  proposalsById: new Map(),
  unitsById: new Map(),
  expandedUnitId: null,
  expandedSoldUnitId: null,
  managerUnitId: null,
  managerProposalId: null,
  managerView: "list",
  brokerManagerView: "list",
  selectedBrokerId: null,
  commentProposalId: null,
  commentAnchor: null,
  dragged: null,
  toastTimer: null
};

const STATUS_LABELS = {
  disponivel: "disponível",
  reservada: "reservado",
  aprovada: "reservado",
  vendida: "vendido",
  distratada: "distratada",
  recusada: "recusada",
  cancelada: "cancelada",
  expirada: "expirada",
  inativa: "inativa",
  sem_status: "sem status"
};

const MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez"
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

    document.documentElement.classList.add("page-authorized");
    bindEvents();
    await loadDashboard();
  } catch (error) {
    console.error("[admin] autenticação:", error);
    window.alert("Não foi possível validar o acesso administrativo.");
    window.location.replace("vendas.html");
  }
});

function bindEvents() {
  elements.refresh.addEventListener("click", loadDashboard);
  elements.logout.addEventListener("click", async () => {
    await signOut(auth);
    window.location.replace("vendas.html");
  });

  [elements.searchUnits, elements.searchOpen, elements.searchApproved, elements.searchSold]
    .forEach(input => input.addEventListener("input", renderBoard));

  document.querySelectorAll("[data-search-toggle]").forEach(button => {
    button.addEventListener("click", () => toggleColumnSearch(button));
  });

  document.querySelectorAll(".column-search-panel input").forEach(input => {
    input.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      const panel = input.closest(".column-search-panel");
      const button = document.querySelector(`[data-search-toggle="${panel?.id}"]`);
      if (button) closeColumnSearch(button, panel);
    });
  });

  elements.statusFilter.addEventListener("change", () => {
    elements.filters.hidden = true;
    elements.toggleFilters.setAttribute("aria-expanded", "false");
    renderBoard();
  });
  elements.typeFilter.addEventListener("change", renderBoard);
  elements.soldPeriod.addEventListener("change", renderBoard);

  elements.toggleFilters.addEventListener("click", () => {
    const willOpen = elements.filters.hidden;
    elements.filters.hidden = !willOpen;
    elements.toggleFilters.setAttribute("aria-expanded", String(willOpen));
  });

  elements.grid.addEventListener("click", handleBoardClick);
  elements.grid.addEventListener("change", handleBoardChange);
  elements.grid.addEventListener("dragstart", handleDragStart);
  elements.grid.addEventListener("dragend", handleDragEnd);
  elements.grid.addEventListener("dragover", handleDragOver);
  elements.grid.addEventListener("dragleave", handleDragLeave);
  elements.grid.addEventListener("drop", handleDrop);

  elements.commentEditorClose.addEventListener("click", closeCommentEditor);
  elements.commentEditorCancel.addEventListener("click", closeCommentEditor);
  elements.commentEditorSave.addEventListener("click", saveAdminComment);
  window.addEventListener("resize", positionCommentEditor);
  document.addEventListener("click", event => {
    if (elements.commentEditor.hidden) return;
    if (elements.commentEditor.contains(event.target) || event.target.closest('[data-action="comment"]')) return;
    closeCommentEditor();
  });

  elements.managerUnitList.addEventListener("click", event => {
    const button = event.target.closest("[data-manager-unit]");
    if (button) openManagerUnit(button.dataset.managerUnit);
  });

  elements.managerProposalList.addEventListener("click", event => {
    const button = event.target.closest("[data-manager-proposal]");
    if (button) openManagerProposal(button.dataset.managerProposal);
  });

  elements.managerSearchButton.addEventListener("click", searchManagerUnit);
  elements.managerSearch.addEventListener("keydown", event => {
    if (event.key === "Enter") searchManagerUnit();
  });
  elements.managerSearch.addEventListener("input", () => {
    if (state.managerView === "list") renderManagerUnitList();
  });
  elements.managerYear.addEventListener("change", renderManagerProposalList);
  elements.managerBack.addEventListener("click", managerGoBack);

  elements.brokerManagerSearch.addEventListener("input", () => {
    showBrokerManagerView("list");
    renderBrokerManagerList();
  });
  elements.brokerManagerSearch.addEventListener("keydown", event => {
    if (event.key === "Enter") renderBrokerManagerList();
  });
  elements.brokerManagerSearchButton.addEventListener("click", renderBrokerManagerList);
  elements.brokerManagerFilter.addEventListener("change", () => {
    state.selectedBrokerId = null;
    showBrokerManagerView("list");
    renderBrokerManagerList();
  });
  elements.brokerManagerBack.addEventListener("click", () => {
    state.selectedBrokerId = null;
    showBrokerManagerView("list");
    renderBrokerManagerList();
  });
  elements.brokerManagerList.addEventListener("click", event => {
    const button = event.target.closest("[data-broker-id]");
    if (button) openBrokerManagerDetail(button.dataset.brokerId);
  });
  elements.brokerManagerDetail.addEventListener("click", handleBrokerManagerAction);

  elements.detailClose.addEventListener("click", closeDetails);
  elements.detailOverlay.addEventListener("click", event => {
    if (event.target === elements.detailOverlay) closeDetails();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !elements.commentEditor.hidden) {
      closeCommentEditor();
      return;
    }
    if (event.key === "Escape" && !elements.detailOverlay.classList.contains("oculto")) {
      closeDetails();
    }
  });
}

function toggleColumnSearch(button) {
  const panel = document.getElementById(button.dataset.searchToggle);
  if (!panel) return;

  const willOpen = panel.hidden;
  panel.hidden = !willOpen;
  button.setAttribute("aria-expanded", String(willOpen));
  button.setAttribute("aria-label", `${willOpen ? "Fechar" : "Abrir"} pesquisa`);
  button.closest(".column-header")?.classList.toggle("has-open-search", willOpen);
  if (willOpen) panel.querySelector("input")?.focus();
}

function closeColumnSearch(button, panel) {
  panel.hidden = true;
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", "Abrir pesquisa");
  button.closest(".column-header")?.classList.remove("has-open-search");
  button.focus();
}

async function loadDashboard() {
  setLoading(true);

  try {
    const [unitsSnapshot, proposalsSnapshot, brokersSnapshot] = await Promise.all([
      getDocs(collection(db, "unidades")),
      getDocs(collection(db, "propostas")),
      getDocs(collection(db, "corretores"))
    ]);

    state.units = snapshotToArray(unitsSnapshot).sort((a, b) => naturalCompare(unitName(a), unitName(b)));
    state.proposals = snapshotToArray(proposalsSnapshot).sort((a, b) => dateValue(b.criadoEm) - dateValue(a.criadoEm));
    state.brokers = new Map(snapshotToArray(brokersSnapshot).map(broker => [broker.id, broker]));
    state.unitsById = new Map(state.units.map(unit => [unit.id, unit]));
    state.proposalsById = new Map(state.proposals.map(proposal => [proposal.id, proposal]));

    if (!state.expandedUnitId || !state.unitsById.has(state.expandedUnitId)) {
      state.expandedUnitId = state.units.find(unit => normalizeStatus(unit.status) === "disponivel")?.id
        ?? state.units[0]?.id
        ?? null;
    }

    fillUnitTypes();
    fillManagerOptions();
    renderBoard();
    renderBrokerManager();

    if (state.managerUnitId && state.unitsById.has(state.managerUnitId)) {
      renderManagerHistory();
    } else {
      showManagerView("list");
      renderManagerUnitList();
    }
  } catch (error) {
    console.error("[admin] carregamento:", error);
    setColumnsMessage(`Erro ao carregar: ${error.message}`, "empty-state");
    showToast("Não foi possível atualizar o painel.", true);
  } finally {
    setLoading(false);
  }
}

function setLoading(loading) {
  elements.refresh.disabled = loading;
  elements.refresh.classList.toggle("is-loading", loading);
  if (loading) {
    setColumnsMessage("Carregando…", "loading-state");
    elements.brokerManagerCount.textContent = "";
    elements.brokerManagerList.innerHTML = `<p class="loading-state">Carregando…</p>`;
  }
}

function setColumnsMessage(message, className) {
  const html = `<p class="${className}">${escapeHtml(message)}</p>`;
  [elements.units, elements.open, elements.approved, elements.sold].forEach(column => {
    column.innerHTML = html;
  });
}

function snapshotToArray(snapshot) {
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

function fillUnitTypes() {
  const previous = elements.typeFilter.value;
  const types = [...new Set(state.units.map(unit => unit.tipologia).filter(Boolean))]
    .sort((a, b) => naturalCompare(a, b));
  elements.typeFilter.innerHTML = `<option value="">Todas</option>${types.map(type => (
    `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`
  )).join("")}`;
  if (types.includes(previous)) elements.typeFilter.value = previous;
}

function fillManagerOptions() {
  elements.managerOptions.innerHTML = state.units.map(unit => (
    `<option value="${escapeHtml(unitName(unit))}"></option>`
  )).join("");
}

function renderBrokerManager() {
  if (state.selectedBrokerId && state.brokers.has(state.selectedBrokerId)) {
    showBrokerManagerView("detail");
    renderBrokerManagerDetail();
    return;
  }

  state.selectedBrokerId = null;
  showBrokerManagerView("list");
  renderBrokerManagerList();
}

function showBrokerManagerView(view) {
  state.brokerManagerView = view;
  elements.brokerManagerListView.hidden = view !== "list";
  elements.brokerManagerDetailView.hidden = view !== "detail";
  elements.brokerManagerBack.hidden = view === "list";
}

function renderBrokerManagerList() {
  const filter = elements.brokerManagerFilter.value || "pendente";
  const search = normalizeText(elements.brokerManagerSearch.value);
  const brokers = [...state.brokers.values()]
    .filter(broker => {
      const status = brokerReviewStatus(broker);
      const matchesStatus = filter === "todos" || status === filter;
      const matchesSearch = searchableBroker(broker).includes(search);
      return matchesStatus && matchesSearch;
    })
    .sort(compareBrokers);

  elements.brokerManagerCount.textContent = `${brokers.length} ${brokers.length === 1 ? "cadastro" : "cadastros"}`;
  elements.brokerManagerList.innerHTML = brokers.length
    ? brokers.map(renderBrokerManagerRow).join("")
    : emptyState(brokerManagerEmptyMessage(filter, search));
}

function renderBrokerManagerRow(broker) {
  const status = brokerReviewStatus(broker);
  return `
    <div class="broker-manager-row broker-status-${status}">
      <button type="button" data-broker-id="${escapeHtml(broker.id)}" aria-label="Ver cadastro de ${escapeHtml(broker.nome || broker.email || "corretor")}">
        <span class="broker-row-main">
          <strong>${display(broker.nome)}</strong>
          <span>${escapeHtml(broker.creci ? `CRECI ${broker.creci}` : "CRECI não informado")}</span>
        </span>
        <span class="broker-row-side">
          <span class="broker-status-badge">${escapeHtml(brokerReviewLabel(status))}</span>
          <small>${escapeHtml(formatShortDate(broker.criadoEm))}</small>
        </span>
      </button>
    </div>`;
}

function openBrokerManagerDetail(brokerId) {
  if (!state.brokers.has(brokerId)) return;
  state.selectedBrokerId = brokerId;
  showBrokerManagerView("detail");
  renderBrokerManagerDetail();
}

function renderBrokerManagerDetail() {
  const broker = state.brokers.get(state.selectedBrokerId);
  if (!broker) {
    state.selectedBrokerId = null;
    renderBrokerManager();
    return;
  }

  const status = brokerReviewStatus(broker);
  const email = String(broker.email ?? "").trim();
  const phone = String(broker.telefone ?? "").replace(/\D/g, "");
  const actions = brokerManagerActions(status);

  elements.brokerManagerDetail.innerHTML = `
    <div class="broker-detail-heading broker-status-${status}">
      <div>
        <span class="broker-detail-eyebrow">Cadastro de corretor</span>
        <h3>${display(broker.nome)}</h3>
      </div>
      <span class="broker-status-badge">${escapeHtml(brokerReviewLabel(status))}</span>
    </div>

    <dl class="broker-detail-grid">
      ${brokerDetailItem("Nome completo", broker.nome)}
      ${brokerDetailItem("CPF", formatCpf(broker.cpf))}
      ${brokerDetailItem("CRECI", broker.creci, `
        <a class="broker-creci-link" href="https://www.crecial.conselho.net.br/form_pesquisa_cadastro_geral_site.php" target="_blank" rel="noopener noreferrer">
          Consultar no CRECI-AL
          <span aria-hidden="true">↗</span>
        </a>`)}
      ${brokerDetailItem("Telefone", formatPhone(broker.telefone), phone ? `<a href="tel:${escapeHtml(phone)}">Ligar</a>` : "")}
      ${brokerDetailItem("E-mail", broker.email, email ? `<a href="mailto:${escapeHtml(email)}">Enviar e-mail</a>` : "")}
      ${brokerDetailItem("Imobiliária", broker.imobiliaria)}
      ${brokerDetailItem("Cadastrado em", formatDate(broker.criadoEm))}
      ${brokerDetailItem("Última revisão", formatDate(broker.revisadoEm))}
    </dl>

    ${status === "ignorado" ? `
      <div class="broker-review-note">
        Este cadastro foi revisado e ignorado. O corretor continua com <code>aprovado: false</code>.
      </div>` : ""}

    ${actions ? `<div class="broker-detail-actions">${actions}</div>` : `
      <p class="broker-approved-message">Cadastro aprovado. O corretor já possui acesso aos recursos restritos.</p>`}
  `;
}

function brokerDetailItem(label, value, action = "") {
  return `
    <div class="broker-detail-item">
      <dt>${escapeHtml(label)}</dt>
      <dd>${display(value)}</dd>
      ${action ? `<div class="broker-detail-item-action">${action}</div>` : ""}
    </div>`;
}

function brokerManagerActions(status) {
  if (status === "aprovado") return "";
  if (status === "ignorado") {
    return `
      <button class="broker-secondary-action" type="button" data-broker-action="restore">Voltar para pendentes</button>
      <button class="broker-approve-action" type="button" data-broker-action="approve">Aprovar corretor</button>`;
  }
  return `
    <button class="broker-ignore-action" type="button" data-broker-action="ignore">Ignorar cadastro</button>
    <button class="broker-approve-action" type="button" data-broker-action="approve">Aprovar corretor</button>`;
}

async function handleBrokerManagerAction(event) {
  const button = event.target.closest("[data-broker-action]");
  if (!button || !state.selectedBrokerId) return;
  const broker = state.brokers.get(state.selectedBrokerId);
  if (!broker) return;

  try {
    if (button.dataset.brokerAction === "approve") await confirmBrokerApproval(broker);
    if (button.dataset.brokerAction === "ignore") await confirmBrokerIgnore(broker);
    if (button.dataset.brokerAction === "restore") await restoreBrokerToPending(broker);
  } catch (error) {
    console.error("[admin] gerenciador de corretores:", error);
    showToast(error.message || "Não foi possível atualizar o cadastro.", true);
  }
}

async function confirmBrokerApproval(broker) {
  const confirmed = await confirmDialog({
    title: "Aprovar este corretor?",
    confirmText: "Aprovar corretor",
    html: brokerConfirmationSummary(broker, "O corretor receberá acesso aos recursos restritos do site.")
  });
  if (!confirmed) return;
  await updateBrokerReview(broker.id, "aprovado");
  showToast("Corretor aprovado com sucesso.");
  state.selectedBrokerId = null;
  await loadDashboard();
}

async function confirmBrokerIgnore(broker) {
  const confirmed = await confirmDialog({
    title: "Ignorar este cadastro?",
    confirmText: "Ignorar cadastro",
    html: brokerConfirmationSummary(
      broker,
      "O cadastro sairá da lista de pendentes e continuará com aprovado: false. Ele poderá ser localizado no filtro Ignorados."
    )
  });
  if (!confirmed) return;
  await updateBrokerReview(broker.id, "ignorado");
  showToast("Cadastro marcado como ignorado.");
  state.selectedBrokerId = null;
  await loadDashboard();
}

async function restoreBrokerToPending(broker) {
  const confirmed = await confirmDialog({
    title: "Voltar cadastro para pendentes?",
    confirmText: "Voltar para pendentes",
    html: brokerConfirmationSummary(broker, "O cadastro voltará a aparecer na lista padrão para uma nova análise.")
  });
  if (!confirmed) return;
  await updateBrokerReview(broker.id, "pendente");
  showToast("Cadastro devolvido à lista de pendentes.");
  state.selectedBrokerId = null;
  await loadDashboard();
}

async function updateBrokerReview(brokerId, decision) {
  const brokerRef = doc(db, "corretores", brokerId);

  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(brokerRef);
    if (!snapshot.exists()) throw new Error("Cadastro de corretor não encontrado.");
    const current = snapshot.data();

    if (decision !== "aprovado" && current.aprovado === true) {
      throw new Error("Este corretor já foi aprovado. Atualize o painel.");
    }

    const review = {
      aprovado: decision === "aprovado",
      statusRevisao: decision,
      revisadoEm: serverTimestamp(),
      revisadoPor: adminId()
    };

    if (decision === "aprovado") {
      Object.assign(review, {
        aprovadoEm: serverTimestamp(),
        aprovadoPor: adminId(),
        ignoradoEm: deleteField(),
        ignoradoPor: deleteField()
      });
    } else if (decision === "ignorado") {
      Object.assign(review, {
        ignoradoEm: serverTimestamp(),
        ignoradoPor: adminId()
      });
    } else {
      Object.assign(review, {
        ignoradoEm: deleteField(),
        ignoradoPor: deleteField()
      });
    }

    transaction.update(brokerRef, review);
  });
}

function brokerConfirmationSummary(broker, message) {
  return `
    <div class="modal-bloco">
      <p><strong>Corretor:</strong> ${display(broker.nome)}</p>
      <p><strong>CRECI:</strong> ${display(broker.creci)}</p>
      <p><strong>E-mail:</strong> ${display(broker.email)}</p>
      <p>${escapeHtml(message)}</p>
    </div>`;
}

function brokerReviewStatus(broker) {
  if (broker?.aprovado === true) return "aprovado";
  if (normalizeText(broker?.statusRevisao) === "ignorado" || broker?.ignorado === true) return "ignorado";
  return "pendente";
}

function brokerReviewLabel(status) {
  return {
    pendente: "Pendente",
    ignorado: "Ignorado",
    aprovado: "Aprovado"
  }[status] ?? "Pendente";
}

function searchableBroker(broker) {
  return normalizeText([
    broker.id,
    broker.nome,
    broker.cpf,
    broker.creci,
    broker.telefone,
    broker.email,
    broker.imobiliaria,
    brokerReviewLabel(brokerReviewStatus(broker))
  ].join(" "));
}

function compareBrokers(a, b) {
  const statusA = brokerReviewStatus(a);
  const statusB = brokerReviewStatus(b);
  if (statusA !== statusB) {
    const order = { pendente: 0, ignorado: 1, aprovado: 2 };
    return order[statusA] - order[statusB];
  }

  if (statusA === "pendente") {
    const dateA = dateValue(a.criadoEm) || Number.MAX_SAFE_INTEGER;
    const dateB = dateValue(b.criadoEm) || Number.MAX_SAFE_INTEGER;
    if (dateA !== dateB) return dateA - dateB;
  } else {
    const reviewed = dateValue(b.revisadoEm) - dateValue(a.revisadoEm);
    if (reviewed) return reviewed;
  }

  return naturalCompare(a.nome ?? a.email, b.nome ?? b.email);
}

function brokerManagerEmptyMessage(filter, search) {
  if (search) return "Nenhum corretor corresponde à pesquisa.";
  if (filter === "pendente") return "Não há cadastros aguardando análise.";
  if (filter === "ignorado") return "Nenhum cadastro foi ignorado.";
  if (filter === "aprovado") return "Nenhum corretor foi aprovado.";
  return "Nenhum corretor cadastrado.";
}

function formatShortDate(value) {
  const date = toDate(value);
  return date ? date.toLocaleDateString("pt-BR") : "Data não informada";
}

function formatCpf(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== 11) return value || "Não informado";
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function formatPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return value || "Não informado";
}

function renderBoard() {
  const unitSearch = normalizeText(elements.searchUnits.value);
  const statusFilter = normalizeStatus(elements.statusFilter.value);
  const typeFilter = normalizeText(elements.typeFilter.value);

  const visibleUnits = state.units.filter(unit => {
    const matchesSearch = searchableUnit(unit).includes(unitSearch);
    const matchesStatus = !elements.statusFilter.value || normalizeStatus(unit.status) === statusFilter;
    const matchesType = !typeFilter || normalizeText(unit.tipologia) === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  if (visibleUnits.length && !visibleUnits.some(unit => unit.id === state.expandedUnitId)) {
    state.expandedUnitId = visibleUnits[0].id;
  }

  elements.units.innerHTML = visibleUnits.length
    ? visibleUnits.map(renderUnitCard).join("")
    : emptyState("Nenhuma unidade encontrada.");

  const openItems = activeUnitsForStatus("reservada").filter(({ unit, proposal }) => (
    searchableProposal(unit, proposal).includes(normalizeText(elements.searchOpen.value))
  ));
  const approvedItems = activeUnitsForStatus("aprovada").filter(({ unit, proposal }) => (
    searchableProposal(unit, proposal).includes(normalizeText(elements.searchApproved.value))
  ));
  const soldItems = activeUnitsForStatus("vendida")
    .filter(({ unit, proposal }) => matchesSoldPeriod(unit, proposal))
    .filter(({ unit, proposal }) => searchableProposal(unit, proposal).includes(normalizeText(elements.searchSold.value)));

  elements.open.innerHTML = openItems.length
    ? openItems.map(item => renderProposalCard(item, "reservada")).join("")
    : emptyState("Nenhuma proposta aberta.");
  elements.approved.innerHTML = approvedItems.length
    ? approvedItems.map(item => renderProposalCard(item, "aprovada")).join("")
    : emptyState("Nenhuma proposta aprovada.");
  elements.sold.innerHTML = soldItems.length
    ? soldItems.map(item => renderProposalCard(item, "vendida")).join("")
    : emptyState("Nenhuma venda no período.");
}

function activeUnitsForStatus(status) {
  return state.units
    .filter(unit => normalizeStatus(unit.status) === status)
    .map(unit => ({ unit, proposal: linkedProposal(unit) }));
}

function linkedProposal(unit) {
  const proposalId = unit.propostaAtualId ?? unit.propostaId ?? null;
  if (proposalId && state.proposalsById.has(proposalId)) return state.proposalsById.get(proposalId);

  return state.proposals.find(proposal => (
    proposal.unidadeId === unit.id && normalizeStatus(proposal.statusProposta) === normalizeStatus(unit.status)
  )) ?? null;
}

function renderUnitCard(unit) {
  const status = normalizeStatus(unit.status);
  const expanded = state.expandedUnitId === unit.id;
  const values = normalizeValues(unit.valores);
  const canCreateProposal = status === "disponivel";

  return `
    <article
      class="unit-card status-stripe status-${escapeHtml(status)} ${expanded ? "is-expanded" : ""} ${canCreateProposal ? "unit-card-draggable" : ""}"
      data-unit-id="${escapeHtml(unit.id)}"
      data-unit-name="${escapeHtml(unitName(unit))}"
      data-status="${escapeHtml(status)}"
      draggable="${canCreateProposal}"
    >
      <button class="unit-card-toggle" type="button" data-unit-toggle="${escapeHtml(unit.id)}" aria-expanded="${expanded}">
        <strong>${escapeHtml(unitName(unit))}</strong>
        <span class="search-glyph" aria-hidden="true"></span>
      </button>
      <div class="unit-card-body" ${expanded ? "" : "inert"}>
        <p>Tipologia: ${display(unit.tipologia)}</p>
        <p>Área: ${formatArea(unit.areaM2)}</p>
        <p>Preço à vista: ${formatMoney(values.cash)}</p>
        <p>Sinal: ${formatMoney(values.downPayment)}</p>
        <p>Parcelas mensais: ${formatMoney(values.monthly)}</p>
        <p>Intercaladas semestrais: ${formatMoney(values.semestral)}</p>
        <p>Chaves: ${formatMoney(values.keys)}</p>
        <p>Status: <strong class="status-word">${escapeHtml(statusLabel(status))}</strong></p>
        <div class="unit-actions">
          ${canCreateProposal ? `<a class="unit-proposal-link" href="${escapeHtml(proposalFormUrl(unit))}">Enviar uma proposta</a>` : ""}
        </div>
      </div>
    </article>`;
}

function proposalFormUrl(unit) {
  return `formulario.html#unidade=${encodeURIComponent(unitName(unit))}&admin=1`;
}

function renderProposalCard({ unit, proposal }, status) {
  const proposalId = proposal?.id ?? unit.propostaAtualId ?? "";
  const broker = proposal?.corretorId ? state.brokers.get(proposal.corretorId) : null;
  const clientName = proposal?.cliente?.nomeCompleto ?? proposal?.cliente?.razaoSocial ?? "Não informado";
  const brokerName = proposal?.corretorSnapshot?.nome ?? broker?.nome ?? proposal?.corretorId ?? "Não vinculado";
  const tags = proposalTags(proposal, status);
  const title = status === "reservada"
    ? "Proposta em Análise"
    : status === "aprovada" ? "Aguardando assinatura" : unitName(unit);
  const draggable = status === "reservada" || status === "aprovada";
  const date = status === "vendida" ? (unit.vendidoEm ?? proposal?.vendidoEm ?? proposal?.atualizadoEm) : proposal?.criadoEm;

  if (status === "vendida") return renderSoldCard({ unit, proposal, proposalId, brokerName, clientName, tags, date });

  return `
    <article
      class="proposal-card status-stripe status-${escapeHtml(status)} ${draggable && proposalId ? "card-arrastavel" : ""}"
      data-unit-id="${escapeHtml(unit.id)}"
      data-proposal-id="${escapeHtml(proposalId)}"
      data-status="${escapeHtml(status)}"
      draggable="${draggable && Boolean(proposalId)}"
    >
      <header class="card-topo">
        <strong>${escapeHtml(title)}</strong>
        ${draggable ? dragHandle() : ""}
      </header>
      <div class="card-body">
        <p>Unidade: ${escapeHtml(unitName(unit))}</p>
        <p>Corretor: ${display(brokerName)}</p>
        <p>Cliente: ${display(clientName)}</p>
        <p>Status: <strong class="status-word">${escapeHtml(statusLabel(status))}</strong></p>
        <div class="tags-row"><span>Tags:</span>${tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
        <div class="card-utilities">
          <button class="mini-button" type="button" data-action="proposal-details" data-proposal-id="${escapeHtml(proposalId)}" data-unit-id="${escapeHtml(unit.id)}">Ver detalhes</button>
          ${proposalId ? `<button class="comment-button ${proposal?.comentarioAdmin ? "has-comment" : ""}" type="button" data-action="comment" data-proposal-id="${escapeHtml(proposalId)}" aria-label="Comentário administrativo" title="${escapeHtml(proposal?.comentarioAdmin ?? "Adicionar comentário")}"></button>` : ""}
        </div>
      </div>
      <footer class="card-footer">
        ${renderCardFooter(status, unit.id, proposalId, proposal)}
      </footer>
    </article>`;
}

function renderSoldCard({ unit, proposal, proposalId, brokerName, clientName, tags, date }) {
  const expanded = state.expandedSoldUnitId === unit.id;
  return `
    <article
      class="proposal-card sold-card status-stripe status-vendida ${expanded ? "is-expanded" : ""}"
      data-unit-id="${escapeHtml(unit.id)}"
      data-proposal-id="${escapeHtml(proposalId)}"
      data-status="vendida"
    >
      <button class="sold-card-toggle" type="button" data-sold-toggle="${escapeHtml(unit.id)}" aria-expanded="${expanded}">
        <strong>${escapeHtml(unitName(unit))}</strong>
        <span class="search-glyph" aria-hidden="true"></span>
      </button>
      <div class="sold-card-content" ${expanded ? "" : "inert"}>
        <div class="card-body">
          <p>Proposta ID: ${display(proposalId || "Sem vínculo")}</p>
          <p>Data: ${formatDate(date)}</p>
          <p>Corretor: ${display(brokerName)}</p>
          <p>Cliente: ${display(clientName)}</p>
          <p>Status: <strong class="status-word">${escapeHtml(statusLabel("vendida"))}</strong></p>
          <div class="tags-row"><span>Tags:</span>${tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
          <div class="card-utilities">
            <button class="mini-button" type="button" data-action="proposal-details" data-proposal-id="${escapeHtml(proposalId)}" data-unit-id="${escapeHtml(unit.id)}">Ver detalhes</button>
            ${proposalId ? `<button class="comment-button ${proposal?.comentarioAdmin ? "has-comment" : ""}" type="button" data-action="comment" data-proposal-id="${escapeHtml(proposalId)}" aria-label="Comentário administrativo" title="${escapeHtml(proposal?.comentarioAdmin ?? "Adicionar comentário")}"></button>` : ""}
          </div>
        </div>
        <footer class="card-footer">
          ${renderCardFooter("vendida", unit.id, proposalId, proposal)}
        </footer>
      </div>
    </article>`;
}

function renderCardFooter(status, unitId, proposalId, proposal) {
  if (!proposalId) return `<span class="empty-state">Vínculo legado indisponível</span>`;

  if (status === "reservada") {
    return `
      <button class="mini-button danger-button" type="button" data-action="reject" data-unit-id="${escapeHtml(unitId)}" data-proposal-id="${escapeHtml(proposalId)}">Recusar</button>
      <button class="action-button" type="button" data-action="approve" data-unit-id="${escapeHtml(unitId)}" data-proposal-id="${escapeHtml(proposalId)}">Aprovar proposta</button>`;
  }

  if (status === "aprovada") {
    return `
      <select class="option-select" data-action-select="approved-options" data-unit-id="${escapeHtml(unitId)}" data-proposal-id="${escapeHtml(proposalId)}" aria-label="Opções da proposta">
        <option value="">Opções</option>
        <option value="juridico">${proposalTags(proposal, status).includes("Jurídico") ? "Remover Jurídico" : "Marcar Jurídico"}</option>
        <option value="cancel">Cancelar proposta</option>
      </select>
      <button class="action-button" type="button" data-action="sell" data-unit-id="${escapeHtml(unitId)}" data-proposal-id="${escapeHtml(proposalId)}">Vender Unidade</button>`;
  }

  return `
    <select class="option-select" data-action-select="sold-options" data-unit-id="${escapeHtml(unitId)}" data-proposal-id="${escapeHtml(proposalId)}" aria-label="Opções da venda">
      <option value="">Opções</option>
      <option value="distract">Distrato</option>
    </select>
    <span></span>`;
}

function dragHandle() {
  return `<span class="drag-handle" title="Arraste para a próxima etapa" aria-hidden="true">${"<span></span>".repeat(9)}</span>`;
}

function proposalTags(proposal, status) {
  const tags = [];
  const legacy = proposal?.tagsEtapas;
  const saved = proposal?.tagsAdmin;

  if (Array.isArray(saved)) tags.push(...saved);
  if (Array.isArray(legacy)) tags.push(...legacy);
  if (typeof legacy === "string") tags.push(...legacy.split(/[,;|]/));

  if (status === "reservada") tags.push("Comercial em Análise");
  if (["aprovada", "vendida"].includes(status)) tags.push("Aprovado");
  if (status === "vendida") tags.push("Contrato Assinado");

  return [...new Set(tags.map(tag => canonicalTag(tag)).filter(Boolean))];
}

function canonicalTag(tag) {
  const normalized = normalizeText(tag);
  if (!normalized) return "";
  if (normalized.includes("comercial")) return "Comercial em Análise";
  if (normalized.includes("jurid")) return "Jurídico";
  if (normalized.includes("contrato")) return "Contrato Assinado";
  if (normalized.includes("aprov")) return "Aprovado";
  return String(tag).trim();
}

async function handleBoardClick(event) {
  const toggle = event.target.closest("[data-unit-toggle]");
  if (toggle) {
    setExpandedCard("unit", toggle.dataset.unitToggle);
    return;
  }

  const soldToggle = event.target.closest("[data-sold-toggle]");
  if (soldToggle) {
    const unitId = soldToggle.dataset.soldToggle;
    state.expandedSoldUnitId = state.expandedSoldUnitId === unitId ? null : unitId;
    setExpandedCard("sold", state.expandedSoldUnitId);
    return;
  }

  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, unitId, proposalId } = button.dataset;
  if (action === "comment") {
    openCommentEditor(proposalId, button);
    return;
  }
  button.disabled = true;

  try {
    if (action === "unit-details") showUnitDetails(unitId);
    if (action === "proposal-details") showProposalDetails(proposalId, unitId);
    if (action === "approve") await confirmApprove(proposalId, unitId);
    if (action === "sell") await confirmSell(proposalId, unitId);
    if (action === "reject") await rejectProposal(proposalId, unitId);
  } catch (error) {
    console.error(`[admin] ${action}:`, error);
    showToast(error.message || "Não foi possível concluir a operação.", true);
  } finally {
    button.disabled = false;
  }
}

function setExpandedCard(kind, activeId) {
  const selector = kind === "unit" ? ".unit-card" : ".sold-card";
  const dataName = kind === "unit" ? "unitToggle" : "soldToggle";
  if (kind === "unit") state.expandedUnitId = activeId;

  document.querySelectorAll(selector).forEach(card => {
    const button = card.querySelector(`[data-${kind === "unit" ? "unit" : "sold"}-toggle]`);
    const isExpanded = Boolean(activeId) && button?.dataset[dataName] === activeId;
    const content = card.querySelector(kind === "unit" ? ".unit-card-body" : ".sold-card-content");
    card.classList.toggle("is-expanded", isExpanded);
    button?.setAttribute("aria-expanded", String(isExpanded));
    if (content) content.inert = !isExpanded;
  });
}

async function handleBoardChange(event) {
  const select = event.target.closest("select[data-action-select]");
  if (!select || !select.value) return;

  const { unitId, proposalId } = select.dataset;
  const value = select.value;
  select.value = "";

  try {
    if (value === "juridico") await toggleLegalTag(proposalId);
    if (value === "cancel") await rejectProposal(proposalId, unitId);
    if (value === "distract") await cancelSale(proposalId, unitId);
  } catch (error) {
    console.error(`[admin] opção ${value}:`, error);
    showToast(error.message || "Não foi possível concluir a operação.", true);
  }
}

function handleDragStart(event) {
  const unitCard = event.target.closest(".unit-card-draggable");
  if (unitCard) {
    state.dragged = {
      kind: "unit",
      unitId: unitCard.dataset.unitId,
      unitName: unitCard.dataset.unitName,
      proposalId: null,
      status: "disponivel"
    };
    unitCard.classList.add("unit-card-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify(state.dragged));
    return;
  }

  const card = event.target.closest(".card-arrastavel");
  if (!card) return;
  state.dragged = {
    kind: "proposal",
    unitId: card.dataset.unitId,
    proposalId: card.dataset.proposalId,
    status: normalizeStatus(card.dataset.status)
  };
  card.classList.add("card-arrastando");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", JSON.stringify(state.dragged));
}

function handleDragEnd(event) {
  event.target.closest(".unit-card-draggable")?.classList.remove("unit-card-dragging");
  event.target.closest(".card-arrastavel")?.classList.remove("card-arrastando");
  state.dragged = null;
  clearDropzones();
}

function handleDragOver(event) {
  const dropzone = event.target.closest(".dropzone");
  if (!dropzone || !state.dragged) return;
  const target = normalizeStatus(dropzone.dataset.dropStatus);
  if (movementAllowed(state.dragged.status, target)) {
    event.preventDefault();
    dropzone.classList.add("dropzone-ativa", "dropzone-permitida");
  }
}

function handleDragLeave(event) {
  event.target.closest(".dropzone")?.classList.remove("dropzone-ativa", "dropzone-permitida");
}

async function handleDrop(event) {
  const dropzone = event.target.closest(".dropzone");
  if (!dropzone || !state.dragged) return;
  event.preventDefault();
  const target = normalizeStatus(dropzone.dataset.dropStatus);
  const dragged = { ...state.dragged };
  clearDropzones();

  if (!movementAllowed(dragged.status, target)) return;
  if (dragged.kind === "unit" && dragged.status === "disponivel" && target === "reservada") {
    const unit = state.unitsById.get(dragged.unitId);
    if (unit) window.location.assign(proposalFormUrl(unit));
    return;
  }
  if (target === "aprovada") await confirmApprove(dragged.proposalId, dragged.unitId);
  if (target === "vendida") await confirmSell(dragged.proposalId, dragged.unitId);
}

function movementAllowed(from, to) {
  return (from === "disponivel" && to === "reservada")
    || (from === "reservada" && to === "aprovada")
    || (from === "aprovada" && to === "vendida");
}

function clearDropzones() {
  document.querySelectorAll(".dropzone").forEach(zone => zone.classList.remove("dropzone-ativa", "dropzone-permitida"));
}

async function confirmApprove(proposalId, unitId) {
  const context = getContext(proposalId, unitId);
  const confirmed = await confirmDialog({
    title: "Aprovar esta proposta?",
    confirmText: "Aprovar proposta",
    html: renderContextDetails(context)
  });
  if (confirmed) await approveProposal(proposalId, unitId);
}

async function confirmSell(proposalId, unitId) {
  const context = getContext(proposalId, unitId);
  const confirmed = await confirmDialog({
    title: "Marcar a unidade como vendida?",
    confirmText: "Vender unidade",
    html: renderContextDetails(context)
  });
  if (confirmed) await sellUnit(proposalId, unitId);
}

async function approveProposal(proposalId, unitId) {
  await changeProposalStage({ proposalId, unitId, from: "reservada", to: "aprovada" });
  showToast("Proposta aprovada. A expiração foi removida.");
  await loadDashboard();
}

async function sellUnit(proposalId, unitId) {
  await changeProposalStage({ proposalId, unitId, from: "aprovada", to: "vendida" });
  showToast("Venda registrada com sucesso.");
  await loadDashboard();
}

async function changeProposalStage({ proposalId, unitId, from, to }) {
  requireIds(proposalId, unitId);
  const proposalRef = doc(db, "propostas", proposalId);
  const unitRef = doc(db, "unidades", unitId);
  const unitHistoryRef = doc(collection(db, "historico_unidades"));
  const proposalHistoryRef = doc(collection(db, "historico_propostas"));

  await runTransaction(db, async transaction => {
    const [proposalSnapshot, unitSnapshot] = await Promise.all([
      transaction.get(proposalRef), transaction.get(unitRef)
    ]);
    if (!proposalSnapshot.exists() || !unitSnapshot.exists()) throw new Error("Proposta ou unidade não encontrada.");

    const proposal = proposalSnapshot.data();
    const unit = unitSnapshot.data();
    if (normalizeStatus(proposal.statusProposta) !== from || normalizeStatus(unit.status) !== from) {
      throw new Error("O status foi alterado por outra sessão. Atualize o painel.");
    }

    const tags = proposalTags(proposal, to);
    const common = historyCommon(proposalId, unitId, proposal, unit, from, to);
    const selling = to === "vendida";

    transaction.update(proposalRef, {
      statusProposta: to,
      adminId: adminId(),
      tagsAdmin: tags,
      atualizadoEm: serverTimestamp(),
      expiraEm: null,
      vendidoEm: selling ? serverTimestamp() : null
    });
    transaction.update(unitRef, {
      status: to,
      propostaAtualId: proposalId,
      propostaId: deleteField(),
      atualizadoEm: serverTimestamp(),
      expiraEm: null,
      vendidoEm: selling ? serverTimestamp() : null
    });
    transaction.set(unitHistoryRef, {
      ...common,
      acao: selling ? "unidade vendida" : "unidade aprovada",
      observacao: selling ? "Unidade marcada como vendida pelo administrador." : "Proposta aprovada e expiração removida."
    });
    transaction.set(proposalHistoryRef, {
      ...common,
      acao: selling ? "proposta vendida" : "proposta aprovada",
      observacao: selling ? "Contrato assinado e proposta convertida em venda." : "Proposta aprovada pelo administrador."
    });
  });
}

async function rejectProposal(proposalId, unitId) {
  requireIds(proposalId, unitId);
  const reason = await requestText({
    title: "Recusar ou cancelar proposta",
    label: "Motivo obrigatório",
    confirmText: "Confirmar recusa"
  });
  if (!reason) return;

  const proposalRef = doc(db, "propostas", proposalId);
  const unitRef = doc(db, "unidades", unitId);
  const unitHistoryRef = doc(collection(db, "historico_unidades"));
  const proposalHistoryRef = doc(collection(db, "historico_propostas"));

  await runTransaction(db, async transaction => {
    const [proposalSnapshot, unitSnapshot] = await Promise.all([transaction.get(proposalRef), transaction.get(unitRef)]);
    if (!proposalSnapshot.exists() || !unitSnapshot.exists()) throw new Error("Proposta ou unidade não encontrada.");
    const proposal = proposalSnapshot.data();
    const unit = unitSnapshot.data();
    const from = normalizeStatus(unit.status);
    if (!["reservada", "aprovada"].includes(from)) throw new Error("Esta proposta não pode mais ser recusada.");
    const to = from === "aprovada" ? "cancelada" : "recusada";
    const common = historyCommon(proposalId, unitId, proposal, unit, from, to);

    transaction.update(proposalRef, {
      statusProposta: to,
      adminId: adminId(),
      observacaoAdmin: reason,
      observacaoRecusa: reason,
      atualizadoEm: serverTimestamp(),
      expiraEm: null,
      vendidoEm: null
    });
    transaction.update(unitRef, {
      status: "disponivel",
      propostaAtualId: null,
      propostaId: deleteField(),
      atualizadoEm: serverTimestamp(),
      expiraEm: null,
      vendidoEm: null
    });
    transaction.set(unitHistoryRef, {
      ...common, statusNovo: "disponivel", acao: "unidade disponível",
      observacao: "Unidade liberada após recusa ou cancelamento da proposta."
    });
    transaction.set(proposalHistoryRef, {
      ...common, acao: from === "aprovada" ? "proposta cancelada" : "proposta recusada", observacao: reason
    });
  });

  showToast("Proposta encerrada e unidade liberada.");
  await loadDashboard();
}

async function cancelSale(proposalId, unitId) {
  requireIds(proposalId, unitId);
  const reason = await requestText({
    title: "Registrar distrato",
    label: "Informe o motivo do distrato. A unidade voltará a ficar disponível.",
    confirmText: "Confirmar distrato"
  });
  if (!reason) return;

  const confirmed = await confirmDialog({
    title: "Confirmar distrato?",
    confirmText: "Sim, liberar unidade",
    html: `<div class="modal-bloco"><p><strong>Motivo:</strong> ${escapeHtml(reason)}</p><p>Esta ação encerrará a proposta e devolverá a unidade à lista de disponíveis.</p></div>`
  });
  if (!confirmed) return;

  const proposalRef = doc(db, "propostas", proposalId);
  const unitRef = doc(db, "unidades", unitId);
  const unitHistoryRef = doc(collection(db, "historico_unidades"));
  const proposalHistoryRef = doc(collection(db, "historico_propostas"));

  await runTransaction(db, async transaction => {
    const [proposalSnapshot, unitSnapshot] = await Promise.all([transaction.get(proposalRef), transaction.get(unitRef)]);
    if (!proposalSnapshot.exists() || !unitSnapshot.exists()) throw new Error("Venda não encontrada.");
    const proposal = proposalSnapshot.data();
    const unit = unitSnapshot.data();
    if (normalizeStatus(unit.status) !== "vendida") throw new Error("A unidade não está mais vendida.");
    const common = historyCommon(proposalId, unitId, proposal, unit, "vendida", "distratada");

    transaction.update(proposalRef, {
      statusProposta: "distratada",
      adminId: adminId(),
      observacaoDistrato: reason,
      atualizadoEm: serverTimestamp(),
      expiraEm: null
    });
    transaction.update(unitRef, {
      status: "disponivel",
      propostaAtualId: null,
      propostaId: deleteField(),
      atualizadoEm: serverTimestamp(),
      expiraEm: null,
      vendidoEm: null
    });
    transaction.set(unitHistoryRef, {
      ...common, statusNovo: "disponivel", acao: "distrato registrado", observacao: reason
    });
    transaction.set(proposalHistoryRef, {
      ...common, acao: "proposta distratada", observacao: reason
    });
  });

  showToast("Distrato registrado. A unidade voltou a ficar disponível.");
  await loadDashboard();
}

async function toggleLegalTag(proposalId) {
  if (!proposalId) throw new Error("Proposta não vinculada.");
  const proposalRef = doc(db, "propostas", proposalId);
  const historyRef = doc(collection(db, "historico_propostas"));

  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(proposalRef);
    if (!snapshot.exists()) throw new Error("Proposta não encontrada.");
    const proposal = snapshot.data();
    const current = proposalTags(proposal, normalizeStatus(proposal.statusProposta));
    const hasLegal = current.includes("Jurídico");
    const tags = hasLegal ? current.filter(tag => tag !== "Jurídico") : [...current, "Jurídico"];

    transaction.update(proposalRef, { tagsAdmin: tags, adminId: adminId(), atualizadoEm: serverTimestamp() });
    transaction.set(historyRef, {
      acao: hasLegal ? "jurídico removido" : "proposta encaminhada ao jurídico",
      adminId: adminId(),
      ano: new Date().getFullYear(),
      corretorId: proposal.corretorId ?? null,
      data: serverTimestamp(),
      observacao: hasLegal ? "Tag Jurídico removida pelo administrador." : "Processo marcado como em andamento no Jurídico.",
      propostaId: proposalId,
      statusAnterior: proposal.statusProposta ?? null,
      statusNovo: proposal.statusProposta ?? null,
      unidade: proposal.unidadeSnapshot?.unidade ?? null,
      unidadeId: proposal.unidadeId ?? null
    });
  });

  showToast("Etapa Jurídico atualizada.");
  await loadDashboard();
}

function openCommentEditor(proposalId, anchor) {
  const proposal = state.proposalsById.get(proposalId);
  if (!proposal) {
    showToast("Proposta não encontrada.", true);
    return;
  }

  state.commentProposalId = proposalId;
  state.commentAnchor = anchor;
  elements.commentEditorField.value = proposal.comentarioAdmin ?? "";
  elements.commentEditor.hidden = false;
  positionCommentEditor();
  requestAnimationFrame(() => elements.commentEditorField.focus());
}

function positionCommentEditor() {
  if (elements.commentEditor.hidden || !state.commentAnchor?.isConnected) return;
  const anchorRect = state.commentAnchor.getBoundingClientRect();
  const editorRect = elements.commentEditor.getBoundingClientRect();
  const margin = 10;
  const roomRight = window.innerWidth - anchorRect.right;
  const opensLeft = roomRight < editorRect.width + margin && anchorRect.left > editorRect.width + margin;
  const left = opensLeft
    ? anchorRect.left - editorRect.width - margin
    : Math.min(anchorRect.right + margin, window.innerWidth - editorRect.width - 12);
  const top = Math.max(12, Math.min(anchorRect.top - 24, window.innerHeight - editorRect.height - 12));
  const arrowTop = Math.max(16, Math.min(anchorRect.top + (anchorRect.height / 2) - top - 6, editorRect.height - 24));

  elements.commentEditor.classList.toggle("opens-left", opensLeft);
  elements.commentEditor.style.left = `${Math.max(12, left)}px`;
  elements.commentEditor.style.top = `${top}px`;
  elements.commentEditor.style.setProperty("--comment-arrow-top", `${arrowTop}px`);
}

function closeCommentEditor() {
  elements.commentEditor.hidden = true;
  elements.commentEditor.classList.remove("opens-left", "is-saving");
  state.commentProposalId = null;
  state.commentAnchor = null;
}

async function saveAdminComment() {
  const proposalId = state.commentProposalId;
  const proposal = state.proposalsById.get(proposalId);
  if (!proposalId || !proposal) {
    closeCommentEditor();
    showToast("Proposta não encontrada.", true);
    return;
  }

  const value = elements.commentEditorField.value.trim();
  elements.commentEditor.classList.add("is-saving");
  elements.commentEditorSave.disabled = true;

  try {
    const proposalRef = doc(db, "propostas", proposalId);
    const historyRef = doc(collection(db, "historico_propostas"));
    await runTransaction(db, async transaction => {
      transaction.update(proposalRef, {
        comentarioAdmin: value || deleteField(),
        adminId: adminId(),
        atualizadoEm: serverTimestamp()
      });
      transaction.set(historyRef, {
        acao: value ? "comentário administrativo atualizado" : "comentário administrativo removido",
        adminId: adminId(), ano: new Date().getFullYear(), corretorId: proposal.corretorId ?? null,
        data: serverTimestamp(), observacao: value || "Comentário removido.", propostaId: proposalId,
        statusAnterior: proposal.statusProposta ?? null, statusNovo: proposal.statusProposta ?? null,
        unidade: proposal.unidadeSnapshot?.unidade ?? null, unidadeId: proposal.unidadeId ?? null
      });
    });
  } catch (error) {
    console.error("[admin] comentário:", error);
    elements.commentEditor.classList.remove("is-saving");
    showToast(error.message || "Não foi possível salvar o comentário.", true);
    return;
  } finally {
    elements.commentEditorSave.disabled = false;
  }

  closeCommentEditor();
  showToast("Comentário salvo.");
  await loadDashboard();
}

function historyCommon(proposalId, unitId, proposal, unit, from, to) {
  return {
    adminId: adminId(),
    ano: new Date().getFullYear(),
    corretorId: proposal.corretorId ?? null,
    data: serverTimestamp(),
    propostaId: proposalId,
    statusAnterior: proposal.statusProposta ?? from,
    statusNovo: to,
    unidade: unit.unidade ?? proposal.unidadeSnapshot?.unidade ?? null,
    unidadeId: unitId
  };
}

function adminId() {
  if (!auth.currentUser) throw new Error("Sessão administrativa expirada.");
  return auth.currentUser.uid;
}

function requireIds(proposalId, unitId) {
  if (!proposalId || !unitId) throw new Error("Unidade ou proposta sem vínculo válido.");
}

function renderManagerUnitList() {
  const search = normalizeText(elements.managerSearch.value);
  const units = state.units.filter(unit => searchableUnit(unit).includes(search));
  elements.managerUnitList.innerHTML = units.length ? units.map(unit => {
    const status = normalizeStatus(unit.status);
    return `
      <div class="manager-unit-row status-stripe status-${escapeHtml(status)}">
        <button type="button" data-manager-unit="${escapeHtml(unit.id)}">
          <span>Unidade ${escapeHtml(unitName(unit))}</span><span class="search-glyph" aria-hidden="true"></span>
        </button>
      </div>`;
  }).join("") : emptyState("Nenhuma unidade encontrada.");
}

function searchManagerUnit() {
  const search = normalizeText(elements.managerSearch.value);
  if (!search) {
    showManagerView("list");
    renderManagerUnitList();
    return;
  }
  const exact = state.units.find(unit => normalizeText(unitName(unit)) === search || normalizeText(unit.id) === search);
  if (exact) openManagerUnit(exact.id);
  else {
    showManagerView("list");
    renderManagerUnitList();
    showToast("Unidade não encontrada.", true);
  }
}

function openManagerUnit(unitId) {
  if (!state.unitsById.has(unitId)) return;
  state.managerUnitId = unitId;
  state.managerProposalId = null;
  elements.managerSearch.value = unitName(state.unitsById.get(unitId));
  showManagerView("history");
  fillManagerYears();
  renderManagerHistory();
  document.querySelector(".manager-shell")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fillManagerYears() {
  const proposals = proposalsForUnit(state.managerUnitId);
  const years = [...new Set(proposals.map(proposal => toDate(proposal.criadoEm)?.getFullYear()).filter(Boolean))]
    .sort((a, b) => b - a);
  const current = elements.managerYear.value;
  elements.managerYear.innerHTML = `<option value="">Todos</option>${years.map(year => `<option value="${year}">${year}</option>`).join("")}`;
  if (years.includes(Number(current))) elements.managerYear.value = current;
  else if (years.length) elements.managerYear.value = String(years[0]);
}

function renderManagerHistory() {
  const unit = state.unitsById.get(state.managerUnitId);
  if (!unit) return;
  const status = normalizeStatus(unit.status);
  elements.managerUnitBadge.textContent = unitName(unit);
  elements.managerUnitBadge.className = `manager-unit-badge status-${status}`;
  elements.managerUnitBadge.style.setProperty("--status-color", statusColor(status));
  elements.managerCurrentStatus.textContent = statusLabel(status);
  elements.managerCurrentStatus.style.color = statusColor(status);
  renderManagerProposalList();
}

function renderManagerProposalList() {
  const selectedYear = Number(elements.managerYear.value) || null;
  const proposals = proposalsForUnit(state.managerUnitId).filter(proposal => {
    const year = toDate(proposal.criadoEm)?.getFullYear();
    return !selectedYear || year === selectedYear;
  });
  elements.managerResultCount.textContent = `${proposals.length} ${proposals.length === 1 ? "resultado" : "resultados"}`;

  const groups = new Map();
  proposals.forEach(proposal => {
    const date = toDate(proposal.criadoEm);
    const key = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "sem-data";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(proposal);
  });

  elements.managerProposalList.innerHTML = groups.size
    ? [...groups.entries()].map(([, group], index) => {
      const date = toDate(group[0].criadoEm);
      const label = date ? `${MONTHS[date.getMonth()]}/${date.getFullYear()}` : "Sem data";
      return `${index ? `<hr class="history-separator">` : ""}<h3 class="history-month">${label}</h3>${group.map(renderManagerProposalCard).join("")}`;
    }).join("")
    : emptyState("Nenhuma proposta para esta unidade no período.");
}

function renderManagerProposalCard(proposal) {
  const status = normalizeStatus(proposal.statusProposta);
  const broker = proposal.corretorId ? state.brokers.get(proposal.corretorId) : null;
  const client = proposal.cliente?.nomeCompleto ?? proposal.cliente?.razaoSocial ?? "Não informado";
  const observation = proposal.observacaoDistrato ?? proposal.observacaoRecusa ?? proposal.observacaoAdmin ?? proposal.legado?.observacao ?? "—";
  const finalDate = ["vendida", "recusada", "cancelada", "distratada", "expirada"].includes(status)
    ? (proposal.vendidoEm ?? proposal.atualizadoEm) : null;

  return `
    <article class="manager-proposal-card status-stripe status-${escapeHtml(status)}">
      <header class="card-topo"><span>Proposta ID: ${escapeHtml(proposal.id)}</span><span class="search-glyph" aria-hidden="true" style="transform:scale(.55)"></span></header>
      <p>Data: ${formatDate(proposal.criadoEm)}</p>
      <p>Corretor: ${display(proposal.corretorSnapshot?.nome ?? broker?.nome ?? proposal.corretorId)}</p>
      <p>Cliente: ${display(client)}</p>
      <p>Status: ${display(statusLabel(status))}</p>
      <p>Observação: “${display(observation)}”</p>
      ${finalDate ? `<p>Finalizada em: ${formatDate(finalDate)}</p>` : ""}
      <button class="mini-button" type="button" data-manager-proposal="${escapeHtml(proposal.id)}">Ver detalhes</button>
      <div style="clear:both"></div>
    </article>`;
}

async function openManagerProposal(proposalId) {
  const proposal = state.proposalsById.get(proposalId);
  if (!proposal) return;
  state.managerProposalId = proposalId;
  showManagerView("detail");
  const unit = state.unitsById.get(state.managerUnitId);
  elements.managerDetailHeader.innerHTML = `<span>Detalhes da Proposta — Proposta ID: ${escapeHtml(proposal.id)}</span><span class="manager-unit-badge status-${normalizeStatus(unit?.status)}" style="--status-color:${statusColor(normalizeStatus(unit?.status))}">${escapeHtml(unitName(unit ?? {}))}</span>`;

  const broker = proposal.corretorId ? state.brokers.get(proposal.corretorId) : null;
  elements.managerDetailSummary.innerHTML = `
    <div class="summary-pair"><span>Corretor: ${display(proposal.corretorSnapshot?.nome ?? broker?.nome ?? proposal.corretorId)}</span><span>Cliente: ${display(proposal.cliente?.nomeCompleto ?? proposal.cliente?.razaoSocial)}</span></div>
    ${proposal.comentarioAdmin ? `<p><strong>Comentário administrativo:</strong> ${display(proposal.comentarioAdmin)}</p>` : ""}`;
  elements.managerTimeline.innerHTML = `<p class="loading-state">Carregando histórico…</p>`;

  try {
    const historySnapshot = await getDocs(query(collection(db, "historico_propostas"), where("propostaId", "==", proposalId)));
    const history = snapshotToArray(historySnapshot).sort((a, b) => dateValue(b.data) - dateValue(a.data));
    elements.managerTimeline.innerHTML = history.length
      ? history.map(renderTimelineEvent).join("")
      : emptyState("Nenhuma ação registrada para esta proposta.");
  } catch (error) {
    console.error("[admin] histórico proposta:", error);
    elements.managerTimeline.innerHTML = emptyState(`Erro ao carregar histórico: ${error.message}`);
  }
}

function renderTimelineEvent(item) {
  return `
    <article class="timeline-event">
      <p>Data: ${formatDate(item.data)}</p>
      <p>Ação: ${display(item.acao)}</p>
      <p>Status anterior: ${display(item.statusAnterior)}</p>
      <p>Status Novo: ${display(item.statusNovo)}</p>
      <p>Observação: ${display(item.observacao)}</p>
      ${item.tags ? `<div class="tags-row">${[].concat(item.tags).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
    </article>`;
}

function proposalsForUnit(unitId) {
  const unit = state.unitsById.get(unitId);
  const name = normalizeText(unitName(unit ?? {}));
  return state.proposals
    .filter(proposal => proposal.unidadeId === unitId || normalizeText(proposal.unidadeSnapshot?.unidade) === name)
    .sort((a, b) => dateValue(b.criadoEm) - dateValue(a.criadoEm));
}

function showManagerView(view) {
  state.managerView = view;
  elements.managerListView.hidden = view !== "list";
  elements.managerHistoryView.hidden = view !== "history";
  elements.managerDetailView.hidden = view !== "detail";
  elements.managerBack.hidden = view === "list";
}

function managerGoBack() {
  if (state.managerView === "detail") {
    showManagerView("history");
    renderManagerHistory();
  } else {
    state.managerUnitId = null;
    state.managerProposalId = null;
    elements.managerSearch.value = "";
    showManagerView("list");
    renderManagerUnitList();
  }
}

function showUnitDetails(unitId) {
  const unit = state.unitsById.get(unitId);
  if (!unit) return;
  const values = normalizeValues(unit.valores);
  openDetails(`Unidade ${unitName(unit)}`, `
    <div class="modal-bloco">
      ${detailLine("ID do documento", unit.id)}
      ${detailLine("Unidade", unitName(unit))}
      ${detailLine("Tipologia", unit.tipologia)}
      ${detailLine("Área", formatArea(unit.areaM2))}
      ${detailLine("Status", statusLabel(normalizeStatus(unit.status)))}
      ${detailLine("Preço à vista", formatMoney(values.cash))}
      ${detailLine("Sinal", formatMoney(values.downPayment))}
      ${detailLine("Parcelas mensais", formatMoney(values.monthly))}
      ${detailLine("Intercaladas semestrais", formatMoney(values.semestral))}
      ${detailLine("Chaves", formatMoney(values.keys))}
      ${detailLine("Proposta atual", unit.propostaAtualId)}
      ${detailLine("Atualizada em", formatDate(unit.atualizadoEm))}
    </div>`);
}

function showProposalDetails(proposalId, unitId) {
  const context = getContext(proposalId, unitId);
  openDetails(`Detalhes da proposta ${proposalId || ""}`, renderContextDetails(context));
}

function getContext(proposalId, unitId) {
  const proposal = state.proposalsById.get(proposalId) ?? null;
  const unit = state.unitsById.get(unitId) ?? null;
  const broker = proposal?.corretorId ? state.brokers.get(proposal.corretorId) ?? null : null;
  return { proposal, unit, broker };
}

function renderContextDetails({ proposal, unit, broker }) {
  if (!proposal || !unit) return `<div class="modal-bloco"><p>Registro legado sem proposta vinculada.</p></div>`;
  const client = proposal.cliente ?? {};
  const brokerData = { ...(broker ?? {}), ...(proposal.corretorSnapshot ?? {}) };
  const condition = proposal.condicaoProposta ?? {};
  return `
    <div class="modal-bloco"><h3>Unidade</h3>
      ${detailLine("Unidade", unitName(unit))}${detailLine("Tipologia", unit.tipologia)}${detailLine("Área", formatArea(unit.areaM2))}${detailLine("Status", statusLabel(normalizeStatus(unit.status)))}
    </div>
    <div class="modal-bloco"><h3>Proposta</h3>
      ${detailLine("ID", proposal.id)}${detailLine("Criada em", formatDate(proposal.criadoEm))}${detailLine("Status", statusLabel(normalizeStatus(proposal.statusProposta)))}${detailLine("Condição", condition.descricao ?? condition.tipo)}${detailLine("Expira em", formatDate(proposal.expiraEm))}${detailLine("Comentário administrativo", proposal.comentarioAdmin)}
      <div class="tags-row">${proposalTags(proposal, normalizeStatus(proposal.statusProposta)).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
    </div>
    <div class="modal-bloco"><h3>Corretor</h3>
      ${detailLine("Nome", brokerData.nome)}${detailLine("CRECI", brokerData.creci)}${detailLine("CPF", brokerData.cpf)}${detailLine("E-mail", brokerData.email)}${detailLine("Telefone", brokerData.telefone)}${detailLine("Imobiliária", brokerData.imobiliaria)}
    </div>
    <div class="modal-bloco"><h3>Cliente</h3>
      ${detailLine("Nome", client.nomeCompleto)}${detailLine("CPF", client.cpf)}${detailLine("E-mail", client.email)}${detailLine("Telefone", client.telefone)}${detailLine("Razão social", client.razaoSocial)}${detailLine("CNPJ", client.cnpj)}${detailLine("E-mail comercial", client.emailComercial)}${detailLine("Telefone comercial", client.telefoneComercial)}
    </div>`;
}

function detailLine(label, value) {
  return `<p><strong>${escapeHtml(label)}:</strong> ${display(value)}</p>`;
}

function openDetails(title, html) {
  elements.detailTitle.textContent = title;
  elements.detailContent.innerHTML = html;
  elements.detailOverlay.classList.remove("oculto");
  elements.detailClose.focus();
}

function closeDetails() {
  elements.detailOverlay.classList.add("oculto");
}

function confirmDialog({ title, html, confirmText }) {
  return new Promise(resolve => {
    elements.confirmTitle.textContent = title;
    elements.confirmContent.innerHTML = html;
    elements.confirmSubmit.textContent = confirmText;
    elements.confirmOverlay.classList.remove("oculto");

    const finish = result => {
      elements.confirmOverlay.classList.add("oculto");
      elements.confirmCancel.removeEventListener("click", cancel);
      elements.confirmSubmit.removeEventListener("click", submit);
      elements.confirmOverlay.removeEventListener("click", outside);
      document.removeEventListener("keydown", keyboard);
      resolve(result);
    };
    const cancel = () => finish(false);
    const submit = () => finish(true);
    const outside = event => { if (event.target === elements.confirmOverlay) cancel(); };
    const keyboard = event => { if (event.key === "Escape") cancel(); };

    elements.confirmCancel.addEventListener("click", cancel);
    elements.confirmSubmit.addEventListener("click", submit);
    elements.confirmOverlay.addEventListener("click", outside);
    document.addEventListener("keydown", keyboard);
    elements.confirmSubmit.focus();
  });
}

async function requestText({ title, label, initialValue = "", confirmText, allowEmpty = false }) {
  const inputId = `modalText-${Date.now()}`;
  const confirmed = await confirmDialog({
    title,
    confirmText,
    html: `<div class="modal-bloco"><label for="${inputId}">${escapeHtml(label)}</label><textarea id="${inputId}" class="modal-field" maxlength="1000">${escapeHtml(initialValue)}</textarea><p id="${inputId}-error" style="color:#9a1010" hidden>Preencha este campo para continuar.</p></div>`
  });
  if (!confirmed) return null;
  const input = $(inputId);
  const value = input?.value.trim() ?? "";
  if (!value && !allowEmpty) {
    showToast("O motivo é obrigatório.", true);
    return null;
  }
  return value;
}

function matchesSoldPeriod(unit, proposal) {
  const period = elements.soldPeriod.value;
  if (period === "all") return true;
  const date = toDate(unit.vendidoEm ?? proposal?.vendidoEm ?? proposal?.atualizadoEm);
  if (!date) return true;
  return Date.now() - date.getTime() <= Number(period) * 86400000;
}

function searchableUnit(unit) {
  return normalizeText([unit.id, unitName(unit), unit.tipologia, unit.status].join(" "));
}

function searchableProposal(unit, proposal) {
  const broker = proposal?.corretorId ? state.brokers.get(proposal.corretorId) : null;
  return normalizeText([
    unit.id, unitName(unit), unit.status, proposal?.id, proposal?.statusProposta,
    broker?.nome, proposal?.corretorSnapshot?.nome, proposal?.cliente?.nomeCompleto,
    proposal?.cliente?.razaoSocial, ...proposalTags(proposal, normalizeStatus(unit.status))
  ].join(" "));
}

function unitName(unit) {
  return unit?.unidade ?? unit?.id ?? "Não informada";
}

function normalizeStatus(value) {
  const status = normalizeText(value).replaceAll(" ", "_");
  const aliases = {
    disponivel: "disponivel", reservado: "reservada", reservada: "reservada",
    reservada_aprovada: "aprovada", aprovado: "aprovada", aprovada: "aprovada",
    vendido: "vendida", vendida: "vendida", distrato: "distratada", distratada: "distratada",
    cancelado: "cancelada", cancelada: "cancelada", recusado: "recusada", recusada: "recusada",
    expirado: "expirada", expirada: "expirada", inativo: "inativa", inativa: "inativa"
  };
  return aliases[status] ?? (status || "sem_status");
}

function statusLabel(status) {
  return STATUS_LABELS[normalizeStatus(status)] ?? String(status ?? "sem status");
}

function statusColor(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "disponivel") return "#00c91b";
  if (["reservada", "aprovada"].includes(normalized)) return "#f4a300";
  if (normalized === "vendida") return "#e51c25";
  return "#777";
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function normalizeValues(values = {}) {
  return {
    cash: values.precoAVistaCentavos ?? values.precoAVista ?? values.precoVistaCentavos ?? values.precoVista ?? null,
    downPayment: values.sinalCentavos ?? values.sinal ?? null,
    monthly: values.parcelasMensaisCentavos ?? values.parcelaMensaisCentavos ?? values.parcelasMensais ?? values.parcelaMensais ?? null,
    semestral: values.intercaladasSemestraisCentavos ?? values.intercaladasSemestrais ?? null,
    keys: values.chavesCentavos ?? values.chaves ?? null
  };
}

function formatMoney(cents) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "Não informado";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatArea(area) {
  if (typeof area !== "number") return "Não informada";
  return `${area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  const converted = new Date(value);
  return Number.isNaN(converted.getTime()) ? null : converted;
}

function dateValue(value) {
  return toDate(value)?.getTime() ?? 0;
}

function formatDate(value) {
  const date = toDate(value);
  return date ? date.toLocaleString("pt-BR") : "Não informado";
}

function naturalCompare(a, b) {
  return String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", { numeric: true, sensitivity: "base" });
}

function display(value) {
  if (value === null || value === undefined || value === "") return "Não informado";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return escapeHtml(value);
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
  state.toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 3200);
}

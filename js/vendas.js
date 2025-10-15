// js/vendas.js — Tabela, filtros, popup e formulário (modal ou nova guia)
// ------------------------------------------------------------------
// - Card: apenas "VER" (visitante pode ocultar via HideMode).
// - Modal: "Enviar Proposta" (só logado + aprovado + Disponível).
// - HideMode só vale para visitante (não logado):
//     "ver" | 2       -> esconde VER (visitante não vê botão)
//     "proposta" | 1  -> esconde Enviar Proposta (não tem efeito prático no visitante)
//     0               -> não esconde nada
// - Form Target: "modal" (iframe no popup) ou "newtab" (abre nova guia).
//   Pode alternar por localStorage ou por um botão opcional #btn-form-target.
// - Planta: mostra imagem simples no modal + botão "Tela cheia" com lightbox fullscreen
//   com zoom (wheel/dblclick), pan (arrastar) e pinch (touch).
// ------------------------------------------------------------------

// ===== CONFIG =====
const CONFIG = {
  webAppURL:
    "https://script.google.com/macros/s/AKfycbwD1zCtYAD_UMaFv9rF63QWJ-RYqZbTv5RbRSVCoUqpZB8WFnOqJAhdqCmd_kxhneewoA/exec",
  formsBase:
    "https://docs.google.com/forms/d/e/1FAIpQLSeN0R7Xh48HVat7Zr4ibVh6PAwipC1DNnYPe8bwF01tfGZiBg/viewform",
  formMap: {
    unidade: "entry.348844169",
    nome: "entry.999901423",
    creci: "entry.1967387475",
    telefone: "entry.752267382",
    email: "entry.598155835",
    imobiliaria: "entry.1725417675",
  },

  // 🔧 HideMode (apenas para visitante / não logado)
  ctaHideMode: 2, // "ver"|2 = esconde VER; "proposta"|1 = esconde Enviar Proposta; 0 = nada

  // 🔧 Destino do formulário: "modal" (iframe) ou "newtab" (nova guia)
  formsTarget: "newtab",
};

// Overrides via localStorage (sem redeploy)
try {
  const v1 = localStorage.getItem("ctaHideMode");
  if (v1 !== null) CONFIG.ctaHideMode = isNaN(v1) ? v1 : Number(v1);
  const v2 = localStorage.getItem("formsTarget");
  if (v2 === "modal" || v2 === "newtab") CONFIG.formsTarget = v2;
} catch {}

// ===== HELPERS DE ESTADO =====
function getHideMode() {
  const m = CONFIG.ctaHideMode;
  if (m === "ver" || m === 2) return 2;       // esconde VER (visitante)
  if (m === "proposta" || m === 1) return 1;  // esconde Enviar Proposta (visitante)
  return 0;                                   // não esconde nada
}
function isLogged() {
  return document.body?.dataset?.logged === "true" || !!window._user;
}
function isAprovado() {
  return !!(window.corretorPodePropor && window.corretorPodePropor());
}
const normaliza = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
const isDisponivel = (status) => normaliza(status).includes("disponivel");

// ===== ESTADO LOCAL =====
let listaCompleta = [];
let listaFiltrada = [];

// ===== UI REFS =====
const btnToggleFiltros = document.getElementById("btn-toggle-filtros");
const filtrosEl =
  document.getElementById("filtros-bar") || document.querySelector(".filtros");
const tabelaEl = document.getElementById("tabela-vendas");
const popup = document.getElementById("popup");
const popupContent = document.getElementById("popup-content");

// Filtros do formulário
const f = {
  form: document.getElementById("filtro-form"),
  unidade: document.getElementById("filtro-unidade"),
  status: document.getElementById("filtro-status"),
  tipologia: document.getElementById("filtro-tipologia"),
  valor: document.getElementById("filtro-valor"),
};

// Botão opcional para alternar destino do Forms
const btnFormTarget = document.getElementById("btn-form-target");

// ===== AUTH EVENTS =====
window.addEventListener("auth-changed", () => {
  renderTabela((listaFiltrada && listaFiltrada.length) ? listaFiltrada : listaCompleta);
});

// ===== INIT =====
document.addEventListener("DOMContentLoaded", async () => {
  initFiltrosToggle();
  initFiltrosForm();
  initPopupEscapes();
  initFormTargetToggle();

  const data = await fetchWebApp();
  listaCompleta = data;
  renderTabela(data);
});

// ========================================================================
// DADOS
// ========================================================================
async function fetchWebApp() {
  try {
    const res = await fetch(CONFIG.webAppURL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    return rows
      .map((r) => ({
        unidade: r["UNIDADE"],
        preco: r["PREÇO À VISTA"],
        area: r["ÁREA"],
        sinal: r["SINAL"],
        parcela: r["80 PARC. MENSAIS"],
        intercalada: r["12 INTERCAL. SEMESTRAIS"],
        chaves: r["CHAVES"],
        status: r["STATUS"],
        tipologia: r["TIPOLOGIA"],
        imagem: r["IMAGEM"],
      }))
      .map((it) => ({
        ...it,
        preco:
          typeof it.preco === "number"
            ? it.preco.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })
            : it.preco,
      }));
  } catch (err) {
    console.error("[vendas] erro ao carregar dados:", err);
    if (tabelaEl) {
      tabelaEl.innerHTML = `
        <div class="alert">
          Não foi possível carregar a Tabela de Vendas agora.
          <br>Verifique a publicação do Web App e tente novamente.
        </div>`;
    }
    return [];
  }
}

// ========================================================================
// FILTROS
// ========================================================================
function initFiltrosToggle() {
  if (!filtrosEl || !btnToggleFiltros) return;

  setFiltrosVisivel(!filtrosEl.classList.contains("oculto"));

  btnToggleFiltros.addEventListener("click", () => {
    const aberto = btnToggleFiltros.getAttribute("aria-expanded") === "true";
    setFiltrosVisivel(!aberto);
  });

  function setFiltrosVisivel(show) {
    filtrosEl.classList.toggle("oculto", !show);
    filtrosEl.hidden = !show;
    filtrosEl.style.display = show ? "flex" : "none";
    btnToggleFiltros.setAttribute("aria-expanded", String(show));
    btnToggleFiltros.title = show ? "Ocultar filtros" : "Mostrar filtros";
  }
}

function initFiltrosForm() {
  if (!f.form) return;

  f.form.addEventListener("input", () => {
    const unidade = (f.unidade?.value || "").toLowerCase();
    const status = (f.status?.value || "").toLowerCase();
    const tipo = (f.tipologia?.value || "").toLowerCase();
    const valorRaw = (f.valor?.value || "").trim();
    const valorLimpo = valorRaw.replace(/\./g, "").replace(",", ".");
    const valorMax = parseFloat(valorLimpo) || Infinity;

    listaFiltrada = (listaCompleta || []).filter((item) => {
      const precoNumerico =
        parseFloat(
          String(item.preco).replace(/[R$\s.]/g, "").replace(",", ".")
        ) || 0;
      return (
        String(item.unidade).toLowerCase().includes(unidade) &&
        String(item.status).toLowerCase().includes(status) &&
        String(item.tipologia).toLowerCase().includes(tipo) &&
        precoNumerico <= valorMax
      );
    });

    renderTabela(listaFiltrada);
  });
}

// ========================================================================
// RENDERIZAÇÃO DOS CARDS
// ========================================================================
function renderTabela(data) {
  if (!tabelaEl) return;

  tabelaEl.innerHTML = "";
  listaFiltrada = data;

  const logged = isLogged();
  const mode = logged ? 0 : getHideMode(); // hide só para visitante

  data.forEach((item, index) => {
    const s = normaliza(item.status);
    const statusClass = s.includes("disponivel")
      ? "status-disponivel"
      : s.includes("reservado")
      ? "status-reservado"
      : s.includes("vendido")
      ? "status-vendido"
      : "";

    const card = document.createElement("div");
    card.className = `unidade-card ${statusClass}`;
    const unidade   = esc(item.unidade);
    const tipologia = esc(item.tipologia);
    const area      = esc(item.area);
    const statusTxt = esc(item.status);
    const url       = safeURL(item.imagem);

    card.innerHTML = `
      <div class="unidade-info">
        <span><strong>Unidade:</strong> ${unidade}</span>
        <span><strong>Tipologia:</strong> ${tipologia}</span>
        <span><strong>Área:</strong> ${area}</span>
        <span class="unidade-status"><strong>Status:</strong>
          <span class="status-texto ${statusClass}">${statusTxt}</span>
        </span>
      </div>
      <div class="acoes"></div>
    `;

    const acoes = card.querySelector(".acoes");

    // ► ÚNICO CTA no card: VER (pode ser ocultado pelo HideMode para visitante)
    if (mode !== 2) {
      const btnVer = document.createElement("button");
      btnVer.className = "ver-btn";
      btnVer.textContent = "VER";
      btnVer.addEventListener("click", () => mostrarDetalhes(index));
      acoes.appendChild(btnVer);
    }

    tabelaEl.appendChild(card);
  });
}

// ========================================================================
// POPUP (modal) + FORM DESTINO
// ========================================================================
function initPopupEscapes() {
  popup?.addEventListener("click", (e) => {
    if (e.target === popup) fecharPopup();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && popup?.style.display === "flex") fecharPopup();
  });
}
function abrirPopup() {
  if (popup) popup.style.display = "flex";
}
function fecharPopup() {
  if (popup) popup.style.display = "none";
  if (popupContent) popupContent.innerHTML = "";
}

function mostrarDetalhes(index) {
  const item = listaFiltrada[index] || listaCompleta[index];
  if (!item || !popupContent) return;

  const aprovado = isAprovado();
  const podeProposta = aprovado && isDisponivel(item.status);

  popupContent.innerHTML = `
    <h2>Condições - Unidade ${item.unidade}</h2>
    <p><strong>Preço à vista:</strong> ${brl(item.preco)}</p>
    <p><strong>Sinal:</strong> ${brl(item.sinal)}</p>
    <p><strong>Parcelas mensais:</strong> ${brl(item.parcela)}</p>
    <p><strong>Intercaladas semestrais:</strong> ${brl(item.intercalada)}</p>
    <p><strong>Chaves:</strong> ${brl(item.chaves)}</p>

    <div class="popup-botoes">
      ${podeProposta ? `<button class="ver-btn" data-action="propor" data-unidade="${encodeURIComponent(item.unidade)}">Enviar Proposta</button>` : ""}
      ${item.imagem && item.imagem !== "-" ? `<button class="ver-btn" data-action="planta" data-imagem="${encodeURIComponent(item.imagem)}">Planta</button>` : ""}
      <button class="ver-btn" data-action="fechar">Fechar</button>
    </div>
  `;

  popupContent.querySelectorAll("button.ver-btn").forEach((btn) => {
    const action = btn.dataset.action;
    if (action === "fechar") {
      btn.addEventListener("click", fecharPopup);
    } else if (action === "planta") {
      const src = btn.dataset.imagem || "";
      btn.addEventListener("click", () => mostrarPlanta(src));
    } else if (action === "propor") {
      const unidade = decodeURIComponent(btn.dataset.unidade || "");
      btn.addEventListener("click", () => enviarProposta(unidade));
    }
  });

  abrirPopup();
}

// ===== Planta no modal (simples) + botão "Tela cheia" =====
function mostrarPlanta(imgNameOrUrl) {
  const content = popupContent;
  if (!content) return;

  // resolve caminho
  let url = (imgNameOrUrl || "").trim();
  try { url = decodeURIComponent(url.replace(/^['"]|['"]$/g, "")); } catch {}
  if (!/^https?:\/\//i.test(url) && !url.startsWith("/") && !url.startsWith("img/")) {
    url = "img/" + url; // ajuste se suas plantas estiverem em outra pasta
  }

  content.innerHTML = `
    <h2>Planta da Unidade</h2>
    <img src="${url}" alt="Planta" class="planta-popup" />
    <div class="popup-botoes">
      <button class="ver-btn" data-action="fs">Tela cheia</button>
      <button class="ver-btn" data-action="fechar">Fechar</button>
    </div>
  `;

  content.querySelector('[data-action="fechar"]')?.addEventListener('click', fecharPopup);
  content.querySelector('[data-action="fs"]')?.addEventListener('click', () => abrirPlantaFullscreen(url));

  abrirPopup();
}

// ===== Lightbox fullscreen com zoom/pinch =====
function abrirPlantaFullscreen(url) {
  let fs = document.getElementById("fsLightbox");
  if (!fs) {
    fs = document.createElement("div");
    fs.id = "fsLightbox";
    fs.className = "fsbox";
    fs.innerHTML = `
      <div class="fsbox-head">
        <div class="fsbox-title">Planta</div>
        <button class="fsbox-close" aria-label="Fechar" title="Fechar">&times;</button>
      </div>
      <div class="fsstage-wrap">
        <div class="fsstage" id="fsStage">
          <img class="fsimg" id="fsImg" alt="Planta">
        </div>
        <div class="fscontrols">
          <button class="fsbtn" id="fsZoomOut">–</button>
          <button class="fsbtn" id="fsZoomReset">100%</button>
          <button class="fsbtn" id="fsZoomIn">+</button>
        </div>
      </div>`;
    document.body.appendChild(fs);

    fs.querySelector(".fsbox-close")?.addEventListener("click", () => {
      fs.classList.remove("open");
      if (fs._onResize) window.removeEventListener("resize", fs._onResize);
      fs._onResize = null;
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") fs.querySelector(".fsbox-close")?.click();
    });
  }

  const imgEl = fs.querySelector("#fsImg");
  const stage = fs.querySelector("#fsStage");

  imgEl.onload = () => {
    const api = enableZoom(stage, imgEl);
    // entra ajustado e centralizado
    api.fitToStage();
    // refaz ajuste ao redimensionar a janela
    const onResize = () => stage.dispatchEvent(new CustomEvent("zoom-fit"));
    window.addEventListener("resize", onResize, { passive: true });
    fs._onResize = onResize;

    // botões
    fs.querySelector("#fsZoomIn")?.addEventListener("click", () =>
      stage.dispatchEvent(new CustomEvent("zoom-step", { detail: { dir: 1 } }))
    );
    fs.querySelector("#fsZoomOut")?.addEventListener("click", () =>
      stage.dispatchEvent(new CustomEvent("zoom-step", { detail: { dir: -1 } }))
    );
    fs.querySelector("#fsZoomReset")?.addEventListener("click", () =>
      stage.dispatchEvent(new CustomEvent("zoom-reset"))
    );
  };

  imgEl.src = url;
  fs.classList.add("open");
}

/**
 * enableZoom(stageEl, imgEl)
 *  - mouse wheel: zoom incremental centralizado no cursor
 *  - duplo clique: alterna zoom 1x -> 2x (ou reseta)
 *  - arrastar: pan
 *  - pinch (touch): zoom com dois dedos, com centro no meio do gesto
 */
function enableZoom(stageEl, imgEl) {
  const MIN_Z = 0.2;
  const MAX_Z = 4;
  const STEP  = 0.2;

  let scale = 1;
  let panX = 0, panY = 0;
  let baseFit = 1;

  let dragging = false, lastPt = null;
  let tracking = false, lastDist = 0;

  imgEl.addEventListener("dragstart", e => e.preventDefault());
  imgEl.style.willChange = "transform";

  function apply() {
    imgEl.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  function fitToStage() {
    const r = stageEl.getBoundingClientRect();
    const w = imgEl.naturalWidth  || imgEl.width;
    const h = imgEl.naturalHeight || imgEl.height;
    if (!w || !h) return;

    baseFit = Math.min(r.width / w, r.height / h);
    baseFit = Math.min(MAX_Z, Math.max(MIN_Z, baseFit));

    scale = baseFit;
    const cw = w * scale, ch = h * scale;
    panX = (r.width  - cw) / 2;
    panY = (r.height - ch) / 2;
    apply();
  }

  function clampPan() {
    const r = stageEl.getBoundingClientRect();
    const w = imgEl.naturalWidth  || imgEl.width;
    const h = imgEl.naturalHeight || imgEl.height;
    if (!w || !h) return;

    const cw = w * scale, ch = h * scale;

    // Se a imagem coube no eixo, centraliza e “trava” o pan nesse eixo
    if (cw <= r.width) {
      panX = (r.width - cw) / 2;
    } else {
      const margin = 30;
      const minX = r.width - cw - margin;
      const maxX = margin;
      panX = Math.max(minX, Math.min(maxX, panX));
    }
    if (ch <= r.height) {
      panY = (r.height - ch) / 2;
    } else {
      const margin = 30;
      const minY = r.height - ch - margin;
      const maxY = margin;
      panY = Math.max(minY, Math.min(maxY, panY));
    }
  }

  // cx, cy nas COORDENADAS DO STAGE (não da janela!)
  function zoomAt(factor, cx, cy) {
    const prev = scale;
    const next = Math.max(MIN_Z, Math.min(MAX_Z, prev * factor));
    if (next === prev) return;

    // mantém o ponto (cx,cy) sob o cursor
    // Fórmula: pan' = (1 - k)*c + k*pan
    const k = next / prev;
    panX = (1 - k) * cx + k * panX;
    panY = (1 - k) * cy + k * panY;

    scale = next;
    clampPan();
    apply();
  }

  function stepZoom(dir, center) {
    const r = stageEl.getBoundingClientRect();
    const c = center || { x: r.width / 2, y: r.height / 2 };
    const factor = dir > 0 ? (1 + STEP) : (1 - STEP);
    zoomAt(factor, c.x, c.y);
  }

  function resetToFit() {
    fitToStage(); // usa baseFit e centraliza
  }

  // Wheel: usa ponto do mouse como foco (coords do stage)
  stageEl.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = stageEl.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    stepZoom(e.deltaY < 0 ? 1 : -1, { x: cx, y: cy });
  }, { passive: false });

  // Duplo clique: baseFit ↔ 2x no ponto
  stageEl.addEventListener("dblclick", (e) => {
    e.preventDefault();
    const r = stageEl.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    const target = scale <= baseFit * 1.05 ? Math.min(2, MAX_Z) : baseFit;
    zoomAt(target / scale, cx, cy);
  });

  // Pan (mouse)
  stageEl.addEventListener("mousedown", (e) => {
    dragging = true;
    lastPt = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastPt.x;
    const dy = e.clientY - lastPt.y;
    lastPt = { x: e.clientX, y: e.clientY };
    panX += dx; panY += dy;
    clampPan(); apply();
  });
  window.addEventListener("mouseup", () => { dragging = false; });

  // Touch: pinch + pan
  stageEl.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      dragging = true;
      lastPt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      tracking = true;
      lastDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: false });

  stageEl.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const r = stageEl.getBoundingClientRect();

    if (tracking && e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const mid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top
      };
      const factor = dist / (lastDist || dist);
      zoomAt(factor, mid.x, mid.y);
      lastDist = dist;
      return;
    }

    if (dragging && e.touches.length === 1) {
      const { clientX, clientY } = e.touches[0];
      const dx = clientX - lastPt.x;
      const dy = clientY - lastPt.y;
      lastPt = { x: clientX, y: clientY };
      panX += dx; panY += dy;
      clampPan(); apply();
    }
  }, { passive: false });

  window.addEventListener("touchend", () => {
    if (e?.touches?.length === 0) { /* noop */ }
    tracking = false; dragging = false; lastPt = null;
  });

  // Hooks externos
  stageEl.addEventListener("zoom-step", (e) => {
    const dir = e.detail?.dir || 1;
    stepZoom(dir);
  });
  stageEl.addEventListener("zoom-reset", resetToFit);
  stageEl.addEventListener("zoom-fit",   resetToFit);

  // primeira aplicação
  fitToStage();

  // expõe API opcional
  return { fitToStage: resetToFit, reset: resetToFit };
}

// ========================================================================
/** ENVIAR PROPOSTA — abre no MODAL (iframe) ou em NOVA GUIA */
// ========================================================================
function enviarProposta(unidade) {
  if (!(window.corretorPodePropor && window.corretorPodePropor())) {
    alert("Faça login e aguarde aprovação para enviar propostas.");
    return;
  }
  const c = window.dadosCorretor ? window.dadosCorretor() : null;
  if (!c) {
    alert("Não foi possível carregar seus dados de corretor.");
    return;
  }

  const p = new URLSearchParams();
  p.set(CONFIG.formMap.unidade, unidade || "");
  p.set(CONFIG.formMap.nome, c.nome || "");
  p.set(CONFIG.formMap.creci, c.creci || "");
  p.set(CONFIG.formMap.telefone, c.telefone || "");
  p.set(CONFIG.formMap.email, c.email || "");
  p.set(CONFIG.formMap.imobiliaria, c.imobiliaria || "");

  const url = `${CONFIG.formsBase}?embedded=true&${p.toString()}`;

  if (CONFIG.formsTarget === "newtab") {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  if (!popupContent) return;
  popupContent.innerHTML = `
    <h2>Solicitação de Proposta - Unidade ${unidade}</h2>
    <iframe class="forms-iframe" src="${url}" referrerpolicy="no-referrer-when-downgrade"></iframe>
    <div class="popup-botoes"><button class="ver-btn" data-action="fechar">Fechar</button></div>
  `;
  popupContent.querySelector('[data-action="fechar"]')?.addEventListener("click", fecharPopup);
  abrirPopup();
}

// ========================================================================
// FORM TARGET TOGGLE (opcional: precisa do botão #btn-form-target no HTML)
// ========================================================================
function initFormTargetToggle() {
  if (!btnFormTarget) return;
  applyFormTargetLabel();

  btnFormTarget.addEventListener("click", () => {
    CONFIG.formsTarget = CONFIG.formsTarget === "modal" ? "newtab" : "modal";
    try { localStorage.setItem("formsTarget", CONFIG.formsTarget); } catch {}
    applyFormTargetLabel();
  });

  function applyFormTargetLabel() {
    const modo = CONFIG.formsTarget === "modal" ? "No site" : "Nova guia";
    btnFormTarget.textContent = `Formulário: ${modo}`;
    btnFormTarget.title =
      CONFIG.formsTarget === "modal"
        ? "Abrir o formulário dentro do site"
        : "Abrir o formulário em nova guia";
    btnFormTarget.setAttribute("aria-pressed", CONFIG.formsTarget === "modal" ? "false" : "true");
  }
}

// ========================================================================
// UTIL
// ========================================================================
function brl(v) {
  if (v === null || v === undefined) return "-";
  const s = String(v).trim();
  if (!s || s === "-") return "-";
  if (s.startsWith("R$")) return s;
  const n = Number(s.replace(/[^\d.-]/g, ""));
  if (isNaN(n)) return s;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ADICIONE perto dos “UTIL”
function esc(s) {
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;')
    .replaceAll('`','&#96;');
}
// URL segura (só http/https)
function safeURL(u) {
  try {
    const url = new URL(u, location.href);
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : '';
  } catch { return ''; }
}

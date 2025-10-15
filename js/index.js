/* ========================= Helpers + Debug ========================= */
const DEBUG = false;
const log = (...a) => DEBUG && console.debug("[LZR]", ...a);
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

document.addEventListener("DOMContentLoaded", () => {

  log("DOM pronto ✅");

  /* ====== Layout vars ====== */
  const CARDS_DESKTOP = 3.5;
  const CARDS_TABLET  = 1.45;
  const CARDS_MOBILE  = 1.05;

  // 6mm ≈ 22.7px
  const GAP_DESKTOP = '6mm';
  const GAP_TABLET  = '5mm';
  const GAP_MOBILE  = '4mm';

  const EDGE_DESKTOP = '16px';
  const EDGE_TABLET  = '12px';
  const EDGE_MOBILE  = '8px';

  /* =================== HERO rotativo =================== */
  const hero = $(".hero");
  if (hero) {
    const imagens = ["img/Folder.jpg"];
    let hIdx = 0;
    const trocar = () => {
      hero.style.backgroundImage = `url('${imagens[hIdx]}')`;
      hero.classList.add("hero-enter");
      setTimeout(() => hero.classList.remove("hero-enter"), 800);
      hIdx = (hIdx + 1) % imagens.length;
    };
    trocar();
    setInterval(trocar, 10000);
  }

  /* ========== Header hide on scroll ========== */
  const headerEl = $("#siteHeader");
  if (headerEl) {
    let lastY = window.scrollY;
    window.addEventListener("scroll", () => {
      if (document.body.classList.contains("menu-open")) return;
      const y = window.scrollY;
      headerEl.classList.toggle("scrolled", y > 2);
      if (y > lastY && y > 80) headerEl.classList.add("hide");
      else headerEl.classList.remove("hide");
      lastY = y;
    }, { passive: true });
  }

  /* ======================== Tabs Lazer ======================== */
  const tabs = $$(".tabs-desktop .tab");
  const panels = {
    exercitar: $("#panel-exercitar"),
    relaxar:   $("#panel-relaxar"),
    trabalhar: $("#panel-trabalhar"),
    familia:   $("#panel-familia"),
  };
  const tabsSelect = $("#tabsSelect");

  function showPanel(id){
    log("showPanel()", id);
    Object.entries(panels).forEach(([k,p])=>{
      if (!p) return;
      const on = (k === id);
      p.classList.toggle("hidden", !on);
      p.setAttribute("aria-hidden", String(!on));
    });
    tabs.forEach(t=>{
      const on = t.dataset.tab === id;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (tabsSelect && tabsSelect.value !== id) tabsSelect.value = id;
    initVisibleRowSliders();   // re-inicializa sliders da aba visível
  }
  tabs.forEach(btn => btn.addEventListener("click", () => showPanel(btn.dataset.tab)));
  tabsSelect?.addEventListener("change", e => showPanel(e.target.value));
  showPanel("exercitar");

  /* ================= Modal FULLSCREEN – LAZER ================= */
  const lazerModal    = $("#lazerModal");
  const lazerModalImg = $("#lazerModalImg");
  const lazerClose    = $("#lazerClose");
  const lazerPrev     = $("#lazerPrev");
  const lazerNext     = $("#lazerNext");

  let lightboxSet = [];
  let lightboxIdx = 0;
  let lastFocus   = null;

  function renderLightbox(){
    if (lazerModalImg) {
      lazerModalImg.src = lightboxSet[lightboxIdx]?.src || "";
    }
  }
  function openLazer(imgs, startIdx = 0){
    lightboxSet = imgs || [];
    lightboxIdx = Math.max(0, Math.min(startIdx, lightboxSet.length - 1));
    if (!lazerModal || !lazerModalImg || lightboxSet.length === 0) return;

    lastFocus = document.activeElement;
    renderLightbox();

    // torna visível e acessível
    lazerModal.classList.add("is-open");
    lazerModal.style.display = "flex";
    lazerModal.setAttribute("aria-hidden","false");
    document.body.classList.add("menu-open");

    // foca o container (precisa de tabindex no HTML)
    lazerModal.focus();
    // reseta o pinch-zoom (se já estava ampliado)
    lazerModal.dispatchEvent(new Event('pz:reset'));
    log("openLazer()", { total: lightboxSet.length, startIdx: lightboxIdx });
  }
  function closeLazer(){
    if (!lazerModal) return;
    lazerModal.classList.remove("is-open");
    lazerModal.style.display = "";
    lazerModal.setAttribute("aria-hidden","true");
    document.body.classList.remove("menu-open");
    log("closeLazer()");
    // devolve o foco
    if (lastFocus?.focus) lastFocus.focus();
  }
  function stepLazer(d){
    if (!lightboxSet.length) return;
    lightboxIdx = (lightboxIdx + d + lightboxSet.length) % lightboxSet.length;
    renderLightbox();
  }

  lazerClose?.addEventListener("click", closeLazer);
  lazerPrev ?.addEventListener("click", () => stepLazer(-1));
  lazerNext ?.addEventListener("click", () => stepLazer(+1));
  lazerModal?.addEventListener("click", (e)=>{ if(e.target === lazerModal) closeLazer(); });
  document.addEventListener("keydown", (e)=>{
    if (!lazerModal?.classList.contains("is-open")) return;
    if (e.key === "Escape")     closeLazer();
    if (e.key === "ArrowLeft")  stepLazer(-1);
    if (e.key === "ArrowRight") stepLazer(+1);
  });

  /* ============== Row-slider (Netflix-like) ============== */
  function setupRowSlider(root){
    if (root.dataset.ready === "1") return;
    root.dataset.ready = "1";
    log("setupRowSlider()", root);

    const track = $("[data-track]", root);
    const prev  = $(".row-arrow.prev", root);
    const next  = $(".row-arrow.next", root);
    if (!track) return;

    const imgsInTrack = $$(".card img", track);
    log("imgs no track:", imgsInTrack.length);

    function applyLayout(){
      const w = root.clientWidth || window.innerWidth;
      const cards = (w >= 1200) ? CARDS_DESKTOP : (w >= 700) ? CARDS_TABLET : CARDS_MOBILE;
      const gap   = (w >= 1200) ? GAP_DESKTOP   : (w >= 700) ? GAP_TABLET   : GAP_MOBILE;
      const edge  = (w >= 1200) ? EDGE_DESKTOP  : (w >= 700) ? EDGE_TABLET  : EDGE_MOBILE;

      root.style.setProperty('--cards', cards);
      root.style.setProperty('--gap',   gap);
      root.style.setProperty('--edge',  edge);

      // DEBUG do que está valendo de verdade
      const cs = getComputedStyle(track);
      console.log('[LZR][gap]',
        'var(--gap)=', root.style.getPropertyValue('--gap'),
        '| usado=', cs.columnGap,
        '| edgeL/R=', cs.paddingLeft, cs.paddingRight,
        '| cards=', cards
      );
    }

    applyLayout();
    window.addEventListener("resize", applyLayout);

    // navegação por setas (encaixa por card)
    function indexFromScroll(){
      const first = track.children[0];
      if (!first) return 0;
      const gap  = parseFloat(getComputedStyle(track).columnGap || "0");
      const step = first.getBoundingClientRect().width + gap;
      return step ? Math.round(track.scrollLeft / step) : 0;
    }
    function goToIndex(i, smooth = true){
      const first = track.children[0];
      if (!first) return;
      const gap  = parseFloat(getComputedStyle(track).columnGap || "0");
      const step = first.getBoundingClientRect().width + gap;
      track.scrollTo({ left: Math.max(0, i) * step, behavior: smooth ? "smooth" : "auto" });
    }
    prev?.addEventListener("click", () => goToIndex(indexFromScroll() - 1));
    next?.addEventListener("click", () => goToIndex(indexFromScroll() + 1));

    // drag horizontal
    let dragging=false, startX=0, startLeft=0, moved=0;
    track.addEventListener("pointerdown", (e)=>{
      dragging=true; startX=e.clientX; startLeft=track.scrollLeft; moved=0;
      track.dataset.dragging = "0";
      track.classList.add("dragging");
      log("pointerdown");
    });
    track.addEventListener("pointermove", (e)=>{
      if(!dragging) return;
      const dx = e.clientX - startX;
      moved = Math.max(moved, Math.abs(dx));
      track.scrollLeft = startLeft - dx;
    });
    function endDrag(){
      if(!dragging) return;
      dragging=false;
      track.classList.remove("dragging");
      track.dataset.dragging = moved > 6 ? "1" : "0";
      log("pointerup/cancel (moved:", moved, ")");
      requestAnimationFrame(()=> goToIndex(indexFromScroll()));
      setTimeout(()=> (track.dataset.dragging = "0"), 0);
    }
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);

    // Clique/teclado no CARD => abre modal do LAZER
    const cards = $$(".card", track);
    const imgsForModal = $$(".card img", track);

    /* --- Efeito “afastar vizinhos” no hover (desktop) --- */
    (function enableHoverPush(){
      if (!window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;

      const H = 12; // quantos px empurrar cada vizinho
      const cardsEls = cards; // já temos acima

      function clearHover(){
        cardsEls.forEach(c=>{
          c.classList.remove('is-hover');
          c.style.transform = '';       // limpa o empurrão nos vizinhos
        });
      }

      cardsEls.forEach((card, idx)=>{
        card.addEventListener('mouseenter', ()=>{
          if (track.dataset.dragging === '1') return; // não durante drag
          cardsEls.forEach((c, i)=>{
            const isMe = (i === idx);
            c.classList.toggle('is-hover', isMe);
            if (!isMe){
              const delta = (i > idx) ? H : -H;      // direita vai pra direita, esquerda pra esquerda
              c.style.transform = `translateX(${delta}px)`; 
            }else{
              // a própria escala/elevação vem do CSS (.is-hover)
              c.style.transform = ''; 
            }
          });
        });
        card.addEventListener('mouseleave', clearHover);
      });

      // também limpamos quando o mouse sai do trilho por completo
      track.addEventListener('mouseleave', clearHover);
    })();

    cards.forEach((card, idx)=>{
      card.style.cursor = "pointer";
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", "Ampliar imagem");
      $("img", card)?.setAttribute("title", "Ver em tela cheia");

      const openAt = (i)=>{
        if (track.dataset.dragging === "1") { log("click suprimido (dragging=1)"); return; }
        log("card click => abrir modal", { i, src: imgsForModal[i]?.src });
        openLazer(imgsForModal, i);
      };
      card.addEventListener("click", ()=> openAt(idx));
      card.addEventListener("keydown", (e)=>{
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAt(idx); }
      });
    });
  }

  function initVisibleRowSliders(){
    const sliders = $$(".tab-panel:not(.hidden) [data-rowslider]");
    log("initVisibleRowSliders() — qty:", sliders.length);
    sliders.forEach(setupRowSlider);
  }
  initVisibleRowSliders();

  /* ===== Menu mobile ===== */
  const burger   = $("#hamburger");
  const burgerIcon = burger?.querySelector("i");
  const overlay  = $("#mobileMenu");
  const closeBtn = $("#mobileClose");

  function openMenu() {
    overlay.classList.add("open");
    document.body.classList.add("menu-open");
    burger?.setAttribute("aria-expanded", "true");
    burger?.setAttribute("aria-label", "Fechar menu");
    overlay?.setAttribute("aria-hidden", "false");
    burgerIcon?.classList.remove("fa-bars"); burgerIcon?.classList.add("fa-xmark");
    overlay?.querySelector("a")?.focus();
  }
  function closeMenu() {
    overlay.classList.remove("open");
    document.body.classList.remove("menu-open");
    burger?.setAttribute("aria-expanded", "false");
    burger?.setAttribute("aria-label", "Abrir menu");
    overlay?.setAttribute("aria-hidden", "true");
    burgerIcon?.classList.remove("fa-xmark"); burgerIcon?.classList.add("fa-bars");
    burger?.focus();
  }
  burger?.addEventListener("click", openMenu);
  closeBtn?.addEventListener("click", closeMenu);
  overlay?.addEventListener("click", (e) => { if (e.target === overlay) closeMenu(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay?.classList.contains("open")) closeMenu();
  });

  /* ===== PLANTAS: slider + fullscreen ===== */
  (function setupPlantas(){
    const sec = document.querySelector('#plantas');
    if (!sec) return;

    const carousel  = sec.querySelector('.carousel');
    const track     = carousel?.querySelector('.carousel-track');
    const imgs      = Array.from(track?.querySelectorAll('img') || []);
    const btnPrev   = carousel?.querySelector('.carousel-btn.prev');
    const btnNext   = carousel?.querySelector('.carousel-btn.next');
    const dotsBox   = carousel?.querySelector('.carousel-dots');

    const modal     = carousel?.querySelector('.modal-carousel');
    const modalImg  = modal?.querySelector('.modal-content');
    const modalPrev = modal?.querySelector('.modal-prev');
    const modalNext = modal?.querySelector('.modal-next');
    const modalClose= modal?.querySelector('.close-modal');

    if (!carousel || !track || imgs.length === 0) return;

    let i = 0;

    function updateDots(){
      if (!dotsBox) return;
      dotsBox.querySelectorAll('.dot').forEach((d, idx)=>{
        d.classList.toggle('active', idx === i);
      });
    }
    function goto(n, smooth = true){
      i = (n + imgs.length) % imgs.length;
      track.style.transition = smooth ? 'transform .6s ease' : 'none';
      track.style.transform  = `translateX(${-i * 100}%)`;
      updateDots();
    }
    if (dotsBox){
      dotsBox.innerHTML = '';
      imgs.forEach((_, idx)=>{
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.addEventListener('click', ()=> goto(idx));
        dotsBox.appendChild(dot);
      });
    }
    updateDots();
    btnPrev?.addEventListener('click', ()=> goto(i - 1));
    btnNext?.addEventListener('click', ()=> goto(i + 1));

    // Drag simples
    let dragging = false, startX = 0;
    track.addEventListener('pointerdown', (e)=>{ dragging = true; startX = e.clientX; });
    track.addEventListener('pointerup', (e)=>{
      if (!dragging) return;
      const dx = e.clientX - startX;
      dragging = false;
      if (Math.abs(dx) > 30) (dx < 0 ? goto(i + 1) : goto(i - 1));
    });
    track.addEventListener('pointercancel', ()=> dragging = false);

    // FULLSCREEN plantas
    function openModal(idx){
      if (!modal || !modalImg) return;
      i = idx;
      modalImg.src = imgs[i].src;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden','false');
      modal.style.display = 'flex';
      document.body.classList.add('menu-open');
      updateDots();
      // reset pinch-zoom desta modal também
      modal.dispatchEvent(new Event('pz:reset'));
    }
    function closeModal(){
      if (!modal) return;
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden','true');
      modal.style.display = '';
      document.body.classList.remove('menu-open');
    }
    function stepModal(delta){
      i = (i + delta + imgs.length) % imgs.length;
      if (modalImg) modalImg.src = imgs[i].src;
      updateDots();
    }

    track.addEventListener('click', (e)=>{
      const img = e.target.closest('img');
      if (!img) return;
      const idx = imgs.indexOf(img);
      if (idx >= 0) openModal(idx);
    });
    imgs.forEach((im, idx)=>{
      im.style.cursor = 'pointer';
      im.tabIndex = 0;
      im.addEventListener('keydown', (e)=>{
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(idx); }
      });
    });

    modalClose?.addEventListener('click', closeModal);
    modalPrev ?.addEventListener('click', ()=> stepModal(-1));
    modalNext ?.addEventListener('click', ()=> stepModal(+1));
    modal     ?.addEventListener('click', (e)=>{ if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e)=>{
      if (!modal || modal.style.display !== 'flex') return;
      if (e.key === 'Escape')      closeModal();
      if (e.key === 'ArrowLeft')   stepModal(-1);
      if (e.key === 'ArrowRight')  stepModal(+1);
    });

    goto(0, false);
  })();

  /* ========= PINCH-ZOOM LIGHTBOX (genérico) ========= */
  function enablePinchZoom(modal, img){
    if (!modal || !img || modal.dataset.pz === '1') return;
    modal.dataset.pz = '1';

    let scale = 1, minScale = 1, maxScale = 4;
    let tx = 0, ty = 0;
    let start = { x:0, y:0 };
    let pointers = new Map();
    let lastDist = 0;
    let dragging = false;

    function apply(){ img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; }
    function reset(){ scale = 1; tx = 0; ty = 0; lastDist = 0; apply(); }
    modal.addEventListener('pz:reset', reset);

    img.addEventListener('pointerdown', (e)=>{ img.setPointerCapture?.(e.pointerId); dragging = true; start.x = e.clientX - tx; start.y = e.clientY - ty; });
    img.addEventListener('pointermove', (e)=>{ if (!dragging || scale <= 1) return; tx = e.clientX - start.x; ty = e.clientY - start.y; apply(); });
    img.addEventListener('pointerup',   ()=> dragging = false);
    img.addEventListener('pointercancel',()=> dragging = false);

    img.addEventListener('wheel', (e)=>{
      e.preventDefault();
      const delta = -Math.sign(e.deltaY) * 0.15;
      const newScale = Math.min(maxScale, Math.max(minScale, scale + delta));
      if (newScale === scale) return;
      const rect = img.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width/2;
      const cy = e.clientY - rect.top  - rect.height/2;
      tx = tx - (cx / scale) * (newScale - scale);
      ty = ty - (cy / scale) * (newScale - scale);
      scale = newScale; apply();
    }, { passive:false });

    img.addEventListener('dblclick', (e)=>{ e.preventDefault(); if (scale === 1){ scale = 2; tx = ty = 0; } else { reset(); } apply(); });

    modal.addEventListener('pointerdown', (e)=>{ pointers.set(e.pointerId, { x:e.clientX, y:e.clientY }); });
    modal.addEventListener('pointermove', (e)=>{
      const p = pointers.get(e.pointerId); if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size >= 2){
        const arr = Array.from(pointers.values());
        const d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
        if (!lastDist) { lastDist = d; return; }
        const factor = d / lastDist;
        const newScale = Math.min(maxScale, Math.max(minScale, scale * factor));
        const rect = img.getBoundingClientRect();
        const cx = ((arr[0].x + arr[1].x) / 2) - rect.left - rect.width/2;
        const cy = ((arr[0].y + arr[1].y) / 2) - rect.top  - rect.height/2;
        tx = tx - (cx / scale) * (newScale - scale);
        ty = ty - (cy / scale) * (newScale - scale);
        scale = newScale; lastDist = d; apply();
      }
    });
    function endPointer(e){ pointers.delete(e.pointerId); if (pointers.size < 2) lastDist = 0; }
    modal.addEventListener('pointerup', endPointer);
    modal.addEventListener('pointercancel', endPointer);
    modal.addEventListener('pointerleave', endPointer);

    const observer = new MutationObserver(()=>{
      const open = getComputedStyle(modal).display !== 'none' && !modal.hasAttribute('aria-hidden');
      if (!open) reset();
    });
    observer.observe(modal, { attributes:true, attributeFilter:['style','class','aria-hidden'] });
  }

  // Ativa pinch-zoom em todas as modais atuais
  (function enablePinchZoomEverywhere(){
    const modals = document.querySelectorAll('.modal-carousel');
    modals.forEach(m => { const img = m.querySelector('.modal-content'); if (img) enablePinchZoom(m, img); });
  })();

  /* ===== Debug final ===== */
  const lazerImgs = $$("#lazer .card img");
  log("🔎 Total de imagens no Lazer:", lazerImgs.length);
  log("🔎 Modal Lazer existe?", Boolean(lazerModal), "Img no modal?", Boolean(lazerModalImg));
});

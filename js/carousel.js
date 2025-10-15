// js/carousel.js — carrossel com modal e acessibilidade básica
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('[data-carousel]').forEach(initCarousel);
});

function initCarousel(root) {
  const track = root.querySelector(".carousel-track");
  const images = Array.from(track.children);
  const prevBtn = root.querySelector(".carousel-btn.prev");
  const nextBtn = root.querySelector(".carousel-btn.next");
  const dotsNav = root.querySelector(".carousel-dots");

  const modal = root.querySelector(".modal-carousel");
  const modalImg = modal.querySelector(".modal-content");
  const closeModal = modal.querySelector(".close-modal");
  const modalPrev = modal.querySelector(".modal-prev");
  const modalNext = modal.querySelector(".modal-next");

  let currentIndex = 0;

  // Dots
  images.forEach((_, i) => {
    const dot = document.createElement("span");
    dot.classList.add("dot");
    if (i === 0) dot.classList.add("active");
    dot.addEventListener("click", () => moveTo(i));
    dotsNav.appendChild(dot);
  });

  function updateDots(i) {
    const all = dotsNav.querySelectorAll(".dot");
    all.forEach(d => d.classList.remove("active"));
    if (all[i]) all[i].classList.add("active");
  }

  function moveTo(i) {
    currentIndex = i;
    const width = images[0].getBoundingClientRect().width;
    track.style.transform = `translateX(-${width * i}px)`;
    updateDots(i);
  }

  window.addEventListener("resize", () => moveTo(currentIndex));
  prevBtn.addEventListener("click", () => moveTo((currentIndex - 1 + images.length) % images.length));
  nextBtn.addEventListener("click", () => moveTo((currentIndex + 1) % images.length));

  // Modal
  images.forEach((img, i) => {
    img.addEventListener("click", () => {
      modal.style.display = "flex";
      modal.setAttribute("aria-hidden","false");
      modalImg.src = img.getAttribute("src");
      currentIndex = i;
    });
  });

  function updateModalImage() { modalImg.src = images[currentIndex].getAttribute("src"); }
  modalPrev.addEventListener("click", () => { currentIndex = (currentIndex - 1 + images.length) % images.length; updateModalImage(); });
  modalNext.addEventListener("click", () => { currentIndex = (currentIndex + 1) % images.length; updateModalImage(); });

  function close() {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden","true");
  }
  closeModal.addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  moveTo(0);
}

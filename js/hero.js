(() => {
  const hero = document.querySelector('.hero');
  const video = hero?.querySelector('.hero-video');
  const image = hero?.querySelector('.hero-fallback');
  if (!video || !image) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const showFallback = () => {
    if (!image.hasAttribute('src')) image.src = image.dataset.src;
    hero.classList.add('is-fallback');
    video.pause();
  };
  const showVideo = () => {
    if (!reducedMotion.matches) hero.classList.remove('is-fallback');
  };
  const play = () => {
    if (reducedMotion.matches || video.error) return showFallback();
    showVideo();
    video.muted = true;
    video.play().catch(error => {
      // Interrupções de carregamento não significam falha ou bloqueio de autoplay.
      if (error.name !== 'AbortError') showFallback();
    });
  };
  video.addEventListener('playing', showVideo);
  video.addEventListener('error', showFallback);
  reducedMotion.addEventListener('change', play);
  play();
})();

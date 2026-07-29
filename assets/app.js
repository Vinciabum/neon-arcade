(function () {
  'use strict';

  const modal = document.getElementById('modal');
  const iframe = document.getElementById('gameFrame');
  const playerTitle = document.getElementById('playerTitle');
  const coinDisplay = document.getElementById('coinDisplay');

  if (coinDisplay) {
    coinDisplay.textContent = localStorage.getItem('neon_coins') || '0';
  }

  window.openGame = function (file, title) {
    if (!modal || !iframe) {
      window.location.href = file;
      return;
    }
    iframe.src = file;
    if (playerTitle) playerTitle.textContent = title;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  window.closeModal = function () {
    if (!modal || !iframe) return;
    modal.classList.remove('open');
    iframe.src = '';
    document.body.style.overflow = '';
  };

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.closeModal();
  });
})();

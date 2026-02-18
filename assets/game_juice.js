/**
 * Game Juice & Utility Library for Neon Arcade
 * "Making games feel good since 2026"
 */

const GameJuice = {
    /**
     * Mobile Detection
     */
    isMobile: function () {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 800;
    },

    /**
     * Screen Shake Effect
     * @param {number} intensity - How violent the shake is (default: 10)
     * @param {number} duration - How long in ms (default: 500)
     */
    shake: function (intensity = 10, duration = 300) {
        const body = document.body;
        const start = Date.now();
        const originalTransform = body.style.transform;

        function shakeLoop() {
            const now = Date.now();
            const elapsed = now - start;

            if (elapsed < duration) {
                const dx = (Math.random() - 0.5) * intensity;
                const dy = (Math.random() - 0.5) * intensity;

                // Rotation for extra juice
                const rot = (Math.random() - 0.5) * (intensity * 0.2);

                body.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
                requestAnimationFrame(shakeLoop);
            } else {
                body.style.transform = originalTransform; // Reset
            }
        }
        shakeLoop();
    },

    /**
     * Flash Effect (Screen Flash)
     * @param {string} color - Color of flash (default: 'white')
     * @param {number} duration - Fade out duration in ms
     */
    flash: function (color = 'white', duration = 300) {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = color;
        overlay.style.zIndex = '9999';
        overlay.style.pointerEvents = 'none';
        overlay.style.transition = `opacity ${duration}ms`;
        overlay.style.opacity = '0.8';

        document.body.appendChild(overlay);

        // trigger reflow
        void overlay.offsetWidth;

        requestAnimationFrame(() => {
            overlay.style.opacity = '0';
        });

        setTimeout(() => {
            overlay.remove();
        }, duration);
    },

    /**
     * Particle System
     * Extends an existing particle array or manages its own
     */
    createExplosion: function (x, y, color, count, particleArray) {
        for (let i = 0; i < count; i++) {
            particleArray.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 10, // Fast bursts
                vy: (Math.random() - 0.5) * 10,
                size: Math.random() * 4 + 2,
                color: color,
                life: 1.0,
                decay: 0.02 + Math.random() * 0.03
            });
        }
    },

    /**
     * Prevents default touch moves to stop scrolling
     * Call this in your init()
     */
    setupTouchControls: function () {
        document.body.addEventListener('touchmove', function (e) {
            e.preventDefault();
        }, { passive: false });
    }
};

// Expose globally
window.GameJuice = GameJuice;

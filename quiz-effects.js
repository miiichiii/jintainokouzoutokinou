(function () {
  "use strict";

  let lastOptionPointer = null;

  function rememberOptionPointer(event) {
    const optionEl = event.target.closest("#options .option");

    if (!optionEl || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
      return;
    }

    lastOptionPointer = {
      optionEl,
      x: event.clientX,
      y: event.clientY,
      time: Date.now(),
    };
  }

  function createPetalCanvasBurst(originX, originY, options = {}) {
    if (
      !Number.isFinite(originX) ||
      !Number.isFinite(originY) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const size = options.size || 600;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.style.position = "fixed";
    canvas.style.left = `${originX}px`;
    canvas.style.top = `${originY}px`;
    canvas.style.transform = "translate(-50%, -50%)";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "9999";
    canvas.setAttribute("aria-hidden", "true");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    document.body.appendChild(canvas);

    const center = size / 2;
    let particles = Array.from({ length: options.count || 24 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;

      return {
        x: center,
        y: center,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        size: Math.random() * 8 + 6,
        opacity: 1,
        gravity: 0.15,
        rotation: Math.random() * 360,
        rotationSpeed: Math.random() * 6 - 3,
        hue: Math.random() * 360,
        saturation: 90 + Math.random() * 10,
        lightness: 55 + Math.random() * 10,
      };
    });

    function drawPetal(petal) {
      ctx.save();
      ctx.translate(petal.x, petal.y);
      ctx.rotate(petal.rotation * Math.PI / 180);
      ctx.beginPath();
      ctx.fillStyle = `hsla(${petal.hue}, ${petal.saturation}%, ${petal.lightness}%, ${petal.opacity})`;
      ctx.ellipse(0, 0, petal.size, petal.size / 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function animate() {
      ctx.clearRect(0, 0, size, size);
      particles = particles.filter((petal) => petal.opacity > 0);

      particles.forEach((petal) => {
        petal.vy += petal.gravity;
        petal.x += petal.vx;
        petal.y += petal.vy;
        petal.rotation += petal.rotationSpeed;
        petal.opacity -= 0.017;
        drawPetal(petal);
      });

      if (particles.length > 0) {
        window.requestAnimationFrame(animate);
      } else {
        canvas.remove();
      }
    }

    window.requestAnimationFrame(animate);
  }

  function celebrateCorrectOption(optionEl, origin) {
    if (!optionEl) {
      return;
    }

    const rect = optionEl.getBoundingClientRect();
    const originX = Number.isFinite(origin?.x) ? origin.x : rect.left + rect.width / 2;
    const originY = Number.isFinite(origin?.y) ? origin.y : rect.top + rect.height / 2;

    createPetalCanvasBurst(originX, originY);
  }

  function patchSelectOption() {
    if (typeof window.selectOption !== "function" || window.selectOption.__petalBurstPatched) {
      return;
    }

    const originalSelectOption = window.selectOption;
    window.selectOption = function patchedSelectOption(index) {
      const result = originalSelectOption.apply(this, arguments);
      const selectedCorrect = document.querySelector("#options .option.selected.correct");
      const pointerIsFresh =
        lastOptionPointer &&
        lastOptionPointer.optionEl === selectedCorrect &&
        Date.now() - lastOptionPointer.time < 1200;

      if (selectedCorrect && selectedCorrect.dataset.petalCelebrated !== "true") {
        selectedCorrect.dataset.petalCelebrated = "true";
        celebrateCorrectOption(selectedCorrect, pointerIsFresh ? lastOptionPointer : null);
      }

      return result;
    };
    window.selectOption.__petalBurstPatched = true;
  }

  window.QuizEffects = {
    celebrateCorrectOption,
    patchSelectOption,
  };

  patchSelectOption();
  document.addEventListener("pointerdown", rememberOptionPointer, true);
  document.addEventListener("mousedown", rememberOptionPointer, true);
  document.addEventListener("DOMContentLoaded", patchSelectOption);
})();

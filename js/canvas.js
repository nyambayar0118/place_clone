const Canvas = (() => {
  const W = 100,
    H = 100;
  const PALETTE = [
    // 16 colors, indexed 0..15. Match server-side palette order.
    "#000000",
    "#7d7d7d",
    "#c4c4c4",
    "#ffffff",
    "#7e2553",
    "#b13e53",
    "#ff004d",
    "#ff77a8",
    "#0066ff",
    "#29adff",
    "#83769c",
    "#ffec27",
    "#ffa300",
    "#ab5236",
    "#5f574f",
    "#008751",
  ];

  let canvasEl,
    ctx,
    scale = 4,
    currentColor = 7;
  const pixels = new Uint8Array(W * H);

  const isTouch = window.matchMedia(
    "(hover: none) and (pointer: coarse)",
  ).matches;

  async function init() {
    canvasEl = document.getElementById("canvas");
    canvasEl.width = W * scale;
    canvasEl.height = H * scale;
    ctx = canvasEl.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    buildPalette();
    attachClickHandler();

    const packed = await API.getCanvasBytes();
    unpack(packed, pixels);
    renderAll();
  }

  function buildPalette() {
    const pal = document.getElementById("palette");
    PALETTE.forEach((color, i) => {
      const sw = document.createElement("button");
      sw.style.background = color;
      sw.className = "swatch";
      sw.onclick = () => {
        currentColor = i;
        document
          .querySelectorAll(".swatch")
          .forEach((s) => s.classList.remove("selected"));
        sw.classList.add("selected");
      };
      if (i === currentColor) sw.classList.add("selected");
      pal.appendChild(sw);
    });
  }

  function unpack(packed, out) {
    for (let i = 0; i < packed.length; i++) {
      out[2 * i] = (packed[i] >> 4) & 0x0f;
      out[2 * i + 1] = packed[i] & 0x0f;
    }
  }

  function renderAll() {
    const off = document.createElement("canvas");
    off.width = W;
    off.height = H;
    const octx = off.getContext("2d");
    const img = octx.createImageData(W, H);
    for (let i = 0; i < pixels.length; i++) {
      const c = PALETTE[pixels[i]];
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      const p = i * 4;
      img.data[p] = r;
      img.data[p + 1] = g;
      img.data[p + 2] = b;
      img.data[p + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.drawImage(off, 0, 0, canvasEl.width, canvasEl.height);
  }

  function renderPixel(x, y, color) {
    pixels[y * W + x] = color;
    ctx.fillStyle = PALETTE[color];
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }

  function attachClickHandler() {
    const wrap = document.getElementById("canvas-wrap");
    const hoverCell = document.getElementById("hover-cell");
    const indicator = document.getElementById("position-indicator");
    const confirmBtn = document.getElementById("confirm-place");
    const cancelBtn = document.getElementById("cancel-place");
    let armed = null;

    function disarm() {
      armed = null;
      hoverCell.classList.remove("armed");
      confirmBtn.classList.remove("visible");
      cancelBtn.classList.remove("visible");
      if (isTouch) {
        hoverCell.style.opacity = "";
        indicator.style.opacity = "";
      }
    }

    function arm(x, y) {
      armed = { x, y };
      hoverCell.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
      hoverCell.classList.add("armed");
      confirmBtn.classList.add("visible");
      cancelBtn.classList.add("visible");
      if (isTouch) {
        hoverCell.style.opacity = "1";
        indicator.textContent = `(${x}, ${y})`;
        indicator.style.opacity = "1";
      }
    }

    async function commit(x, y) {
      if (!API.token()) {
        document.getElementById("login-prompt").click();
        return;
      }
      try {
        await API.placePixel(x, y, currentColor);
        showCooldown(1);
        disarm();
      } catch (err) {
        if (err.retryAfterSeconds != null) {
          showCooldown(err.retryAfterSeconds);
          disarm();
        } else if (err.message === "unauthorized") {
          showStatus("error: session expired, log in again");
          document.getElementById("login-prompt").click();
        } else {
          showStatus("error: " + err.message);
        }
      }
    }

    canvasEl.addEventListener("click", (e) => {
      if (!API.token()) {
        document.getElementById("login-prompt").click();
        return;
      }
      const rect = canvasEl.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) * (W / rect.width));
      const y = Math.floor((e.clientY - rect.top) * (H / rect.height));
      if (x < 0 || x >= W || y < 0 || y >= H) return;

      if (isTouch) {
        // Two-tap-to-confirm: tap same cell twice, or use button
        if (armed && armed.x === x && armed.y === y) {
          commit(x, y);
        } else {
          arm(x, y);
        }
      } else {
        // Desktop: single click commits
        commit(x, y);
      }
    });

    confirmBtn.addEventListener("click", () => {
      if (armed) commit(armed.x, armed.y);
    });

    cancelBtn.addEventListener("click", disarm);

    // On touch, tapping outside disarms
    document.addEventListener("click", (e) => {
      if (!isTouch) return;
      if (!armed) return;
      if (wrap.contains(e.target)) return;
      if (confirmBtn.contains(e.target) || cancelBtn.contains(e.target)) return;
      if (e.target.classList.contains("swatch")) return;
      disarm();
    });
  }

  let cooldownTimer = null;

  function showCooldown(seconds) {
    if (cooldownTimer !== null) {
      clearTimeout(cooldownTimer);
      cooldownTimer = null;
    }

    const fill = document.getElementById("cooldown-fill");
    const status = document.getElementById("status-line");
    const total = seconds;
    let elapsed = 0;

    fill.style.transition = "none";
    fill.style.width = "100%";
    requestAnimationFrame(() => {
      fill.style.transition = `width ${total}s linear`;
      fill.style.width = "0%";
    });

    const tick = () => {
      const remaining = total - elapsed;
      if (remaining <= 0) {
        status.textContent = "ready";
        status.className = "ok";
        cooldownTimer = setTimeout(() => {
          if (status.textContent === "ready") {
            status.textContent = "";
            status.className = "";
          }
          cooldownTimer = null;
        }, 1500);
        return;
      }
      status.textContent = `cooldown: ${remaining}s`;
      status.className = "";
      elapsed++;
      cooldownTimer = setTimeout(tick, 1000);
    };
    tick();
  }

  function showStatus(msg) {
    const el = document.getElementById("status-line");
    el.textContent = msg;
    el.className = msg.startsWith("error") ? "error" : "";
  }

  return { init, renderPixel };
})();

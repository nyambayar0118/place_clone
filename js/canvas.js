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
  const pixels = new Uint8Array(W * H); // unpacked: one byte per pixel, value 0..15

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
    // 4-bit packed: byte N holds pixels (2N) and (2N+1) — high nibble first.
    // This must match the server's BITFIELD u4 ordering.
    for (let i = 0; i < packed.length; i++) {
      out[2 * i] = (packed[i] >> 4) & 0x0f;
      out[2 * i + 1] = packed[i] & 0x0f;
    }
  }

  function renderAll() {
    // Draw at 1:1 into an offscreen ImageData, then blit scaled.
    const off = document.createElement("canvas");
    off.width = W;
    off.height = H;
    const octx = off.getContext("2d");
    const img = octx.createImageData(W, H);
    for (let i = 0; i < pixels.length; i++) {
      const c = PALETTE[pixels[i]];
      // parse "#rrggbb"
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
    canvasEl.addEventListener("click", async (e) => {
      if (!API.token()) {
        document.getElementById("login-prompt").click(); // open auth modal
        return;
      }
      const rect = canvasEl.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) * (W / rect.width));
      const y = Math.floor((e.clientY - rect.top) * (H / rect.height));
      if (x < 0 || x >= W || y < 0 || y >= H) return;

      try {
        await API.placePixel(x, y, currentColor);
        showCooldown(5);
      } catch (err) {
        if (err.retryAfterSeconds != null) {
          showCooldown(err.retryAfterSeconds);
        } else if (err.message === "unauthorized") {
          showStatus("error: session expired, log in again");
          document.getElementById("login-prompt").click();
        } else {
          showStatus("error: " + err.message);
        }
      }
    });
  }

  let cooldownTimer = null;

  function showCooldown(seconds) {
    // Cancel any prior countdown
    if (cooldownTimer !== null) {
      clearTimeout(cooldownTimer);
      cooldownTimer = null;
    }

    const fill = document.getElementById("cooldown-fill");
    const status = document.getElementById("status-line");
    const total = seconds;
    let elapsed = 0;

    // Reset the bar instantly, then animate it draining over `total` seconds
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

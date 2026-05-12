const Auth = (() => {
  function init() {
    document
      .getElementById("login-form")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          const r = await API.login(fd.get("username"), fd.get("password"));
          API.setToken(r.token);
          showError("");
          window.UI_syncAuthState();
          window.UI_closeAuth();
          WS.connect();
          showStatus("logged in as " + r.username, "ok");
        } catch (err) {
          showError("login failed");
        }
      });

    document
      .getElementById("register-form")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          const r = await API.register(
            fd.get("username"),
            fd.get("email"),
            fd.get("password"),
          );
          API.setToken(r.token);
          showError("");
          window.UI_syncAuthState();
          window.UI_closeAuth();
          WS.connect();
          showStatus("welcome, " + r.username, "ok");
        } catch (err) {
          showError(
            err.message.includes("HTTP 409")
              ? "username or email taken"
              : "registration failed",
          );
        }
      });
  }

  function showError(m) {
    document.getElementById("auth-error").textContent = m;
  }

  function showStatus(m, cls) {
    const el = document.getElementById("status-line");
    el.textContent = m;
    el.className = cls || "";
    if (m)
      setTimeout(() => {
        if (el.textContent === m) {
          el.textContent = "";
          el.className = "";
        }
      }, 3000);
  }

  return { init };
})();

const API = (() => {
    const BASE = "http://159.223.43.225:8080";

    function token() { return localStorage.getItem("jwt"); }
    function setToken(t) { localStorage.setItem("jwt", t); }
    function clearToken() { localStorage.removeItem("jwt"); }

    async function post(path, body, authed) {
        const headers = { "Content-Type": "application/json" };
        if (authed) {
            const t = token();
            if (!t) throw new Error("not logged in");
            headers["Authorization"] = "Bearer " + t;
        }
        const r = await fetch(BASE + path, {
            method: "POST",
            headers,
            body: JSON.stringify(body)
        });
        if (r.status === 401 || r.status === 403) {
            if (authed) clearToken();
            throw new Error("unauthorized");
        }
        if (r.status === 429) {
            const data = await r.json();
            const err = new Error("cooldown");
            err.retryAfterSeconds = data.retryAfterSeconds;
            throw err;
        }
        if (!r.ok) {
            const text = await r.text();
            throw new Error("HTTP " + r.status + ": " + text);
        }
        return r.json();
    }

    async function getCanvasBytes() {
        const r = await fetch(BASE + "/api/canvas");
        if (!r.ok) throw new Error("canvas fetch failed: " + r.status);
        const buf = await r.arrayBuffer();
        return new Uint8Array(buf);
    }

    return {
        register: (u, e, p) => post("/api/auth/register", { username: u, email: e, password: p }, false),
        login:    (u, p)    => post("/api/auth/login",    { username: u, password: p }, false),
        placePixel: (x, y, color) => post("/api/pixel", { x, y, color }, true),
        getCanvasBytes,
        token, setToken, clearToken
    };
})();
/* GH Games — shared nickname leaderboard
   Backed by a free Supabase project. The two values below are safe to be
   public: the anon key is designed for browsers, and the database rules only
   allow reading scores and adding new ones (never editing or deleting). */
(function () {
  var CONFIG = {
    url: "https://bpqaeqswtgtbqrczjcrx.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwcWFlcXN3dGd0YnFyY3pqY3J4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMzUzOTIsImV4cCI6MjA5NjkxMTM5Mn0.hsEZJ_C4NvySPMb59G9EPPfdJRSNBODbnuo9ij_zxrI"
  };

  var TABLE = "scores";
  var NAME_KEY = "ghgames_nick";
  var configured = CONFIG.url.indexOf("YOUR_") === -1 && CONFIG.key.indexOf("YOUR_") === -1;
  var BANNED = /(fuck|shit|cunt|bitch|nigg|f4g|fag|slut|whore|dick|penis|rape)/i;
  var PERIOD_LABEL = { day: "today", week: "this week", month: "this month", all: "all-time" };

  function api(path, opts) {
    opts = opts || {};
    return fetch(CONFIG.url + "/rest/v1/" + path, {
      method: opts.method || "GET",
      headers: {
        apikey: CONFIG.key,
        Authorization: "Bearer " + CONFIG.key,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: opts.body || undefined
    }).then(function (r) {
      if (!r.ok) throw new Error("leaderboard api " + r.status);
      return r.status === 204 ? null : r.json();
    });
  }

  function periodStart(p) {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    if (p === "day") return d.toISOString();
    if (p === "week") { var dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d.toISOString(); }
    if (p === "month") { d.setDate(1); return d.toISOString(); }
    return null;
  }

  function fmt(n, unit) {
    if (unit === "sec") return Number(n).toFixed(1) + "s";
    n = Math.round(n);
    if (n < 1e6) return n.toLocaleString();
    var s = ["", "K", "M", "B", "T", "Qa", "Qi"];
    var e = Math.min(s.length - 1, Math.floor(Math.log10(n) / 3));
    var v = n / Math.pow(10, e * 3);
    return (v >= 100 ? Math.round(v) : v.toFixed(1)) + s[e];
  }

  function esc(t) { var d = document.createElement("div"); d.textContent = t; return d.innerHTML; }
  function el(sel) { return typeof sel === "string" ? document.getElementById(sel) : sel; }

  var CSS = ""
    + ".lb,.lb-nickbar{font-family:system-ui,sans-serif;color:#eef1f8;box-sizing:border-box}"
    + ".lb-nickbar{max-width:360px;margin:0 auto 16px;background:#1a2030;border:1px solid #2a3650;border-radius:12px;padding:10px 14px;text-align:center;font-size:.95rem}"
    + ".lb-nickbar b{color:#7dd97b}"
    + ".lb-nickbar input{background:#10141f;border:1px solid #2a3650;color:#eef1f8;border-radius:8px;padding:8px 10px;font-family:inherit;width:60%}"
    + ".lb-nickbar button,.lb button{font-family:inherit;cursor:pointer}"
    + ".lb-nickbar .go,.lb .go{background:#5b8cff;border:none;color:#fff;border-radius:8px;padding:8px 12px;margin-left:6px}"
    + ".lb-nickbar .link,.lb .link{background:none;border:none;color:#8d96ad;text-decoration:underline;padding:0 0 0 4px}"
    + ".lb{max-width:360px;margin:16px auto;background:#1a2030;border:1px solid #2a3650;border-radius:14px;padding:14px;text-align:left}"
    + ".lb h3{font-size:1rem;margin:0 0 10px;text-align:center}"
    + ".lb .nick{text-align:center;font-size:.9rem;margin-bottom:10px}"
    + ".lb .nick b{color:#7dd97b}"
    + ".lb .nick input{background:#10141f;border:1px solid #2a3650;color:#eef1f8;border-radius:8px;padding:7px 9px;font-family:inherit;width:55%}"
    + ".lb .tabs{display:flex;gap:4px;margin-bottom:10px}"
    + ".lb .tabs button{flex:1;background:#26304a;border:1px solid #3a4a70;color:#8d96ad;border-radius:7px;padding:6px 0;font-size:.72rem}"
    + ".lb .tabs button.on{background:#5b8cff;border-color:#5b8cff;color:#fff}"
    + ".lb .you{background:#1f3326;border:1px solid #2f6b3f;color:#9be8a0;border-radius:8px;padding:6px 8px;font-size:.82rem;text-align:center;margin-bottom:8px}"
    + ".lb ol{list-style:none;margin:0;padding:0;min-height:120px}"
    + ".lb li{display:flex;justify-content:space-between;align-items:center;padding:6px 4px;border-bottom:1px solid #232c44;font-size:.9rem}"
    + ".lb li .r{color:#8d96ad;width:26px}.lb li .medal{width:26px}"
    + ".lb li .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
    + ".lb li .sc{font-weight:600}"
    + ".lb li.me{color:#7dd97b;font-weight:600}"
    + ".lb .note{color:#5c6680;font-size:.72rem;text-align:center;margin-top:8px}"
    + ".lb .empty{color:#5c6680;text-align:center;padding:20px 0;font-size:.85rem}";

  function injectCSS() {
    if (document.getElementById("lb-css")) return;
    var s = document.createElement("style"); s.id = "lb-css"; s.textContent = CSS;
    document.head.appendChild(s);
  }

  var boards = [];      // { box, listEl, cfg, period, nickEl }
  var nickbars = [];    // standalone nickname-bar elements
  var submitCfg = null; // cfg used by submit()

  function getName() { return localStorage.getItem(NAME_KEY) || ""; }
  function setName(n) {
    n = (n || "").trim().slice(0, 12);
    if (!n) return false;
    if (BANNED.test(n)) { alert("Please pick a friendlier name 🙂"); return false; }
    localStorage.setItem(NAME_KEY, n);
    return true;
  }

  // ---- nickname widgets (used both in the bar and inside each board) ----
  function paintNick(container, opts) {
    opts = opts || {};
    var name = getName();
    if (name && !container._editing) {
      container.innerHTML = (opts.bar ? "Playing as <b>" : 'You are <b>') + esc(name)
        + '</b> <button class="link chg">change</button>';
      container.querySelector(".chg").onclick = function () { container._editing = true; paintNick(container, opts); };
    } else {
      container.innerHTML = '<input maxlength="12" placeholder="pick a nickname"/><button class="go">save</button>';
      var inp = container.querySelector("input"); inp.value = name;
      function save() {
        if (setName(inp.value)) { container._editing = false; syncAllNick(); refreshAll(); }
      }
      container.querySelector(".go").onclick = save;
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); save(); } });
      if (container._editing || opts.autofocus) inp.focus();
    }
  }
  function syncAllNick() {
    nickbars.forEach(function (c) { paintNick(c, { bar: true }); });
    boards.forEach(function (b) { if (b.nickEl) paintNick(b.nickEl, {}); });
  }

  // ---- board rendering ----
  function fetchBoard(cfg, period) {
    if (!configured) return Promise.resolve([]);
    var dir = cfg.dir === "asc" ? "asc" : "desc";
    var q = "?game=eq." + encodeURIComponent(cfg.game) + "&order=score." + dir + "&limit=200";
    var start = periodStart(period);
    if (start) q += "&created_at=gte." + start;
    return api(TABLE + q).then(function (rows) {
      var best = {};
      rows.forEach(function (r) {
        var c = best[r.name];
        if (!c || (dir === "desc" ? r.score > c.score : r.score < c.score)) best[r.name] = r;
      });
      return Object.keys(best).map(function (k) { return best[k]; })
        .sort(function (a, b) { return dir === "desc" ? b.score - a.score : a.score - b.score; })
        .slice(0, 10);
    }).catch(function () { return []; });
  }

  function renderBoard(b) {
    var me = getName();
    b.box.querySelectorAll(".tabs button").forEach(function (btn) {
      btn.classList.toggle("on", btn.dataset.p === b.period);
    });
    var youEl = b.box.querySelector(".you");
    if (!configured) { b.listEl.innerHTML = '<div class="empty">Leaderboard not connected yet.</div>'; return; }
    b.listEl.innerHTML = '<div class="empty">Loading…</div>';
    youEl.style.display = "none";
    fetchBoard(b.cfg, b.period).then(function (rows) {
      if (!rows.length) { b.listEl.innerHTML = '<div class="empty">No scores yet — be the first!</div>'; return; }
      var medals = ["🥇", "🥈", "🥉"];
      b.listEl.innerHTML = rows.map(function (r, i) {
        var mine = r.name === me ? " me" : "";
        var rank = i < 3 ? '<span class="medal">' + medals[i] + '</span>' : '<span class="r">' + (i + 1) + '</span>';
        return '<li class="' + mine.trim() + '">' + rank
          + '<span class="nm">' + esc(r.name) + '</span>'
          + '<span class="sc">' + fmt(r.score, b.cfg.unit) + '</span></li>';
      }).join("");
      var myIdx = -1;
      for (var i = 0; i < rows.length; i++) if (rows[i].name === me) { myIdx = i; break; }
      if (myIdx >= 0) {
        youEl.style.display = "block";
        youEl.textContent = (myIdx === 0 ? "🏆 You're #1 " : "🎉 You're #" + (myIdx + 1) + " ") + PERIOD_LABEL[b.period] + "!";
      }
    });
  }

  function refreshAll() { boards.forEach(renderBoard); }

  var Leaderboard = {
    getName: getName,
    setName: setName,

    submit: function (score) {
      if (!configured || !submitCfg) return Promise.resolve();
      var name = getName(); if (!name) return Promise.resolve();
      score = Math.round(Number(score));
      if (isNaN(score) || score < 0) return Promise.resolve();
      if (submitCfg.max != null && score > submitCfg.max) return Promise.resolve();
      if (submitCfg.min != null && score < submitCfg.min) return Promise.resolve();
      return api(TABLE, { method: "POST", body: JSON.stringify({ game: submitCfg.game, name: name, score: score }) })
        .then(function () { refreshAll(); }).catch(function () {});
    },

    // standalone shared nickname bar (used on the hub / homepage)
    mountNick: function (target) {
      injectCSS();
      var c = el(target); if (!c) return;
      c.className = "lb-nickbar";
      nickbars.push(c);
      paintNick(c, { bar: true });
    },

    // opts: { el, game, dir, unit, max, min, title, showNick (default true) }
    mount: function (opts) {
      injectCSS();
      var box = el(opts.el); if (!box) return;
      var cfg = { game: opts.game, dir: opts.dir || "desc", unit: opts.unit || "", max: opts.max, min: opts.min };
      if (opts.showNick !== false) submitCfg = cfg; // game pages submit; hub boards don't
      var dirNote = cfg.dir === "asc" ? "fastest wins" : "highest wins";
      box.className = "lb";
      box.innerHTML =
        '<h3>🏆 ' + esc(opts.title || "Leaderboard") + '</h3>'
        + (opts.showNick !== false ? '<div class="nick"></div>' : '')
        + '<div class="tabs">'
        + '<button data-p="day">Today</button><button data-p="week">Week</button>'
        + '<button data-p="month">Month</button><button data-p="all">All-time</button>'
        + '</div><div class="you" style="display:none"></div><ol></ol>'
        + '<div class="note">' + dirNote + ' · nicknames only, keep them friendly</div>';

      var board = { box: box, listEl: box.querySelector("ol"), cfg: cfg, period: "day",
                    nickEl: opts.showNick !== false ? box.querySelector(".nick") : null };
      boards.push(board);
      if (board.nickEl) paintNick(board.nickEl, {});
      box.querySelectorAll(".tabs button").forEach(function (btn) {
        btn.addEventListener("click", function () { board.period = btn.dataset.p; renderBoard(board); });
      });
      renderBoard(board);
    }
  };

  window.Leaderboard = Leaderboard;
})();

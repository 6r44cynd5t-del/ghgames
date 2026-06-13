/* GH Games — shared nickname leaderboard
   Backed by a free Supabase project. After you create the project,
   paste your Project URL and anon public key into CONFIG below.
   These two values are safe to be public (the anon key is designed for
   browser use; the database only allows reading and adding scores). */
(function () {
  var CONFIG = {
    url: "https://bpqaeqswtgtbqrczjcrx.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwcWFlcXN3dGd0YnFyY3pqY3J4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMzUzOTIsImV4cCI6MjA5NjkxMTM5Mn0.hsEZJ_C4NvySPMb59G9EPPfdJRSNBODbnuo9ij_zxrI"
  };

  var TABLE = "scores";
  var NAME_KEY = "ghgames_nick";
  var configured = CONFIG.url.indexOf("YOUR_") === -1 && CONFIG.key.indexOf("YOUR_") === -1;

  // a light, non-strict word guard for nicknames
  var BANNED = /(fuck|shit|cunt|bitch|nigg|f4g|fag|slut|whore|dick|penis|rape)/i;

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
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    if (p === "day") return d.toISOString();
    if (p === "week") { var dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d.toISOString(); }
    if (p === "month") { d.setDate(1); return d.toISOString(); }
    return null; // all-time
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

  var CSS = ""
    + ".lb{max-width:340px;margin:16px auto;background:#1a2030;border:1px solid #2a3650;border-radius:14px;padding:14px;text-align:left;font-family:system-ui,sans-serif;color:#eef1f8}"
    + ".lb h3{font-size:1rem;margin:0 0 10px;text-align:center}"
    + ".lb .nick{display:flex;gap:6px;margin-bottom:10px}"
    + ".lb input{flex:1;background:#10141f;border:1px solid #2a3650;color:#eef1f8;border-radius:8px;padding:8px 10px;font-family:inherit}"
    + ".lb .nick button{background:#5b8cff;border:none;color:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;font-family:inherit}"
    + ".lb .tabs{display:flex;gap:4px;margin-bottom:10px}"
    + ".lb .tabs button{flex:1;background:#26304a;border:1px solid #3a4a70;color:#8d96ad;border-radius:7px;padding:6px 0;font-size:.72rem;cursor:pointer;font-family:inherit}"
    + ".lb .tabs button.on{background:#5b8cff;border-color:#5b8cff;color:#fff}"
    + ".lb ol{list-style:none;margin:0;padding:0;min-height:120px}"
    + ".lb li{display:flex;justify-content:space-between;padding:6px 4px;border-bottom:1px solid #232c44;font-size:.9rem}"
    + ".lb li .r{color:#8d96ad;width:24px}"
    + ".lb li .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
    + ".lb li .sc{font-weight:600}"
    + ".lb li.me{color:#7dd97b}"
    + ".lb .note{color:#5c6680;font-size:.72rem;text-align:center;margin-top:8px}"
    + ".lb .empty{color:#5c6680;text-align:center;padding:20px 0;font-size:.85rem}";

  function injectCSS() {
    if (document.getElementById("lb-css")) return;
    var s = document.createElement("style"); s.id = "lb-css"; s.textContent = CSS;
    document.head.appendChild(s);
  }

  var Leaderboard = {
    cfg: null,
    _period: "day",

    getName: function () { return localStorage.getItem(NAME_KEY) || ""; },
    setName: function (n) {
      n = (n || "").trim().slice(0, 12);
      if (!n) return false;
      if (BANNED.test(n)) { alert("Please pick a friendlier name 🙂"); return false; }
      localStorage.setItem(NAME_KEY, n);
      return true;
    },

    submit: function (score) {
      if (!configured) return Promise.resolve();
      var name = this.getName();
      if (!name || !this.cfg) return Promise.resolve();
      score = Math.round(Number(score));
      if (isNaN(score) || score < 0) return Promise.resolve();
      if (this.cfg.max != null && score > this.cfg.max) return Promise.resolve();
      if (this.cfg.min != null && score < this.cfg.min) return Promise.resolve();
      var self = this;
      return api(TABLE, {
        method: "POST",
        body: JSON.stringify({ game: this.cfg.game, name: name, score: score })
      }).then(function () { self.refresh(); }).catch(function () {});
    },

    board: function (period) {
      if (!configured || !this.cfg) return Promise.resolve([]);
      var dir = this.cfg.dir === "asc" ? "asc" : "desc";
      var q = "?game=eq." + encodeURIComponent(this.cfg.game) + "&order=score." + dir + "&limit=200";
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
    },

    refresh: function () { this._render(this._period); },

    _render: function (period) {
      this._period = period;
      var box = this.cfg && this.cfg._el; if (!box) return;
      var list = box.querySelector("ol");
      var me = this.getName();
      box.querySelectorAll(".tabs button").forEach(function (b) {
        b.classList.toggle("on", b.dataset.p === period);
      });
      if (!configured) {
        list.innerHTML = '<div class="empty">Leaderboard not connected yet.</div>';
        return;
      }
      list.innerHTML = '<div class="empty">Loading…</div>';
      var self = this;
      this.board(period).then(function (rows) {
        if (!rows.length) { list.innerHTML = '<div class="empty">No scores yet — be the first!</div>'; return; }
        list.innerHTML = rows.map(function (r, i) {
          var mine = r.name === me ? " me" : "";
          return '<li class="' + mine.trim() + '"><span class="r">' + (i + 1) + '</span>'
            + '<span class="nm">' + esc(r.name) + '</span>'
            + '<span class="sc">' + fmt(r.score, self.cfg.unit) + '</span></li>';
        }).join("");
      });
    },

    // opts: { el, game, dir:'desc'|'asc', unit:'clicks'|'sec'|'wood', max, min, title }
    mount: function (opts) {
      injectCSS();
      var el = typeof opts.el === "string" ? document.getElementById(opts.el) : opts.el;
      if (!el) return;
      this.cfg = { game: opts.game, dir: opts.dir || "desc", unit: opts.unit || "", max: opts.max, min: opts.min, _el: el };
      var dirNote = this.cfg.dir === "asc" ? "fastest wins" : "highest wins";
      el.className = "lb";
      el.innerHTML =
        '<h3>🏆 ' + esc(opts.title || "Leaderboard") + '</h3>'
        + '<div class="nick"><input maxlength="12" placeholder="your nickname"/><button type="button">save</button></div>'
        + '<div class="tabs">'
        + '<button data-p="day">Today</button>'
        + '<button data-p="week">Week</button>'
        + '<button data-p="month">Month</button>'
        + '<button data-p="all">All-time</button>'
        + '</div><ol></ol>'
        + '<div class="note">' + dirNote + ' · nicknames only, keep them friendly</div>';

      var self = this;
      var input = el.querySelector("input");
      input.value = this.getName();
      el.querySelector(".nick button").addEventListener("click", function () {
        if (self.setName(input.value)) { input.value = self.getName(); self.refresh(); }
      });
      el.querySelectorAll(".tabs button").forEach(function (b) {
        b.addEventListener("click", function () { self._render(b.dataset.p); });
      });
      this._render("day");
    }
  };

  window.Leaderboard = Leaderboard;
})();

/* Sibiya AI: the shared menu button and colour themes for the static pages.
   The chosen theme is shared with the app, because both live on the same address. */
(function () {
  var THEMES = [
    { key: "classic", label: "Classic", dot: "#C9A44C", page: "#0B0B0C" },
    { key: "luxury", label: "Luxury", dot: "#1B4332", page: "#F3EFE6" },
    { key: "startup", label: "Startup", dot: "#4338CA", page: "#F5F7FB" },
    { key: "warm", label: "Warm", dot: "#B13A08", page: "#F6EEE3" },
    { key: "dark", label: "Dark", dot: "#6B9BF5", page: "#0E0F12" }
  ];
  var KEY = "sibiya_theme";

  function getTheme() {
    try {
      var t = localStorage.getItem(KEY);
      for (var i = 0; i < THEMES.length; i++) if (THEMES[i].key === t) return t;
    } catch (e) {}
    return "classic";
  }
  function applyTheme(key) {
    var theme = THEMES[0];
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].key === key) theme = THEMES[i];
    document.documentElement.setAttribute("data-theme", theme.key);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", theme.page);
  }
  function setTheme(key) {
    try { localStorage.setItem(KEY, key); } catch (e) {}
    applyTheme(key);
  }

  applyTheme(getTheme()); // straight away, so the page never flashes the wrong colours

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === "text") n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  function build() {
    if (document.querySelector(".sb-btn")) return;
    var btn = el("button", { "class": "sb-btn", type: "button", "aria-label": "Menu", "aria-haspopup": "dialog", "aria-expanded": "false" });
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

    var closeBtn = el("button", { "class": "sb-close", type: "button", "aria-label": "Close menu", text: "\u00D7" });
    var brand = el("div", { "class": "sb-brand" });
    brand.innerHTML = 'SIBIYA <span>AI</span>';
    var head = el("div", { "class": "sb-head" }, [brand, closeBtn]);

    var pills = el("div", { "class": "sb-pills" });
    THEMES.forEach(function (t) {
      var p = el("button", { "class": "sb-pill", type: "button", "data-theme-key": t.key, "aria-pressed": String(getTheme() === t.key) });
      var dot = el("span", { "class": "sb-dot" });
      dot.style.background = t.dot;
      p.appendChild(dot);
      p.appendChild(document.createTextNode(t.label));
      p.addEventListener("click", function () {
        setTheme(t.key);
        [].forEach.call(pills.children, function (x) { x.setAttribute("aria-pressed", String(x === p)); });
      });
      pills.appendChild(p);
    });

    function link(href, label, sub) {
      var a = el("a", { "class": "sb-link", href: href });
      a.appendChild(document.createTextNode(label));
      if (sub) a.appendChild(el("small", { text: sub }));
      return a;
    }
    var path = location.pathname.replace(/\/+$/, "") || "/";
    var panel = el("div", { "class": "sb-panel", role: "dialog", "aria-modal": "true", "aria-label": "Menu" }, [
      head,
      el("div", { "class": "sb-label", text: "Theme" }),
      pills,
      el("div", { "class": "sb-label", text: "Sibiya AI" }),
      link("/", "Open Sibiya AI", "Chat, groups and calls"),
      link("/landing.html", "Home page"),
      link("/about.html", "About"),
      link("/support.html", "Support"),
      link("/privacy.html", "Privacy")
    ]);
    var share = el("button", { "class": "sb-link", type: "button", text: "Share Sibiya AI" });
    share.addEventListener("click", function () {
      var url = "https://sibiya-ai.vercel.app";
      var text = "Sawubona! Try Sibiya AI, an AI assistant made in South Africa. It speaks isiZulu and English, with group chats, quizzes and more.";
      if (navigator.share) navigator.share({ title: "Sibiya AI", text: text, url: url }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(text + " " + url).then(function () { share.textContent = "Link copied"; }).catch(function () {});
    });
    panel.appendChild(share);
    panel.appendChild(el("p", { "class": "sb-note", text: "The Izibongo maker, time capsules, quiz night and stokvel tools are inside the app." }));

    var overlay = el("div", { "class": "sb-overlay", hidden: "" }, [panel]);

    function open() {
      overlay.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      closeBtn.focus();
    }
    function close() {
      overlay.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      btn.focus();
    }
    btn.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !overlay.hidden) close(); });

    document.body.appendChild(btn);
    document.body.appendChild(overlay);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();

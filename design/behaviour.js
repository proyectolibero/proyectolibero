/*
 * Libero · Sistema de diseño (S0) — comportamiento
 * Mejora progresiva: sin JS todos los datos son legibles. Este fichero
 * solo revela controles opcionales (desplegables, filtro de texto, paginación
 * de listas largas y scrubber temporal) y nunca es requisito para leer el contenido.
 * Sin dependencias.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("lb-js");

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function queryAll(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  /* --- Desplegables: se colapsan solo si hay JS ----------------------- */
  function initDisclosures() {
    queryAll("[data-lb-toggle]").forEach(function (button) {
      var panel = document.querySelector(button.getAttribute("aria-controls"));
      if (!panel) return;
      var open = panel.hasAttribute("data-lb-open");
      button.setAttribute("aria-expanded", String(open));
      if (!open) panel.hidden = true;
      button.addEventListener("click", function () {
        var next = button.getAttribute("aria-expanded") !== "true";
        button.setAttribute("aria-expanded", String(next));
        panel.hidden = !next;
      });
    });
  }

  /* --- Filtro de texto ----------------------------------------------- */
  function filterItems(items, term, type) {
    var needle = normalize(term);
    var visible = 0;
    items.forEach(function (item) {
      var matchText = !needle || normalize(item.textContent).indexOf(needle) !== -1;
      var itemType = item.getAttribute("data-lb-filter-type") || "";
      var matchType = !type || type === "all" || itemType === type;
      var match = matchText && matchType;
      item.hidden = !match;
      if (match) visible += 1;
    });
    return visible;
  }

  function initFilters() {
    queryAll("[data-lb-filter]").forEach(function (input) {
      var scope = document.querySelector(input.getAttribute("data-lb-filter-target"));
      if (!scope) return;
      var items = queryAll("[data-lb-filter-item]", scope);
      var groups = queryAll("[data-lb-filter-group]", scope);
      var counter = document.querySelector(input.getAttribute("data-lb-filter-count") || "");
      var empty = document.querySelector(input.getAttribute("data-lb-filter-empty") || "");
      var typeControl = document.querySelector(input.getAttribute("data-lb-filter-type") || "");
      var format = counter && counter.getAttribute("data-lb-filter-format");
      var onInput = function () {
        var visible = filterItems(items, input.value, typeControl ? typeControl.value : "");
        if (counter) counter.textContent = format ? format.replace("{n}", visible) : String(visible);
        if (empty) empty.hidden = visible !== 0;
        groups.forEach(function (group) {
          group.hidden = !items.some(function (item) {
            return !item.hidden && group.contains(item);
          });
        });
      };
      input.addEventListener("input", onInput);
      if (typeControl) typeControl.addEventListener("change", onInput);
      onInput();
    });
  }

  /* --- Scrubber temporal --------------------------------------------- */
  function initScrubbers() {
    queryAll("[data-lb-scrubber]").forEach(function (input) {
      var scope = document.querySelector(input.getAttribute("data-lb-scrubber-target"));
      if (!scope) return;
      var items = queryAll("[data-lb-year]", scope);
      var output = document.querySelector(input.getAttribute("data-lb-scrubber-value") || "");
      var onInput = function () {
        var max = Number(input.value);
        items.forEach(function (item) {
          item.hidden = Number(item.getAttribute("data-lb-year")) > max;
        });
        if (output) output.textContent = String(max);
      };
      input.addEventListener("input", onInput);
      onInput();
    });
  }

  /* --- Paginación (lista larga) -------------------------------------- */
  function initPagination() {
    queryAll("[data-lb-pagination]").forEach(function (button) {
      var scope = document.querySelector(button.getAttribute("data-lb-pagination-target"));
      if (!scope) return;
      var step = Number(button.getAttribute("data-lb-pagination-step")) || 60;
      var items = queryAll("[data-lb-page-item]", scope);
      var status = document.querySelector(button.getAttribute("data-lb-pagination-status") || "");
      var format = button.getAttribute("data-lb-pagination-format") || "{shown} de {total}";
      var shown = step;
      function render() {
        var count = Math.min(shown, items.length);
        items.forEach(function (item, i) { item.hidden = i >= count; });
        if (status) status.textContent = format.replace("{shown}", count).replace("{total}", items.length);
        button.hidden = count >= items.length;
      }
      button.addEventListener("click", function () {
        shown += step;
        render();
      });
      render();
    });
  }

  /* --- Tema manual (anula prefers-color-scheme) ---------------------- */
  function initTheme() {
    queryAll("[data-lb-theme]").forEach(function (button) {
      button.addEventListener("click", function () {
        root.dataset.theme = button.getAttribute("data-lb-theme");
      });
    });
  }

  /* --- Menu movil: sin JS queda desplegado; con JS se pliega en movil. */
  function initNav() {
    var mq = window.matchMedia("(max-width: 960px)");
    queryAll("[data-lb-nav]").forEach(function (details) {
      var sync = function () {
        if (mq.matches) details.removeAttribute("open");
        else details.setAttribute("open", "");
      };
      if (typeof mq.addEventListener === "function") mq.addEventListener("change", sync);
      else if (typeof mq.addListener === "function") mq.addListener(sync);
      sync();
    });
  }

  /* --- Formulario de aporte: compone la URL de GitHub (opcional) ------ */
  function initContribute() {
    var names = ["competicion", "edicion", "tipo", "descripcion", "fuente", "fecha", "autoria"];
    queryAll("[data-lb-contribute]").forEach(function (form) {
      var endpoint = form.getAttribute("data-lb-contribute-action");
      if (!endpoint) return;
      var status = form.querySelector("[data-lb-contribute-status]");
      var invalid = form.getAttribute("data-lb-contribute-invalid") || "";
      function entries() {
        return names
          .map(function (name) {
            var el = form.querySelector('[name="' + name + '"]');
            if (!el) return null;
            var label = el.id ? form.querySelector('label[for="' + el.id + '"]') : null;
            var heading = label ? label.textContent.trim() : name;
            return { name: name, heading: heading, value: String(el.value || "").trim() };
          })
          .filter(Boolean);
      }
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var rows = entries();
        var byName = {};
        rows.forEach(function (row) { byName[row.name] = row.value; });
        var confirm = form.querySelector('[name="confirm"]');
        if (!byName.descripcion || !byName.fuente || (confirm && !confirm.checked)) {
          if (status) status.textContent = invalid;
          return;
        }
        if (status) status.textContent = "";
        var title = "[aporte] " + [byName.tipo, byName.competicion, byName.edicion].filter(Boolean).join(" \u00b7 ");
        var body = rows
          .map(function (row) { return "### " + row.heading + "\n" + (row.value || "\u2014"); })
          .join("\n\n");
        var url = endpoint + "?labels=aporte&title=" + encodeURIComponent(title) + "&body=" + encodeURIComponent(body);
        window.open(url, "_blank", "noopener,noreferrer");
      });
    });
  }

  /* --- Ficha de partido en modal --------------------------------------
   * Mejora progresiva: sin JS las fichas siguen inline en /partidos/ y el
   * ancla funciona. Con JS, un enlace a #<id> o un #<id> en la URL abre la
   * ficha en el <dialog> nativo. La ficha se MUEVE al modal al abrir y se
   * DEVUELVE a su sitio al cerrar: nunca se duplica en el DOM. */
  function initFacsimileModal() {
    var dialog = document.querySelector("[data-lb-modal]");
    if (!dialog || typeof dialog.showModal !== "function") return;
    var body = dialog.querySelector("[data-lb-modal-body]");
    if (!body) return;
    var title = dialog.querySelector("[data-lb-modal-title]");
    var closeButton = dialog.querySelector("[data-lb-modal-close]");
    var onPageLink = dialog.querySelector("[data-lb-modal-onpage]");

    var current = null;
    var marker = null;
    var origin = null;
    var jumpTo = null;

    function isFacsimile(id) {
      var figure = id ? document.getElementById(id) : null;
      return figure && figure.classList.contains("lb-facsimile") ? figure : null;
    }

    function open(id, trigger) {
      var figure = isFacsimile(id);
      if (!figure || dialog.open) return;
      origin = trigger || null;
      marker = document.createComment(" lb-facsimile ");
      figure.parentNode.insertBefore(marker, figure);
      body.appendChild(figure);
      current = figure;
      if (title) {
        var caption = figure.querySelector(".lb-facsimile__caption");
        title.textContent = caption ? caption.textContent : "";
      }
      dialog.showModal();
      if (closeButton) closeButton.focus();
    }

    dialog.addEventListener("close", function () {
      if (current && marker && marker.parentNode) {
        marker.parentNode.insertBefore(current, marker);
        marker.parentNode.removeChild(marker);
      }
      current = null;
      marker = null;
      if (jumpTo) {
        var hash = jumpTo;
        jumpTo = null;
        origin = null;
        var figure = isFacsimile(hash);
        if (figure) {
          if (typeof figure.scrollIntoView === "function") figure.scrollIntoView({ block: "start" });
          if (window.history && window.history.replaceState) window.history.replaceState(null, "", "#" + hash);
        }
        return;
      }
      if (origin && document.contains(origin) && typeof origin.focus === "function") origin.focus();
      origin = null;
    });

    if (closeButton) closeButton.addEventListener("click", function () { dialog.close(); });

    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) dialog.close();
    });

    document.addEventListener("click", function (event) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var node = event.target;
      var link = node && node.closest ? node.closest('a[href^="#"]') : null;
      if (!link) return;
      var id = String(link.getAttribute("href") || "").slice(1);
      if (!id || !isFacsimile(id)) return;
      event.preventDefault();
      open(id, link);
    });

    if (onPageLink) {
      onPageLink.addEventListener("click", function (event) {
        event.preventDefault();
        if (!current) return;
        jumpTo = current.id;
        dialog.close();
      });
    }

    function fromHash() {
      return String(window.location.hash || "").slice(1);
    }

    window.addEventListener("hashchange", function () {
      var id = fromHash();
      if (id && !dialog.open) open(id, null);
      else if (!id && dialog.open) dialog.close();
    });

    if (fromHash()) open(fromHash(), null);
  }

  function init() {
    initTheme();
    initNav();
    initDisclosures();
    initFilters();
    initScrubbers();
    initPagination();
    initContribute();
    initFacsimileModal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

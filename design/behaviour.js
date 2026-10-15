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
  function filterItems(items, term) {
    var needle = normalize(term);
    var visible = 0;
    items.forEach(function (item) {
      var match = !needle || normalize(item.textContent).indexOf(needle) !== -1;
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
      var counter = document.querySelector(input.getAttribute("data-lb-filter-count") || "");
      var onInput = function () {
        var visible = filterItems(items, input.value);
        if (counter) counter.textContent = String(visible);
      };
      input.addEventListener("input", onInput);
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

  function init() {
    initTheme();
    initNav();
    initDisclosures();
    initFilters();
    initScrubbers();
    initPagination();
    initContribute();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

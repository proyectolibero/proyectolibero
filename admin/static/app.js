(function () {
  'use strict';

  var TOKEN_META = document.querySelector('meta[name="admin-token"]');
  var TOKEN = TOKEN_META ? TOKEN_META.getAttribute('content') : '';
  var TOKEN_INJECTED = Boolean(TOKEN) && TOKEN !== '__ADMIN_TOKEN__';
  var renderToken = 0;

  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = String(value);
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key.indexOf('on') === 0 && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
        else if (value === true) node.setAttribute(key, '');
        else node.setAttribute(key, String(value));
      });
    }
    appendChildren(node, children);
    return node;
  }

  function appendChildren(node, children) {
    if (children === null || children === undefined) return;
    var list = Array.isArray(children) ? children : [children];
    list.forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      if (Array.isArray(child)) appendChildren(node, child);
      else if (child instanceof Node) node.appendChild(child);
      else node.appendChild(document.createTextNode(String(child)));
    });
  }

  function getPath(object, path) {
    return path.split('.').reduce(function (acc, key) {
      return acc === null || acc === undefined ? acc : acc[key];
    }, object);
  }

  function firstValue(object, paths) {
    var found;
    for (var i = 0; i < paths.length; i += 1) {
      found = getPath(object, paths[i]);
      if (found !== undefined && found !== null) return found;
    }
    return undefined;
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.keys(value).map(function (k) { return value[k]; });
    return [];
  }

  function num(value) {
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && isFinite(Number(value))) return Number(value);
    return 0;
  }

  function countOf(value) {
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'number' && isFinite(value)) return value;
    return 0;
  }

  function apiError(code, message, status, data) {
    var err = new Error(message || code || 'Error');
    err.code = code || 'error';
    err.status = status || 0;
    err.data = data;
    return err;
  }

  function api(path, options) {
    var opts = options || {};
    var headers = { 'x-admin-token': TOKEN };
    var body;
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    return fetch(path, { method: opts.method || 'GET', headers: headers, body: body })
      .catch(function (cause) {
        throw apiError('network_error', 'No se pudo contactar con el servidor. Comprueba que el backend esté arrancado. ' + (cause && cause.message ? cause.message : ''), 0, null);
      })
      .then(function (response) {
        return response.text().then(function (text) {
          var data = null;
          if (text) {
            try { data = JSON.parse(text); } catch (parseError) { data = { raw: text }; }
          }
          if (!response.ok) {
            var payload = data && data.error ? data.error : data;
            var code = (payload && (payload.code || payload.errorCode)) || ('http_' + response.status);
            var message = (payload && (payload.message || payload.detail || payload.error)) || ('Respuesta HTTP ' + response.status);
            throw apiError(code, typeof message === 'string' ? message : ('HTTP ' + response.status), response.status, data);
          }
          return data;
        });
      });
  }

  function fmt(value) {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'sí' : 'no';
    if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
    if (typeof value === 'object') {
      try { return JSON.stringify(value); } catch (error) { return '[objeto]'; }
    }
    return String(value);
  }

  function shortHash(value) {
    if (!value) return '—';
    var text = String(value);
    return text.length > 12 ? text.slice(0, 12) + '…' : text;
  }

  function safeUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null;
  }

  function baseName(path) {
    var parts = String(path).split(/[\\/]/);
    return parts[parts.length - 1];
  }

  function splitId(id) {
    var parts = String(id || '').split('/');
    return { sport: parts[0] || '', competition: parts[1] || '' };
  }

  function pill(label, variant) {
    return h('span', { class: 'pill' + (variant ? ' pill-' + variant : ''), text: label });
  }

  function boolPill(value) {
    return value ? pill('sí', 'yes') : pill('—', 'no');
  }

  function spinner(label) {
    return h('div', { class: 'loading', role: 'status' }, [
      h('span', { class: 'spinner', 'aria-hidden': 'true' }),
      h('span', { text: label || 'Cargando…' })
    ]);
  }

  function errorBox(error) {
    var err = error && error.code !== undefined ? error : apiError('error', String(error), 0, null);
    return h('div', { class: 'error-box', role: 'alert' }, [
      h('p', { class: 'error-code', text: err.code || 'error' }),
      h('p', { class: 'error-message', text: err.message || 'Error desconocido.' }),
      err.status ? h('p', { class: 'error-status', text: 'HTTP ' + err.status }) : null
    ]);
  }

  function emptyBox(message) {
    return h('p', { class: 'empty', text: message });
  }

  function def(term, value) {
    return h('div', { class: 'def' }, [
      h('dt', { text: term }),
      h('dd', { text: fmt(value) })
    ]);
  }

  function kpiCard(label, value, hint) {
    return h('article', { class: 'kpi' }, [
      h('p', { class: 'kpi-value', text: fmt(value) }),
      h('p', { class: 'kpi-label', text: label }),
      hint ? h('p', { class: 'kpi-hint', text: hint }) : null
    ]);
  }

  function sectionHead(title, lead) {
    return h('header', { class: 'section-head' }, [
      h('h1', { text: title }),
      lead ? h('p', { class: 'lead', text: lead }) : null
    ]);
  }

  function breadcrumb(label, href) {
    return h('p', { class: 'breadcrumb' }, h('a', { href: href, text: '← ' + label }));
  }

  function field(label, control) {
    return h('div', { class: 'field' }, [
      h('label', { for: control.getAttribute('id'), text: label }),
      control
    ]);
  }

  function dataTable(columns, rows) {
    var header = h('tr', {}, columns.map(function (col) {
      return h('th', { scope: 'col', class: col.numeric ? 'num' : null, text: col.label });
    }));
    var body = h('tbody', {}, rows.map(function (row) {
      return h('tr', {}, columns.map(function (col) {
        var cell = h('td', { class: col.numeric ? 'num' : null });
        appendChildren(cell, col.render ? col.render(row) : fmt(row[col.key]));
        return cell;
      }));
    }));
    return h('div', { class: 'table-wrap' }, h('table', {}, [h('thead', {}, header), body]));
  }

  function announce(message) {
    var node = document.getElementById('announcer');
    if (node) node.textContent = message;
  }

  function setConn(text, kind) {
    var node = document.getElementById('conn-status');
    if (!node) return;
    node.textContent = text;
    node.className = 'topbar-status' + (kind ? ' status-' + kind : '');
  }

  function checkToken() {
    if (!TOKEN_INJECTED) {
      setConn('Token no inyectado: el servidor debe sustituir __ADMIN_TOKEN__.', 'warn');
    } else {
      setConn('Token cargado.', 'ok');
    }
  }

  function normalizeCompetitions(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.competitions)) return data.competitions;
    if (data && Array.isArray(data.sports)) {
      return data.sports.reduce(function (acc, sport) {
        if (Array.isArray(sport.competitions)) {
          sport.competitions.forEach(function (comp) {
            if (comp && typeof comp === 'object') acc.push(Object.assign({ sport: sport.id }, comp));
          });
        }
        return acc;
      }, []);
    }
    return [];
  }

  function statusModel(source) {
    var s = source || {};
    var validation = s.validation || {};
    var release = firstValue(s, ['lastRelease', 'release', 'latestRelease', 'releaseInfo']);
    if (typeof release === 'string') release = { id: release };
    return {
      published: num(firstValue(s, ['published', 'editionsPublished', 'editions.published', 'coverage.published'])),
      held: num(firstValue(s, ['held', 'editionsHeld', 'editions.held', 'coverage.held'])),
      matches: num(firstValue(s, ['matches', 'counts.matches', 'coverage.matches', 'totals.matches'])),
      goals: num(firstValue(s, ['goals', 'counts.goals', 'coverage.goals', 'totals.goals'])),
      competitions: num(firstValue(s, ['competitions', 'counts.competitions', 'catalog.competitions', 'totals.competitions'])),
      release: release || null,
      validation: {
        errors: countOf(validation.errors !== undefined ? validation.errors : s.errors),
        warnings: countOf(validation.warnings !== undefined ? validation.warnings : s.warnings)
      }
    };
  }

  function releaseCard(release) {
    var body = [];
    if (!release) {
      body.push(emptyBox('No hay ningún release construido todavía.'));
    } else {
      body.push(h('dl', { class: 'deflist' }, [
        def('Identificador', release.id || release.releaseId),
        def('asOf', release.asOf),
        def('Checksum', shortHash(release.checksum)),
        release.created ? def('Creado', release.created) : null
      ]));
    }
    return h('section', { class: 'panel' }, [h('h2', { text: 'Release más reciente' })].concat(body));
  }

  function validationSummaryCard(validation) {
    return h('section', { class: 'panel' }, [
      h('h2', { text: 'Validación' }),
      h('p', { class: 'badges' }, [
        pill('Errores: ' + validation.errors, validation.errors ? 'error' : 'ok'),
        pill('Avisos: ' + validation.warnings, validation.warnings ? 'warn' : 'ok')
      ])
    ]);
  }

  function entriesOf(data, key) {
    if (!data) return [];
    if (Array.isArray(data[key])) return data[key];
    if (data.validation && Array.isArray(data.validation[key])) return data.validation[key];
    return [];
  }

  function renderValidation(data) {
    var errors = entriesOf(data, 'errors');
    var warnings = entriesOf(data, 'warnings');
    var panel = h('section', { class: 'panel' }, [h('h2', { text: 'Resultado de la validación' })]);
    if (!errors.length && !warnings.length) {
      panel.appendChild(h('p', { class: 'badges' }, pill('Sin errores ni avisos', 'ok')));
      return panel;
    }
    var rows = errors.map(function (entry) { return { severity: 'error', entry: entry }; })
      .concat(warnings.map(function (entry) { return { severity: 'warning', entry: entry }; }));
    panel.appendChild(h('p', { class: 'badges' }, [
      pill('Errores: ' + errors.length, errors.length ? 'error' : 'ok'),
      pill('Avisos: ' + warnings.length, warnings.length ? 'warn' : 'ok')
    ]));
    panel.appendChild(dataTable([
      { label: 'Severidad', render: function (row) { return pill(row.severity === 'error' ? 'Error' : 'Aviso', row.severity === 'error' ? 'error' : 'warn'); } },
      { label: 'Código', render: function (row) { return h('span', { class: 'mono', text: row.entry.code || row.entry.rule || '—' }); } },
      { label: 'Fichero', render: function (row) { return fmt(row.entry.file || row.entry.path); } },
      { label: 'Mensaje', render: function (row) { return fmt(row.entry.message || row.entry.msg); } }
    ], rows));
    return panel;
  }

  function runValidation(button, panel) {
    var original = button.textContent;
    button.disabled = true;
    button.textContent = 'Revalidando…';
    panel.replaceChildren(spinner('Ejecutando validador…'));
    api('/api/validate').then(function (data) {
      panel.replaceChildren(renderValidation(data));
      announce('Validación completada');
    }).catch(function (error) {
      panel.replaceChildren(errorBox(error));
    }).then(function () {
      button.disabled = false;
      button.textContent = original;
    });
  }

  function renderStatus() {
    return api('/api/status').then(function (data) {
      setConn('Conectado.', 'ok');
      var model = statusModel(data);
      var panel = h('div', { class: 'panel-inner' });
      var button = h('button', { type: 'button', class: 'btn', text: 'Revalidar' });
      button.addEventListener('click', function () { runValidation(button, panel); });
      var section = h('section', { class: 'section' });
      section.appendChild(sectionHead('Estado', 'Resumen del archivo: ediciones, resultados, release vigente y validación.'));
      section.appendChild(h('div', { class: 'kpi-grid' }, [
        kpiCard('Ediciones publicadas', model.published),
        kpiCard('Ediciones celebradas', model.held),
        kpiCard('Partidos', model.matches),
        kpiCard('Goles', model.goals),
        kpiCard('Competiciones', model.competitions)
      ]));
      section.appendChild(releaseCard(model.release));
      section.appendChild(validationSummaryCard(model.validation));
      section.appendChild(h('div', { class: 'toolbar' }, button));
      section.appendChild(panel);
      return section;
    });
  }

  function compLink(comp) {
    var id = comp.id || [comp.sport, comp.competition].filter(Boolean).join('/');
    return h('a', { href: '#/competition/' + encodeURIComponent(id), class: 'link-strong', text: comp.name || id || '—' });
  }

  function coverageText(comp) {
    var coverage = comp.coverage || {};
    var published = num(coverage.published !== undefined ? coverage.published : comp.published);
    var held = num(coverage.held !== undefined ? coverage.held : comp.held);
    var missing = coverage.missing !== undefined ? num(coverage.missing) : Math.max(held - published, 0);
    return h('span', {}, [
      h('strong', { text: String(published) }),
      ' / ' + held,
      h('span', { class: 'muted', text: ' · ' + missing + ' pendientes' })
    ]);
  }

  function cadenceText(cadence) {
    if (!cadence) return '—';
    if (typeof cadence === 'string') return cadence;
    var type = cadence.type || cadence.mode || '';
    if (type === 'interval' && cadence.years) return 'cada ' + cadence.years + ' años';
    if (type === 'annual') return 'anual';
    if (type === 'once') return 'única';
    return type || fmt(cadence);
  }

  function updatePolicyText(policy) {
    if (!policy) return '—';
    if (typeof policy === 'string') return policy;
    var parts = [];
    if (policy.mode) parts.push(policy.mode);
    if (policy.checkEveryDays) parts.push('cada ' + policy.checkEveryDays + ' días');
    if (policy.liveSource) parts.push('fuente en vivo');
    return parts.length ? parts.join(' · ') : '—';
  }

  function statusPill(status) {
    if (!status) return h('span', { text: '—' });
    var variant = status === 'active' ? 'ok' : (status === 'historical' || status === 'dormant' ? 'warn' : 'no');
    return pill(String(status), variant);
  }

  function renderCatalog() {
    return api('/api/catalog').then(function (data) {
      var list = normalizeCompetitions(data);
      var section = h('section', { class: 'section' });
      section.appendChild(sectionHead('Catálogo', 'Competiciones del archivo con cobertura, estado y política de actualización.'));
      if (!list.length) {
        section.appendChild(emptyBox('El catálogo está vacío o no tiene el formato esperado.'));
        return section;
      }
      section.appendChild(dataTable([
        { label: 'Competición', render: function (comp) { return compLink(comp); } },
        { label: 'Cobertura', render: function (comp) { return coverageText(comp); } },
        { label: 'Estado', render: function (comp) { return statusPill(comp.status); } },
        { label: 'Cadencia', render: function (comp) { return cadenceText(comp.cadence); } },
        { label: 'Actualización', render: function (comp) { return updatePolicyText(comp.updatePolicy); } }
      ], list));
      return section;
    });
  }

  function coveragePlain(coverage) {
    if (!coverage) return undefined;
    var parts = [];
    if (coverage.held !== undefined) parts.push('celebradas: ' + coverage.held);
    if (coverage.published !== undefined) parts.push('publicadas: ' + coverage.published);
    if (coverage.missing !== undefined) parts.push('pendientes: ' + coverage.missing);
    if (coverage.missingYears && coverage.missingYears.length) parts.push('años: ' + coverage.missingYears.join(', '));
    return parts.length ? parts.join(' · ') : undefined;
  }

  function metadataPanel(comp) {
    var rows = [
      ['Identificador', comp.id],
      ['Deporte', comp.sport],
      ['Competición', comp.competition],
      ['Organizador', comp.organizer],
      ['Ámbito', comp.scope],
      ['Modo de equipo', comp.teamMode],
      ['Arquetipo', comp.resultArchetype],
      ['Género', comp.gender],
      ['Estado', comp.status],
      ['Cadencia', cadenceText(comp.cadence)],
      ['Primera edición', comp.firstEdition],
      ['Última celebrada', comp.lastEditionHeld],
      ['Cobertura', coveragePlain(comp.coverage)]
    ].filter(function (row) { return row[1] !== undefined && row[1] !== null && row[1] !== ''; });
    return h('section', { class: 'panel' }, [
      h('h2', { text: 'Metadatos' }),
      h('dl', { class: 'deflist' }, rows.map(function (row) { return def(row[0], row[1]); }))
    ]);
  }

  function editionsOf(data, comp) {
    if (data && Array.isArray(data.editions)) return data.editions;
    if (comp && Array.isArray(comp.editions)) return comp.editions;
    if (comp && comp.coverage && Array.isArray(comp.coverage.editions)) return comp.coverage.editions;
    return [];
  }

  function editionLink(ed, sport, competition) {
    var year = ed.year || ed.edition || ed.id;
    if (!year) return '—';
    if (!(ed.published || ed.data || ed.held)) return String(year);
    var href = '#/edition/' + [sport, competition, year].map(encodeURIComponent).join('/');
    return h('a', { href: href, class: 'link-strong', text: String(year) });
  }

  function dataPill(ed) {
    var value = ed.data;
    if (value === undefined || value === null || value === false || value === '') return pill('—', 'no');
    if (typeof value === 'string' && value.trim()) return h('span', { class: 'mono', text: baseName(value) });
    return pill('sí', 'yes');
  }

  function editionsPanel(comp, editions) {
    var panel = h('section', { class: 'panel' }, [h('h2', { text: 'Ediciones' })]);
    if (!editions.length) {
      panel.appendChild(emptyBox('No hay ediciones en la respuesta del catálogo.'));
      return panel;
    }
    var parts = splitId(comp.id);
    var sport = comp.sport || parts.sport;
    var competition = comp.competition || parts.competition;
    panel.appendChild(dataTable([
      { label: 'Año', render: function (ed) { return editionLink(ed, sport, competition); } },
      { label: 'Celebrada', render: function (ed) { return boolPill(ed.held !== false); } },
      { label: 'Campeón', render: function (ed) { return fmt(ed.champion); } },
      { label: 'Subcampeón', render: function (ed) { return fmt(ed.runnerUp); } },
      { label: 'Datos', render: function (ed) { return dataPill(ed); } },
      { label: 'Publicada', render: function (ed) { return boolPill(ed.published); } }
    ], editions));
    return panel;
  }

  function statusOptions(current) {
    var options = ['', 'active', 'historical', 'dormant', 'discontinued'];
    if (current && options.indexOf(current) === -1) options.push(current);
    return options.map(function (value) {
      return h('option', { value: value, selected: value === (current || ''), text: value || '— sin cambio —' });
    });
  }

  function cadenceOptions(current) {
    var values = ['', 'annual', 'interval', 'once'];
    if (current && values.indexOf(current) === -1) values.push(current);
    var labels = { '': '— sin cambio —', annual: 'annual (cada año)', interval: 'interval (cada N años)', once: 'once (única)' };
    return values.map(function (value) {
      return h('option', { value: value, selected: value === (current || ''), text: labels[value] || value });
    });
  }

  function buildCadence(type, years) {
    var clean = (type || '').trim();
    var hasYears = years !== undefined && years !== null && String(years).trim() !== '';
    if (!clean) return null;
    if (clean === 'interval') {
      var count = hasYears ? Number(years) : undefined;
      return count === undefined || isNaN(count) ? { type: 'interval' } : { type: 'interval', years: count };
    }
    return { type: clean };
  }

  function sameJson(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function change(fieldName, from, to) {
    return { field: fieldName, from: from, to: to };
  }

  function buildPolicyBody(current, f) {
    var body = {};
    var changes = [];
    var problems = [];
    if (f.statusSelect.value && f.statusSelect.value !== current.status) {
      body.status = f.statusSelect.value;
      changes.push(change('status', current.status, f.statusSelect.value));
    }
    if (f.cadenceSelect.value) {
      var cadenceValue = buildCadence(f.cadenceSelect.value, f.yearsInput.value);
      var currentCadence = buildCadence(current.cadenceType, current.cadenceYears);
      if (!sameJson(cadenceValue, currentCadence)) {
        body.cadence = cadenceValue;
        changes.push(change('cadence', currentCadence, cadenceValue));
      }
    }
    var check = f.checkInput.value.trim();
    if (check !== current.checkEveryDays) {
      if (!/^[1-9]\d*$/.test(check)) {
        problems.push('updatePolicy.checkEveryDays debe ser un entero positivo.');
      } else {
        body.updatePolicy = body.updatePolicy || {};
        body.updatePolicy.checkEveryDays = Number(check);
        changes.push(change('updatePolicy.checkEveryDays', current.checkEveryDays, check));
      }
    }
    var live = f.liveInput.value.trim();
    if (live !== current.liveSource) {
      body.updatePolicy = body.updatePolicy || {};
      body.updatePolicy.liveSource = live;
      changes.push(change('updatePolicy.liveSource', current.liveSource, live));
    }
    var note = f.noteInput.value.trim();
    if (note !== current.note) {
      body.updatePolicy = body.updatePolicy || {};
      body.updatePolicy.note = note;
      changes.push(change('updatePolicy.note', current.note, note));
    }
    if (f.licenseInput.value.trim() !== current.licenseNote) {
      body.license = { note: f.licenseInput.value.trim() };
      changes.push(change('license.note', current.licenseNote, f.licenseInput.value.trim()));
    }
    return { body: body, changes: changes, problems: problems };
  }

  function submitPolicy(comp, body, button, resultPanel) {
    var id = comp.id || [comp.sport, comp.competition].filter(Boolean).join('/');
    var original = button.textContent;
    button.disabled = true;
    button.textContent = 'Enviando…';
    resultPanel.replaceChildren(spinner('Aplicando cambios…'));
    api('/api/competitions/' + encodeURIComponent(id), { method: 'PATCH', body: body }).then(function (data) {
      resultPanel.replaceChildren(policySuccess(data));
      announce('Cambios aplicados');
    }).catch(function (error) {
      resultPanel.replaceChildren(policyError(error));
    }).then(function () {
      button.disabled = false;
      button.textContent = original;
    });
  }

  function policySuccess(data) {
    var validation = data && data.validation ? data.validation : null;
    return h('div', { class: 'status-box status-ok', role: 'status' }, [
      h('p', { text: 'Cambios aplicados correctamente.' }),
      validation ? h('p', { class: 'badges' }, [
        pill('Errores: ' + countOf(validation.errors), countOf(validation.errors) ? 'error' : 'ok'),
        pill('Avisos: ' + countOf(validation.warnings), countOf(validation.warnings) ? 'warn' : 'ok')
      ]) : null,
      data && data.path ? h('p', { class: 'mono', text: data.path }) : null
    ]);
  }

  function policyError(error) {
    var box = errorBox(error);
    if (error && error.status === 409) {
      box.appendChild(h('p', { class: 'error-note', text: 'El cambio no supera la validación del proyecto (409). La operación se revirtió: no se aplicó ningún cambio. Revisa los valores y vuelve a intentarlo.' }));
    } else if (error && error.status === 400) {
      box.appendChild(h('p', { class: 'error-note', text: 'La petición fue rechazada (400). Revisa los valores de la lista blanca.' }));
    }
    return box;
  }

  function renderDiff(changes, body, comp, resultPanel) {
    var wrap = h('div', { class: 'diff' });
    wrap.appendChild(h('h3', { text: 'Resumen de cambios' }));
    wrap.appendChild(dataTable([
      { label: 'Campo', render: function (item) { return h('span', { class: 'mono', text: item.field }); } },
      { label: 'Valor actual', render: function (item) { return h('span', { class: 'diff-from', text: fmt(item.from) }); } },
      { label: 'Valor nuevo', render: function (item) { return h('span', { class: 'diff-to', text: fmt(item.to) }); } }
    ], changes));
    var id = comp.id || [comp.sport, comp.competition].filter(Boolean).join('/');
    wrap.appendChild(h('p', { class: 'lead', text: 'Se enviará PATCH /api/competitions/' + id + ' con los campos anteriores.' }));
    var confirm = h('button', { type: 'button', class: 'btn btn-primary', text: 'Confirmar y enviar' });
    confirm.addEventListener('click', function () { submitPolicy(comp, body, confirm, resultPanel); });
    wrap.appendChild(h('div', { class: 'toolbar' }, confirm));
    return wrap;
  }

  function policyPanel(comp) {
    var current = {
      status: comp.status || '',
      cadenceType: comp.cadence && comp.cadence.type ? comp.cadence.type : '',
      cadenceYears: comp.cadence && comp.cadence.years !== undefined ? String(comp.cadence.years) : '',
      checkEveryDays: comp.updatePolicy && comp.updatePolicy.checkEveryDays !== undefined ? String(comp.updatePolicy.checkEveryDays) : '',
      liveSource: comp.updatePolicy && comp.updatePolicy.liveSource ? comp.updatePolicy.liveSource : '',
      note: comp.updatePolicy && comp.updatePolicy.note ? comp.updatePolicy.note : '',
      licenseNote: comp.license && comp.license.note ? comp.license.note : ''
    };
    var statusSelect = h('select', { id: 'pol-status' }, statusOptions(current.status));
    var cadenceSelect = h('select', { id: 'pol-cadence' }, cadenceOptions(current.cadenceType));
    var yearsInput = h('input', { id: 'pol-years', type: 'text', inputmode: 'numeric', value: current.cadenceYears, placeholder: 'p. ej. 4' });
    var checkInput = h('input', { id: 'pol-check', type: 'number', min: '1', value: current.checkEveryDays, placeholder: 'p. ej. 30' });
    var liveInput = h('input', { id: 'pol-live', type: 'url', value: current.liveSource, placeholder: 'https://…' });
    var noteInput = h('input', { id: 'pol-note', type: 'text', value: current.note });
    var licenseInput = h('textarea', { id: 'pol-license', rows: '2' }, current.licenseNote);
    var diffPanel = h('div', { class: 'panel-inner' });
    var resultPanel = h('div', { class: 'panel-inner' });
    var review = h('button', { type: 'button', class: 'btn', text: 'Revisar cambios' });
    var fields = { statusSelect: statusSelect, cadenceSelect: cadenceSelect, yearsInput: yearsInput, checkInput: checkInput, liveInput: liveInput, noteInput: noteInput, licenseInput: licenseInput };
    var form = h('form', { class: 'form' }, [
      field('Estado', statusSelect),
      field('Cadencia · tipo', cadenceSelect),
      field('Cadencia · años (interval)', yearsInput),
      field('updatePolicy.checkEveryDays', checkInput),
      field('updatePolicy.liveSource', liveInput),
      field('updatePolicy.note', noteInput),
      field('license.note', licenseInput),
      h('div', { class: 'toolbar' }, review)
    ]);
    form.addEventListener('submit', function (event) { event.preventDefault(); });
    review.addEventListener('click', function () {
      var built = buildPolicyBody(current, fields);
      resultPanel.replaceChildren();
      if (built.problems.length) {
        diffPanel.replaceChildren(errorBox(apiError('validation_error', built.problems.join(' '), 400, null)));
        return;
      }
      if (!built.changes.length) {
        diffPanel.replaceChildren(h('p', { class: 'badges' }, pill('Sin cambios respecto al valor actual', 'ok')));
        return;
      }
      diffPanel.replaceChildren(renderDiff(built.changes, built.body, comp, resultPanel));
    });
    return h('section', { class: 'panel' }, [
      h('h2', { text: 'Edición vigilada' }),
      h('p', { class: 'lead', text: 'Solo se pueden modificar los campos de la lista blanca. Se muestra el diff antes de enviar.' }),
      form,
      diffPanel,
      resultPanel
    ]);
  }

  function renderCompetition(id) {
    return api('/api/competitions/' + encodeURIComponent(id)).then(function (data) {
      var comp = data.competition || data;
      var editions = editionsOf(data, comp);
      var section = h('section', { class: 'section' });
      section.appendChild(breadcrumb('Catálogo', '#/catalog'));
      section.appendChild(sectionHead(comp.name || id, 'Metadatos, ediciones y edición vigilada.'));
      section.appendChild(metadataPanel(comp));
      section.appendChild(editionsPanel(comp, editions));
      section.appendChild(policyPanel(comp));
      return section;
    });
  }

  function sourceLink(source) {
    var url = safeUrl(source.url);
    var name = source.name || source.id || '—';
    return url
      ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: name })
      : h('span', { text: name });
  }

  function sourcesPanel(sources) {
    var panel = h('section', { class: 'panel' }, [h('h2', { text: 'Fuentes' })]);
    if (!sources.length) {
      panel.appendChild(emptyBox('Esta edición no declara fuentes.'));
      return panel;
    }
    panel.appendChild(dataTable([
      { label: 'id', render: function (s) { return h('span', { class: 'mono', text: fmt(s.id) }); } },
      { label: 'Nombre', render: function (s) { return sourceLink(s); } },
      { label: 'Editor', render: function (s) { return fmt(s.publisher); } },
      { label: 'Licencia', render: function (s) { return fmt(s.license); } },
      { label: 'Redistribuible', render: function (s) { return boolPill(s.redistribute); } },
      { label: 'Nota', render: function (s) { return fmt(s.note); } }
    ], sources));
    return panel;
  }

  function normalizeProvenance(provenance) {
    if (!provenance) return [];
    if (Array.isArray(provenance)) return provenance;
    if (provenance.primary !== undefined || provenance.rejected !== undefined) {
      return [{ where: provenance.where || 'edición', primary: provenance.primary, rejected: asArray(provenance.rejected) }];
    }
    if (typeof provenance === 'object') {
      return Object.keys(provenance).map(function (key) {
        var value = provenance[key] || {};
        return { where: key, primary: value.primary, rejected: asArray(value.rejected) };
      });
    }
    return [];
  }

  function provEntry(entry) {
    var rejected = asArray(entry.rejected);
    var header = h('header', { class: 'prov-head' }, [
      h('span', { class: 'prov-where', text: entry.where || 'edición' }),
      entry.primary
        ? h('span', { class: 'badge badge-primary', text: 'primary · ' + entry.primary })
        : h('span', { class: 'badge badge-warn', text: 'sin primary' })
    ]);
    var body = [];
    if (!rejected.length) {
      body.push(h('p', { class: 'prov-none', text: 'Sin valores descartados para este dato.' }));
    } else {
      body.push(h('ul', { class: 'prov-rejected' }, rejected.map(function (item) {
        return h('li', {}, [
          h('div', { class: 'prov-row' }, [
            h('span', { class: 'prov-field', text: fmt(item.field) }),
            h('code', { class: 'prov-value', text: fmt(item.value) })
          ]),
          item.source ? h('p', { class: 'prov-source', text: 'descartada de ' + item.source }) : null,
          h('p', { class: 'prov-reason', text: fmt(item.reason) })
        ]);
      })));
    }
    return h('article', { class: 'prov' }, [header, h('div', { class: 'prov-body' }, body)]);
  }

  function provenancePanel(provenance) {
    var panel = h('section', { class: 'panel panel-provenance' }, [
      h('h2', { text: 'Procedencia' }),
      h('p', { class: 'lead', text: 'De qué fuente sale cada dato y qué valores alternativos se descartaron.' })
    ]);
    var entries = normalizeProvenance(provenance);
    if (!entries.length) {
      panel.appendChild(emptyBox('Esta edición no registra conflictos de procedencia.'));
      return panel;
    }
    entries.forEach(function (entry) { panel.appendChild(provEntry(entry)); });
    return panel;
  }

  function countsPanel(counts) {
    var source = counts || {};
    var keys = Object.keys(source).filter(function (key) { return typeof source[key] !== 'object'; });
    if (!keys.length) {
      return h('section', { class: 'panel' }, [h('h2', { text: 'Recuentos' }), emptyBox('Sin recuentos disponibles.')]);
    }
    return h('section', { class: 'panel' }, [
      h('h2', { text: 'Recuentos' }),
      h('div', { class: 'kpi-grid' }, keys.map(function (key) { return kpiCard(key, source[key]); }))
    ]);
  }

  function metaPanel(meta, ctx) {
    return h('section', { class: 'panel' }, [
      h('h2', { text: 'Metadatos' }),
      h('dl', { class: 'deflist' }, [
        def('Deporte', meta.sport || ctx.sport),
        def('Competición', meta.competition || ctx.competition),
        def('Edición', meta.edition || ctx.year),
        def('Arquetipo', meta.archetype),
        def('Estado', meta.status),
        def('asOf', meta.asOf),
        def('Sede(s)', meta.hosts),
        def('Equipos', meta.teamsCount)
      ])
    ]);
  }

  function editionDetail(data, ctx) {
    var meta = data.meta || data;
    var counts = data.counts || data.coverage || {};
    var sources = asArray(data.sources || (meta && meta.sources));
    var provenance = data.provenance || (meta && meta.provenance);
    return h('div', {}, [
      metaPanel(meta, ctx),
      countsPanel(counts),
      sourcesPanel(sources),
      provenancePanel(provenance)
    ]);
  }

  function loadEditionFromSelection(id, year, detail) {
    if (!id || !year) return Promise.resolve();
    var parts = splitId(id);
    detail.replaceChildren(spinner('Cargando edición…'));
    return api('/api/editions/' + [parts.sport, parts.competition, year].map(encodeURIComponent).join('/'))
      .then(function (data) {
        detail.replaceChildren(editionDetail(data, { sport: parts.sport, competition: parts.competition, year: year }));
      })
      .catch(function (error) {
        detail.replaceChildren(errorBox(error));
      });
  }

  function loadYears(id, yearSelect, detail, preselectYear) {
    yearSelect.replaceChildren(h('option', { value: '', text: 'Cargando…' }));
    detail.replaceChildren();
    return api('/api/competitions/' + encodeURIComponent(id)).then(function (data) {
      var comp = data.competition || data;
      var editions = editionsOf(data, comp);
      var years = editions.map(function (ed) { return ed.year || ed.edition || ed.id; })
        .filter(function (year) { return year !== undefined && year !== null; });
      if (!years.length) {
        yearSelect.replaceChildren(h('option', { value: '', text: '— sin ediciones —' }));
        detail.replaceChildren(emptyBox('No hay ediciones para esta competición.'));
        return;
      }
      yearSelect.replaceChildren();
      years.forEach(function (year) {
        yearSelect.appendChild(h('option', { value: String(year), text: String(year), selected: preselectYear !== null && String(year) === String(preselectYear) }));
      });
      return loadEditionFromSelection(id, yearSelect.value, detail);
    }).catch(function (error) {
      yearSelect.replaceChildren(h('option', { value: '', text: '—' }));
      detail.replaceChildren(errorBox(error));
    });
  }

  function renderEdition(params) {
    var preselected = params && params.length === 3 ? params : null;
    return api('/api/catalog').then(function (catalogData) {
      var competitions = normalizeCompetitions(catalogData);
      var section = h('section', { class: 'section' });
      section.appendChild(sectionHead('Edición', 'Metadatos, recuentos, fuentes y visor de procedencia de una edición publicada.'));
      if (!competitions.length) {
        section.appendChild(emptyBox('El catálogo está vacío.'));
        return section;
      }
      var compSelect = h('select', { id: 'ed-comp' });
      var yearSelect = h('select', { id: 'ed-year' });
      var detail = h('div', { class: 'edition-detail' });
      competitions.forEach(function (comp) {
        var id = comp.id || [comp.sport, comp.competition].join('/');
        compSelect.appendChild(h('option', { value: id, text: comp.name || id }));
      });
      section.appendChild(h('div', { class: 'controls' }, [field('Competición', compSelect), field('Año', yearSelect)]));
      section.appendChild(detail);
      if (preselected) compSelect.value = preselected[0] + '/' + preselected[1];
      if (compSelect.selectedIndex === -1) compSelect.selectedIndex = 0;
      compSelect.addEventListener('change', function () {
        loadYears(compSelect.value, yearSelect, detail, null);
      });
      yearSelect.addEventListener('change', function () {
        loadEditionFromSelection(compSelect.value, yearSelect.value, detail);
      });
      return loadYears(compSelect.value, yearSelect, detail, preselected ? preselected[2] : null).then(function () { return section; });
    });
  }

  function fileCount(release) {
    if (Array.isArray(release.contents)) return release.contents.length;
    if (release.files !== undefined) return release.files;
    if (release.fileCount !== undefined) return release.fileCount;
    if (release.dataset && release.dataset.files !== undefined) return release.dataset.files;
    return undefined;
  }

  function releaseResult(data, dryRun) {
    var rows = [
      data && data.path ? def('Ruta', data.path) : null,
      data && data.checksum ? def('Checksum', data.checksum) : null,
      data && (data.releaseId || data.id) ? def('Release', data.releaseId || data.id) : null
    ].filter(Boolean);
    return h('div', { class: 'status-box status-ok', role: 'status' }, [
      h('p', { text: dryRun ? 'Dry-run completado: no se escribió nada en disco.' : 'Release construido.' }),
      rows.length ? h('dl', { class: 'deflist' }, rows) : null
    ]);
  }

  function submitRelease(fields, button, panel) {
    var releaseId = fields.idInput.value.trim();
    if (!releaseId) {
      panel.replaceChildren(errorBox(apiError('validation_error', 'El releaseId es obligatorio.', 400, null)));
      return;
    }
    var original = button.textContent;
    button.disabled = true;
    button.textContent = 'Construyendo…';
    panel.replaceChildren(spinner('Construyendo release…'));
    var body = { releaseId: releaseId, dryRun: fields.dryInput.checked };
    if (fields.asOfInput.value) body.asOf = fields.asOfInput.value;
    api('/api/releases', { method: 'POST', body: body }).then(function (data) {
      panel.replaceChildren(releaseResult(data, fields.dryInput.checked));
      announce('Release construido');
    }).catch(function (error) {
      panel.replaceChildren(errorBox(error));
    }).then(function () {
      button.disabled = false;
      button.textContent = original;
    });
  }

  function buildReleaseForm() {
    var idInput = h('input', { id: 'rel-id', type: 'text', required: true, placeholder: '2026.10' });
    var asOfInput = h('input', { id: 'rel-asof', type: 'date' });
    var dryInput = h('input', { id: 'rel-dry', type: 'checkbox', checked: true });
    var panel = h('div', { class: 'panel-inner' });
    var submit = h('button', { type: 'submit', class: 'btn btn-primary', text: 'Construir release' });
    var form = h('form', { class: 'form' }, [
      field('releaseId', idInput),
      field('asOf', asOfInput),
      h('label', { class: 'checkbox', for: 'rel-dry' }, [dryInput, ' dry-run (no escribe ficheros)']),
      h('div', { class: 'toolbar' }, submit)
    ]);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      submitRelease({ idInput: idInput, asOfInput: asOfInput, dryInput: dryInput }, submit, panel);
    });
    return h('section', { class: 'panel' }, [h('h2', { text: 'Construir release' }), form, panel]);
  }

  function renderReleases() {
    return api('/api/releases').then(function (data) {
      var list = Array.isArray(data) ? data : asArray(data && data.releases);
      var section = h('section', { class: 'section' });
      section.appendChild(sectionHead('Releases', 'Paquetes sellados publicados y construcción de uno nuevo.'));
      if (!list.length) {
        section.appendChild(emptyBox('Todavía no hay releases publicados.'));
      } else {
        section.appendChild(dataTable([
          { label: 'Release', render: function (r) { return fmt(r.id || r.releaseId); } },
          { label: 'asOf', render: function (r) { return fmt(r.asOf); } },
          { label: 'Ficheros', numeric: true, render: function (r) { return fmt(fileCount(r)); } },
          { label: 'Checksum', render: function (r) { return h('span', { class: 'mono', text: shortHash(r.checksum) }); } }
        ], list));
      }
      section.appendChild(buildReleaseForm());
      return section;
    });
  }

  function resultPill(value) {
    if (value === undefined || value === null || value === '') return '—';
    var text = String(value).toLowerCase();
    var ok = text === 'ok' || text === 'success' || text === 'true' || text === 'applied';
    var bad = text === 'error' || text === 'failed' || text === 'false' || text === 'rejected';
    return pill(String(value), ok ? 'ok' : (bad ? 'error' : 'warn'));
  }

  function loadAudit(panel, limit) {
    panel.replaceChildren(spinner('Cargando auditoría…'));
    return api('/api/audit?limit=' + encodeURIComponent(limit)).then(function (data) {
      var entries = Array.isArray(data) ? data : asArray(data && (data.entries || data.audit));
      if (!entries.length) {
        panel.replaceChildren(emptyBox('Sin entradas de auditoría.'));
        return;
      }
      panel.replaceChildren(dataTable([
        { label: 'Fecha', render: function (entry) { return fmt(entry.ts || entry.time || entry.at); } },
        { label: 'Acción', render: function (entry) { return fmt(entry.action); } },
        { label: 'Objetivo', render: function (entry) { return fmt(entry.target); } },
        { label: 'Resultado', render: function (entry) { return resultPill(entry.result); } },
        { label: 'Detalle', render: function (entry) { return fmt(entry.detail); } }
      ], entries));
    }).catch(function (error) {
      panel.replaceChildren(errorBox(error));
    });
  }

  function renderAudit() {
    var limitSelect = h('select', { id: 'audit-limit' }, [25, 50, 100, 200].map(function (value) {
      return h('option', { value: String(value), selected: value === 50, text: String(value) });
    }));
    var panel = h('div', {});
    var section = h('section', { class: 'section' });
    section.appendChild(sectionHead('Auditoría', 'Últimas acciones registradas por el panel.'));
    section.appendChild(h('div', { class: 'toolbar' }, [h('label', { class: 'inline-label', for: 'audit-limit', text: 'Mostrar' }), limitSelect]));
    section.appendChild(panel);
    limitSelect.addEventListener('change', function () { loadAudit(panel, Number(limitSelect.value)); });
    return loadAudit(panel, 50).then(function () { return section; });
  }

  function parseHash() {
    var raw = location.hash.replace(/^#\/?/, '');
    var parts = raw.split('/').filter(function (part) { return part !== ''; }).map(decodeURIComponent);
    return { name: parts[0] || 'status', parts: parts.slice(1) };
  }

  function renderSection(route) {
    if (route.name === 'catalog') return renderCatalog();
    if (route.name === 'competition') return renderCompetition(route.parts[0]);
    if (route.name === 'edition') return renderEdition(route.parts);
    if (route.name === 'releases') return renderReleases();
    if (route.name === 'audit') return renderAudit();
    return renderStatus();
  }

  function updateNav(name) {
    var active = name === 'competition' ? 'catalog' : name;
    var links = document.querySelectorAll('.menu a');
    Array.prototype.forEach.call(links, function (link) {
      var on = link.getAttribute('data-nav') === active;
      link.classList.toggle('active', on);
      if (on) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function renderRoute() {
    var route = parseHash();
    updateNav(route.name);
    var view = document.getElementById('view');
    var token = ++renderToken;
    view.replaceChildren(spinner('Cargando…'));
    renderSection(route).then(function (node) {
      if (token !== renderToken) return;
      view.replaceChildren(node);
      announce('Sección cargada');
    }).catch(function (error) {
      if (token !== renderToken) return;
      view.replaceChildren(errorBox(error));
    });
    window.scrollTo({ top: 0 });
  }

  function init() {
    checkToken();
    window.addEventListener('hashchange', renderRoute);
    if (!location.hash) history.replaceState(null, '', '#/status');
    renderRoute();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

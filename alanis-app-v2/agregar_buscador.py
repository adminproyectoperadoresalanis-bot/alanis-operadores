import re

# ---------- admin.html ----------
with open('admin.html', 'r', encoding='utf-8') as f:
    html = f.read()

anchor_html = '<div id="operadores-list"></div>'
buscador_input = ('<input type="text" id="buscar-operador" '
                   'placeholder="Buscar por nombre, correo o unidad..." '
                   'oninput="filtrarOperadores()" '
                   'style="width:100%;padding:10px 12px;font-size:14px;'
                   'border:0.5px solid var(--border-strong);border-radius:8px;'
                   'background:var(--bg-app);color:var(--text-primary);'
                   'margin-bottom:12px"/>\n    ')

if 'id="buscar-operador"' in html:
    print('admin.html: el buscador ya existe, no se modifico.')
elif anchor_html not in html:
    print('ERROR: no encontre <div id="operadores-list"></div> en admin.html. No se modifico nada.')
else:
    html = html.replace(anchor_html, buscador_input + anchor_html, 1)
    m = re.search(r'admin2\.js\?v=(\d+)', html)
    if m:
        old_v = int(m.group(1))
        new_v = old_v + 1
        html = html.replace('admin2.js?v=' + str(old_v), 'admin2.js?v=' + str(new_v))
        print('Version de admin2.js actualizada: v=' + str(old_v) + ' -> v=' + str(new_v))
    else:
        print('Aviso: no encontre el query ?v= de admin2.js en admin.html, revisa el cache-busting a mano.')
    with open('admin.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print('admin.html: buscador agregado.')

# ---------- js/admin2.js ----------
with open('js/admin2.js', 'r', encoding='utf-8') as f:
    js = f.read()

changed = False

if 'let operadoresCache' in js:
    print('admin2.js: operadoresCache ya existe, no se modifico esa parte.')
else:
    anchor1 = 'async function cargarOperadores() {'
    if anchor1 not in js:
        print('ERROR: no encontre cargarOperadores() en admin2.js.')
    else:
        js = js.replace(anchor1, 'let operadoresCache = [];\n\n' + anchor1, 1)
        changed = True
        print('admin2.js: variable operadoresCache agregada.')

if 'operadoresCache = lista;' in js:
    print('admin2.js: la linea operadoresCache = lista ya existe.')
else:
    anchor2 = '    renderOperadores(lista);'
    if anchor2 not in js:
        print('ERROR: no encontre "renderOperadores(lista);" en admin2.js.')
    else:
        js = js.replace(anchor2, '    operadoresCache = lista;\n' + anchor2, 1)
        changed = True
        print('admin2.js: guardado de operadoresCache dentro de cargarOperadores agregado.')

if 'function filtrarOperadores' in js:
    print('admin2.js: filtrarOperadores ya existe, no se agrego de nuevo.')
else:
    anchor3 = 'async function guardarDatosOperador(uid, unidadAnterior) {'
    if anchor3 not in js:
        print('ERROR: no encontre guardarDatosOperador en admin2.js.')
    else:
        nueva_funcion = """function filtrarOperadores() {
  const inputEl = document.getElementById('buscar-operador');
  const q = ((inputEl ? inputEl.value : '') || '').trim().toLowerCase();
  if (!q) { renderOperadores(operadoresCache); return; }
  const filtrada = operadoresCache.filter(function(o) {
    return (o.nombre || '').toLowerCase().indexOf(q) !== -1 ||
           (o.correo || '').toLowerCase().indexOf(q) !== -1 ||
           String(o.numero || '').toLowerCase().indexOf(q) !== -1;
  });
  renderOperadores(filtrada);
}

"""
        js = js.replace(anchor3, nueva_funcion + anchor3, 1)
        changed = True
        print('admin2.js: funcion filtrarOperadores agregada.')

if changed:
    with open('js/admin2.js', 'w', encoding='utf-8') as f:
        f.write(js)
    print('admin2.js: cambios guardados.')
else:
    print('admin2.js: no hubo cambios nuevos que guardar.')

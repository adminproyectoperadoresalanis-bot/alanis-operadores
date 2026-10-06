import re

with open('js/operador4.js', 'r', encoding='utf-8') as f:
    js = f.read()
with open('operador.html', 'r', encoding='utf-8') as f:
    html = f.read()

js_cambiado = False
html_cambiado = False

# ============================================================
# 1) js/operador4.js
# ============================================================
if 'docLeerFoto' in js:
    print('js/operador4.js: ya estaba actualizado (encontre "docLeerFoto"), no se toco.')
else:
    A1 = "{ fps: 10, qrbox: 250 },"
    N1 = "{ fps: 10 },"
    A2 = "docLectorQR = new window.Html5Qrcode('doc-qr-reader');"
    N2 = "docLectorQR = new window.Html5Qrcode('doc-qr-reader', docConfigLector());"
    A3 = re.compile(
        r"\)\.catch\(function\(\) \{\s*\n\s*estadoEl\.textContent = 'No se pudo acceder a la c\u00e1mara \(revisa permisos del navegador\)\.';\s*\n\s*\}\);")
    N3 = (").catch(function(err) {\n"
          "    console.warn('C\u00e1mara:', err);\n"
          "    estadoEl.textContent = docMensajeErrorCamara(err);\n"
          "  });")
    A4 = "async function docManejarLectura(datos) {"

    for nombre, ancla in (('qrbox', A1), ('constructor', A2), ('docManejarLectura', A4)):
        n = js.count(ancla)
        if n != 1:
            raise SystemExit('ERROR: esperaba encontrar 1 vez el texto de "' + nombre + '" en js/operador4.js y encontre ' + str(n) + '. No se modifico nada. Avisa a Claude.')
    if len(A3.findall(js)) != 1:
        raise SystemExit('ERROR: no encontre (o encontre mas de una vez) el bloque de error de camara en js/operador4.js. No se modifico nada. Avisa a Claude.')

    with open('new_qr_foto_block.js', 'r', encoding='utf-8') as f:
        bloque = f.read().rstrip('\n') + '\n\n'

    js = js.replace(A1, N1, 1)
    js = js.replace(A2, N2, 1)
    js = A3.sub(lambda m: N3, js, count=1)
    js = js.replace(A4, bloque + A4, 1)
    js_cambiado = True

# ============================================================
# 2) operador.html — boton de foto dentro del cuadro de captura
# ============================================================
if 'doc-foto-btn' in html:
    print('operador.html: ya estaba actualizado (encontre "doc-foto-btn"), no se toco el boton.')
else:
    A_HTML = re.compile(r'(id="doc-camara-estado"[^>]*>[^<]*</p>)')
    if len(A_HTML.findall(html)) != 1:
        raise SystemExit('ERROR: no encontre (o encontre mas de una vez) el parrafo doc-camara-estado en operador.html. No se modifico nada. Avisa a Claude.')
    SNIPPET = r'''
      <button type="button" class="btn-secondary" id="doc-foto-btn" style="width:100%;margin-top:10px" onclick="document.getElementById('doc-foto-input').click()">&#128247; &iquest;No lee? Toma o elige una foto del QR</button>
      <input type="file" id="doc-foto-input" accept="image/*" class="hidden" onchange="docLeerFoto(this)"/>'''
    html = A_HTML.sub(lambda m: m.group(1) + SNIPPET, html, count=1)
    html_cambiado = True

# ============================================================
# 3) cache-busting de operador4.js (solo si cambio algo)
# ============================================================
if js_cambiado or html_cambiado:
    m = re.search(r'operador4\.js(\?v=(\d+))?', html)
    if m:
        if m.group(2):
            old_v = int(m.group(2))
            html = html.replace('operador4.js?v=' + str(old_v), 'operador4.js?v=' + str(old_v + 1), 1)
            print('operador.html: version de operador4.js actualizada: v=' + str(old_v) + ' -> v=' + str(old_v + 1))
        else:
            html = html.replace('operador4.js', 'operador4.js?v=2', 1)
            print('operador.html: operador4.js ahora lleva ?v=2 (antes no llevaba version).')
        html_cambiado = True
    else:
        print('Aviso: no encontre operador4.js en operador.html, revisa el cache-busting a mano.')

if js_cambiado:
    with open('js/operador4.js', 'w', encoding='utf-8') as f:
        f.write(js)
    print('js/operador4.js: lector sin cuadro de 250 px, boton de foto y mensajes de camara agregados.')
if html_cambiado:
    with open('operador.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print('operador.html: boton de foto agregado.')

print('Listo.')

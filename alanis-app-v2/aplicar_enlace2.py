import re

def leer(ruta):
    with open(ruta, 'r', encoding='utf-8') as f:
        return f.read()

def escribir(ruta, txt):
    with open(ruta, 'w', encoding='utf-8') as f:
        f.write(txt)

def unico(txt, ancla, donde, nombre):
    n = txt.count(ancla)
    if n != 1:
        raise SystemExit('ERROR: esperaba encontrar 1 vez "' + nombre + '" en ' + donde + ' y encontre ' + str(n) + '. No se modifico NADA. Avisa a Claude.')

js   = leer('js/operador4.js')
html = leer('operador.html')
cambios = {}

if 'enlaceCheckpointFalta' in js:
    print('js/operador4.js: ya estaba actualizado, no se toco.')
else:
    A1 = "var enlaceCheckpointCodigo = null;"
    A2 = "    var c = p.get('enlace');\n    if (c) {"
    A3 = "function enlaceMostrar(estado, datos, err) {"
    A4 = "    document.getElementById('enlace-error-texto').textContent = datos;"
    A5 = "async function procesarEnlaceCheckpointPendiente() {\n  if (!enlaceCheckpointCodigo) return;"
    for nombre, ancla in (('var enlaceCheckpointCodigo', A1), ('captura de p.get(enlace)', A2), ('enlaceMostrar', A3), ('texto de error', A4), ('procesarEnlaceCheckpointPendiente', A5)):
        unico(js, ancla, 'js/operador4.js', nombre)
    js = js.replace(A1, "var enlaceCheckpointCodigo = null;\nvar enlaceCheckpointFalta = false;", 1)
    js = js.replace(A2, "    var c = p.get('enlace');\n    if (p.has('enlace') && !(c && c.trim())) { enlaceCheckpointFalta = true; }\n    if (c) {", 1)
    js = js.replace(A3, "function enlaceMostrar(estado, datos, err, motivo) {", 1)
    js = js.replace(A4, A4 + "\n"
        "    var mot = motivo || (err && err.details && err.details.motivo) || '';\n"
        "    var motEl = document.getElementById('enlace-error-motivo');\n"
        "    if (motEl) motEl.textContent = mot ? 'Motivo: ' + String(mot).replace(/_/g, ' ') : '';", 1)
    js = js.replace(A5, "async function procesarEnlaceCheckpointPendiente() {\n"
        "  if (enlaceCheckpointFalta) {\n"
        "    enlaceCheckpointFalta = false;\n"
        "    limpiarEnlacePendiente();\n"
        "    enlaceMostrar('error', 'El enlace llegó sin su código. Pide a Operaciones que te lo envíe de nuevo.', null, 'falta_codigo');\n"
        "    return;\n"
        "  }\n"
        "  if (!enlaceCheckpointCodigo) return;", 1)
    cambios['js/operador4.js'] = js

if 'enlace-error-motivo' in html:
    print('operador.html: ya estaba actualizado, no se toco.')
else:
    H1 = '<div id="enlace-error-texto" style="font-size:14px;margin-top:10px;line-height:1.5"></div>'
    unico(html, H1, 'operador.html', 'texto de error del modal')
    html = html.replace(H1, H1 + '\n      <div id="enlace-error-motivo" style="font-size:11px;color:var(--text-muted,#8a8070);margin-top:8px"></div>', 1)
    m = re.search(r'operador4\.js\?v=(\d+)', html)
    if m:
        html = html.replace(m.group(0), 'operador4.js?v=' + str(int(m.group(1)) + 1), 1)
        print('operador.html: operador4.js v=' + m.group(1) + ' -> v=' + str(int(m.group(1)) + 1))
    else:
        print('Aviso: no encontre operador4.js?v=N en operador.html, revisa el cache-busting a mano.')
    cambios['operador.html'] = html

for ruta, txt in cambios.items():
    escribir(ruta, txt)
    print('modificado: ' + ruta)
print('Listo.')

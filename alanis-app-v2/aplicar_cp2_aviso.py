#!/usr/bin/env python3
# Parche: aviso correcto cuando la pre-entrega (Checkpoint 2) ya fue registrada
# (incluye "validada por Operaciones") + bloqueo explicito de la bitacora en reglas.
# Idempotente: si algo no esta exactamente una vez, aborta SIN escribir nada.
import re, sys, os

RAIZ = sys.argv[1] if len(sys.argv) > 1 else '.'
JS = os.path.join(RAIZ, 'js', 'operador4.js')
HTML = os.path.join(RAIZ, 'operador.html')
REGLAS = os.path.join(RAIZ, 'firestore.rules')

def leer(p):
    with open(p, encoding='utf-8') as f:
        return f.read()

js = leer(JS); html = leer(HTML); reglas = leer(REGLAS)
cambios = []

# ---------- operador4.js ----------
if 'checkpoint2YaRegistrado' in js:
    print('operador4.js: ya aplicado, se omite')
else:
    A1 = 'let checkpoint2Habilitado = false;'
    A2 = "showToast('Primero completa el Checkpoint 1 de tu embarque asignado.', true);"
    A3 = 'actualizarDisponibilidadCheckpoint2(listos.length > 0);'
    for a in (A1, A2, A3):
        if js.count(a) != 1:
            sys.exit('ABORTADO: ancla no encontrada exactamente una vez en operador4.js: ' + a)
    bloque_decl = A1 + """
// Si la pre-entrega ya quedo registrada (por el operador o por Operaciones), se guarda aqui
let checkpoint2YaRegistrado = null;
function mostrarBloqueoCheckpoint2() {
  if (checkpoint2YaRegistrado) {
    var msg = checkpoint2YaRegistrado.remoto
      ? 'La pre-entrega de este embarque ya fue registrada (validada por Operaciones).'
      : 'La pre-entrega de este embarque ya fue registrada.';
    showToast(msg, false);
    return;
  }
  showToast('Primero completa el Checkpoint 1 de tu embarque asignado.', true);
}"""
    bloque_calc = A3 + """
      checkpoint2YaRegistrado = null;
      if (listos.length === 0) {
        const yaRegistrados = asignados.filter(function(e) {
          return e.recepcionOperador && e.recepcionOperador.resultado === 'COINCIDE'
            && (e.estatusValidacion === 'VALIDADO' || e.estatusValidacion === 'DISCREPANCIA');
        });
        if (yaRegistrados.length > 0) {
          const d = yaRegistrados[0].destinoEscaneo;
          checkpoint2YaRegistrado = { remoto: !!(d && d.metodo === 'remoto_operaciones') };
        }
      }"""
    js = js.replace(A2, 'mostrarBloqueoCheckpoint2();').replace(A1, bloque_decl).replace(A3, bloque_calc)
    cambios.append('operador4.js')

# ---------- operador.html (bump de cache) ----------
if 'js/operador4.js?v=17' in html:
    print('operador.html: ya en v=17, se omite')
else:
    if html.count('js/operador4.js?v=16') != 1:
        sys.exit('ABORTADO: operador4.js?v=16 no aparece exactamente una vez en operador.html')
    html = html.replace('js/operador4.js?v=16', 'js/operador4.js?v=17')
    cambios.append('operador.html')

# ---------- firestore.rules ----------
if 'bitacora_validaciones_remotas' in reglas:
    print('firestore.rules: ya tiene el bloqueo, se omite')
else:
    pat = re.compile(r'([ \t]*)match /enlaces_checkpoint/\{id\} \{[^{}]*\}')
    if len(pat.findall(reglas)) != 1:
        sys.exit('ABORTADO: bloque de enlaces_checkpoint no encontrado exactamente una vez en firestore.rules')
    mm = pat.search(reglas)
    sangria = mm.group(1)
    nuevo = (mm.group(0) + '\n\n' + sangria +
             '// Bitacora de validaciones hechas por Operaciones: solo escribe el servidor (Admin SDK)\n' + sangria +
             'match /bitacora_validaciones_remotas/{id} { allow read, write: if false; }')
    reglas = reglas[:mm.start()] + nuevo + reglas[mm.end():]
    cambios.append('firestore.rules')

for p, c in ((JS, js), (HTML, html), (REGLAS, reglas)):
    if os.path.basename(p) in cambios:
        with open(p, 'w', encoding='utf-8') as f:
            f.write(c)
print('Listo. Modificados:', ', '.join(cambios) if cambios else 'nada (todo ya estaba aplicado)')

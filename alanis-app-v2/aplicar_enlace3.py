def leer(ruta):
    with open(ruta, 'r', encoding='utf-8') as f:
        return f.read()

def escribir(ruta, txt):
    with open(ruta, 'w', encoding='utf-8') as f:
        f.write(txt)

def unico(txt, ancla, nombre):
    n = txt.count(ancla)
    if n != 1:
        raise SystemExit('ERROR: esperaba encontrar 1 vez "' + nombre + '" en functions/enlacesCheckpoint.js y encontre ' + str(n) + '. No se modifico NADA. Avisa a Claude.')

f = leer('functions/enlacesCheckpoint.js')
if 'quienEmitio' in f:
    print('functions/enlacesCheckpoint.js: ya estaba actualizado, no se toco.')
else:
    A1 = "            emitidoPor: enlace.emitidoPor || null,"
    A2 = "// Ejecuta una función y, si se rechaza con un motivo, lo deja en el log y en el"
    unico(f, A1, 'linea emitidoPor')
    unico(f, A2, 'comentario de conDiagnostico')
    HELPER = (
        "// Quién generó el enlace. Interno lo guarda como `creadoPor` {uid, nombre, correo,\n"
        "// proyecto}; el contrato original lo llamaba `emitidoPor`. Se acepta cualquiera.\n"
        "function quienEmitio(enlace) {\n"
        "  const p = enlace.emitidoPor || enlace.creadoPor;\n"
        "  if (!p || typeof p !== \"object\") return null;\n"
        "  return { uid: p.uid || null, nombre: p.nombre || null, correo: p.correo || null };\n"
        "}\n\n")
    f = f.replace(A1, "            emitidoPor: quienEmitio(enlace),", 1)
    f = f.replace(A2, HELPER + A2, 1)
    escribir('functions/enlacesCheckpoint.js', f)
    print('modificado: functions/enlacesCheckpoint.js')
print('Listo.')

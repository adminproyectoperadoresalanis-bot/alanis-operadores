// ============================================================
// AUTOTRANSPORTES ALANÍS — Script de configuración inicial
// ============================================================
// Ejecuta este archivo UNA SOLA VEZ desde la consola de Firebase
// o desde un entorno Node.js con el SDK de Admin de Firebase.
//
// INSTRUCCIONES:
// 1. Ve a Firebase Console > Firestore Database > Reglas
// 2. Pega las reglas de seguridad de este archivo
// 3. Para crear el primer admin, usa Firebase Authentication
//    manualmente y luego crea el documento en Firestore.
// ============================================================

/*
══════════════════════════════════════════════════════════
  REGLAS DE SEGURIDAD FIRESTORE
  Copia y pega en: Firebase Console > Firestore > Reglas
══════════════════════════════════════════════════════════

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Usuarios: solo el propio usuario y admins
    match /usuarios/{uid} {
      allow read:  if request.auth.uid == uid || isAdmin();
      allow write: if isAdmin();
    }

    // Reportes: operador puede crear/leer los suyos; admin ve todos
    match /reportes/{id} {
      allow create: if request.auth != null
                    && request.resource.data.uid == request.auth.uid;
      allow read:   if request.auth.uid == resource.data.uid || isAdmin();
      allow list:   if isAdmin();
    }

    // Órdenes de trabajo: igual que reportes
    match /ordenes_trabajo/{id} {
      allow create: if request.auth != null
                    && request.resource.data.uid == request.auth.uid;
      allow read:   if request.auth.uid == resource.data.uid || isAdmin();
      allow update: if isAdmin();
      allow list:   if isAdmin();
    }

    function isAdmin() {
      return request.auth != null &&
        get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data.rol
          in ['admin', 'supervisor'];
    }
  }
}
*/

// ══════════════════════════════════════════════════════════
//  ESTRUCTURA DE DOCUMENTOS EN FIRESTORE
// ══════════════════════════════════════════════════════════

/*
Colección: usuarios
Documento (id = UID de Firebase Auth):
{
  nombre:   "Juan Reyes",
  numero:   "OP-1021",        // Número económico / operador
  correo:   "jreyes@alanis.com",
  rol:      "operador",       // "operador" | "supervisor" | "admin"
  activo:   true,
  creado:   Timestamp
}

Colección: reportes
Documento (auto-id):
{
  uid:       "firebase-uid",
  operador:  "Juan Reyes",
  numero:    "OP-1021",
  estatus:   "disponible",    // disponible | taller | enfermo | permiso | incapacitado
  fecha:     "2025-01-15",    // YYYY-MM-DD
  timestamp: Timestamp
}

Colección: ordenes_trabajo
Documento (auto-id):
{
  uid:       "firebase-uid",
  operador:  "Juan Reyes",
  numero:    "OP-1021",
  unidad:    "T-142",
  folio:     "OT-14523",
  fallas:    [ { id:1, cat:"...", name:"...", sev:"alta" }, ... ],
  estado:    "pendiente",     // pendiente | en_proceso | resuelto
  fecha:     "2025-01-15",
  timestamp: Timestamp
}
*/

// ══════════════════════════════════════════════════════════
//  CÓMO CREAR EL PRIMER USUARIO ADMIN
// ══════════════════════════════════════════════════════════
/*
1. Ve a Firebase Console > Authentication > Users > Add user
2. Ingresa: correo y contraseña del admin
3. Copia el UID generado
4. Ve a Firestore > usuarios > Add document
5. Usa el UID como ID del documento
6. Agrega los campos:
   nombre:  "Administrador Alanís"
   correo:  "admin@alanis.com"
   numero:  "ADMIN"
   rol:     "admin"
   activo:  true

Para crear operadores puedes usar el mismo proceso o
implementar un panel de alta de usuarios (próxima fase).
*/

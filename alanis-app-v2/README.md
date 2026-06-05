# AUTOTRANSPORTES ALANÍS — Sistema de Control de Operadores
## Guía de instalación — Autenticación con Google

---

## 📁 Archivos del proyecto

```
alanis-app/
├── index.html          ← Pantalla de login (botón de Google)
├── operador.html       ← Reporte + Orden de trabajo + Historial
├── admin.html          ← Dashboard admin
├── firebase-config.js  ← ⚠️ CONFIGURA ESTO PRIMERO
├── manifest.json       ← Configuración PWA
├── css/main.css        ← Estilos
├── js/
│   ├── auth.js         ← Login con Google
│   ├── data.js         ← Catálogo de 58 fallas
│   ├── operador.js     ← Lógica operador
│   └── admin.js        ← Lógica admin
└── img/logo.webp       ← Logo Alanís
```

---

## 🚀 PASO 1 — Crear proyecto Firebase

1. Ve a **https://console.firebase.google.com**
2. Clic **"Crear un proyecto"** → nombre: `alanis-operadores`
3. Desactiva Google Analytics → **Crear proyecto**

---

## 🔑 PASO 2 — Activar Google como método de login

1. Menú izquierdo → **Authentication** → **Comenzar**
2. Pestaña **"Sign-in method"**
3. Clic en **"Google"** → Activar switch → selecciona tu correo de soporte → **Guardar**

---

## 🗄️ PASO 3 — Crear base de datos Firestore

1. Menú izquierdo → **Firestore Database** → **Crear base de datos**
2. Selecciona **"Comenzar en modo de producción"**
3. Región: `us-central` → **Listo**
4. Pestaña **"Reglas"** → pega esto y haz clic en **Publicar**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /usuarios/{uid} {
      allow read:  if request.auth.uid == uid || isAdmin();
      allow write: if isAdmin();
    }

    match /reportes/{id} {
      allow create: if request.auth != null
                    && request.resource.data.uid == request.auth.uid;
      allow read:   if request.auth.uid == resource.data.uid || isAdmin();
      allow list:   if isAdmin();
    }

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
```

---

## ⚙️ PASO 4 — Obtener credenciales de Firebase

1. Clic en el ícono ⚙️ (Configuración del proyecto) en el menú
2. Baja a **"Tus apps"** → clic en **`</>`** (Web)
3. Nombre: `alanis-web` → **Registrar app**
4. Copia el bloque `firebaseConfig` que aparece
5. Abre `firebase-config.js` y reemplaza los valores:

```javascript
const firebaseConfig = {
  apiKey:            "AIza...",        // ← tu valor
  authDomain:        "alanis-operadores.firebaseapp.com",
  projectId:         "alanis-operadores",
  storageBucket:     "alanis-operadores.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123:web:abc"
};
```

---

## 👤 PASO 5 — Crear el primer administrador

1. **Authentication** → **Agregar usuario**
   - Correo: tu correo Gmail personal (ej. `tunombre@gmail.com`)
   - Contraseña: cualquiera (no se usará, el login es con Google)
   - Copia el **UID** que aparece

2. **Firestore** → **usuarios** → **Agregar documento**
   - ID del documento: pega el UID
   - Campos:
     ```
     nombre  → Tu Nombre Completo
     correo  → tuname@gmail.com
     numero  → ADMIN
     rol     → admin
     activo  → true (boolean)
     ```

---

## 👷 PASO 6 — Dar de alta operadores

Por cada operador necesitas:

### 6a. Agregar en Authentication
- **Authentication** → **Agregar usuario**
- Correo: el Gmail del operador (ej. `juan.reyes@gmail.com`)
- Contraseña: cualquiera (no importa, login es con Google)
- **Copiar el UID**

### 6b. Crear documento en Firestore
- **Firestore** → **usuarios** → **Agregar documento**
- ID del documento: el UID del paso anterior
- Campos:
  ```
  nombre  → Juan Reyes
  correo  → juan.reyes@gmail.com
  numero  → OP-1021
  rol     → operador
  activo  → true (boolean)
  ```

> ✅ Cuando el operador abra la app y toque "Entrar con Google"
> con su cuenta registrada, entrará automáticamente.
> Si usa un correo que NO está registrado, verá un mensaje de acceso denegado.

---

## 🌐 PASO 7 — Publicar en Firebase Hosting

1. Instala Node.js desde **https://nodejs.org** (versión LTS)
2. Abre **Símbolo del sistema** (CMD) en la carpeta del proyecto
3. Ejecuta uno por uno:

```
npm install -g firebase-tools
firebase login
firebase init hosting
```

Cuando pregunte:
- **"What do you want to use as your public directory?"** → escribe `.` y Enter
- **"Configure as single-page app?"** → escribe `N` y Enter
- **"Set up automatic builds with GitHub?"** → escribe `N` y Enter

4. Finalmente:
```
firebase deploy
```

Tu app quedará en: **`https://alanis-operadores.web.app`** 🎉

---

## 🔐 PASO 8 — Autorizar el dominio en Firebase

> ⚠️ Este paso es importante para que el login con Google funcione en producción.

1. Firebase Console → **Authentication** → **Settings**
2. Pestaña **"Authorized domains"**
3. Verifica que `alanis-operadores.web.app` aparezca en la lista
4. Si no aparece: clic **"Add domain"** y agrégalo

---

## 📱 PASO 9 — Instalar como app en el celular

**Android (Chrome):**
1. Abrir `https://alanis-operadores.web.app` en Chrome
2. Menú (⋮) → **"Agregar a pantalla de inicio"**

**iPhone (Safari):**
1. Abrir la URL en Safari
2. Botón compartir → **"Agregar a pantalla de inicio"**

---

## ✅ Flujo completo del operador

1. Abre la app → toca **"Entrar con Google"**
2. Selecciona su cuenta Gmail registrada
3. Entra directo a su pantalla de reporte diario
4. Selecciona estatus → **Enviar reporte**
5. Si tiene fallas en su unidad → tab **Orden de trabajo** → selecciona fallas → **Crear OT**

## ✅ Flujo del administrador

1. Entra con su Gmail de admin
2. Ve el dashboard con contadores en tiempo real
3. Gestiona OTs: marca en proceso / resuelta
4. Exporta reportes del día a CSV/Excel

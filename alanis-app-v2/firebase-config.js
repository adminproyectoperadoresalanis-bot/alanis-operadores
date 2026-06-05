// ============================================================
// AUTOTRANSPORTES ALANÍS — Configuración Firebase
// ============================================================
// INSTRUCCIONES:
// 1. Ve a https://console.firebase.google.com
// 2. Crea un proyecto llamado "alanis-operadores"
// 3. Ve a Configuración del proyecto > Tus apps > Web
// 4. Copia los valores y pégalos aquí abajo
// ============================================================

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB_RYaPCxQYmb9J3at8R510el7wRU6uxMY",
  authDomain: "alanis-operadores.firebaseapp.com",
  projectId: "alanis-operadores",
  storageBucket: "alanis-operadores.firebasestorage.app",
  messagingSenderId: "917596488564",
  appId: "1:917596488564:web:41c77776ffa67929ac2221"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

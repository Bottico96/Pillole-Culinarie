import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyA9aWu4aWuOgx5QVPZUUvOFHPRxv3KxmQc",
  authDomain: "pillola-culinarie.firebaseapp.com",
  projectId: "pillola-culinarie",
  storageBucket: "pillola-culinarie.firebasestorage.app",
  messagingSenderId: "158692115073",
  appId: "1:158692115073:web:746eedb1581c03cbe24380"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export default app

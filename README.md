# Pillole Culinarie — Gestione Interna

## Setup iniziale (una volta sola)

### 1. Apri il Terminale e vai nella cartella del progetto
```bash
cd Desktop/pillole-culinarie
```

### 2. Installa le dipendenze
```bash
npm install
```
Aspetta che finisca (1-2 minuti). Vedrà scaricare molti pacchetti.

### 3. Avvia in sviluppo
```bash
npm run dev
```
Apri il browser su **http://localhost:5173**

---

## Creare il primo utente (admin)

1. Vai su **console.firebase.google.com**
2. Apri il progetto **pillola-culinarie**
3. Clicca **Authentication** → **Utenti** → **Aggiungi utente**
4. Inserisci email e password per ogni membro del team
5. Ogni persona usa quelle credenziali per accedere

---

## Deploy su Firebase Hosting

### Prima volta: installa Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

### Ogni volta che vuoi aggiornare il sito:
```bash
npm run build
firebase deploy
```
Il sito sarà live su: **https://pillola-culinarie.web.app**

---

## Struttura del progetto
```
src/
  components/
    layout/     → Sidebar, Header
    views/      → Dashboard, Calendario, CashFlow, Progetti...
    ui/         → componenti riutilizzabili (Modal, Badge, Table...)
  hooks/
    useAuth.jsx → login/logout/stato utente
    useData.js  → dati Firestore in tempo reale
  lib/
    firebase.js → configurazione Firebase
    db.js       → operazioni database
    calc.js     → calcoli finanziari (fatturato, margini, IVA...)
```

---

## Fase attuale: 2 di 5
- ✅ Fase 1 — Setup e struttura
- ✅ Fase 2 — Autenticazione
- ✅ Fase 3 — Database e dati
- 🔄 Fase 4 — Interfaccia completa (prossima)
- ⏳ Fase 5 — Deploy finale

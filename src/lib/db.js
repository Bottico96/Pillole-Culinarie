import {
  collection, doc, getDocs, getDoc,
  setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, writeBatch, serverTimestamp,
  query, orderBy
} from 'firebase/firestore'
import { db } from './firebase'

// ── Collection references ──────────────────────────────────────
export const cols = {
  progetti:       () => collection(db, 'progetti'),
  professionisti: () => collection(db, 'professionisti'),
  costiFissi:     () => collection(db, 'costiFissi'),
  businessUnit:   () => collection(db, 'businessUnit'),
  rimborsi:       () => collection(db, 'rimborsi'),
  movimentiCassa: () => collection(db, 'movimentiCassa'),
  fattureEmesse:  () => collection(db, 'fattureEmesse'),
  fattureRicevute:() => collection(db, 'fattureRicevute'),
  impostazioni:   () => collection(db, 'impostazioni'),
  clienti:        () => collection(db, 'clienti'),
  servizi:        () => collection(db, 'servizi'),
  preventivi:     () => collection(db, 'preventivi'),
}

// ── Generic helpers ────────────────────────────────────────────
export async function getAll(colFn) {
  const snap = await getDocs(colFn())
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function addItem(colFn, data) {
  const ref = await addDoc(colFn(), { ...data, createdAt: serverTimestamp() })
  return ref.id
}

export async function updateItem(colFn, id, data) {
  await updateDoc(doc(db, colFn().path, id), { ...data, updatedAt: serverTimestamp() })
}

export async function deleteItem(colFn, id) {
  await deleteDoc(doc(db, colFn().path, id))
}

export function subscribeAll(colFn, callback) {
  return onSnapshot(query(colFn(), orderBy('createdAt', 'asc')), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

// ── Impostazioni (dateOverride, etc.) ─────────────────────────
export async function getImpostazione(key) {
  const snap = await getDoc(doc(db, 'impostazioni', key))
  return snap.exists() ? snap.data() : null
}

export async function setImpostazione(key, data) {
  await setDoc(doc(db, 'impostazioni', key), { ...data, updatedAt: serverTimestamp() })
}

// ── Accetta preventivo → crea progetto + fatture budget ───────
export async function accettaPreventivo(preventivo, datiAccettazione) {
  const {
    // dati cliente
    clienteId, clienteNome,
    // dati contratto
    tipoContratto,    // 'ricorrente' | 'spot'
    meseInizio,       // 1-12
    annoInizio,       // es. 2026
    durata,           // mesi (se ricorrente)
    modalitaFatturazione, // 'anticipata' | 'consuntivo' | 'rate'
    // righe costi con professionista assegnato
    righeConProfessionista, // [{...riga, professionistaId, professionistaNome}]
  } = datiAccettazione

  const { prezzoNetto, costoTot } = prevComputeSimple(preventivo, righeConProfessionista)
  const importoMensile = tipoContratto === 'ricorrente' ? (prezzoNetto / (durata || 1)) : prezzoNetto
  const batch = writeBatch(db)

  // 1. Crea progetto
  const progettoRef = doc(collection(db, 'progetti'))
  const costiProgetto = (righeConProfessionista || []).map(r => ({
    profId: r.professionistaId || '',
    importo: tipoContratto === 'ricorrente'
      ? (parseFloat(r.costoNetto) || 0)
      : (parseFloat(r.costoNetto) || 0),
    iva: 22,
    tipo: tipoContratto === 'ricorrente' ? 'mensile' : 'unatantum',
    mese: tipoContratto === 'spot' ? meseInizio : 1,
    anno: annoInizio,
    buId: '',
    bdg_cons: 'bdg',
  }))

  batch.set(progettoRef, {
    nome: preventivo.progetto || '',
    cliente: clienteNome || '',
    clienteId: clienteId || '',
    tipo: tipoContratto === 'ricorrente' ? 'ricorrente' : 'spot',
    importo: importoMensile,
    meseInizio: meseInizio,
    annoInizio: annoInizio,
    durata: tipoContratto === 'ricorrente' ? (durata || 12) : 1,
    scadenze: tipoContratto === 'spot' ? [{ desc: preventivo.progetto, importo: prezzoNetto, data: `${annoInizio}-${String(meseInizio).padStart(2,'0')}-01` }] : [],
    costi: costiProgetto,
    buSplit: [],
    mesiConsuntivati: [],
    preventivoId: preventivo._fsId || preventivo.id || '',
    modalitaFatturazione,
    createdAt: serverTimestamp(),
  })

  // 2. Fatture emesse (ricavi da cliente) - budget
  if (tipoContratto === 'ricorrente') {
    for (let i = 0; i < (durata || 1); i++) {
      const m = ((meseInizio - 1 + i) % 12) + 1
      const a = annoInizio + Math.floor((meseInizio - 1 + i) / 12)
      const fattRef = doc(collection(db, 'fattureEmesse'))
      batch.set(fattRef, {
        progettoId: progettoRef.id,
        progettoNome: preventivo.progetto || '',
        clienteId,
        clienteNome,
        importo: importoMensile,
        iva: 22,
        mese: m,
        anno: a,
        bdg_cons: 'bdg',
        stato: 'da_emettere',
        createdAt: serverTimestamp(),
      })
    }
  } else {
    const fattRef = doc(collection(db, 'fattureEmesse'))
    batch.set(fattRef, {
      progettoId: progettoRef.id,
      progettoNome: preventivo.progetto || '',
      clienteId,
      clienteNome,
      importo: prezzoNetto,
      iva: 22,
      mese: meseInizio,
      anno: annoInizio,
      bdg_cons: 'bdg',
      stato: 'da_emettere',
      createdAt: serverTimestamp(),
    })
  }

  // 3. Fatture ricevute (costi professionisti) - budget
  for (const r of (righeConProfessionista || [])) {
    if (!r.professionistaId || !r.costoNetto) continue
    const costoLordo = (parseFloat(r.costoNetto) || 0) * 1.04 + 2
    if (tipoContratto === 'ricorrente') {
      for (let i = 0; i < (durata || 1); i++) {
        const m = ((meseInizio - 1 + i) % 12) + 1
        const a = annoInizio + Math.floor((meseInizio - 1 + i) / 12)
        const ref = doc(collection(db, 'fattureRicevute'))
        batch.set(ref, {
          progettoId: progettoRef.id,
          progettoNome: preventivo.progetto || '',
          professionistaId: r.professionistaId,
          professionistaNome: r.professionistaNome || '',
          servizio: r.servizio || '',
          importo: parseFloat(r.costoNetto) || 0,
          costoLordo,
          iva: 4,
          mese: m,
          anno: a,
          bdg_cons: 'bdg',
          stato: 'da_ricevere',
          createdAt: serverTimestamp(),
        })
      }
    } else {
      const ref = doc(collection(db, 'fattureRicevute'))
      batch.set(ref, {
        progettoId: progettoRef.id,
        progettoNome: preventivo.progetto || '',
        professionistaId: r.professionistaId,
        professionistaNome: r.professionistaNome || '',
        servizio: r.servizio || '',
        importo: parseFloat(r.costoNetto) || 0,
        costoLordo,
        iva: 4,
        mese: meseInizio,
        anno: annoInizio,
        bdg_cons: 'bdg',
        stato: 'da_ricevere',
        createdAt: serverTimestamp(),
      })
    }
  }

  // 4. Aggiorna stato preventivo
  const prevRef = doc(db, 'preventivi', preventivo._fsId || preventivo.id)
  batch.update(prevRef, {
    stato: 'Contrattualizzato',
    accettato: 'Si',
    progettoId: progettoRef.id,
    updatedAt: serverTimestamp(),
  })

  await batch.commit()
  return progettoRef.id
}

function prevComputeSimple(p, righe) {
  const r = righe || p.righe || []
  let costoTot = 0
  r.forEach(riga => {
    const cn = parseFloat(riga.costoNetto) || 0
    const imposte = cn * 0.04 + 2
    costoTot += (cn + imposte) * (parseFloat(riga.output) || 1)
  })
  const molt = parseFloat(p.moltiplicatore) || 0.63
  const prezzoAuto = molt > 0 ? costoTot / molt : 0
  const prezzoNetto = parseFloat(p.prezzoOverride) > 0 ? parseFloat(p.prezzoOverride) : prezzoAuto
  return { costoTot, prezzoNetto }
}

// ── Batch import from old HTML localStorage data ──────────────
export async function importaBatch(colName, items) {
  const batch = writeBatch(db)
  items.forEach(item => {
    const { id: oldId, ...rest } = item
    const ref = doc(collection(db, colName))
    batch.set(ref, { ...rest, _oldId: oldId, createdAt: serverTimestamp() })
  })
  await batch.commit()
}

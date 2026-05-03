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

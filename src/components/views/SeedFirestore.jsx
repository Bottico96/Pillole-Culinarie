import { useState } from 'react'
import { collection, doc, writeBatch, serverTimestamp, getDocs } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { SEED_CLIENTS, SEED_SUPPLIERS, SEED_SERVICES } from '../../lib/seedData'

async function clearAndSeed(colName, items, keyMap) {
  // Clear
  const snap = await getDocs(collection(db, colName))
  let batch = writeBatch(db)
  let count = 0
  for (const d of snap.docs) {
    batch.delete(d.ref)
    count++
    if (count === 499) { await batch.commit(); batch = writeBatch(db); count = 0 }
  }
  if (count > 0) await batch.commit()

  // Seed
  batch = writeBatch(db)
  count = 0
  for (const item of items) {
    const mapped = keyMap(item)
    const ref = doc(collection(db, colName))
    batch.set(ref, { ...mapped, seededAt: serverTimestamp() })
    count++
    if (count === 499) { await batch.commit(); batch = writeBatch(db); count = 0 }
  }
  if (count > 0) await batch.commit()
  return items.length
}

export default function SeedFirestore() {
  const [status, setStatus] = useState(null)
  const [log, setLog] = useState([])
  const [done, setDone] = useState(false)

  async function handleSeed() {
    if (!window.confirm('Questo caricherà 20 clienti, 16 fornitori e 169 servizi su Firestore. I dati esistenti nelle stesse collezioni verranno sovrascritti. Continuare?')) return
    setStatus('loading')
    setLog([])
    const newLog = []

    try {
      const nc = await clearAndSeed('clienti', SEED_CLIENTS, c => ({
        excelId: c.id,
        nome: c.nome,
        settore: c.settore || '',
        email: c.email || '',
        telefono: c.telefono || '',
      }))
      newLog.push(`✓ ${nc} clienti caricati`)
      setLog([...newLog])

      const ns = await clearAndSeed('professionisti', SEED_SUPPLIERS, s => ({
        excelId: s.id,
        nome: s.nome,
        ruolo: s.ruolo || 'Operatore',
        email: s.email || '',
        riferimento: s.riferimento || '',
      }))
      newLog.push(`✓ ${ns} professionisti caricati`)
      setLog([...newLog])

      const nsrv = await clearAndSeed('servizi', SEED_SERVICES, s => ({
        excelId: s.id,
        nome: s.nome,
        macroArea: s.macro || '',
        centroCosto: s.centro_costo || '',
        ruoloOperatore: s.ruolo || '',
        costoNetto: s.costo_netto || 0,
        prezzoBase: s.prezzo_base || 0,
      }))
      newLog.push(`✓ ${nsrv} servizi caricati`)
      setLog([...newLog])

      setStatus('success')
      setDone(true)
    } catch (err) {
      newLog.push(`✗ Errore: ${err.message}`)
      setLog([...newLog])
      setStatus('error')
    }
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1>Carica Dati Base</h1>
          <p className="view-subtitle">Carica clienti, professionisti e listino servizi direttamente dall'archivio interno</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Dati disponibili</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'Clienti', count: SEED_CLIENTS.length, desc: 'ADG, Pinocchio, Love & Passion…' },
            { label: 'Professionisti', count: SEED_SUPPLIERS.length, desc: 'Colombo, Pollato, Bezzola…' },
            { label: 'Servizi listino', count: SEED_SERVICES.length, desc: 'Grafica, Video, Foto, Social, IT…' },
          ].map(({ label, count, desc }) => (
            <div key={label} style={{ background: 'var(--cream-d)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-head)' }}>{count}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{desc}</div>
            </div>
          ))}
        </div>

        {!done ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
              ⚠️ Questo <strong>sovrascrive</strong> clienti, professionisti e servizi esistenti su Firestore.
              Usalo solo la prima volta o per ripristinare i dati base.
            </p>
            <button
              className="btn btn-primary"
              onClick={handleSeed}
              disabled={status === 'loading'}
              style={{ fontSize: 15, padding: '12px 28px' }}
            >
              {status === 'loading' ? '⏳ Caricamento in corso…' : '🚀 Carica tutti i dati su Firestore'}
            </button>
          </>
        ) : null}
      </div>

      {log.length > 0 && (
        <div className="card" style={{
          background: status === 'success' ? '#f0faf4' : '#fff5f5',
          border: `1px solid ${status === 'success' ? '#a3d9b1' : '#f5c6cb'}`
        }}>
          <h2 style={{ marginBottom: 12 }}>Risultato</h2>
          {log.map((l, i) => (
            <div key={i} style={{ fontSize: 14, padding: '4px 0', fontWeight: 500 }}>{l}</div>
          ))}
          {status === 'success' && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--white)', borderRadius: 8, border: '1px solid var(--line)' }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>✅ Dati caricati. Ora puoi:</p>
              <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                • Andare su <strong>Clienti</strong> per vedere i 20 clienti<br/>
                • Andare su <strong>Preventivi</strong> e creare un nuovo preventivo<br/>
                • Usare <strong>Importa Excel</strong> per aggiornare con i dati più recenti del file del collega
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { collection, doc, writeBatch, serverTimestamp, getDocs, deleteDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'

/* ── helpers ─────────────────────────────────────────────────── */
function cellVal(v) {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).trim()
}
function cellNum(v) {
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

/* ── parser fogli ────────────────────────────────────────────── */
function parseAnagrafiche(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const clienti = [], professionisti = []
  let mode = null

  for (const row of rows) {
    const first = cellVal(row[0])
    if (first === 'ID Cliente' && cellVal(row[2]) === 'Tipo') { mode = 'header'; continue }
    if (!first || first.startsWith('ID Cliente')) { mode = first === 'ID Cliente' ? 'header' : mode; continue }

    if (first.startsWith('CLI')) {
      clienti.push({
        excelId: first,
        nome: cellVal(row[1]),
        settore: cellVal(row[5]),
        email: cellVal(row[6]),
        telefono: cellVal(row[7]),
        projectManager: cellVal(row[4]),
      })
    } else if (first.startsWith('FOR')) {
      professionisti.push({
        excelId: first,
        nome: cellVal(row[1]),
        ruolo: cellVal(row[5]) || 'Operatore',
        email: cellVal(row[6]),
        riferimento: cellVal(row[4]),
      })
    }
  }
  return { clienti, professionisti }
}

function parseListino(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const servizi = []
  for (const row of rows) {
    const first = cellVal(row[0])
    if (!first.startsWith('SRV')) continue
    servizi.push({
      excelId: first,
      nome: cellVal(row[1]),
      macroArea: cellVal(row[2]),
      centroCosto: cellVal(row[3]),
      ruoloOperatore: cellVal(row[4]),
      costoNetto: cellNum(row[5]),
      prezzoBase: cellNum(row[6]),
    })
  }
  return servizi
}

function parseStorico(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false })
  // Trova header row (riga con "N. Preventivo")
  let headerIdx = -1
  for (let i = 0; i < rows.length; i++) {
    if (cellVal(rows[i][0]) === 'N. Preventivo') { headerIdx = i; break }
  }
  if (headerIdx < 0) return []

  const prevMap = {}
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const prevId = cellVal(row[0])
    if (!prevId || !prevId.startsWith('PREV')) continue

    if (!prevMap[prevId]) {
      // clienteNome può essere formula - prendi il valore come stringa
      const clienteNome = cellVal(row[4])
      const clienteNomePulito = clienteNome.startsWith('=') ? cellVal(row[3]) : clienteNome
      prevMap[prevId] = {
        excelId: prevId,
        progetto: cellVal(row[1]),
        data: cellVal(row[2]),
        clienteId: cellVal(row[3]),
        clienteNome: clienteNomePulito,
        stato: cellVal(row[5]),
        accettato: cellVal(row[6]),
        scadenza: cellVal(row[7]),
        moltiplicatore: cellNum(row[25]) || 0.63,
        note: cellVal(row[32]),
        righe: [],
      }
    }

    const servizioId = cellVal(row[8])
    const servizio = cellVal(row[10])
    if (servizio) {
      prevMap[prevId].righe.push({
        servizioId,
        centroCosto: cellVal(row[9]),
        servizio,
        operatore: cellVal(row[12]),
        tipologia: cellVal(row[14]) || 'Costo Variabile',
        costoNetto: cellNum(row[15]),
        output: cellNum(row[19]) || 1,
        mesi: cellNum(row[21]) || 1,
      })
    }
  }
  return Object.values(prevMap)
}

/* ── batch write su Firestore ─────────────────────────────────── */
async function clearCollection(colName) {
  const snap = await getDocs(collection(db, colName))
  const batches = []
  let batch = writeBatch(db)
  let count = 0
  for (const d of snap.docs) {
    batch.delete(d.ref)
    count++
    if (count === 499) { batches.push(batch.commit()); batch = writeBatch(db); count = 0 }
  }
  if (count > 0) batches.push(batch.commit())
  await Promise.all(batches)
}

async function batchWrite(colName, items) {
  const batches = []
  let batch = writeBatch(db)
  let count = 0
  for (const item of items) {
    const ref = doc(collection(db, colName))
    batch.set(ref, { ...item, createdAt: serverTimestamp(), importedAt: serverTimestamp() })
    count++
    if (count === 499) { batches.push(batch.commit()); batch = writeBatch(db); count = 0 }
  }
  if (count > 0) batches.push(batch.commit())
  await Promise.all(batches)
}

/* ── componente ──────────────────────────────────────────────── */
export default function Importazione() {
  const fileRef = useRef()
  const [preview, setPreview] = useState(null)   // dati parsati prima dell'import
  const [status, setStatus] = useState(null)      // 'loading' | 'success' | 'error'
  const [log, setLog] = useState([])
  const [options, setOptions] = useState({
    clienti: true,
    professionisti: true,
    servizi: true,
    preventivi: true,
  })

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setStatus('loading')
    setLog([`📂 Lettura file: ${file.name} (${(file.size / 1024).toFixed(0)} KB)…`])
    setPreview(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: true, cellText: false })
        const sheets = wb.SheetNames
        setLog([`✓ File letto. Fogli trovati: ${sheets.join(', ')}`])

        if (!wb.Sheets['ANAGRAFICHE']) throw new Error('Foglio ANAGRAFICHE non trovato. Fogli presenti: ' + sheets.join(', '))
        if (!wb.Sheets['LISTINO_PREZZI']) throw new Error('Foglio LISTINO_PREZZI non trovato')
        if (!wb.Sheets['STORICO']) throw new Error('Foglio STORICO non trovato')

        const { clienti, professionisti } = parseAnagrafiche(wb.Sheets['ANAGRAFICHE'])
        const servizi = parseListino(wb.Sheets['LISTINO_PREZZI'])
        const preventivi = parseStorico(wb.Sheets['STORICO'])

        setPreview({ clienti, professionisti, servizi, preventivi })
        setStatus(null)
        setLog([`✓ File analizzato correttamente`])
      } catch (err) {
        setStatus('error')
        setLog([`✗ Errore lettura file: ${err.message}`])
      }
    }
    reader.onerror = () => {
      setStatus('error')
      setLog([`✗ Impossibile leggere il file. Assicurati che sia completamente scaricato da iCloud prima di importarlo.`])
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleImport() {
    if (!preview) return
    setStatus('loading')
    const newLog = []

    try {
      if (options.clienti) {
        await clearCollection('clienti')
        await batchWrite('clienti', preview.clienti)
        newLog.push(`✓ ${preview.clienti.length} clienti importati`)
      }
      if (options.professionisti) {
        await clearCollection('professionisti')
        await batchWrite('professionisti', preview.professionisti)
        newLog.push(`✓ ${preview.professionisti.length} professionisti importati`)
      }
      if (options.servizi) {
        await clearCollection('servizi')
        await batchWrite('servizi', preview.servizi)
        newLog.push(`✓ ${preview.servizi.length} servizi importati`)
      }
      if (options.preventivi) {
        await clearCollection('preventivi')
        await batchWrite('preventivi', preview.preventivi)
        newLog.push(`✓ ${preview.preventivi.length} preventivi importati`)
      }

      setLog(newLog)
      setStatus('success')
      setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setLog([...newLog, `✗ Errore durante import: ${err.message}`])
      setStatus('error')
    }
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1>Importa Excel</h1>
          <p className="view-subtitle">
            Sincronizza clienti, professionisti, listino e preventivi dal file Excel del collega
          </p>
        </div>
      </div>

      {/* Upload area */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 8 }}>1 · Seleziona il file</h2>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
          Trascina o seleziona il file <strong>Gestionale_Commerciale_*.xlsx</strong>.
          Verranno letti i fogli: ANAGRAFICHE, LISTINO_PREZZI, STORICO.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFile}
          style={{ display: 'none' }}
          id="excel-input"
        />
        <label
          htmlFor="excel-input"
          className="btn btn-primary"
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          ⬆ Scegli file Excel
        </label>
      </div>

      {/* Preview */}
      {preview && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ marginBottom: 16 }}>2 · Anteprima dati rilevati</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Clienti',       count: preview.clienti.length,       key: 'clienti' },
                { label: 'Professionisti', count: preview.professionisti.length, key: 'professionisti' },
                { label: 'Servizi listino',count: preview.servizi.length,       key: 'servizi' },
                { label: 'Preventivi',     count: preview.preventivi.length,    key: 'preventivi' },
              ].map(({ label, count, key }) => (
                <div
                  key={key}
                  onClick={() => setOptions(o => ({ ...o, [key]: !o[key] }))}
                  style={{
                    background: options[key] ? 'var(--accent-light, #faf6e8)' : '#f5f5f5',
                    border: `2px solid ${options[key] ? 'var(--accent, #b5935a)' : '#ddd'}`,
                    borderRadius: 10,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    opacity: options[key] ? 1 : 0.5,
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                    {options[key] ? '✓ ' : '○ '}{label}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>{count}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                    {options[key] ? 'Verrà importato' : 'Escluso'}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
              ⚠️ L'import <strong>sovrascrive</strong> i dati esistenti per le sezioni selezionate.
              Clicca su un riquadro per escluderlo.
            </p>

            {/* Anteprima tabella clienti */}
            <details style={{ marginBottom: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                Clienti ({preview.clienti.length})
              </summary>
              <table className="data-table" style={{ fontSize: 12 }}>
                <thead><tr><th>ID</th><th>Nome</th><th>Settore</th><th>Email</th></tr></thead>
                <tbody>
                  {preview.clienti.slice(0, 10).map((c, i) => (
                    <tr key={i}>
                      <td>{c.excelId}</td><td>{c.nome}</td>
                      <td>{c.settore}</td><td>{c.email}</td>
                    </tr>
                  ))}
                  {preview.clienti.length > 10 && <tr><td colSpan={4} style={{ color: 'var(--text-dim)', textAlign: 'center' }}>… e altri {preview.clienti.length - 10}</td></tr>}
                </tbody>
              </table>
            </details>

            <details style={{ marginBottom: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                Preventivi ({preview.preventivi.length})
              </summary>
              <table className="data-table" style={{ fontSize: 12 }}>
                <thead><tr><th>ID</th><th>Progetto</th><th>Cliente</th><th>Stato</th><th>Righe</th></tr></thead>
                <tbody>
                  {preview.preventivi.slice(0, 10).map((p, i) => (
                    <tr key={i}>
                      <td>{p.excelId}</td><td>{p.progetto}</td>
                      <td>{p.clienteNome}</td><td>{p.stato}</td>
                      <td>{p.righe.length}</td>
                    </tr>
                  ))}
                  {preview.preventivi.length > 10 && <tr><td colSpan={5} style={{ color: 'var(--text-dim)', textAlign: 'center' }}>… e altri {preview.preventivi.length - 10}</td></tr>}
                </tbody>
              </table>
            </details>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: 16 }}>3 · Conferma import</h2>
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={status === 'loading' || !Object.values(options).some(Boolean)}
              style={{ fontSize: 15, padding: '12px 28px' }}
            >
              {status === 'loading' ? '⏳ Importazione in corso…' : '⬆ Importa su Firestore'}
            </button>
          </div>
        </>
      )}

      {/* Log risultato */}
      {log.length > 0 && (
        <div className="card" style={{ marginTop: 20, background: status === 'success' ? '#f0faf4' : '#fff5f5', border: `1px solid ${status === 'success' ? '#a3d9b1' : '#f5c6cb'}` }}>
          <h2 style={{ marginBottom: 12 }}>Risultato</h2>
          {log.map((l, i) => (
            <div key={i} style={{ fontSize: 14, padding: '4px 0', fontWeight: 500 }}>{l}</div>
          ))}
          {status === 'success' && (
            <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 12 }}>
              Ricarica la pagina per vedere i dati aggiornati nelle altre sezioni.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

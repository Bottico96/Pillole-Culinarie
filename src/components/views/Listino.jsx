import { useState, useMemo, useEffect } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../lib/firebase'

function useServizi() {
  const [servizi, setServizi] = useState([])
  useEffect(() => onSnapshot(collection(db, 'servizi'), snap =>
    setServizi(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  ), [])
  return servizi
}

const fmt = n => n ? '€ ' + Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'

export default function Listino() {
  const servizi = useServizi()
  const [search, setSearch] = useState('')
  const [filtroCentro, setFiltroCentro] = useState('')
  const [filtroMacro, setFiltroMacro] = useState('')

  const centri = useMemo(() => [...new Set(servizi.map(s => s.centroCosto).filter(Boolean))].sort(), [servizi])
  const macro  = useMemo(() => [...new Set(servizi.map(s => s.macroArea).filter(Boolean))].sort(), [servizi])

  const lista = useMemo(() => {
    let arr = [...servizi]
    if (search) {
      const q = search.toLowerCase()
      arr = arr.filter(s => (s.nome || '').toLowerCase().includes(q) || (s.centroCosto || '').toLowerCase().includes(q))
    }
    if (filtroCentro) arr = arr.filter(s => s.centroCosto === filtroCentro)
    if (filtroMacro)  arr = arr.filter(s => s.macroArea === filtroMacro)
    return arr.sort((a, b) => (a.centroCosto || '').localeCompare(b.centroCosto || '') || (a.nome || '').localeCompare(b.nome || ''))
  }, [servizi, search, filtroCentro, filtroMacro])

  // Group by centro costo
  const grouped = useMemo(() => {
    const map = {}
    lista.forEach(s => {
      const k = s.centroCosto || 'Altro'
      if (!map[k]) map[k] = []
      map[k].push(s)
    })
    return map
  }, [lista])

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1>Listino Servizi</h1>
          <p className="view-subtitle">{servizi.length} servizi · catalogo prezzi e costi</p>
        </div>
      </div>

      {/* Stats per macro area */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        {macro.map(m => {
          const count = servizi.filter(s => s.macroArea === m).length
          return (
            <div
              key={m}
              onClick={() => setFiltroMacro(filtroMacro === m ? '' : m)}
              style={{
                padding: '8px 16px', borderRadius: 99, cursor: 'pointer',
                background: filtroMacro === m ? 'var(--ink)' : 'var(--white)',
                color: filtroMacro === m ? '#fff' : 'var(--ink)',
                border: '1.5px solid var(--ink)',
                fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px',
                transition: 'var(--transition)',
              }}
            >
              {m} <span style={{ opacity: .7 }}>({count})</span>
            </div>
          )
        })}
      </div>

      {/* Filtri */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Cerca servizio…"
            style={{ maxWidth: 280 }}
          />
          <select value={filtroCentro} onChange={e => setFiltroCentro(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Tutti i centri di costo</option>
            {centri.map(c => <option key={c}>{c}</option>)}
          </select>
          {(search || filtroCentro || filtroMacro) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFiltroCentro(''); setFiltroMacro('') }}>✕ Reset</button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-dim)' }}>{lista.length} servizi</span>
        </div>
      </div>

      {/* Lista per gruppo */}
      {servizi.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="icon">🛍️</div>
            <p>Nessun servizio trovato.</p>
            <p style={{ fontSize: 12, marginTop: 8 }}>Vai in <strong>Impostazioni → Carica Dati Base</strong> per caricare il listino.</p>
          </div>
        </div>
      ) : (
        Object.entries(grouped).map(([centro, items]) => (
          <div key={centro} className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ marginBottom: 0 }}>{centro}</h2>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>{items.length} servizi</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Servizio</th>
                    <th>Ruolo operatore</th>
                    <th className="num">Costo netto</th>
                    <th className="num">Prezzo base</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-dim)' }}>{s.excelId || '—'}</td>
                      <td style={{ fontWeight: 500 }}>{s.nome}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.ruoloOperatore || '—'}</td>
                      <td className="num" style={{ color: 'var(--red)', fontWeight: 600 }}>{fmt(s.costoNetto)}</td>
                      <td className="num" style={{ color: 'var(--teal)', fontWeight: 700 }}>{fmt(s.prezzoBase)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

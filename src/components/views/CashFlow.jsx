import { useState, useMemo } from 'react'
import { useData } from '../../hooks/useData'
import { addItem, deleteItem, cols } from '../../lib/db'
import { fmt, fmtDate, MESI, fatturatoCliente, totaleProfMese, costoFissoMese, applyIva } from '../../lib/calc'

const CATEGORIE_ENTRATA = ['Incasso fattura cliente', 'Acconto cliente', 'Rimborso ricevuto']
const CATEGORIE_USCITA = ['Pagamento collaboratore', 'Pagamento fornitore', 'Costo fisso aziendale', 'Tasse e contributi', 'Rimborso spese', 'Altro']

export default function CashFlow() {
  const { progetti, professionisti, costiFissi, movimentiCassa, loading } = useData()
  const [anno, setAnno] = useState(2026)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ tipo: 'entrata', data: new Date().toISOString().split('T')[0], importo: '', desc: '', controparte: '', categoria: 'Incasso fattura cliente', note: '' })
  const [saving, setSaving] = useState(false)

  // ── Calcoli ───────────────────────────────────────────────────
  const saldo = useMemo(() =>
    movimentiCassa.reduce((tot, m) =>
      tot + (m.tipo === 'entrata' ? parseFloat(m.importo) || 0 : -(parseFloat(m.importo) || 0)), 0)
  , [movimentiCassa])

  const mesiCF = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      let entratePrev = 0, uscitePrev = 0, entrateReali = 0, usciteReali = 0

      progetti.forEach(p => { entratePrev += fatturatoCliente(p, anno, m) * 1.22 })
      professionisti.forEach(prof => { uscitePrev += totaleProfMese(prof, progetti, anno, m) })
      costiFissi.forEach(cf => { uscitePrev += applyIva(costoFissoMese(cf, anno, m), parseFloat(cf.iva) || 0) })

      movimentiCassa.forEach(mv => {
        const d = new Date(mv.data + 'T00:00:00')
        if (d.getFullYear() !== anno || d.getMonth() + 1 !== m) return
        const imp = parseFloat(mv.importo) || 0
        if (mv.tipo === 'entrata') entrateReali += imp
        else usciteReali += imp
      })

      return { mese: m, entratePrev, uscitePrev, entrateReali, usciteReali }
    })
  }, [progetti, professionisti, costiFissi, movimentiCassa, anno])

  const totEntrateReali = mesiCF.reduce((a, m) => a + m.entrateReali, 0)
  const totUsciteReali = mesiCF.reduce((a, m) => a + m.usciteReali, 0)
  const totEntratePrev = mesiCF.reduce((a, m) => a + m.entratePrev, 0)
  const totUscitePrev = mesiCF.reduce((a, m) => a + m.uscitePrev, 0)

  // Scadenze prossimi 2 mesi
  const oggi = new Date()
  const fra2Mesi = new Date(oggi); fra2Mesi.setMonth(fra2Mesi.getMonth() + 2)

  const entrateAttese = useMemo(() => {
    const result = []
    progetti.forEach(p => {
      for (let m = 1; m <= 12; m++) {
        const f = fatturatoCliente(p, anno, m)
        if (f <= 0) continue
        const dataStimata = new Date(anno, m - 1 + 2, 28) // +60gg stimati
        if (dataStimata < oggi || dataStimata > fra2Mesi) continue
        const giàIncassato = movimentiCassa.some(mv => mv._scadKey === `e_${p.id}_${m}_${anno}`)
        if (!giàIncassato) result.push({ key: `e_${p.id}_${m}_${anno}`, cliente: p.nome || p.cliente, servizio: p.nome || p.cliente, importo: f * 1.22, mese: m, anno, data: dataStimata, progettoId: p.id, scaduta: dataStimata < oggi })
      }
    })
    return result.sort((a, b) => a.data - b.data)
  }, [progetti, movimentiCassa, anno])

  const usciteAttese = useMemo(() => {
    const result = []
    professionisti.forEach(prof => {
      for (let m = 1; m <= 12; m++) {
        const tot = totaleProfMese(prof, progetti, anno, m)
        if (tot <= 0) continue
        const dataScad = new Date(anno, m, 15)
        if (dataScad < oggi || dataScad > fra2Mesi) continue
        const key = `u_op_${prof.id}_${m}_${anno}`
        if (!movimentiCassa.some(mv => mv._scadKey === key))
          result.push({ key, desc: prof.nome + ' — ' + MESI[m - 1], controparte: prof.nome, importo: tot, tipo: 'operatore', mese: m, anno, data: dataScad, scaduta: dataScad < oggi })
      }
    })
    costiFissi.forEach(cf => {
      for (let m = 1; m <= 12; m++) {
        const imp = costoFissoMese(cf, anno, m)
        if (imp <= 0) continue
        const dataScad = new Date(anno, m - 1, cf.giorno || 1)
        if (dataScad < oggi || dataScad > fra2Mesi) continue
        const key = `u_cf_${cf.id}_${m}_${anno}`
        if (!movimentiCassa.some(mv => mv._scadKey === key))
          result.push({ key, desc: cf.descrizione, controparte: cf.fornitore, importo: applyIva(imp, parseFloat(cf.iva) || 0), tipo: 'fisso', mese: m, anno, data: dataScad, scaduta: dataScad < oggi })
      }
    })
    return result.sort((a, b) => a.data - b.data)
  }, [professionisti, costiFissi, progetti, movimentiCassa, anno])

  // ── Azioni ───────────────────────────────────────────────────
  const segnaIncassato = async (e) => {
    if (movimentiCassa.some(mv => mv._scadKey === e.key)) return
    await addItem(cols.movimentiCassa, { tipo: 'entrata', data: oggi.toISOString().split('T')[0], importo: e.importo, desc: e.cliente + ' — ' + MESI[e.mese - 1], controparte: e.cliente, categoria: 'Incasso fattura cliente', progettoId: e.progettoId, note: '', _daScadenzario: true, _scadKey: e.key })
  }

  const segnaPagato = async (u) => {
    if (movimentiCassa.some(mv => mv._scadKey === u.key)) return
    await addItem(cols.movimentiCassa, { tipo: 'uscita', data: oggi.toISOString().split('T')[0], importo: u.importo, desc: u.desc, controparte: u.controparte, categoria: u.tipo === 'fisso' ? 'Costo fisso aziendale' : 'Pagamento collaboratore', note: '', _daScadenzario: true, _scadKey: u.key })
  }

  const eliminaMovimento = async (id) => {
    if (!window.confirm('Eliminare questo movimento?')) return
    await deleteItem(cols.movimentiCassa, id)
  }

  const salvaMovimento = async () => {
    if (!form.importo || !form.desc) return alert('Compila importo e descrizione.')
    setSaving(true)
    await addItem(cols.movimentiCassa, { ...form, importo: parseFloat(form.importo) })
    setSaving(false)
    setShowModal(false)
    setForm({ tipo: 'entrata', data: new Date().toISOString().split('T')[0], importo: '', desc: '', controparte: '', categoria: 'Incasso fattura cliente', note: '' })
  }

  if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>

  const maxBar = Math.max(...mesiCF.map(m => Math.max(m.entratePrev, m.uscitePrev, m.entrateReali, m.usciteReali)), 1)
  const movimentiOrdinati = [...movimentiCassa].sort((a, b) => new Date(b.data) - new Date(a.data))

  // Saldo progressivo
  let saldoProg = 0
  const movConSaldo = [...movimentiCassa]
    .sort((a, b) => new Date(a.data) - new Date(b.data))
    .map(m => { saldoProg += m.tipo === 'entrata' ? parseFloat(m.importo) || 0 : -(parseFloat(m.importo) || 0); return { ...m, saldoProg } })
    .reverse()

  return (
    <>
      <div className="page-header">
        <div className="page-title">Cash Flow</div>
        <div className="page-sub">Entrate e uscite reali — quando i soldi entrano e escono davvero</div>
        <div className="header-actions">
          <select value={anno} onChange={e => setAnno(parseInt(e.target.value))} style={{ width: 100 }}>
            <option value={2025}>2025</option><option value={2026}>2026</option><option value={2027}>2027</option>
          </select>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>＋ Movimento</button>
        </div>
      </div>

      <div className="content">
        {/* Stats */}
        <div className="grid-4" style={{ marginBottom: 20 }}>
          <div className="stat-card gold">
            <div className="stat-label">Saldo Cassa</div>
            <div className="stat-value" style={{ color: saldo >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(saldo)}</div>
            <div className="stat-note">{movimentiCassa.length} movimenti</div>
          </div>
          <div className="stat-card green">
            <div className="stat-label">Incassato {anno}</div>
            <div className="stat-value">{fmt(totEntrateReali)}</div>
            <div className="stat-note">Entrate reali registrate</div>
          </div>
          <div className="stat-card red">
            <div className="stat-label">Pagato {anno}</div>
            <div className="stat-value">{fmt(totUsciteReali)}</div>
            <div className="stat-note">Uscite reali registrate</div>
          </div>
          <div className={`stat-card ${totEntratePrev - totUscitePrev >= 0 ? '' : 'red'}`}>
            <div className="stat-label">CF Previsionale {anno}</div>
            <div className="stat-value" style={{ color: totEntratePrev - totUscitePrev >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(totEntratePrev - totUscitePrev)}</div>
            <div className="stat-note">Entrate − Uscite previste</div>
          </div>
        </div>

        {/* Grafico mensile */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">Andamento Mensile {anno}</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', fontSize: 11 }}>
            {[['rgba(45,122,58,0.2)', 'Entrate previste'], ['var(--green)', 'Entrate reali'], ['rgba(192,57,43,0.2)', 'Uscite previste'], ['var(--red)', 'Uscite reali']].map(([color, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 12, height: 12, background: color, borderRadius: 2 }} />{label}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 110, paddingBottom: 4 }}>
            {mesiCF.map((m, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', gap: 1, height: 80 }}>
                  {[
                    [m.entratePrev, 'rgba(45,122,58,0.2)'],
                    [m.entrateReali, 'var(--green)'],
                    [m.uscitePrev, 'rgba(192,57,43,0.2)'],
                    [m.usciteReali, 'var(--red)'],
                  ].map(([val, color], j) => (
                    <div key={j} style={{ flex: 1, background: color, borderRadius: '2px 2px 0 0', height: Math.max(val / maxBar * 80, val > 0 ? 2 : 0) }} />
                  ))}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{MESI[i].slice(0, 3)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Scadenze */}
        <div className="grid-2" style={{ marginBottom: 20 }}>
          <div className="card">
            <div className="card-title">📅 Prossime da Incassare</div>
            {entrateAttese.length === 0
              ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nessuna entrata attesa nei prossimi 2 mesi.</p>
              : entrateAttese.map(e => (
                <div key={e.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid var(--border)', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{e.cliente}</div>
                    <div style={{ fontSize: 11, color: e.scaduta ? 'var(--red)' : 'var(--text-dim)', marginTop: 3 }}>
                      {e.scaduta ? '⚠ Scaduta' : '📅'} Stima: {e.data.toLocaleDateString('it-IT')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                    <span style={{ fontWeight: 700, color: 'var(--green)' }}>{fmt(e.importo)}</span>
                    <button onClick={() => segnaIncassato(e)} style={{ background: 'rgba(45,122,58,0.1)', color: 'var(--green)', border: '1px solid rgba(45,122,58,0.3)', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>💰 Incassato</button>
                  </div>
                </div>
              ))
            }
          </div>

          <div className="card">
            <div className="card-title">📅 Prossime da Pagare</div>
            {usciteAttese.length === 0
              ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nessuna uscita attesa nei prossimi 2 mesi.</p>
              : usciteAttese.map(u => (
                <div key={u.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid var(--border)', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{u.desc}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{u.controparte} · {u.tipo === 'fisso' ? 'Costo fisso' : 'Operatore'}</div>
                    <div style={{ fontSize: 11, color: u.scaduta ? 'var(--red)' : 'var(--text-dim)', marginTop: 3 }}>
                      {u.scaduta ? '⚠ Scaduta' : '📅'} {u.data.toLocaleDateString('it-IT')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                    <span style={{ fontWeight: 700, color: 'var(--red)' }}>{fmt(u.importo)}</span>
                    <button onClick={() => segnaPagato(u)} style={{ background: 'rgba(192,57,43,0.1)', color: 'var(--red)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>✓ Pagato</button>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Registro movimenti */}
        <div className="card">
          <div className="card-title">📒 Registro Movimenti</div>
          {movConSaldo.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>Nessun movimento registrato.<br /><span style={{ fontSize: 12 }}>Usa "＋ Movimento" oppure i tasti Incassato/Pagato nelle scadenze.</span></p>
            : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th><th>Tipo</th><th>Descrizione</th><th>Controparte</th><th>Categoria</th>
                      <th className="text-right">Importo</th><th className="text-right">Saldo</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {movConSaldo.map(m => (
                      <tr key={m.id}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-dim)' }}>{fmtDate(m.data)}</td>
                        <td><span className={`badge ${m.tipo === 'entrata' ? 'badge-green' : 'badge-red'}`}>{m.tipo === 'entrata' ? '💰 Entrata' : '💸 Uscita'}</span></td>
                        <td style={{ fontSize: 13 }}>{m.desc}{m.note ? <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{m.note}</div> : null}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.controparte || '—'}</td>
                        <td><span className="badge badge-blue" style={{ fontSize: 10 }}>{m.categoria || '—'}</span></td>
                        <td className="text-right fw-500" style={{ color: m.tipo === 'entrata' ? 'var(--green)' : 'var(--red)' }}>
                          {m.tipo === 'entrata' ? '+' : '−'}{fmt(parseFloat(m.importo) || 0)}
                        </td>
                        <td className="text-right" style={{ color: m.saldoProg >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>{fmt(m.saldoProg)}</td>
                        <td><button className="delete-btn" onClick={() => eliminaMovimento(m.id)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      </div>

      {/* Modal nuovo movimento */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-title">Nuovo Movimento</div>
            <div className="form-row">
              <div className="form-group">
                <label>Tipo *</label>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value, categoria: e.target.value === 'entrata' ? 'Incasso fattura cliente' : 'Pagamento collaboratore' }))}>
                  <option value="entrata">💰 Entrata (incasso)</option>
                  <option value="uscita">💸 Uscita (pagamento)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Data *</label>
                <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Importo (€) *</label>
                <input type="number" value={form.importo} onChange={e => setForm(f => ({ ...f, importo: e.target.value }))} placeholder="es. 1830" />
              </div>
              <div className="form-group">
                <label>Categoria</label>
                <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                  {(form.tipo === 'entrata' ? CATEGORIE_ENTRATA : CATEGORIE_USCITA).map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Descrizione *</label>
              <input type="text" value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} placeholder="es. Pagamento fattura — LOVE & PASSION" />
            </div>
            <div className="form-group">
              <label>Controparte</label>
              <input type="text" value={form.controparte} onChange={e => setForm(f => ({ ...f, controparte: e.target.value }))} placeholder="es. LOVE & PASSION Srl" />
            </div>
            <div className="form-group">
              <label>Note</label>
              <input type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="opzionale" />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={salvaMovimento} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

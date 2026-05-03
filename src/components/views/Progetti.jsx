import { useState, useMemo } from 'react'
import { useData } from '../../hooks/useData'
import { addItem, updateItem, deleteItem, cols } from '../../lib/db'
import { fmt, MESI, fatturatoCliente, costoOperatoreMese, validaImporto, validaTesto, validaData } from '../../lib/calc'
import { FieldError, ValidationSummary, useConfirm } from '../ui/FormComponents'

const ANNI = [2025, 2026, 2027]

function getMesiProgetto(p) {
  const mI = parseInt(p.meseInizio) || 1
  const aI = parseInt(p.annoInizio) || 2026
  const dur = parseInt(p.durata) || 1
  const result = []
  for (let i = 0; i < dur; i++) {
    const m = ((mI - 1 + i) % 12) + 1
    const a = aI + Math.floor((mI - 1 + i) / 12)
    result.push({ mese: m, anno: a })
  }
  return result
}

export default function Progetti() {
  const { progetti, professionisti, loading } = useData()
  const { confirm, ConfirmModal } = useConfirm()
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [filtroAnno, setFiltroAnno] = useState(2026)
  const [saving, setSaving] = useState(false)
  const [errori, setErrori] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})

  const emptyForm = { nome: '', cliente: '', tipo: 'ricorrente', importo: '', meseInizio: new Date().getMonth() + 1, annoInizio: 2026, durata: 12, scadenze: [], buSplit: [], costi: [] }
  const [form, setForm] = useState(emptyForm)
  const [newScadenza, setNewScadenza] = useState({ desc: '', importo: '', data: '' })
  const [newCosto, setNewCosto] = useState({ profId: '', importo: '', iva: 22, tipo: 'mensile', mese: 1, anno: 2026, buId: '' })

  const progettiAnno = useMemo(() => {
    return progetti.map(p => {
      let totFat = 0, totCosti = 0
      for (let m = 1; m <= 12; m++) {
        totFat += fatturatoCliente(p, filtroAnno, m)
        ;(p.costi || []).forEach(c => { totCosti += costoOperatoreMese(c, p, filtroAnno, m) })
      }
      return { ...p, totFat, totCosti, margine: totFat - totCosti }
    }).filter(p => getMesiProgetto(p).some(({ anno }) => anno === filtroAnno))
  }, [progetti, filtroAnno])

  const valida = () => {
    const fe = {}
    const errs = []
    const eNome = validaTesto(form.nome, 'Nome progetto')
    if (eNome) { fe.nome = eNome; errs.push(eNome) }
    const eCliente = validaTesto(form.cliente, 'Cliente')
    if (eCliente) { fe.cliente = eCliente; errs.push(eCliente) }
    const eImporto = validaImporto(form.importo, form.tipo === 'ricorrente' ? 'Importo mensile' : 'Importo totale')
    if (eImporto) { fe.importo = eImporto; errs.push(eImporto) }
    if (form.tipo === 'ricorrente') {
      const dur = parseInt(form.durata)
      if (!dur || dur < 1 || dur > 120) { fe.durata = 'Durata deve essere tra 1 e 120 mesi.'; errs.push(fe.durata) }
    }
    if (form.tipo === 'spot' && form.scadenze.length === 0) {
      errs.push('Aggiungi almeno una scadenza per un progetto spot.')
    }
    setFieldErrors(fe)
    setErrori(errs)
    return errs.length === 0
  }

  const openNew = () => { setEditingId(null); setForm(emptyForm); setErrori([]); setFieldErrors({}); setShowModal(true) }
  const openEdit = (p) => {
    setEditingId(p.id)
    setForm({ nome: p.nome || '', cliente: p.cliente || '', tipo: p.tipo || 'ricorrente', importo: p.importo || '', meseInizio: p.meseInizio || 1, annoInizio: p.annoInizio || 2026, durata: p.durata || 12, scadenze: p.scadenze || [], buSplit: p.buSplit || [], costi: p.costi || [] })
    setErrori([]); setFieldErrors({}); setShowModal(true)
  }

  const salva = async () => {
    if (!valida()) return
    setSaving(true)
    const data = { ...form, importo: parseFloat(form.importo) || 0 }
    if (editingId) await updateItem(cols.progetti, editingId, data)
    else await addItem(cols.progetti, data)
    setSaving(false); setShowModal(false); setForm(emptyForm); setEditingId(null)
  }

  const elimina = async (p) => {
    const ok = await confirm(`Eliminare "${p.nome}"?`, 'Questa operazione non può essere annullata.')
    if (!ok) return
    await deleteItem(cols.progetti, p.id)
  }

  const addScadenza = () => {
    const eImp = validaImporto(newScadenza.importo, 'Importo scadenza')
    const eData = validaData(newScadenza.data, 'Data scadenza')
    if (eImp || eData) { setErrori([eImp, eData].filter(Boolean)); return }
    setForm(f => ({ ...f, scadenze: [...f.scadenze, { ...newScadenza, importo: parseFloat(newScadenza.importo) }] }))
    setNewScadenza({ desc: '', importo: '', data: '' })
  }

  const addCosto = () => {
    if (!newCosto.profId) { setErrori(['Seleziona un professionista.']); return }
    const eImp = validaImporto(newCosto.importo, 'Importo operatore')
    if (eImp) { setErrori([eImp]); return }
    setForm(f => ({ ...f, costi: [...f.costi, { ...newCosto, importo: parseFloat(newCosto.importo) }] }))
    setNewCosto({ profId: '', importo: '', iva: 22, tipo: 'mensile', mese: 1, anno: 2026, buId: '' })
    setErrori([])
  }

  if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>

  const totFat = progettiAnno.reduce((a, p) => a + p.totFat, 0)
  const totCosti = progettiAnno.reduce((a, p) => a + p.totCosti, 0)

  return (
    <>
      <ConfirmModal />
      <div className="page-header">
        <div className="page-title">Progetti</div>
        <div className="page-sub">Contratti attivi e fatturato per anno</div>
        <div className="header-actions">
          <select value={filtroAnno} onChange={e => setFiltroAnno(parseInt(e.target.value))} style={{ width: 100 }}>{ANNI.map(a => <option key={a}>{a}</option>)}</select>
          <button className="btn btn-primary" onClick={openNew}>＋ Nuovo Progetto</button>
        </div>
      </div>

      <div className="content">
        <div className="grid-3" style={{ marginBottom: 20 }}>
          <div className="stat-card gold"><div className="stat-label">Fatturato {filtroAnno}</div><div className="stat-value">{fmt(totFat)}</div><div className="stat-note">{progettiAnno.length} progetti attivi</div></div>
          <div className="stat-card red"><div className="stat-label">Costi Operatori</div><div className="stat-value">{fmt(totCosti)}</div><div className="stat-note">Totale collaboratori</div></div>
          <div className={`stat-card ${totFat - totCosti >= 0 ? 'green' : 'red'}`}><div className="stat-label">Margine 1° Livello</div><div className="stat-value">{fmt(totFat - totCosti)}</div><div className="stat-note">{totFat > 0 ? Math.round((totFat - totCosti) / totFat * 100) : 0}%</div></div>
        </div>

        {progettiAnno.length === 0
          ? <div className="empty-state"><div className="icon">◻</div><p>Nessun progetto per il {filtroAnno}.</p></div>
          : progettiAnno.map(p => {
            const mgPct = p.totFat > 0 ? Math.round(p.margine / p.totFat * 100) : 0
            return (
              <div key={p.id} className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, fontWeight: 600 }}>{p.nome}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>{p.cliente}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      <span className={`badge ${p.tipo === 'ricorrente' ? 'badge-gold' : 'badge-blue'}`}>{p.tipo === 'ricorrente' ? '↻ Ricorrente' : '⬡ Spot'}</span>
                      {p.tipo === 'ricorrente' && <span className="badge badge-purple">{fmt(p.importo)}/mese × {p.durata} mesi</span>}
                      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>da {MESI[(parseInt(p.meseInizio) || 1) - 1]} {p.annoInizio}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>✎ Modifica</button>
                    <button className="btn btn-danger btn-sm" onClick={() => elimina(p)}>✕</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, padding: 14, background: 'var(--surface2)', borderRadius: 8, marginBottom: 16 }}>
                  {[['Fatturato', p.totFat, 'var(--gold)'], ['Costi', p.totCosti, 'var(--red)'], [`Margine (${mgPct}%)`, p.margine, p.margine >= 0 ? 'var(--green)' : 'var(--red)']].map(([lab, val, col]) => (
                    <div key={lab}><div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{lab}</div><div style={{ fontSize: 18, fontFamily: "'Cormorant Garamond',serif", fontWeight: 600, color: col }}>{fmt(val)}</div></div>
                  ))}
                </div>
                {p.tipo === 'spot' && p.scadenze?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8, fontWeight: 600 }}>Scadenze</div>
                    {p.scadenze.map((sc, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                        <span className="text-muted">{sc.desc || '—'}</span>
                        <div style={{ display: 'flex', gap: 16 }}>
                          <span style={{ color: 'var(--text-dim)' }}>{sc.data}</span>
                          <span className="text-gold fw-500">{fmt(parseFloat(sc.importo))}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {p.costi?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8, fontWeight: 600 }}>Costi Operatori</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {p.costi.map((c, i) => {
                        const prof = professionisti.find(pr => pr.id === c.profId)
                        return <div key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}><span className="fw-500">{prof?.nome || 'N/D'}</span><span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>{fmt(c.importo)}{c.tipo === 'mensile' ? '/mese' : ' una tantum'}</span></div>
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        }
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 720 }}>
            <div className="modal-title">{editingId ? 'Modifica Progetto' : 'Nuovo Progetto'}</div>
            <ValidationSummary errors={errori} />
            <div className="form-row">
              <div className="form-group"><label>Nome progetto *</label><input value={form.nome} onChange={e => { setForm(f => ({ ...f, nome: e.target.value })); setFieldErrors(fe => ({ ...fe, nome: null })) }} placeholder="es. Love & Passion – Comunicazione" style={fieldErrors.nome ? { borderColor: 'var(--red)' } : {}} /><FieldError error={fieldErrors.nome} /></div>
              <div className="form-group"><label>Cliente *</label><input value={form.cliente} onChange={e => { setForm(f => ({ ...f, cliente: e.target.value })); setFieldErrors(fe => ({ ...fe, cliente: null })) }} placeholder="es. LOVE & PASSION Srl" style={fieldErrors.cliente ? { borderColor: 'var(--red)' } : {}} /><FieldError error={fieldErrors.cliente} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Tipo</label><select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}><option value="ricorrente">↻ Ricorrente (mensile)</option><option value="spot">⬡ Spot</option></select></div>
              <div className="form-group"><label>{form.tipo === 'ricorrente' ? 'Importo mensile (€)' : 'Importo totale (€)'} *</label><input type="number" min="0.01" value={form.importo} onChange={e => { setForm(f => ({ ...f, importo: e.target.value })); setFieldErrors(fe => ({ ...fe, importo: null })) }} placeholder="es. 1700" style={fieldErrors.importo ? { borderColor: 'var(--red)' } : {}} /><FieldError error={fieldErrors.importo} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Mese inizio</label><select value={form.meseInizio} onChange={e => setForm(f => ({ ...f, meseInizio: parseInt(e.target.value) }))}>{MESI.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select></div>
              <div className="form-group"><label>Anno inizio</label><select value={form.annoInizio} onChange={e => setForm(f => ({ ...f, annoInizio: parseInt(e.target.value) }))}>{ANNI.map(a => <option key={a}>{a}</option>)}</select></div>
              {form.tipo === 'ricorrente' && <div className="form-group"><label>Durata (mesi)</label><input type="number" min="1" max="120" value={form.durata} onChange={e => { setForm(f => ({ ...f, durata: parseInt(e.target.value) || 1 })); setFieldErrors(fe => ({ ...fe, durata: null })) }} style={fieldErrors.durata ? { borderColor: 'var(--red)' } : {}} /><FieldError error={fieldErrors.durata} /></div>}
            </div>
            {form.tipo === 'spot' && (
              <>
                <hr className="divider" />
                <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 10, fontWeight: 600 }}>Scadenze / Tranche</div>
                {form.scadenze.map((sc, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}><span style={{ fontSize: 13 }}>{sc.desc || '—'} · {sc.data} · <strong>{fmt(parseFloat(sc.importo))}</strong></span><button className="delete-btn" onClick={() => setForm(f => ({ ...f, scadenze: f.scadenze.filter((_, idx) => idx !== i) }))}>✕</button></div>)}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>Descrizione</label><input value={newScadenza.desc} onChange={e => setNewScadenza(s => ({ ...s, desc: e.target.value }))} placeholder="es. 50% acconto" /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>Importo (€) *</label><input type="number" min="0.01" value={newScadenza.importo} onChange={e => setNewScadenza(s => ({ ...s, importo: e.target.value }))} /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>Data *</label><input type="date" value={newScadenza.data} onChange={e => setNewScadenza(s => ({ ...s, data: e.target.value }))} /></div>
                  <button className="btn btn-ghost" onClick={addScadenza}>＋</button>
                </div>
              </>
            )}
            <hr className="divider" />
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 10, fontWeight: 600 }}>Costi Operatori</div>
            {form.costi.map((c, i) => { const prof = professionisti.find(p => p.id === c.profId); return <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}><span style={{ fontSize: 13 }}>{prof?.nome || c.profId} · {fmt(c.importo)} · {c.tipo}</span><button className="delete-btn" onClick={() => setForm(f => ({ ...f, costi: f.costi.filter((_, idx) => idx !== i) }))}>✕</button></div> })}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'flex-end' }}>
              <div className="form-group" style={{ marginBottom: 0 }}><label>Professionista *</label><select value={newCosto.profId} onChange={e => setNewCosto(c => ({ ...c, profId: e.target.value }))}><option value="">— Seleziona —</option>{professionisti.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>Importo (€) *</label><input type="number" min="0.01" value={newCosto.importo} onChange={e => setNewCosto(c => ({ ...c, importo: e.target.value }))} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>Tipo</label><select value={newCosto.tipo} onChange={e => setNewCosto(c => ({ ...c, tipo: e.target.value }))}><option value="mensile">Mensile</option><option value="unatantum">Una tantum</option></select></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>IVA %</label><select value={newCosto.iva} onChange={e => setNewCosto(c => ({ ...c, iva: parseInt(e.target.value) }))}><option value={22}>22%</option><option value={0}>0%</option></select></div>
              <button className="btn btn-ghost" onClick={addCosto}>＋</button>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setShowModal(false); setEditingId(null) }}>Annulla</button>
              <button className="btn btn-primary" onClick={salva} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva Progetto'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

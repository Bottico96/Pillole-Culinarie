import { useState, useMemo } from 'react'
import { useData } from '../../hooks/useData'
import { addItem, updateItem, deleteItem, cols } from '../../lib/db'
import { fmt, MESI, costoFissoMese, applyIva, validaImporto, validaTesto } from '../../lib/calc'
import { ValidationSummary, FieldError, useConfirm } from '../ui/FormComponents'

const ANNI = [2025, 2026, 2027]
const CATEGORIE = ['Consulenze', 'Ufficio & Sede', 'Software & Abbonamenti', 'Marketing & Comunicazione', 'Altro']

function ricorrenzaLabel(cf) {
  if (cf.ricorrenza === 'mensile') return { label: 'Mensile', cls: 'badge-green' }
  if (cf.ricorrenza === 'unatantum') return { label: 'Una tantum', cls: 'badge-blue' }
  const ogni = cf.ogni || 1
  if (ogni === 3) return { label: 'Trimestrale', cls: 'badge-gold' }
  if (ogni === 6) return { label: 'Semestrale', cls: 'badge-gold' }
  if (ogni === 12) return { label: 'Annuale', cls: 'badge-gold' }
  return { label: `Ogni ${ogni} mesi`, cls: 'badge-gold' }
}

export default function CostiFissi() {
  const { costiFissi, loading } = useData()
  const [annoStats, setAnnoStats] = useState(2026)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)

  const emptyForm = {
    descrizione: '', categoria: 'Consulenze', importo: '', iva: 22,
    fornitore: '', ricorrenza: 'mensile', ogni: 1,
    meseInizio: 1, annoInizio: 2026, durata: null, giorno: ''
  }
  const [form, setForm] = useState(emptyForm)

  // Calcoli anno
  const { totAnno, perMese, perCategoria } = useMemo(() => {
    let totAnno = 0
    const perMese = Array(12).fill(0)
    const perCategoria = {}

    costiFissi.forEach(cf => {
      let totCF = 0
      for (let m = 1; m <= 12; m++) {
        const imp = costoFissoMese(cf, annoStats, m)
        perMese[m - 1] += imp
        totCF += imp
      }
      totAnno += totCF
      const cat = cf.categoria || 'Altro'
      perCategoria[cat] = (perCategoria[cat] || 0) + totCF
    })

    return { totAnno, perMese, perCategoria }
  }, [costiFissi, annoStats])

  const maxMese = Math.max(...perMese, 1)

  // Raggruppa per categoria
  const byCat = useMemo(() => {
    const map = {}
    costiFissi.forEach(cf => {
      const cat = cf.categoria || 'Altro'
      if (!map[cat]) map[cat] = []
      map[cat].push(cf)
    })
    return map
  }, [costiFissi])

  const openNew = () => { setEditingId(null); setForm(emptyForm); setShowModal(true) }

  const openEdit = (cf) => {
    setEditingId(cf.id)
    setForm({
      descrizione: cf.descrizione || '',
      categoria: cf.categoria || 'Altro',
      importo: cf.importo || '',
      iva: cf.iva ?? 22,
      fornitore: cf.fornitore || '',
      ricorrenza: cf.ricorrenza || 'mensile',
      ogni: cf.ogni || 1,
      meseInizio: cf.meseInizio || 1,
      annoInizio: cf.annoInizio || 2026,
      durata: cf.durata || '',
      giorno: cf.giorno || ''
    })
    setShowModal(true)
  }

  const salva = async () => {
    if (!form.descrizione || !form.importo) return alert('Compila descrizione e importo.')
    setSaving(true)
    const data = {
      ...form,
      importo: parseFloat(form.importo) || 0,
      iva: parseFloat(form.iva) || 0,
      ogni: parseInt(form.ogni) || 1,
      meseInizio: parseInt(form.meseInizio) || 1,
      annoInizio: parseInt(form.annoInizio) || 2026,
      durata: form.durata ? parseInt(form.durata) : null,
      giorno: form.giorno ? parseInt(form.giorno) : null
    }
    if (editingId) await updateItem(cols.costiFissi, editingId, data)
    else await addItem(cols.costiFissi, data)
    setSaving(false)
    setShowModal(false)
    setForm(emptyForm)
    setEditingId(null)
  }

  const elimina = async (id) => {
    if (!window.confirm('Eliminare questo costo fisso?')) return
    await deleteItem(cols.costiFissi, id)
  }

  if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>

  const catColors = { 'Consulenze': 'var(--gold)', 'Ufficio & Sede': 'var(--blue)', 'Software & Abbonamenti': 'var(--purple)', 'Marketing & Comunicazione': 'var(--green)', 'Altro': 'var(--text-muted)' }

  return (
    <>
      <div className="page-header">
        <div className="page-title">Costi Fissi</div>
        <div className="page-sub">Affitti, software, utenze e consulenze ricorrenti</div>
        <div className="header-actions">
          <select value={annoStats} onChange={e => setAnnoStats(parseInt(e.target.value))} style={{ width: 100 }}>
            {ANNI.map(a => <option key={a}>{a}</option>)}
          </select>
          <button className="btn btn-primary" onClick={openNew}>＋ Nuovo Costo Fisso</button>
        </div>
      </div>

      <div className="content">
        {/* Stats */}
        <div className="grid-3" style={{ marginBottom: 20 }}>
          <div className="stat-card purple">
            <div className="stat-label">Costi Fissi {annoStats}</div>
            <div className="stat-value">{fmt(totAnno)}</div>
            <div className="stat-note">{costiFissi.length} voci configurate</div>
          </div>
          <div className="stat-card gold">
            <div className="stat-label">Media mensile</div>
            <div className="stat-value">{fmt(totAnno / 12)}</div>
            <div className="stat-note">Costo fisso mensile stimato</div>
          </div>
          <div className="stat-card red">
            <div className="stat-label">Mese corrente</div>
            <div className="stat-value">{fmt(perMese[new Date().getMonth()])}</div>
            <div className="stat-note">{MESI[new Date().getMonth()]} {new Date().getFullYear()}</div>
          </div>
        </div>

        {/* Grafico mensile */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">Distribuzione mensile {annoStats}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 80, paddingBottom: 4 }}>
            {perMese.map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{ width: '100%', background: v > 0 ? 'rgba(107,74,154,0.5)' : 'var(--surface2)', borderRadius: '3px 3px 0 0', height: Math.max(v / maxMese * 60, v > 0 ? 3 : 0), transition: 'height 0.3s' }} />
                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{MESI[i].slice(0, 3)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Per categoria */}
        <div className="grid-2" style={{ marginBottom: 20 }}>
          <div className="card">
            <div className="card-title">Per Categoria</div>
            {Object.entries(perCategoria).sort((a, b) => b[1] - a[1]).map(([cat, v]) => (
              <div key={cat} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: catColors[cat] || 'var(--text)' }}>◆ {cat}</span>
                  <span style={{ fontWeight: 500, color: catColors[cat] || 'var(--text)', fontSize: 13 }}>{fmt(v)}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill purple" style={{ width: `${v / totAnno * 100}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-title">Riepilogo</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)' }}>Categoria</th>
                  <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)' }}>Totale anno</th>
                  <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(perCategoria).sort((a, b) => b[1] - a[1]).map(([cat, v]) => (
                  <tr key={cat}>
                    <td style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', color: catColors[cat] || 'var(--text)' }}>{cat}</td>
                    <td style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', textAlign: 'right', fontWeight: 500 }}>{fmt(v)}</td>
                    <td style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', textAlign: 'right', color: 'var(--text-dim)' }}>{Math.round(v / totAnno * 100)}%</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: '10px 0', fontWeight: 700 }}>Totale</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 700, color: 'var(--purple)' }}>{fmt(totAnno)}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 700 }}>100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Lista per categoria */}
        {CATEGORIE.filter(cat => byCat[cat]?.length > 0).map(cat => (
          <div key={cat} className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="card-title" style={{ marginBottom: 0, color: catColors[cat] || 'var(--gold)' }}>◆ {cat}</div>
              <span style={{ fontWeight: 600, color: catColors[cat] || 'var(--text)', fontSize: 14 }}>
                {fmt(byCat[cat].reduce((a, cf) => {
                  for (let m = 1; m <= 12; m++) a += costoFissoMese(cf, annoStats, m)
                  return a
                }, 0))} / anno
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Descrizione</th>
                    <th>Fornitore</th>
                    <th>Ricorrenza</th>
                    <th>IVA</th>
                    <th className="text-right">Importo</th>
                    <th className="text-right">Con IVA</th>
                    <th className="text-right">Totale anno</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {byCat[cat].map(cf => {
                    const ric = ricorrenzaLabel(cf)
                    const iva = parseFloat(cf.iva) || 0
                    const imp = parseFloat(cf.importo) || 0
                    let totCF = 0
                    for (let m = 1; m <= 12; m++) totCF += costoFissoMese(cf, annoStats, m)
                    return (
                      <tr key={cf.id}>
                        <td>
                          <div style={{ fontWeight: 500 }}>{cf.descrizione}</div>
                          {cf.giorno && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Giorno {cf.giorno} del mese</div>}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{cf.fornitore || '—'}</td>
                        <td><span className={`badge ${ric.cls}`}>{ric.label}</span></td>
                        <td><span className="badge badge-blue">{iva}%</span></td>
                        <td className="text-right" style={{ color: 'var(--purple)', fontWeight: 500 }}>{fmt(imp)}</td>
                        <td className="text-right">{fmt(applyIva(imp, iva))}</td>
                        <td className="text-right fw-500">{fmt(totCF)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => openEdit(cf)}>✎</button>
                            <button className="btn btn-danger btn-sm" onClick={() => elimina(cf.id)}>✕</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-title">{editingId ? 'Modifica Costo Fisso' : 'Nuovo Costo Fisso'}</div>

            <div className="form-row">
              <div className="form-group">
                <label>Descrizione *</label>
                <input value={form.descrizione} onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))} placeholder="es. Microsoft Office 365" />
              </div>
              <div className="form-group">
                <label>Categoria</label>
                <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                  {CATEGORIE.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Importo (€, escluso IVA) *</label>
                <input type="number" value={form.importo} onChange={e => setForm(f => ({ ...f, importo: e.target.value }))} placeholder="es. 82" />
              </div>
              <div className="form-group">
                <label>IVA %</label>
                <select value={form.iva} onChange={e => setForm(f => ({ ...f, iva: e.target.value }))}>
                  <option value={22}>22% (standard)</option>
                  <option value={10}>10%</option>
                  <option value={4}>4%</option>
                  <option value={0}>0%</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Fornitore</label>
                <input value={form.fornitore} onChange={e => setForm(f => ({ ...f, fornitore: e.target.value }))} placeholder="es. Microsoft" />
              </div>
              <div className="form-group">
                <label>Giorno di scadenza nel mese</label>
                <input type="number" value={form.giorno} onChange={e => setForm(f => ({ ...f, giorno: e.target.value }))} placeholder="es. 1, 15, 30" min={1} max={31} />
              </div>
            </div>

            <hr className="divider" />
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 12, fontWeight: 600 }}>Ricorrenza</div>

            <div className="form-group">
              <label>Tipo di ricorrenza</label>
              <select value={form.ricorrenza} onChange={e => setForm(f => ({ ...f, ricorrenza: e.target.value }))}>
                <option value="mensile">Mensile (ogni mese)</option>
                <option value="unatantum">Una tantum (singola)</option>
                <option value="custom">Personalizzata (ogni N mesi)</option>
              </select>
            </div>

            {form.ricorrenza === 'custom' && (
              <div className="form-group">
                <label>Ogni quanti mesi</label>
                <input type="number" value={form.ogni} onChange={e => setForm(f => ({ ...f, ogni: e.target.value }))} min={1} max={24} />
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label>Mese inizio *</label>
                <select value={form.meseInizio} onChange={e => setForm(f => ({ ...f, meseInizio: parseInt(e.target.value) }))}>
                  {MESI.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Anno inizio *</label>
                <select value={form.annoInizio} onChange={e => setForm(f => ({ ...f, annoInizio: parseInt(e.target.value) }))}>
                  {ANNI.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              {form.ricorrenza !== 'mensile' && (
                <div className="form-group">
                  <label>Durata (mesi, lascia vuoto = illimitata)</label>
                  <input type="number" value={form.durata} onChange={e => setForm(f => ({ ...f, durata: e.target.value }))} min={1} placeholder="es. 12" />
                </div>
              )}
            </div>

            {form.importo && (
              <div style={{ background: 'rgba(107,74,154,0.06)', border: '1px solid rgba(107,74,154,0.2)', borderRadius: 8, padding: '12px 16px', fontSize: 13, marginTop: 4 }}>
                <span style={{ color: 'var(--text-dim)' }}>Importo con IVA: </span>
                <strong style={{ color: 'var(--purple)' }}>{fmt(applyIva(parseFloat(form.importo) || 0, parseFloat(form.iva) || 0))}</strong>
                {form.ricorrenza === 'mensile' && (
                  <span style={{ color: 'var(--text-dim)', marginLeft: 12 }}>· Annuale: <strong style={{ color: 'var(--purple)' }}>{fmt((parseFloat(form.importo) || 0) * 12)}</strong></span>
                )}
              </div>
            )}

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setShowModal(false); setEditingId(null) }}>Annulla</button>
              <button className="btn btn-primary" onClick={salva} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva Costo Fisso'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

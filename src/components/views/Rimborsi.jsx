import { useState, useMemo } from 'react'
import { useData } from '../../hooks/useData'
import { addItem, updateItem, deleteItem, cols } from '../../lib/db'
import { fmt, fmtDate, validaImporto, validaTesto, validaData } from '../../lib/calc'
import { useConfirm } from '../ui/FormComponents'

const CATEGORIE = ['Trasporto', 'Vitto & Alloggio', 'Materiali', 'Software', 'Altro']
const CAT_ICONS = { 'Trasporto': '🚗', 'Vitto & Alloggio': '🍽', 'Materiali': '📦', 'Software': '💻', 'Altro': '📋' }

export default function Rimborsi() {
  const { rimborsi, professionisti, progetti, loading } = useData()
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [filtroStato, setFiltroStato] = useState('tutti')
  const [saving, setSaving] = useState(false)

  const emptyForm = { profId: '', importo: '', desc: '', data: new Date().toISOString().split('T')[0], categoria: 'Trasporto', progettoId: '', stato: 'da_rimborsare', note: '' }
  const [form, setForm] = useState(emptyForm)

  const rimborsiOrdinati = useMemo(() =>
    [...rimborsi].filter(r => filtroStato === 'tutti' || r.stato === filtroStato)
      .sort((a, b) => new Date(b.data) - new Date(a.data))
  , [rimborsi, filtroStato])

  const totDa = rimborsi.filter(r => r.stato === 'da_rimborsare').reduce((a, r) => a + (parseFloat(r.importo) || 0), 0)
  const totRimb = rimborsi.filter(r => r.stato === 'rimborsato').reduce((a, r) => a + (parseFloat(r.importo) || 0), 0)

  const openNew = () => { setEditingId(null); setForm(emptyForm); setShowModal(true) }
  const openEdit = (r) => { setEditingId(r.id); setForm({ profId: r.profId || '', importo: r.importo || '', desc: r.desc || '', data: r.data || '', categoria: r.categoria || 'Trasporto', progettoId: r.progettoId || '', stato: r.stato || 'da_rimborsare', note: r.note || '' }); setShowModal(true) }

  const salva = async () => {
    if (!form.profId || !form.importo || !form.desc) return alert('Compila collaboratore, importo e descrizione.')
    setSaving(true)
    const data = { ...form, importo: parseFloat(form.importo) || 0 }
    if (editingId) await updateItem(cols.rimborsi, editingId, data)
    else await addItem(cols.rimborsi, data)
    setSaving(false); setShowModal(false); setForm(emptyForm); setEditingId(null)
  }

  const elimina = async (id) => { if (!window.confirm('Eliminare?')) return; await deleteItem(cols.rimborsi, id) }
  const segnaRimborsato = async (r) => await updateItem(cols.rimborsi, r.id, { ...r, stato: 'rimborsato' })
  const getProfNome = (id) => professionisti.find(p => p.id === id)?.nome || '—'
  const getProgNome = (id) => progetti.find(p => p.id === id)?.nome?.split(' – ')[0] || '—'

  if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>

  return (
    <>
      <div className="page-header">
        <div className="page-title">Rimborso Spese</div>
        <div className="page-sub">Spese anticipate dai collaboratori</div>
        <div className="header-actions">
          <select value={filtroStato} onChange={e => setFiltroStato(e.target.value)} style={{ width: 160 }}>
            <option value="tutti">Tutti</option>
            <option value="da_rimborsare">Da rimborsare</option>
            <option value="rimborsato">Rimborsati</option>
          </select>
          <button className="btn btn-primary" onClick={openNew}>＋ Nuova Spesa</button>
        </div>
      </div>

      <div className="content">
        <div className="grid-3" style={{ marginBottom: 20 }}>
          <div className="stat-card red"><div className="stat-label">Da Rimborsare</div><div className="stat-value">{fmt(totDa)}</div><div className="stat-note">{rimborsi.filter(r => r.stato === 'da_rimborsare').length} spese in attesa</div></div>
          <div className="stat-card green"><div className="stat-label">Rimborsati</div><div className="stat-value">{fmt(totRimb)}</div><div className="stat-note">{rimborsi.filter(r => r.stato === 'rimborsato').length} spese pagate</div></div>
          <div className="stat-card gold"><div className="stat-label">Totale</div><div className="stat-value">{fmt(totDa + totRimb)}</div><div className="stat-note">{rimborsi.length} spese totali</div></div>
        </div>

        {rimborsiOrdinati.length === 0
          ? <div className="empty-state"><div className="icon">🧾</div><p>Nessuna spesa registrata.</p></div>
          : <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Data</th><th>Collaboratore</th><th>Categoria</th><th>Descrizione</th><th>Progetto</th><th>Stato</th><th className="text-right">Importo</th><th></th></tr></thead>
                <tbody>
                  {rimborsiOrdinati.map(r => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-dim)' }}>{fmtDate(r.data)}</td>
                      <td style={{ fontWeight: 500 }}>{getProfNome(r.profId)}</td>
                      <td><span className="badge badge-blue">{CAT_ICONS[r.categoria] || '📋'} {r.categoria}</span></td>
                      <td style={{ fontSize: 13 }}>{r.desc}{r.note && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.note}</div>}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.progettoId ? getProgNome(r.progettoId) : '—'}</td>
                      <td>{r.stato === 'da_rimborsare' ? <span className="badge badge-red">⏳ Da rimborsare</span> : <span className="badge badge-green">✓ Rimborsato</span>}</td>
                      <td className="text-right fw-500" style={{ color: r.stato === 'rimborsato' ? 'var(--text-dim)' : 'var(--red)' }}>{fmt(parseFloat(r.importo) || 0)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {r.stato === 'da_rimborsare' && <button onClick={() => segnaRimborsato(r)} style={{ background: 'rgba(45,122,58,0.1)', color: 'var(--green)', border: '1px solid rgba(45,122,58,0.3)', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>✓ Rimborsa</button>}
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>✎</button>
                          <button className="btn btn-danger btn-sm" onClick={() => elimina(r.id)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        }
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-title">{editingId ? 'Modifica Spesa' : 'Nuova Spesa'}</div>
            <div className="form-row">
              <div className="form-group"><label>Collaboratore *</label><select value={form.profId} onChange={e => setForm(f => ({ ...f, profId: e.target.value }))}><option value="">— Seleziona —</option>{professionisti.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
              <div className="form-group"><label>Data *</label><input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Importo (€) *</label><input type="number" value={form.importo} onChange={e => setForm(f => ({ ...f, importo: e.target.value }))} placeholder="es. 45.50" /></div>
              <div className="form-group"><label>Categoria</label><select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>{CATEGORIE.map(c => <option key={c}>{c}</option>)}</select></div>
            </div>
            <div className="form-group"><label>Descrizione *</label><input value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} placeholder="es. Biglietto treno Milano-Roma" /></div>
            <div className="form-row">
              <div className="form-group"><label>Progetto collegato</label><select value={form.progettoId} onChange={e => setForm(f => ({ ...f, progettoId: e.target.value }))}><option value="">— Nessuno —</option>{progetti.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
              <div className="form-group"><label>Stato</label><select value={form.stato} onChange={e => setForm(f => ({ ...f, stato: e.target.value }))}><option value="da_rimborsare">Da rimborsare</option><option value="rimborsato">Rimborsato</option></select></div>
            </div>
            <div className="form-group"><label>Note</label><input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Note aggiuntive" /></div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setShowModal(false); setEditingId(null) }}>Annulla</button>
              <button className="btn btn-primary" onClick={salva} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

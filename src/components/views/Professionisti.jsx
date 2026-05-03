import { useState, useMemo } from 'react'
import { useData } from '../../hooks/useData'
import { addItem, updateItem, deleteItem, cols } from '../../lib/db'
import { fmt, MESI, totaleProfMese, validaTesto, validaImporto, validaPIVA } from '../../lib/calc'
import { FieldError, ValidationSummary, useConfirm } from '../ui/FormComponents'

const ANNI = [2025, 2026, 2027]

export default function Professionisti() {
  const { professionisti, progetti, loading } = useData()
  const { confirm, ConfirmModal } = useConfirm()
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [annoStats, setAnnoStats] = useState(2026)
  const [saving, setSaving] = useState(false)
  const [errori, setErrori] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})

  const emptyForm = { nome: '', ruolo: '', email: '', piva: '', note: '', compensiFissi: [] }
  const [form, setForm] = useState(emptyForm)
  const [newCompenso, setNewCompenso] = useState({ importo: '', meseInizio: 1, annoInizio: 2026, durata: 12 })

  const costiAnno = useMemo(() => {
    const map = {}
    professionisti.forEach(prof => { let t = 0; for (let m = 1; m <= 12; m++) t += totaleProfMese(prof, progetti, annoStats, m); map[prof.id] = t })
    return map
  }, [professionisti, progetti, annoStats])

  const totAnno = Object.values(costiAnno).reduce((a, v) => a + v, 0)

  const valida = () => {
    const fe = {}, errs = []
    const eNome = validaTesto(form.nome, 'Nome'); if (eNome) { fe.nome = eNome; errs.push(eNome) }
    const eRuolo = validaTesto(form.ruolo, 'Ruolo'); if (eRuolo) { fe.ruolo = eRuolo; errs.push(eRuolo) }
    if (form.piva) {
      const { valida: ok, errore } = validaPIVA(form.piva)
      if (!ok) { fe.piva = errore; errs.push(errore) }
    } else {
      // P.IVA non obbligatoria in fase di inserimento ma segnala warning
      fe.piva_warning = true
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      fe.email = 'Formato email non valido.'; errs.push(fe.email)
    }
    setFieldErrors(fe); setErrori(errs)
    return errs.length === 0
  }

  const openNew = () => { setEditingId(null); setForm(emptyForm); setErrori([]); setFieldErrors({}); setShowModal(true) }
  const openEdit = (p) => { setEditingId(p.id); setForm({ nome: p.nome||'', ruolo: p.ruolo||'', email: p.email||'', piva: p.piva||'', note: p.note||'', compensiFissi: p.compensiFissi||[] }); setErrori([]); setFieldErrors({}); setShowModal(true) }

  const salva = async () => {
    if (!valida()) return
    setSaving(true)
    if (editingId) await updateItem(cols.professionisti, editingId, form)
    else await addItem(cols.professionisti, form)
    setSaving(false); setShowModal(false); setForm(emptyForm); setEditingId(null)
  }

  const elimina = async (prof) => {
    const inUso = progetti.some(p => (p.costi||[]).some(c => c.profId === prof.id))
    if (inUso) { alert(`Non puoi eliminare ${prof.nome}: è collegato a uno o più progetti. Rimuovilo prima dai costi operatori.`); return }
    const ok = await confirm(`Eliminare ${prof.nome}?`, 'Questa operazione non può essere annullata.')
    if (!ok) return
    await deleteItem(cols.professionisti, prof.id)
  }

  const addCompenso = () => {
    const eImp = validaImporto(newCompenso.importo, 'Importo compenso')
    if (eImp) { setErrori([eImp]); return }
    setForm(f => ({ ...f, compensiFissi: [...f.compensiFissi, { ...newCompenso, importo: parseFloat(newCompenso.importo) }] }))
    setNewCompenso({ importo: '', meseInizio: 1, annoInizio: 2026, durata: 12 }); setErrori([])
  }

  const openEmail = (prof) => {
    if (!prof.email) { alert('Email non disponibile per questo professionista.'); return }
    const mese = new Date().getMonth()+1, anno = new Date().getFullYear()
    const tot = totaleProfMese(prof, progetti, anno, mese)
    const oggetto = `Recap fatturazione ${MESI[mese-1]} ${anno} - Pillole Culinarie`
    const corpo = `Gentile ${prof.nome},\n\nti inviamo il riepilogo delle fatture da emettere per ${MESI[mese-1]} ${anno}.\n\nTOTALE: ${fmt(tot)}\n\nGrazie,\nPillole Culinarie`
    window.location.href = `mailto:${prof.email}?subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(corpo)}`
  }

  if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>

  const topProf = [...professionisti].sort((a, b) => (costiAnno[b.id]||0) - (costiAnno[a.id]||0))
  const costoMax = costiAnno[topProf[0]?.id] || 1

  return (
    <>
      <ConfirmModal />
      <div className="page-header">
        <div className="page-title">Professionisti</div>
        <div className="page-sub">Collaboratori e costi operatori</div>
        <div className="header-actions">
          <select value={annoStats} onChange={e => setAnnoStats(parseInt(e.target.value))} style={{ width: 100 }}>{ANNI.map(a => <option key={a}>{a}</option>)}</select>
          <button className="btn btn-primary" onClick={openNew}>＋ Nuovo Professionista</button>
        </div>
      </div>
      <div className="content">
        <div className="grid-3" style={{ marginBottom: 20 }}>
          <div className="stat-card red"><div className="stat-label">Costi Operatori {annoStats}</div><div className="stat-value">{fmt(totAnno)}</div><div className="stat-note">{professionisti.length} collaboratori</div></div>
          <div className="stat-card gold"><div className="stat-label">Media mensile</div><div className="stat-value">{fmt(totAnno/12)}</div><div className="stat-note">Costo medio mensile totale</div></div>
          <div className="stat-card purple"><div className="stat-label">Media per collaboratore</div><div className="stat-value">{fmt(professionisti.length>0?totAnno/professionisti.length:0)}</div><div className="stat-note">Costo medio annuale</div></div>
        </div>
        {professionisti.length === 0
          ? <div className="empty-state"><div className="icon">◉</div><p>Nessun professionista ancora.</p></div>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(380px,1fr))', gap: 16 }}>
            {topProf.map(prof => {
              const costoAnno = costiAnno[prof.id]||0
              const pivaOk = prof.piva && prof.piva.length >= 11
              const progettiCol = progetti.filter(p => (p.costi||[]).some(c => c.profId===prof.id))
              return (
                <div key={prof.id} className="card" style={{ borderLeft: !pivaOk ? '3px solid var(--red)' : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{prof.nome}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{prof.ruolo}</div>
                      {pivaOk ? <span className="piva-tag" style={{ marginTop: 6, display: 'inline-block' }}>P.IVA {prof.piva}</span> : <span className="piva-missing" style={{ marginTop: 6, display: 'inline-block' }}>⚠ P.IVA mancante — aggiorna prima di fatturare</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {prof.email && <button className="btn btn-email btn-sm" onClick={() => openEmail(prof)}>✉</button>}
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(prof)}>✎</button>
                      <button className="btn btn-danger btn-sm" onClick={() => elimina(prof)}>✕</button>
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Costo {annoStats}</span><span style={{ fontWeight: 700, color: 'var(--red)', fontSize: 14 }}>{fmt(costoAnno)}</span></div>
                    <div className="progress-bar"><div className="progress-fill red" style={{ width: `${costoAnno/costoMax*100}%` }}/></div>
                  </div>
                  {progettiCol.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>{progettiCol.map(p => <span key={p.id} className="badge badge-gold" style={{ fontSize: 10 }}>{p.nome?.split(' – ')[0]||p.cliente}</span>)}</div>}
                  {prof.email && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>✉ {prof.email}</div>}
                </div>
              )
            })}
          </div>
        }
      </div>
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget&&setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-title">{editingId ? 'Modifica Professionista' : 'Nuovo Professionista'}</div>
            <ValidationSummary errors={errori} />
            <div className="form-row">
              <div className="form-group"><label>Nome completo *</label><input value={form.nome} onChange={e=>{setForm(f=>({...f,nome:e.target.value}));setFieldErrors(fe=>({...fe,nome:null}))}} style={fieldErrors.nome?{borderColor:'var(--red)'}:{}}/><FieldError error={fieldErrors.nome}/></div>
              <div className="form-group"><label>Ruolo *</label><input value={form.ruolo} onChange={e=>{setForm(f=>({...f,ruolo:e.target.value}));setFieldErrors(fe=>({...fe,ruolo:null}))}} style={fieldErrors.ruolo?{borderColor:'var(--red)'}:{}}/><FieldError error={fieldErrors.ruolo}/></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e=>{setForm(f=>({...f,email:e.target.value}));setFieldErrors(fe=>({...fe,email:null}))}} style={fieldErrors.email?{borderColor:'var(--red)'}:{}}/><FieldError error={fieldErrors.email}/></div>
              <div className="form-group">
                <label>P.IVA {fieldErrors.piva_warning && <span style={{color:'var(--gold)',fontSize:10,marginLeft:4}}>⚠ Richiesta per fatturare</span>}</label>
                <input value={form.piva} placeholder="IT12345678901" onChange={e=>{setForm(f=>({...f,piva:e.target.value.trim().toUpperCase()}));setFieldErrors(fe=>({...fe,piva:null,piva_warning:false}))}} style={fieldErrors.piva?{borderColor:'var(--red)'}:{}}/>
                <FieldError error={fieldErrors.piva}/>
              </div>
            </div>
            <div className="form-group"><label>Note</label><input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/></div>
            <hr className="divider"/>
            <div style={{fontSize:11,textTransform:'uppercase',color:'var(--text-dim)',marginBottom:10,fontWeight:600}}>Compensi Fissi Aziendali</div>
            {form.compensiFissi.map((c,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',marginBottom:6}}><span style={{fontSize:13}}>{fmt(c.importo)}/mese × {c.durata} mesi — da {MESI[(c.meseInizio||1)-1]} {c.annoInizio}</span><button className="delete-btn" onClick={()=>setForm(f=>({...f,compensiFissi:f.compensiFissi.filter((_,idx)=>idx!==i)}))}>✕</button></div>)}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr auto',gap:8,alignItems:'flex-end'}}>
              <div className="form-group" style={{marginBottom:0}}><label>€/mese *</label><input type="number" min="0.01" value={newCompenso.importo} onChange={e=>setNewCompenso(c=>({...c,importo:e.target.value}))}/></div>
              <div className="form-group" style={{marginBottom:0}}><label>Mese inizio</label><select value={newCompenso.meseInizio} onChange={e=>setNewCompenso(c=>({...c,meseInizio:parseInt(e.target.value)}))}>{MESI.map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select></div>
              <div className="form-group" style={{marginBottom:0}}><label>Anno</label><select value={newCompenso.annoInizio} onChange={e=>setNewCompenso(c=>({...c,annoInizio:parseInt(e.target.value)}))}>{ANNI.map(a=><option key={a}>{a}</option>)}</select></div>
              <div className="form-group" style={{marginBottom:0}}><label>Durata (mesi)</label><input type="number" min="1" max="120" value={newCompenso.durata} onChange={e=>setNewCompenso(c=>({...c,durata:parseInt(e.target.value)||1}))}/></div>
              <button className="btn btn-ghost" onClick={addCompenso}>＋</button>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>{setShowModal(false);setEditingId(null)}}>Annulla</button>
              <button className="btn btn-primary" onClick={salva} disabled={saving}>{saving?'Salvataggio...':'Salva'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

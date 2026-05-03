import { useState, useMemo } from 'react'
import { useData } from '../../hooks/useData'
import { addItem, updateItem, deleteItem, cols } from '../../lib/db'
import { fmt, fatturatoCliente, costoOperatoreMese } from '../../lib/calc'

const ANNI = [2025, 2026, 2027]
const COLORI = ['#2c5f8a','#a07840','#6b4a9a','#2d7a3a','#c0392b','#7ab0a0','#e67e22','#8e44ad']

export default function BusinessUnit() {
  const { businessUnit, progetti, loading } = useData()
  const [annoStats, setAnnoStats] = useState(2026)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const emptyForm = { nome: '', colore: '#2c5f8a', descrizione: '' }
  const [form, setForm] = useState(emptyForm)

  const buStats = useMemo(() => businessUnit.map(bu => {
    let fatturato = 0, costi = 0
    progetti.forEach(p => {
      const split = (p.buSplit || []).find(s => s.buId === bu.id)
      if (split) {
        for (let m = 1; m <= 12; m++) {
          const f = fatturatoCliente(p, annoStats, m)
          if (f > 0) {
            if (p.tipo === 'ricorrente') fatturato += parseFloat(split.importo) || 0
            else {
              const totP = p.scadenze?.length > 0 ? p.scadenze.reduce((a,s) => a+(parseFloat(s.importo)||0),0) : parseFloat(p.importo)||0
              fatturato += f * (totP > 0 ? (parseFloat(split.importo)||0)/totP : 0)
            }
          }
        }
      }
      ;(p.costi||[]).forEach(c => { if(c.buId===bu.id) for(let m=1;m<=12;m++) costi+=costoOperatoreMese(c,p,annoStats,m) })
    })
    return { ...bu, fatturato, costi, margine: fatturato-costi }
  }), [businessUnit, progetti, annoStats])

  const totFat = buStats.reduce((a,b)=>a+b.fatturato,0)
  const maxFat = Math.max(...buStats.map(b=>b.fatturato),1)

  const openNew = () => { setEditingId(null); setForm(emptyForm); setShowModal(true) }
  const openEdit = (bu) => { setEditingId(bu.id); setForm({ nome:bu.nome||'', colore:bu.colore||'#2c5f8a', descrizione:bu.descrizione||'' }); setShowModal(true) }
  const salva = async () => {
    if(!form.nome) return alert('Inserisci il nome.')
    setSaving(true)
    if(editingId) await updateItem(cols.businessUnit,editingId,form)
    else await addItem(cols.businessUnit,form)
    setSaving(false); setShowModal(false); setForm(emptyForm); setEditingId(null)
  }
  const elimina = async (id) => { if(!window.confirm('Eliminare?')) return; await deleteItem(cols.businessUnit,id) }

  if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>

  return (
    <>
      <div className="page-header">
        <div className="page-title">Business Unit</div>
        <div className="page-sub">Aree di servizio e performance per unità</div>
        <div className="header-actions">
          <select value={annoStats} onChange={e=>setAnnoStats(parseInt(e.target.value))} style={{width:100}}>{ANNI.map(a=><option key={a}>{a}</option>)}</select>
          <button className="btn btn-primary" onClick={openNew}>＋ Nuova BU</button>
        </div>
      </div>
      <div className="content">
        <div className="grid-3" style={{marginBottom:20}}>
          <div className="stat-card gold"><div className="stat-label">Fatturato {annoStats}</div><div className="stat-value">{fmt(totFat)}</div><div className="stat-note">{businessUnit.length} business unit</div></div>
          <div className="stat-card red"><div className="stat-label">Costi Operatori</div><div className="stat-value">{fmt(buStats.reduce((a,b)=>a+b.costi,0))}</div><div className="stat-note">Attribuiti alle BU</div></div>
          <div className="stat-card green"><div className="stat-label">Margine</div><div className="stat-value">{fmt(buStats.reduce((a,b)=>a+b.margine,0))}</div><div className="stat-note">Fatturato − Costi BU</div></div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:16,marginBottom:20}}>
          {buStats.map(bu => {
            const mgPct = bu.fatturato>0?Math.round(bu.margine/bu.fatturato*100):0
            const progettiCol = progetti.filter(p=>(p.buSplit||[]).some(s=>s.buId===bu.id))
            return (
              <div key={bu.id} className="card" style={{borderTop:`4px solid ${bu.colore}`}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                      <div style={{width:10,height:10,borderRadius:'50%',background:bu.colore}}/>
                      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:600}}>{bu.nome}</div>
                    </div>
                    {bu.descrizione&&<div style={{fontSize:12,color:'var(--text-muted)'}}>{bu.descrizione}</div>}
                  </div>
                  <div style={{display:'flex',gap:4}}>
                    <button className="btn btn-ghost btn-sm" onClick={()=>openEdit(bu)}>✎</button>
                    <button className="btn btn-danger btn-sm" onClick={()=>elimina(bu.id)}>✕</button>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
                  {[['Fatturato',bu.fatturato,bu.colore],['Costi',bu.costi,'var(--red)'],['Margine',bu.margine,bu.margine>=0?'var(--green)':'var(--red)']].map(([lab,val,col])=>(
                    <div key={lab} style={{textAlign:'center',background:'var(--surface2)',borderRadius:8,padding:'8px 4px'}}>
                      <div style={{fontSize:10,color:'var(--text-dim)',textTransform:'uppercase',marginBottom:3}}>{lab}</div>
                      <div style={{fontSize:14,fontFamily:"'Cormorant Garamond',serif",fontWeight:600,color:col}}>{fmt(val)}</div>
                    </div>
                  ))}
                </div>
                <div style={{marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-dim)',marginBottom:4}}>
                    <span>Quota fatturato</span><span style={{color:bu.colore,fontWeight:600}}>{totFat>0?Math.round(bu.fatturato/totFat*100):0}% · Margine {mgPct}%</span>
                  </div>
                  <div className="progress-bar"><div style={{height:'100%',background:bu.colore,borderRadius:3,width:`${bu.fatturato/maxFat*100}%`,transition:'width 0.4s'}}/></div>
                </div>
                {progettiCol.length>0&&(
                  <div style={{display:'flex',flexWrap:'wrap',gap:5,paddingTop:8,borderTop:'1px solid var(--border)'}}>
                    {progettiCol.map(p=><span key={p.id} className="badge badge-gold" style={{fontSize:10}}>{p.nome?.split(' – ')[0]||p.cliente}</span>)}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {buStats.length>0&&(
          <div className="card">
            <div className="card-title">Confronto Business Unit {annoStats}</div>
            <div className="table-wrap"><table>
              <thead><tr><th>Business Unit</th><th className="text-right">Fatturato</th><th className="text-right">Quota</th><th className="text-right">Costi</th><th className="text-right">Margine</th><th className="text-right">Margine %</th></tr></thead>
              <tbody>
                {[...buStats].sort((a,b)=>b.fatturato-a.fatturato).map(bu=>(
                  <tr key={bu.id}>
                    <td><div style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:10,height:10,borderRadius:'50%',background:bu.colore}}/><span style={{fontWeight:500}}>{bu.nome}</span></div></td>
                    <td className="text-right text-gold fw-500">{fmt(bu.fatturato)}</td>
                    <td className="text-right" style={{color:'var(--text-muted)'}}>{totFat>0?Math.round(bu.fatturato/totFat*100):0}%</td>
                    <td className="text-right text-red">{fmt(bu.costi)}</td>
                    <td className="text-right fw-500" style={{color:bu.margine>=0?'var(--green)':'var(--red)'}}>{fmt(bu.margine)}</td>
                    <td className="text-right" style={{color:bu.margine>=0?'var(--green)':'var(--red)'}}>{bu.fatturato>0?Math.round(bu.margine/bu.fatturato*100):0}%</td>
                  </tr>
                ))}
                <tr style={{background:'rgba(160,120,64,0.05)',fontWeight:700}}>
                  <td>TOTALE</td>
                  <td className="text-right text-gold">{fmt(totFat)}</td><td className="text-right">100%</td>
                  <td className="text-right text-red">{fmt(buStats.reduce((a,b)=>a+b.costi,0))}</td>
                  <td className="text-right" style={{color:buStats.reduce((a,b)=>a+b.margine,0)>=0?'var(--green)':'var(--red)'}}>{fmt(buStats.reduce((a,b)=>a+b.margine,0))}</td>
                  <td className="text-right" style={{color:buStats.reduce((a,b)=>a+b.margine,0)>=0?'var(--green)':'var(--red)'}}>{totFat>0?Math.round(buStats.reduce((a,b)=>a+b.margine,0)/totFat*100):0}%</td>
                </tr>
              </tbody>
            </table></div>
          </div>
        )}
      </div>

      {showModal&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowModal(false)}>
          <div className="modal" style={{maxWidth:420}}>
            <div className="modal-title">{editingId?'Modifica BU':'Nuova Business Unit'}</div>
            <div className="form-group"><label>Nome *</label><input value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} placeholder="es. Social Media"/></div>
            <div className="form-group"><label>Descrizione</label><input value={form.descrizione} onChange={e=>setForm(f=>({...f,descrizione:e.target.value}))} placeholder="es. Gestione canali social"/></div>
            <div className="form-group">
              <label>Colore</label>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:4}}>
                {COLORI.map(c=><div key={c} onClick={()=>setForm(f=>({...f,colore:c}))} style={{width:28,height:28,borderRadius:'50%',background:c,cursor:'pointer',border:form.colore===c?'3px solid var(--text)':'3px solid transparent'}}/>)}
              </div>
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

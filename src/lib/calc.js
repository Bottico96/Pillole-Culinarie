export const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

export const fmt = (n) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0)

export const fmtDate = (dateStr) => {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('it-IT')
}

export function progettoAttivo(p, anno, mese) {
  const aI = parseInt(p.annoInizio) || 2026
  const mI = parseInt(p.meseInizio) || 1
  const dur = parseInt(p.durata) || 1
  if (anno < aI) return false
  if (anno > aI) return mese <= (mI + dur - 1) - 12
  return mese >= mI && mese < mI + dur
}

export function fatturatoCliente(p, anno, mese) {
  if (p.tipo === 'spot') {
    if (!p.scadenze?.length) {
      if (anno !== parseInt(p.annoInizio) || mese !== parseInt(p.meseInizio)) return 0
      return parseFloat(p.importo) || 0
    }
    return p.scadenze
      .filter(sc => {
        if (!sc.data) return false
        const d = new Date(sc.data + 'T00:00:00')
        return d.getFullYear() === anno && d.getMonth() + 1 === mese
      })
      .reduce((a, sc) => a + (parseFloat(sc.importo) || 0), 0)
  }
  if (!progettoAttivo(p, anno, mese)) return 0
  return parseFloat(p.importo) || 0
}

export function costoOperatoreMese(c, p, anno, mese) {
  const imp = parseFloat(c.importo) || 0
  if (imp <= 0) return 0
  if (c.tipo === 'unatantum') {
    return (parseInt(c.anno) === anno && parseInt(c.mese) === mese) ? imp : 0
  }
  // mensile
  if (!progettoAttivo(p, anno, mese)) return 0
  return imp
}

export function costoFissoMese(cf, anno, mese) {
  const mI = parseInt(cf.meseInizio) || 1
  const aI = parseInt(cf.annoInizio) || 2026
  const imp = parseFloat(cf.importo) || 0
  if (anno < aI) return 0
  const mesiDaInizio = (anno - aI) * 12 + (mese - mI)
  if (mesiDaInizio < 0) return 0
  if (cf.ricorrenza === 'mensile') return imp
  if (cf.ricorrenza === 'unatantum') return mesiDaInizio === 0 ? imp : 0
  if (cf.ricorrenza === 'custom') {
    const ogni = parseInt(cf.ogni) || 1
    const durata = cf.durata ? parseInt(cf.durata) : null
    if (durata && mesiDaInizio >= durata) return 0
    return mesiDaInizio % ogni === 0 ? imp : 0
  }
  return 0
}

export function applyIva(imp, iva) {
  return imp * (1 + (iva || 0) / 100)
}

export function compensiFissiMese(prof, anno, mese) {
  return (prof.compensiFissi || []).reduce((tot, c) => {
    const mI = parseInt(c.meseInizio) || 1
    const aI = parseInt(c.annoInizio) || 2026
    const dur = parseInt(c.durata) || 12
    const mesiDaInizio = (anno - aI) * 12 + (mese - mI)
    if (mesiDaInizio >= 0 && mesiDaInizio < dur) return tot + (parseFloat(c.importo) || 0)
    return tot
  }, 0)
}

export function totaleProfMese(prof, progetti, anno, mese) {
  let tot = 0
  progetti.forEach(p => {
    (p.costi || []).forEach(c => {
      if (String(c.profId) === String(prof.id)) {
        tot += costoOperatoreMese(c, p, anno, mese)
      }
    })
  })
  tot += compensiFissiMese(prof, anno, mese)
  return tot
}

export function totaleCostiFissiMese(costiFissi, anno, mese) {
  return costiFissi.reduce((tot, cf) => tot + costoFissoMese(cf, anno, mese), 0)
}

// ── VALIDAZIONE INPUT ──────────────────────────────────────────

// Valida P.IVA italiana: IT + 11 cifre
export function validaPIVA(piva) {
  if (!piva) return { valida: false, errore: 'P.IVA obbligatoria per la fatturazione italiana.' }
  const clean = piva.replace(/\s/g, '').toUpperCase()
  if (!/^IT\d{11}$/.test(clean) && !/^\d{11}$/.test(clean)) {
    return { valida: false, errore: 'Formato non valido. Esempi corretti: IT12345678901 oppure 12345678901' }
  }
  // Algoritmo di controllo cifra finale (Luhn adattato per P.IVA IT)
  const digits = clean.replace('IT', '')
  let s = 0
  for (let i = 0; i < 10; i++) {
    const d = parseInt(digits[i])
    s += i % 2 === 0 ? d : (d * 2 > 9 ? d * 2 - 9 : d * 2)
  }
  const check = (10 - (s % 10)) % 10
  if (check !== parseInt(digits[10])) {
    return { valida: false, errore: 'P.IVA non valida (cifra di controllo errata).' }
  }
  return { valida: true, errore: null }
}

// Valida importo: numero positivo, max 2 decimali
export function validaImporto(val, campo = 'Importo') {
  const n = parseFloat(val)
  if (val === '' || val === null || val === undefined) return `${campo} è obbligatorio.`
  if (isNaN(n)) return `${campo} deve essere un numero.`
  if (n <= 0) return `${campo} deve essere maggiore di zero.`
  if (n > 9_999_999) return `${campo} sembra troppo alto — controlla il valore.`
  if (!/^\d+(\.\d{1,2})?$/.test(String(Math.abs(n)))) return `${campo} può avere al massimo 2 decimali.`
  return null
}

// Valida data: formato YYYY-MM-DD, non troppo nel passato/futuro
export function validaData(dateStr, campo = 'Data') {
  if (!dateStr) return `${campo} è obbligatoria.`
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return `${campo} non è una data valida.`
  const anno = d.getFullYear()
  if (anno < 2020) return `${campo}: anno precedente al 2020, controlla il valore.`
  if (anno > 2035) return `${campo}: anno superiore al 2035, controlla il valore.`
  return null
}

// Valida stringa obbligatoria con lunghezza minima/massima
export function validaTesto(val, campo = 'Campo', min = 2, max = 200) {
  if (!val || !val.trim()) return `${campo} è obbligatorio.`
  if (val.trim().length < min) return `${campo} deve avere almeno ${min} caratteri.`
  if (val.trim().length > max) return `${campo} è troppo lungo (max ${max} caratteri).`
  return null
}

// Raccoglie tutti gli errori di un form e restituisce array di stringhe
export function raccogliErrori(checks) {
  return checks.map(fn => fn()).filter(Boolean)
}

// ── FILTRO BDG/CONS ────────────────────────────────────────────

// Restituisce il fatturato filtrato per vista (cons | bdg | tot)
export function fatturatoFiltrato(p, anno, mese, vista = 'tot') {
  const f = fatturatoCliente(p, anno, mese)
  if (f <= 0 || vista === 'tot') return f

  // Per spot: filtra per bdg_cons della singola scadenza
  if (p.tipo === 'spot' && p.scadenze?.length > 0) {
    return p.scadenze
      .filter(sc => {
        if (!sc.data) return false
        const d = new Date(sc.data + 'T00:00:00')
        return d.getFullYear() === anno && d.getMonth() + 1 === mese &&
          (vista === 'tot' || (sc.bdg_cons || 'bdg') === vista)
      })
      .reduce((a, sc) => a + (parseFloat(sc.importo) || 0), 0)
  }

  // Per ricorrente: consuntivo se mese è in mesiConsuntivati
  const mesiCons = p.mesiConsuntivati || []
  const isCons = mesiCons.includes(mese)
  if (vista === 'cons' && !isCons) return 0
  if (vista === 'bdg' && isCons) return 0
  return f
}

// Costo operatore filtrato per vista
export function costoOperatoreFiltrato(c, p, anno, mese, vista = 'tot') {
  const imp = costoOperatoreMese(c, p, anno, mese)
  if (imp <= 0 || vista === 'tot') return imp
  const bdgCons = c.bdg_cons || 'bdg'
  return bdgCons === vista ? imp : 0
}

// Costo fisso filtrato per vista
export function costoFissoFiltrato(cf, anno, mese, vista = 'tot') {
  const imp = costoFissoMese(cf, anno, mese)
  if (imp <= 0 || vista === 'tot') return imp
  const mesiCons = cf.mesiConsuntivati || []
  const isCons = mesiCons.includes(mese)
  if (vista === 'cons' && !isCons) return 0
  if (vista === 'bdg' && isCons) return 0
  return imp
}

export function saldoIvaTrimestre(progetti, costiFissi, anno, trimestre) {
  const mI = (trimestre - 1) * 3 + 1
  let debito = 0, credito = 0
  for (let m = mI; m < mI + 3; m++) {
    progetti.forEach(p => { debito += fatturatoCliente(p, anno, m) * 0.22 })
    costiFissi.forEach(cf => {
      const imp = costoFissoMese(cf, anno, m)
      credito += imp * ((parseFloat(cf.iva) || 0) / 100)
    })
  }
  return { debito: Math.round(debito), credito: Math.round(credito), saldo: Math.round(debito - credito) }
}

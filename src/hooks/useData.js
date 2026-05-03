import { useState, useEffect } from 'react'
import { subscribeAll, cols } from '../lib/db'

export function useData() {
  const [data, setData] = useState({
    progetti: [],
    professionisti: [],
    costiFissi: [],
    businessUnit: [],
    rimborsi: [],
    movimentiCassa: [],
    fattureEmesse: [],
    fattureRicevute: [],
    loading: true,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubs = []
    let loaded = {}

    const colNames = [
      'progetti', 'professionisti', 'costiFissi', 'businessUnit',
      'rimborsi', 'movimentiCassa', 'fattureEmesse', 'fattureRicevute'
    ]

    colNames.forEach(name => {
      loaded[name] = false
      const unsub = subscribeAll(cols[name], items => {
        loaded[name] = true
        setData(prev => ({ ...prev, [name]: items }))
        if (Object.values(loaded).every(Boolean)) setLoading(false)
      })
      unsubs.push(unsub)
    })

    return () => unsubs.forEach(u => u())
  }, [])

  return { ...data, loading }
}

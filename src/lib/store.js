/**
 * store.js — Camada de dados offline-first
 *
 * Estratégia:
 *  1. ESCREVE no localStorage imediatamente (zero latência, disponível offline)
 *  2. TENTA escrever no Supabase. Se falhar → enfileira na fila de sync.
 *  3. No startup (online) → puxa do Supabase (fonte verdade na nuvem).
 *  4. Quando volta online → processa a fila de sync.
 */

import { supabase } from './supabase'
import { PRODUTOS_INICIAIS } from './catalog'

// ── CHAVES LOCAL ──────────────────────────────────────────────────────────────
const K = {
  produtos:  'korin-produtos',
  pedidos:   'korin-pedidos',
  periodo:   'korin-periodo',
  queue:     'korin-sync-queue',
  lastSync:  'korin-last-sync',
}

// ── HELPERS LOCAL ─────────────────────────────────────────────────────────────
const local = {
  get: (k)    => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} },
}

// ── FILA DE SYNC (operações que falharam por falta de internet) ───────────────
const enqueue = (key, value) => {
  const q = local.get(K.queue) || []
  const sem = q.filter(x => x.key !== key)          // remove entrada anterior da mesma chave
  sem.push({ key, value, ts: Date.now() })
  local.set(K.queue, sem)
}

/** Processa toda a fila pendente. Chame quando detectar retorno de internet. */
export const flushQueue = async () => {
  if (!supabase) return { ok: false, reason: 'no_supabase' }
  const q = local.get(K.queue) || []
  if (!q.length) return { ok: true, flushed: 0 }

  const remaining = []
  let flushed = 0

  for (const item of q) {
    try {
      const { error } = await supabase
        .from('korin_data')
        .upsert({ key: item.key, value: item.value, updated_at: new Date().toISOString() })
      if (error) throw error
      flushed++
    } catch {
      remaining.push(item)
    }
  }

  local.set(K.queue, remaining)
  if (!remaining.length) local.set(K.lastSync, new Date().toISOString())
  return { ok: true, flushed, pending: remaining.length }
}

// ── PUSH INDIVIDUAL (escrita + fallback para fila) ────────────────────────────
const push = async (key, value) => {
  if (!supabase) { enqueue(key, value); return false }
  try {
    const { error } = await supabase
      .from('korin_data')
      .upsert({ key, value, updated_at: new Date().toISOString() })
    if (error) throw error
    local.set(K.lastSync, new Date().toISOString())
    return true
  } catch {
    enqueue(key, value)
    return false
  }
}

// ── PULL (busca nuvem → atualiza local) ───────────────────────────────────────
export const pullFromCloud = async () => {
  if (!supabase) return { ok: false, reason: 'no_supabase' }
  try {
    const { data, error } = await supabase.from('korin_data').select('*')
    if (error) throw error
    data?.forEach(row => local.set(row.key, row.value))
    local.set(K.lastSync, new Date().toISOString())
    return { ok: true, rows: data?.length || 0 }
  } catch (e) {
    return { ok: false, reason: e.message }
  }
}

// ── OPERAÇÕES DE NEGÓCIO ──────────────────────────────────────────────────────
export const loadAll = () => ({
  produtos:  local.get(K.produtos) || PRODUTOS_INICIAIS,
  pedidos:   local.get(K.pedidos)  || [],
  periodo:   local.get(K.periodo)  || 'Abril/2026',
  lastSync:  local.get(K.lastSync),
  queueSize: (local.get(K.queue) || []).length,
})

export const saveProdutos = (data) => { local.set(K.produtos, data); push(K.produtos, data) }
export const savePedidos  = (data) => { local.set(K.pedidos,  data); push(K.pedidos,  data) }
export const savePeriodo  = (data) => { local.set(K.periodo,  data); push(K.periodo,  data) }

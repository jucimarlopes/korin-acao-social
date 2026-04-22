import { useState, useEffect, useCallback } from 'react'
import { loadAll, saveProdutos, savePedidos, savePeriodo, pullFromCloud, flushQueue } from './lib/store'
import { fmt, calcTotal, sortByCod } from './lib/helpers'
import { printPedido, printTodos } from './lib/print'
import { CAT_COR, CATS_ORDEM, PAGAMENTOS } from './lib/catalog'

// ── SYNC BADGE ────────────────────────────────────────────────────────────────
function SyncBadge({ online, queueSize, lastSync, syncing }) {
  if (syncing) return (
    <div className="text-xs text-yellow-300 font-bold flex items-center gap-1">⟳ Sincronizando…</div>
  )
  if (!online) return (
    <div className="text-xs text-red-300 font-bold flex items-center gap-1">
      📴 Offline{queueSize > 0 ? ` · ${queueSize} pendente(s)` : ''}
    </div>
  )
  if (queueSize > 0) return (
    <div className="text-xs text-yellow-300 font-bold">⚠️ {queueSize} a sincronizar</div>
  )
  return (
    <div className="text-xs text-green-300 font-bold">
      ☁️ {lastSync ? new Date(lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Online'}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab]         = useState('pedidos')
  const [produtos, setProdutos] = useState([])
  const [pedidos, setPedidos]   = useState([])
  const [periodo, setPeriodo]   = useState('Abril/2026')
  const [loaded, setLoaded]     = useState(false)
  const [online, setOnline]     = useState(navigator.onLine)
  const [syncing, setSyncing]   = useState(false)
  const [queueSize, setQueueSize] = useState(0)
  const [lastSync, setLastSync]   = useState(null)

  const [modal, setModal]           = useState(null)
  const [editPedido, setEditPedido]   = useState(null)
  const [editProduto, setEditProduto] = useState(null)
  const [viewPedido, setViewPedido]   = useState(null)
  const [modoEntrega, setModoEntrega] = useState(null)

  // ── STARTUP ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      // 1. Carrega local primeiro (imediato)
      const local = loadAll()
      setProdutos(local.produtos)
      setPedidos(local.pedidos)
      setPeriodo(local.periodo)
      setQueueSize(local.queueSize)
      setLastSync(local.lastSync)
      setLoaded(true)

      // 2. Se online, puxa da nuvem (pode ter dados mais recentes de outro device)
      if (navigator.onLine) {
        setSyncing(true)
        const result = await pullFromCloud()
        if (result.ok) {
          const fresh = loadAll()
          setProdutos(fresh.produtos)
          setPedidos(fresh.pedidos)
          setPeriodo(fresh.periodo)
          setLastSync(fresh.lastSync)
          setQueueSize(fresh.queueSize)
        }
        // Processa fila de operações que ficaram pendentes
        await flushQueue()
        const afterFlush = loadAll()
        setQueueSize(afterFlush.queueSize)
        setLastSync(afterFlush.lastSync)
        setSyncing(false)
      }
    }
    init()
  }, [])

  // ── DETECTA ONLINE/OFFLINE ─────────────────────────────────────────────────
  useEffect(() => {
    const goOnline = async () => {
      setOnline(true)
      setSyncing(true)
      await flushQueue()
      const d = loadAll()
      setQueueSize(d.queueSize)
      setLastSync(d.lastSync)
      setSyncing(false)
    }
    const goOffline = () => setOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // ── AÇÕES ──────────────────────────────────────────────────────────────────
  const atualizarPedidos = (novosPedidos) => {
    setPedidos(novosPedidos)
    savePedidos(novosPedidos)
    setQueueSize(loadAll().queueSize)
  }

  const atualizarProdutos = (novosProdutos) => {
    setProdutos(novosProdutos)
    saveProdutos(novosProdutos)
  }

  const savePedido = (p) => {
    const novo = p.id
      ? pedidos.map(x => x.id === p.id ? p : x)
      : [...pedidos, { ...p, id: Date.now(), status: 'pendente', dataPedido: new Date().toISOString() }]
    atualizarPedidos(novo)
    closeModal()
  }

  const deletePedido = (id) => {
    if (!window.confirm('Remover este pedido?')) return
    atualizarPedidos(pedidos.filter(x => x.id !== id))
  }

  const entregarPedido = (id) => {
    atualizarPedidos(pedidos.map(x =>
      x.id === id ? { ...x, status: 'entregue', dataEntrega: new Date().toISOString() } : x
    ))
  }

  // Finaliza entrega com itens ajustados + pagamento
  const finalizarEntrega = (id, itensAjustados, pagamento, troco, obs) => {
    atualizarPedidos(pedidos.map(x =>
      x.id === id ? { ...x, status: 'entregue', dataEntrega: new Date().toISOString(), itens: itensAjustados, pagamento, troco, obs } : x
    ))
  }

  const saveProduto = (p) => {
    const novo = p.id
      ? produtos.map(x => x.id === p.id ? p : x)
      : [...produtos, { ...p, id: Date.now(), cod: Math.max(...produtos.map(x => x.cod), 0) + 1 }]
    atualizarProdutos(novo)
    closeModal()
  }

  const deleteProduto = (id) => {
    if (!window.confirm('Remover este produto?')) return
    atualizarProdutos(produtos.filter(x => x.id !== id))
  }

  const changePeriodo = (v) => {
    setPeriodo(v)
    savePeriodo(v)
    closeModal()
  }

  const closeModal = () => { setModal(null); setEditPedido(null); setEditProduto(null); setViewPedido(null) }

  if (!loaded) return (
    <div className="flex items-center justify-center min-h-screen bg-stone-100">
      <div className="text-green-800 text-xl font-black animate-pulse">Carregando… 🌿</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-stone-100 w-full relative">
      {/* HEADER */}
      <header className="bg-green-800 text-white sticky top-0 z-20 shadow-md">
        {/* Logos */}
        <div className="bg-white flex items-center justify-between px-3 py-1.5 border-b border-green-700">
          <img src="/logo-lattuga.png" alt="Lattuga Orgânicos" className="h-9 w-auto" />
          <img src="/logo-korin.png"   alt="Korin"            className="h-8 w-auto" style={{filter:'brightness(0) invert(1)'}} />
        </div>
        {/* Título + período + sync */}
        <div className="px-4 py-2.5 flex items-center justify-between">
          <div className="text-lg font-black leading-tight">Ação Social Korin</div>
          <div className="flex flex-col items-end gap-0.5">
            <button onClick={() => setModal('periodo')} className="text-base font-black active:opacity-60">{periodo}</button>
            <SyncBadge online={online} queueSize={queueSize} lastSync={lastSync} syncing={syncing} />
          </div>
        </div>
      </header>

      {/* CONTEÚDO */}
      <main className="pb-36">
        {tab === 'pedidos'    && <PedidosScreen   pedidos={pedidos}  produtos={produtos} onAdd={() => { setEditPedido(null); setModal('pedido') }} onColar={() => setModal('colar')} onEdit={p => { setEditPedido(p); setModal('pedido') }} onDelete={deletePedido} onView={p => { setViewPedido(p); setModal('detalhe') }} onEntregar={entregarPedido} onIniciarEntrega={p => setModoEntrega(p)} onPrintTodos={() => printTodos(pedidos, produtos, periodo)} />}
        {tab === 'entregas'   && <EntregasScreen  pedidos={pedidos}  produtos={produtos} onEntregar={entregarPedido} onFinalizar={finalizarEntrega} onView={p => { setViewPedido(p); setModal('detalhe') }} onIniciarEntrega={p => setModoEntrega(p)} />}
        {tab === 'produtos'   && <ProdutosScreen  produtos={produtos} onAdd={() => { setEditProduto(null); setModal('produto') }} onEdit={p => { setEditProduto(p); setModal('produto') }} onDelete={deleteProduto} />}
        {tab === 'fechamento' && <FechamentoScreen pedidos={pedidos} produtos={produtos} periodo={periodo} onPrintTodos={() => printTodos(pedidos, produtos, periodo)} />}
      </main>

      {/* BOTTOM NAV */}
      <nav className="fixed bottom-8 left-0 w-full bg-white border-t border-stone-200 flex z-20 shadow-2xl">
        {[
          { id: 'pedidos',    icon: '🛒', label: 'Pedidos' },
          { id: 'entregas',   icon: '🚚', label: 'Entregas' },
          { id: 'produtos',   icon: '📦', label: 'Produtos' },
          { id: 'fechamento', icon: '📊', label: 'Fechamento' },
        ].map(({ id, icon, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 flex flex-col items-center py-2.5 relative transition-colors ${tab === id ? 'text-green-700' : 'text-stone-400'}`}>
            <span className="text-2xl leading-none">{icon}</span>
            <span className={`text-xs mt-0.5 font-bold ${tab === id ? 'text-green-700' : 'text-stone-400'}`}>{label}</span>
            {tab === id && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 bg-green-600 rounded-b-full" />}
          </button>
        ))}
      </nav>

      {/* RODAPÉ */}
      <footer className="fixed bottom-0 left-0 w-full bg-green-900 z-20 flex items-center justify-between px-3 py-1">
        <span className="text-green-400 font-semibold whitespace-nowrap" style={{fontSize:'10px'}}>© Todos os Direitos Reservados — <a href="https://lattuga-organicos.vercel.app" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">Lattuga Orgânicos</a></span>
        <a href="https://www.personalsupport.tec.br/" target="_blank" rel="noopener noreferrer"
          className="text-green-300 font-bold hover:text-white transition-colors underline underline-offset-2 flex-shrink-0 ml-2 whitespace-nowrap" style={{fontSize:'10px'}}>
          Desenvolvido por Personal Support
        </a>
      </footer>

      {/* MODALS */}
      {modal === 'pedido'   && <ModalPedido   pedido={editPedido}   produtos={produtos} onSave={savePedido}   onClose={closeModal} />}
      {modal === 'detalhe'  && viewPedido && <ModalDetalhe  pedido={viewPedido}  produtos={produtos} periodo={periodo} onClose={closeModal} onPrint={() => printPedido(viewPedido, produtos, periodo)} />}
      {modal === 'produto'  && <ModalProduto  produto={editProduto}               onSave={saveProduto}  onClose={closeModal} />}
      {modal === 'periodo'  && <ModalPeriodo  periodo={periodo}                   onSave={changePeriodo} onClose={closeModal} />}
      {modal === 'colar'    && <ModalColarPedido produtos={produtos} onSave={savePedido} onClose={closeModal} />}

      {/* MODO ENTREGA — overlay global, acessível de qualquer tab */}
      {modoEntrega && (
        <div className="fixed inset-0 z-50 bg-stone-100 overflow-y-auto pb-4">
          <ModoEntrega
            pedido={modoEntrega}
            produtos={produtos}
            onCancelar={() => setModoEntrega(null)}
            onFinalizar={(itens, pagamento, troco, obs) => {
              finalizarEntrega(modoEntrega.id, itens, pagamento, troco, obs)
              setModoEntrega(null)
            }}
          />
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: PEDIDOS
// ═══════════════════════════════════════════════════════════════════════════════
function PedidosScreen({ pedidos, produtos, onAdd, onColar, onEdit, onDelete, onView, onEntregar, onIniciarEntrega, onPrintTodos }) {
  const [busca, setBusca]   = useState('')
  const [filtro, setFiltro] = useState('todos')

  const lista = pedidos
    .filter(p => p.clienteNome.toLowerCase().includes(busca.toLowerCase()))
    .filter(p => filtro === 'todos' || p.status === filtro)
    .sort((a, b) => a.clienteNome.localeCompare(b.clienteNome))

  const totalGeral = pedidos.reduce((s, p) => s + calcTotal(p, produtos), 0)

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Pedidos"  value={pedidos.length} color="green" />
        <Stat label="Pendentes" value={pedidos.filter(p => p.status === 'pendente').length} color="amber" />
        <Stat label="Total" value={`R$${totalGeral.toFixed(0)}`} color="teal" small />
      </div>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-base">🔍</span>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente…"
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-green-500 shadow-sm" />
      </div>

      <div className="flex gap-2 items-center">
        {[['todos', 'Todos'], ['pendente', 'Pendentes'], ['entregue', 'Entregues']].map(([v, l]) => (
          <button key={v} onClick={() => setFiltro(v)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${filtro === v ? 'bg-green-700 text-white' : 'bg-white text-stone-500 border border-stone-200'}`}>{l}</button>
        ))}
        {pedidos.filter(p => p.status === 'pendente').length > 0 &&
          <button onClick={onPrintTodos} className="ml-auto px-3 py-1.5 rounded-full text-xs font-bold bg-stone-700 text-white">🖨️ Imprimir</button>
        }
      </div>

      <div className="space-y-2">
        {lista.length === 0 && <EmptyState icon="🛒" text="Nenhum pedido encontrado" />}
        {lista.map(pedido => {
          const vt = calcTotal(pedido, produtos)
          return (
            <div key={pedido.id} className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
              <button className="w-full text-left p-4 flex items-center gap-3" onClick={() => onView(pedido)}>
                <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-black text-xl flex-shrink-0 ${pedido.status === 'entregue' ? 'bg-green-500' : 'bg-amber-500'}`}>
                  {pedido.clienteNome.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-base text-stone-800 truncate">{pedido.clienteNome}</div>
                  <div className="text-xs text-stone-500 mt-0.5">{pedido.itens.length} item(ns) · <span className="font-bold text-green-700">{fmt(vt)}</span></div>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-bold flex-shrink-0 ${pedido.status === 'entregue' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {pedido.status === 'entregue' ? '✓ Entregue' : '⏳ Pendente'}
                </span>
              </button>
              <div className="grid grid-cols-3 border-t border-stone-100">
                <button onClick={e => { e.stopPropagation(); onEdit(pedido) }} className="py-2.5 text-xs font-bold text-blue-600 flex items-center justify-center gap-1 active:bg-blue-50">✏️ Editar</button>
                {pedido.status === 'pendente'
                  ? <button onClick={e => { e.stopPropagation(); onIniciarEntrega(pedido) }} className="py-2.5 text-xs font-bold text-green-700 flex items-center justify-center border-x border-stone-100 active:bg-green-50">✓ Entregar</button>
                  : <div className="py-2.5 text-xs text-stone-300 flex items-center justify-center border-x border-stone-100">✅ Entregue</div>
                }
                <button onClick={e => { e.stopPropagation(); onDelete(pedido.id) }} className="py-2.5 text-xs font-bold text-red-500 flex items-center justify-center active:bg-red-50">🗑️ Excluir</button>
              </div>
            </div>
          )
        })}
      </div>

      <button onClick={onAdd} className="fixed bottom-36 right-4 w-16 h-16 bg-green-700 text-white rounded-full shadow-xl flex items-center justify-center z-30 active:scale-95 text-3xl">＋</button>
      <button onClick={onColar} title="Colar pedido do WhatsApp" className="fixed bottom-36 right-24 w-14 h-14 bg-white border-2 border-green-700 text-green-700 rounded-full shadow-xl flex flex-col items-center justify-center z-30 active:scale-95">
        <span className="text-xl leading-none">📋</span>
        <span className="text-xs font-black leading-none mt-0.5">Colar</span>
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: ENTREGAS
// ═══════════════════════════════════════════════════════════════════════════════
function EntregasScreen({ pedidos, produtos, onEntregar, onFinalizar, onView, onIniciarEntrega }) {
  const pendentes = pedidos.filter(p => p.status === 'pendente').sort((a, b) => a.clienteNome.localeCompare(b.clienteNome))
  const entregues = pedidos.filter(p => p.status === 'entregue').sort((a, b) => a.clienteNome.localeCompare(b.clienteNome))

  return (
    <div className="px-4 py-4">
      {pedidos.length === 0 && <EmptyState icon="🚚" text="Nenhum pedido cadastrado ainda" />}
      {pendentes.length > 0 && <>
        <SectionLabel icon="⏰" text={`Pendentes · ${pendentes.length}`} color="amber" />
        {pendentes.map(p => (
          <div key={p.id} className="bg-white rounded-2xl border border-stone-200 shadow-sm mb-3 overflow-hidden">
            <button className="w-full text-left p-4" onClick={() => onIniciarEntrega(p)}>
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-2xl font-black text-stone-800">{p.clienteNome}</div>
                  {p.clienteTel && <div className="text-sm text-stone-400 mt-0.5">📱 {p.clienteTel}</div>}
                </div>
                <div className="text-right">
                  <div className="text-xl font-black text-green-700">{fmt(calcTotal(p, produtos))}</div>
                  <div className="text-xs text-amber-600 font-bold mt-0.5">{p.itens.length} item(ns) · Toque para entregar →</div>
                </div>
              </div>
            </button>
          </div>
        ))}
      </>}
      {entregues.length > 0 && <>
        <SectionLabel icon="✅" text={`Entregues · ${entregues.length}`} color="green" />
        {entregues.map(p => (
          <div key={p.id} className="bg-white rounded-2xl border border-green-200 shadow-sm mb-3 overflow-hidden">
            <button className="w-full text-left p-4" onClick={() => onView(p)}>
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-xl font-black text-stone-700">{p.clienteNome}</div>
                  <div className="text-xs text-green-600 font-bold mt-0.5">
                    ✅ Entregue em {new Date(p.dataEntrega).toLocaleDateString('pt-BR')} · {p.pagamento}
                    {p.troco ? ` · Troco R$${p.troco}` : ''}
                  </div>
                </div>
                <div className="text-lg font-black text-green-700">{fmt(calcTotal(p, produtos))}</div>
              </div>
            </button>
          </div>
        ))}
      </>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODO ENTREGA — fluxo 3 etapas
// ═══════════════════════════════════════════════════════════════════════════════
function ModoEntrega({ pedido, produtos, onCancelar, onFinalizar }) {
  const [etapa, setEtapa]   = useState(1)
  const [itens, setItens]   = useState(pedido.itens.map(i => ({ ...i })))
  const [pagamento, setPagamento] = useState(pedido.pagamento || 'PIX')
  const [troco, setTroco]   = useState('')
  const [obs, setObs]       = useState(pedido.obs || '')
  const [busca, setBusca]   = useState('')
  const [adicionando, setAdicionando] = useState(false)

  const total = itens.reduce((s, it) => {
    const p = produtos.find(x => x.id === it.produtoId)
    return s + (p ? p.preco * it.qty : 0)
  }, 0)

  const setQty = (produtoId, qty) => {
    if (qty <= 0) setItens(prev => prev.filter(i => i.produtoId !== produtoId))
    else setItens(prev => prev.map(i => i.produtoId === produtoId ? { ...i, qty } : i))
  }

  const addItem = (produtoId) => {
    if (itens.find(i => i.produtoId === produtoId)) {
      setItens(prev => prev.map(i => i.produtoId === produtoId ? { ...i, qty: i.qty + 1 } : i))
    } else {
      setItens(prev => [...prev, { produtoId, qty: 1 }])
    }
    setBusca('')
    setAdicionando(false)
  }

  const prodFiltrados = produtos
    .filter(p => !itens.find(i => i.produtoId === p.id))
    .filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()) || p.cod.toString() === busca.trim())
    .sort((a, b) => a.cod - b.cod)

  const itensSorted = sortByCod(itens, produtos)

  // ── ETAPA 1: Ajustar itens ──────────────────────────────────────────────────
  if (etapa === 1) return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={onCancelar} className="text-stone-400 text-2xl active:text-stone-600">←</button>
        <div className="flex-1">
          <div className="text-xl font-black text-stone-800">{pedido.clienteNome}</div>
          <div className="text-xs text-stone-400">{pedido.clienteTel}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-stone-400 font-bold">ETAPA 1 DE 3</div>
          <div className="text-base font-black text-green-700">{fmt(total)}</div>
        </div>
      </div>

      {/* Indicador de etapas */}
      <div className="flex gap-1.5">
        {[1,2,3].map(e => <div key={e} className={`flex-1 h-1.5 rounded-full ${e <= etapa ? 'bg-green-600' : 'bg-stone-200'}`}/>)}
      </div>

      <div className="text-xs font-black text-stone-400 uppercase tracking-widest">Conferir e Ajustar Itens</div>

      {/* Lista de itens com +/- inline */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm divide-y divide-stone-50">
        {itensSorted.map(it => {
          const p = produtos.find(x => x.id === it.produtoId)
          if (!p) return null
          return (
            <div key={it.produtoId} className="flex items-center px-4 py-3 gap-3">
              <span className="text-xs bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded font-black flex-shrink-0">{p.cod}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-stone-800 leading-tight">{p.nome}</div>
                <div className="text-xs text-stone-400">{p.unidade} · {fmt(p.preco)}</div>
              </div>
              <div className="flex-shrink-0 text-xs font-black text-green-700 mr-2">{fmt(p.preco * it.qty)}</div>
              <QtyCtrl qty={it.qty} onChange={qty => setQty(it.produtoId, qty)} />
            </div>
          )
        })}
        {itens.length === 0 && <div className="px-4 py-6 text-center text-stone-400 text-sm">Nenhum item</div>}
      </div>

      {/* Adicionar item extra */}
      {adicionando ? (
        <div className="bg-white rounded-2xl border border-green-200 shadow-sm p-4 space-y-2">
          <div className="text-xs font-black text-green-700 uppercase tracking-widest">Adicionar item</div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">🔍</span>
            <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome ou código…"
              className="w-full pl-8 pr-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-green-500"/>
          </div>
          {busca.length > 0 && prodFiltrados.map(p => (
            <button key={p.id} onClick={() => addItem(p.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 bg-stone-50 rounded-xl active:bg-green-50 text-left">
              <span className="text-xs bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded font-black flex-shrink-0">{p.cod}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-stone-800">{p.nome}</div>
                <div className="text-xs text-stone-400">{p.unidade} · {fmt(p.preco)}</div>
              </div>
              <span className="text-green-700 text-lg font-black">＋</span>
            </button>
          ))}
          <button onClick={() => { setAdicionando(false); setBusca('') }} className="text-xs text-stone-400 font-bold mt-1">cancelar</button>
        </div>
      ) : (
        <button onClick={() => setAdicionando(true)}
          className="w-full py-3 border-2 border-dashed border-stone-300 rounded-2xl text-sm font-bold text-stone-500 active:border-green-500 active:text-green-700">
          ＋ Adicionar item extra
        </button>
      )}

      <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Observação (opcional)…"
        className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-500 bg-white"/>

      <button onClick={() => setEtapa(2)} disabled={itens.length === 0}
        className="w-full py-4 bg-green-700 text-white rounded-2xl font-black text-lg active:bg-green-800 disabled:opacity-40">
        Confirmar Itens → {fmt(total)}
      </button>
    </div>
  )

  // ── ETAPA 2: Pagamento ──────────────────────────────────────────────────────
  if (etapa === 2) return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setEtapa(1)} className="text-stone-400 text-2xl active:text-stone-600">←</button>
        <div className="flex-1">
          <div className="text-xl font-black text-stone-800">{pedido.clienteNome}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-stone-400 font-bold">ETAPA 2 DE 3</div>
        </div>
      </div>

      <div className="flex gap-1.5">
        {[1,2,3].map(e => <div key={e} className={`flex-1 h-1.5 rounded-full ${e <= etapa ? 'bg-green-600' : 'bg-stone-200'}`}/>)}
      </div>

      {/* Total destacado */}
      <div className="bg-green-800 text-white rounded-3xl p-5 text-center">
        <div className="text-sm text-green-300 font-bold">TOTAL A RECEBER</div>
        <div className="text-5xl font-black mt-1">{fmt(total)}</div>
      </div>

      <div className="text-xs font-black text-stone-400 uppercase tracking-widest">Forma de Pagamento</div>

      <div className="grid grid-cols-2 gap-2">
        {PAGAMENTOS.filter(p => p !== 'A Definir').map(p => (
          <button key={p} onClick={() => setPagamento(p)}
            className={`py-4 rounded-2xl font-black text-base transition-colors ${pagamento === p ? 'bg-green-700 text-white' : 'bg-white text-stone-600 border border-stone-200 active:bg-stone-50'}`}>
            {p === 'PIX' ? '📱 PIX' : p === 'Dinheiro' ? '💵 Dinheiro' : p === 'Cartão Crédito' ? '💳 Crédito' : '💳 Débito'}
          </button>
        ))}
      </div>

      {pagamento === 'Dinheiro' && (
        <div>
          <div className="text-xs font-black text-stone-400 uppercase tracking-widest mb-2">Valor Recebido (para calcular troco)</div>
          <input value={troco} onChange={e => setTroco(e.target.value)} placeholder={`Ex: ${(Math.ceil(total / 10) * 10).toFixed(2)}`}
            type="number" step="0.01"
            className="w-full border border-stone-200 rounded-xl px-4 py-3 text-xl font-bold focus:outline-none focus:border-green-500 bg-white"/>
          {troco && parseFloat(troco) >= total && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-center">
              <div className="text-xs text-amber-600 font-bold">TROCO</div>
              <div className="text-3xl font-black text-amber-700">{fmt(parseFloat(troco) - total)}</div>
            </div>
          )}
        </div>
      )}

      <button onClick={() => setEtapa(3)}
        className="w-full py-4 bg-green-700 text-white rounded-2xl font-black text-lg active:bg-green-800">
        Próximo → Finalizar
      </button>
    </div>
  )

  // ── ETAPA 3: Confirmação final ──────────────────────────────────────────────
  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setEtapa(2)} className="text-stone-400 text-2xl active:text-stone-600">←</button>
        <div className="flex-1 text-xl font-black text-stone-800">{pedido.clienteNome}</div>
        <div className="text-xs text-stone-400 font-bold">ETAPA 3 DE 3</div>
      </div>

      <div className="flex gap-1.5">
        {[1,2,3].map(e => <div key={e} className={`flex-1 h-1.5 rounded-full ${e <= etapa ? 'bg-green-600' : 'bg-stone-200'}`}/>)}
      </div>

      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 space-y-2">
        <div className="text-xs font-black text-stone-400 uppercase tracking-widest mb-2">Resumo Final</div>
        {itensSorted.map(it => {
          const p = produtos.find(x => x.id === it.produtoId)
          if (!p) return null
          return (
            <div key={it.produtoId} className="flex justify-between text-sm">
              <span className="text-stone-700"><span className="text-xs bg-stone-100 text-stone-500 px-1 rounded font-black mr-1">{p.cod}</span>{it.qty}× {p.nome}</span>
              <span className="font-black text-stone-700">{fmt(p.preco * it.qty)}</span>
            </div>
          )
        })}
        <div className="border-t border-stone-100 pt-2 flex justify-between font-black text-base">
          <span>Total</span><span className="text-green-700">{fmt(total)}</span>
        </div>
        <div className="flex justify-between text-sm text-stone-500">
          <span>Pagamento</span><span className="font-bold text-stone-700">{pagamento}</span>
        </div>
        {pagamento === 'Dinheiro' && troco && parseFloat(troco) >= total && (
          <div className="flex justify-between text-sm text-stone-500">
            <span>Troco</span><span className="font-bold text-amber-700">{fmt(parseFloat(troco) - total)}</span>
          </div>
        )}
        {obs && <div className="text-xs text-stone-400 italic mt-1">"{obs}"</div>}
      </div>

      <button onClick={() => onFinalizar(itens, pagamento, pagamento === 'Dinheiro' && troco ? (parseFloat(troco) - total).toFixed(2) : '', obs)}
        className="w-full py-5 bg-green-700 text-white rounded-2xl font-black text-xl active:bg-green-800 shadow-lg">
        ✅ Confirmar Entrega e Recebimento
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: PRODUTOS
// ═══════════════════════════════════════════════════════════════════════════════
function ProdutosScreen({ produtos, onAdd, onEdit, onDelete }) {
  const cats = [...new Set([...CATS_ORDEM, ...produtos.map(p => p.categoria)])]
  return (
    <div className="px-4 py-4 space-y-4">
      {cats.map(cat => {
        const list = produtos.filter(p => p.categoria === cat).sort((a, b) => a.cod - b.cod)
        if (!list.length) return null
        return (
          <div key={cat}>
            <div className="text-xs font-black uppercase tracking-widest mb-2 px-1 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CAT_COR[cat] || '#888' }} />
              <span style={{ color: CAT_COR[cat] || '#555' }}>{cat}</span>
            </div>
            <div className="space-y-2">
              {list.map(prod => (
                <div key={prod.id} className="bg-white rounded-2xl border border-stone-100 px-3 py-3 flex items-center gap-3 shadow-sm">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-black flex-shrink-0" style={{ background: CAT_COR[prod.categoria] || '#888' }}>
                    {prod.cod}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-stone-800 leading-tight">{prod.nome}</div>
                    <div className="text-xs text-stone-400">{prod.unidade}</div>
                  </div>
                  <div className="text-base font-black text-green-700 flex-shrink-0">{fmt(prod.preco)}</div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => onEdit(prod)} className="p-2 rounded-xl bg-blue-50 text-base active:bg-blue-100">✏️</button>
                    <button onClick={() => onDelete(prod.id)} className="p-2 rounded-xl bg-red-50 text-base active:bg-red-100">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      <div style={{ height: 80 }} />
      <button onClick={onAdd} className="fixed bottom-20 right-4 w-16 h-16 bg-green-700 text-white rounded-full shadow-xl flex items-center justify-center z-10 active:scale-95 text-3xl">＋</button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN: FECHAMENTO
// ═══════════════════════════════════════════════════════════════════════════════
function FechamentoScreen({ pedidos, produtos, periodo, onPrintTodos }) {
  const total    = pedidos.reduce((s, p) => s + calcTotal(p, produtos), 0)
  const entregue = pedidos.filter(p => p.status === 'entregue').reduce((s, p) => s + calcTotal(p, produtos), 0)

  const porPag = {}
  pedidos.forEach(p => { const k = p.pagamento || 'A Definir'; porPag[k] = (porPag[k] || 0) + calcTotal(p, produtos) })

  const porItem = {}
  pedidos.forEach(p => p.itens.forEach(it => {
    const prod = produtos.find(x => x.id === it.produtoId)
    if (!prod) return
    if (!porItem[prod.id]) porItem[prod.id] = { cod: prod.cod, nome: prod.nome, unidade: prod.unidade, qty: 0, total: 0 }
    porItem[prod.id].qty   += it.qty
    porItem[prod.id].total += prod.preco * it.qty
  }))
  const itensList = Object.values(porItem).sort((a, b) => a.cod - b.cod)

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="text-center">
        <div className="text-2xl font-black text-green-800">{periodo}</div>
        <div className="text-sm text-stone-500 font-semibold">Resumo da Ação Social Korin</div>
      </div>

      <div className="bg-green-800 text-white rounded-3xl p-5 shadow-lg">
        <div className="text-sm font-bold text-green-300 mb-1">TOTAL GERAL</div>
        <div className="text-5xl font-black">{fmt(total)}</div>
        <div className="text-sm text-green-300 mt-2">
          {pedidos.length} clientes · {pedidos.reduce((s, p) => s + p.itens.reduce((a, i) => a + i.qty, 0), 0)} itens
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-stone-100 shadow-sm">
          <div className="text-xs text-stone-400 font-bold mb-1">ENTREGUE</div>
          <div className="text-xl font-black text-green-600">{fmt(entregue)}</div>
          <div className="text-xs text-stone-400">{pedidos.filter(p => p.status === 'entregue').length} clientes</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-stone-100 shadow-sm">
          <div className="text-xs text-stone-400 font-bold mb-1">PENDENTE</div>
          <div className="text-xl font-black text-amber-600">{fmt(total - entregue)}</div>
          <div className="text-xs text-stone-400">{pedidos.filter(p => p.status === 'pendente').length} clientes</div>
        </div>
      </div>

      {Object.keys(porPag).length > 0 && (
        <div className="bg-white rounded-2xl p-4 border border-stone-100 shadow-sm">
          <div className="text-xs font-black text-stone-500 uppercase tracking-widest mb-3">Por Forma de Pagamento</div>
          {Object.entries(porPag).map(([pag, val]) => (
            <div key={pag} className="flex justify-between py-2 border-b border-stone-50 last:border-0">
              <span className="text-sm font-semibold text-stone-700">{pag}</span>
              <span className="text-sm font-black text-green-700">{fmt(val)}</span>
            </div>
          ))}
        </div>
      )}

      {itensList.length > 0 && (
        <div className="bg-white rounded-2xl p-4 border border-stone-100 shadow-sm">
          <div className="text-xs font-black text-stone-500 uppercase tracking-widest mb-3">Itens Pedidos (ordem catálogo)</div>
          {itensList.map((item, i) => (
            <div key={i} className="flex justify-between items-center py-2.5 border-b border-stone-50 last:border-0">
              <div>
                <div className="text-sm font-bold text-stone-800">
                  <span className="text-xs bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded font-black mr-1.5">{item.cod}</span>
                  {item.nome}
                </div>
                <div className="text-xs text-stone-400">{item.unidade}</div>
              </div>
              <div className="text-right flex-shrink-0 ml-3">
                <div className="text-base font-black text-green-700">{item.qty}×</div>
                <div className="text-xs text-stone-400">{fmt(item.total)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pedidos.filter(p => p.status === 'pendente').length > 0 && (
        <button onClick={onPrintTodos} className="w-full py-4 bg-stone-800 text-white rounded-2xl font-black text-base flex items-center justify-center gap-2 active:bg-stone-900">
          🖨️ Imprimir Todos os Pedidos Pendentes
        </button>
      )}
      <div style={{ height: 20 }} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL: PEDIDO
// ═══════════════════════════════════════════════════════════════════════════════
function ModalPedido({ pedido, produtos, onSave, onClose }) {
  const [nome,  setNome]  = useState(pedido?.clienteNome || '')
  const [tel,   setTel]   = useState(pedido?.clienteTel  || '')
  const [pagto, setPagto] = useState(pedido?.pagamento   || 'A Definir')
  const [itens, setItens] = useState(pedido?.itens       || [])
  const [busca, setBusca] = useState('')

  const getQty = (id) => itens.find(i => i.produtoId === id)?.qty || 0
  const setQty = (id, qty) => {
    if (qty <= 0) setItens(prev => prev.filter(i => i.produtoId !== id))
    else setItens(prev => {
      const ex = prev.find(i => i.produtoId === id)
      return ex ? prev.map(i => i.produtoId === id ? { ...i, qty } : i) : [...prev, { produtoId: id, qty }]
    })
  }

  const total = itens.reduce((s, it) => { const p = produtos.find(x => x.id === it.produtoId); return s + (p ? p.preco * it.qty : 0) }, 0)
  const cats  = [...new Set([...CATS_ORDEM, ...produtos.map(p => p.categoria)])]
  const prodFiltrados = produtos
    .filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()) || p.cod.toString() === busca.trim())
    .sort((a, b) => a.cod - b.cod)

  const handleSave = () => {
    if (!nome.trim())      { alert('Informe o nome do cliente'); return }
    if (!itens.length)     { alert('Adicione pelo menos 1 item'); return }
    onSave({ ...pedido, clienteNome: nome.trim(), clienteTel: tel, pagamento: pagto, itens })
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex flex-col justify-end">
      <div className="bg-stone-50 rounded-t-3xl flex flex-col overflow-hidden" style={{ maxHeight: '93vh' }}>
        <div className="bg-white flex items-center justify-between px-5 py-4 border-b border-stone-100 rounded-t-3xl flex-shrink-0">
          <div>
            <div className="text-lg font-black text-stone-800">{pedido ? 'Editar Pedido' : 'Novo Pedido'}</div>
            {itens.length > 0 && <div className="text-sm font-bold text-green-700">{fmt(total)} · {itens.length} item(ns)</div>}
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-stone-100 text-xl">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100 space-y-3">
            <div className="text-xs font-black text-stone-400 uppercase tracking-widest">Cliente</div>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo *"
              className="w-full border border-stone-200 rounded-xl px-4 py-3 text-base font-semibold focus:outline-none focus:border-green-500" />
            <input value={tel} onChange={e => setTel(e.target.value)} placeholder="WhatsApp (opcional)"
              className="w-full border border-stone-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-green-500" />
            <select value={pagto} onChange={e => setPagto(e.target.value)}
              className="w-full border border-stone-200 rounded-xl px-4 py-3 text-base bg-white focus:outline-none focus:border-green-500 font-semibold">
              {PAGAMENTOS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>

          {itens.length > 0 && (
            <div className="bg-green-50 rounded-2xl p-4 border border-green-100">
              <div className="text-xs font-black text-green-700 uppercase tracking-widest mb-3">✅ Selecionados ({itens.length})</div>
              {sortByCod(itens, produtos).map(it => {
                const p = produtos.find(x => x.id === it.produtoId)
                if (!p) return null
                return (
                  <div key={it.produtoId} className="flex items-center justify-between py-2 border-b border-green-100 last:border-0">
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="text-sm font-bold text-stone-700 truncate">
                        <span className="text-xs bg-green-200 text-green-800 px-1.5 py-0.5 rounded font-black mr-1.5">{p.cod}</span>
                        {p.nome}
                      </div>
                      <div className="text-xs text-green-700 font-bold">{fmt(p.preco * it.qty)}</div>
                    </div>
                    <QtyCtrl qty={it.qty} onChange={qty => setQty(p.id, qty)} />
                  </div>
                )
              })}
              <div className="flex justify-between pt-3 mt-1">
                <span className="text-sm font-black text-stone-700">Total</span>
                <span className="text-base font-black text-green-800">{fmt(total)}</span>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
            <div className="text-xs font-black text-stone-400 uppercase tracking-widest mb-3">Catálogo Korin</div>
            <div className="relative mb-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">🔍</span>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome ou código (ex: 09)…"
                className="w-full pl-8 pr-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-green-500" />
            </div>
            {(busca ? [null] : cats).map((cat, ci) => {
              const list = (busca ? prodFiltrados : produtos.filter(p => p.categoria === cat)).sort((a, b) => a.cod - b.cod)
              if (!list.length) return null
              return (
                <div key={cat || ci}>
                  {cat && <div className="text-xs font-black uppercase tracking-widest mt-3 mb-2" style={{ color: CAT_COR[cat] || '#888' }}>{cat}</div>}
                  {list.map(prod => (
                    <div key={prod.id} className="flex items-center py-2.5 border-b border-stone-50 last:border-0">
                      <span className="text-xs bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded font-black mr-2 flex-shrink-0">{prod.cod}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-stone-700 leading-tight">{prod.nome}</div>
                        <div className="text-xs text-stone-400">{prod.unidade} · <span className="font-black text-green-700">{fmt(prod.preco)}</span></div>
                      </div>
                      <QtyCtrl qty={getQty(prod.id)} onChange={qty => setQty(prod.id, qty)} />
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white border-t border-stone-100 px-4 py-4 flex-shrink-0">
          <button onClick={handleSave} className="w-full py-4 bg-green-700 text-white rounded-2xl font-black text-lg active:bg-green-800">
            {pedido ? 'Salvar Alterações' : `Salvar Pedido${itens.length ? ' — ' + fmt(total) : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL: DETALHE
// ═══════════════════════════════════════════════════════════════════════════════
function ModalDetalhe({ pedido, produtos, onClose, onPrint }) {
  const total = calcTotal(pedido, produtos)
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex flex-col justify-end">
      <div className="bg-stone-50 rounded-t-3xl flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>
        <div className="bg-white flex items-center justify-between px-5 py-4 border-b border-stone-100 rounded-t-3xl flex-shrink-0">
          <div>
            <div className="text-2xl font-black text-stone-800">{pedido.clienteNome}</div>
            {pedido.clienteTel && <div className="text-xs text-stone-400 mt-0.5">📱 {pedido.clienteTel}</div>}
          </div>
          <div className="flex gap-2">
            <button onClick={onPrint} className="p-2.5 rounded-full bg-stone-100 text-xl active:bg-stone-200">🖨️</button>
            <button onClick={onClose} className="p-2.5 rounded-full bg-stone-100 text-xl active:bg-stone-200">✕</button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {sortByCod(pedido.itens, produtos).map((it, i) => {
            const p = produtos.find(x => x.id === it.produtoId)
            if (!p) return null
            return (
              <div key={i} className="bg-white rounded-2xl px-4 py-3.5 border border-stone-100 shadow-sm flex justify-between items-center">
                <div>
                  <div className="text-base font-black text-stone-800">
                    <span className="text-xs bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded font-black mr-1.5">{p.cod}</span>
                    <span className="text-green-700">{it.qty}×</span> {p.nome}
                  </div>
                  <div className="text-xs text-stone-400 mt-0.5">{p.unidade} · {fmt(p.preco)} cada</div>
                </div>
                <div className="text-base font-black text-green-700 flex-shrink-0 ml-3">{fmt(p.preco * it.qty)}</div>
              </div>
            )
          })}
          <div className="bg-green-800 text-white rounded-2xl p-5 mt-2">
            <div className="flex justify-between items-center">
              <span className="text-base font-black">TOTAL</span>
              <span className="text-3xl font-black">{fmt(total)}</span>
            </div>
            {pedido.pagamento && <div className="text-xs text-green-300 font-bold mt-1">{pedido.pagamento}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL: PRODUTO
// ═══════════════════════════════════════════════════════════════════════════════
function ModalProduto({ produto, onSave, onClose }) {
  const [nome,  setNome]  = useState(produto?.nome      || '')
  const [un,    setUn]    = useState(produto?.unidade   || '')
  const [preco, setPreco] = useState(produto?.preco?.toString() || '')
  const [cat,   setCat]   = useState(produto?.categoria || 'Frangos 1kg')
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
      <div className="bg-white w-full rounded-t-3xl p-5 space-y-4">
        <div className="flex justify-between items-center">
          <div className="text-xl font-black">{produto ? 'Editar Produto' : 'Novo Produto'}</div>
          <button onClick={onClose} className="p-2 rounded-full bg-stone-100 text-xl">✕</button>
        </div>
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do produto *"
          className="w-full border border-stone-200 rounded-xl px-4 py-3 text-base font-semibold focus:outline-none focus:border-green-500" />
        <input value={un} onChange={e => setUn(e.target.value)} placeholder="Unidade (ex: Pacote 1kg)"
          className="w-full border border-stone-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-green-500" />
        <input value={preco} onChange={e => setPreco(e.target.value)} placeholder="Preço (ex: 22.50)" type="number" step="0.01"
          className="w-full border border-stone-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-green-500" />
        <select value={cat} onChange={e => setCat(e.target.value)}
          className="w-full border border-stone-200 rounded-xl px-4 py-3 text-base bg-white focus:outline-none focus:border-green-500">
          {CATS_ORDEM.map(c => <option key={c}>{c}</option>)}
        </select>
        <button onClick={() => {
          if (!nome || !preco) { alert('Preencha nome e preço'); return }
          onSave({ ...produto, nome, unidade: un, preco: parseFloat(preco), categoria: cat })
        }} className="w-full py-4 bg-green-700 text-white rounded-2xl font-black text-lg active:bg-green-800">
          {produto ? 'Salvar Alterações' : 'Adicionar Produto'}
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL: PERÍODO
// ═══════════════════════════════════════════════════════════════════════════════
function ModalPeriodo({ periodo, onSave, onClose }) {
  const [val, setVal] = useState(periodo)
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
      <div className="bg-white w-full rounded-t-3xl p-5 space-y-4">
        <div className="flex justify-between items-center">
          <div className="text-xl font-black">Período da Ação</div>
          <button onClick={onClose} className="p-2 rounded-full bg-stone-100 text-xl">✕</button>
        </div>
        <input value={val} onChange={e => setVal(e.target.value)} placeholder="Ex: Maio/2026"
          className="w-full border border-stone-200 rounded-xl px-4 py-3 text-base font-semibold focus:outline-none focus:border-green-500" />
        <p className="text-xs text-stone-400">Alterar o período NÃO apaga os pedidos existentes.</p>
        <button onClick={() => onSave(val)} className="w-full py-4 bg-green-700 text-white rounded-2xl font-black text-lg active:bg-green-800">Salvar</button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTES MICRO
// ═══════════════════════════════════════════════════════════════════════════════
function QtyCtrl({ qty, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
      {qty > 0 && <>
        <button onClick={() => onChange(qty - 1)} className="w-8 h-8 rounded-full bg-stone-100 text-stone-600 font-black text-lg flex items-center justify-center active:bg-stone-200">−</button>
        <span className="text-base font-black text-green-700 w-5 text-center">{qty}</span>
      </>}
      <button onClick={() => onChange(qty + 1)}
        className={`w-8 h-8 rounded-full font-black text-lg flex items-center justify-center ${qty > 0 ? 'bg-green-600 text-white active:bg-green-700' : 'bg-green-100 text-green-700 active:bg-green-200'}`}>
        +
      </button>
    </div>
  )
}

function Stat({ label, value, color, small }) {
  const c = { green: 'text-green-700', amber: 'text-amber-600', teal: 'text-teal-700' }
  return (
    <div className="bg-white rounded-2xl p-3 text-center shadow-sm border border-stone-100">
      <div className={`${small ? 'text-lg' : 'text-3xl'} font-black ${c[color]}`}>{value}</div>
      <div className="text-xs font-bold text-stone-600">{label}</div>
    </div>
  )
}

function EmptyState({ icon, text }) {
  return (
    <div className="text-center py-16 text-stone-400 space-y-2">
      <div className="text-5xl">{icon}</div>
      <p className="text-sm font-bold">{text}</p>
    </div>
  )
}

function SectionLabel({ icon, text, color }) {
  const c = { green: 'text-green-600', amber: 'text-amber-600' }
  return <div className={`text-xs font-black uppercase tracking-widest mb-2 flex items-center gap-1.5 ${c[color]}`}>{icon} {text}</div>
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL: COLAR PEDIDO DO WHATSAPP
// ═══════════════════════════════════════════════════════════════════════════════
function ModalColarPedido({ produtos, onSave, onClose }) {
  const [etapa, setEtapa]     = useState(1)       // 1=colar, 2=confirmar
  const [texto, setTexto]     = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro]       = useState('')
  const [parsed, setParsed]   = useState(null)    // { nome, itens }
  const [nome, setNome]       = useState('')
  const [tel, setTel]         = useState('')
  const [pagto, setPagto]     = useState('A Definir')

  const interpretar = async () => {
    if (!texto.trim()) return
    setLoading(true)
    setErro('')
    try {
      const res = await fetch('/api/interpretar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto })
      })
      const data = await res.json()
      const raw  = data.content?.[0]?.text || ''
      const obj  = JSON.parse(raw.replace(/```json|```/g, '').trim())

      // Resolver cod → produtoId
      const itensResolvidos = (obj.itens || []).reduce((acc, it) => {
        const prod = produtos.find(p => p.cod === it.cod)
        if (prod && it.qty > 0) acc.push({ produtoId: prod.id, qty: it.qty })
        return acc
      }, [])

      if (!itensResolvidos.length) throw new Error('Nenhum item reconhecido. Verifique os códigos.')

      setParsed({ nome: obj.nome || '', itens: itensResolvidos })
      setNome(obj.nome || '')
      setEtapa(2)
    } catch (e) {
      setErro(e.message || 'Erro ao interpretar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const confirmar = () => {
    if (!nome.trim()) { alert('Informe o nome do cliente'); return }
    onSave({ clienteNome: nome.trim(), clienteTel: tel, pagamento: pagto, itens: parsed.itens })
  }

  const total = parsed
    ? parsed.itens.reduce((s, it) => {
        const p = produtos.find(x => x.id === it.produtoId)
        return s + (p ? p.preco * it.qty : 0)
      }, 0)
    : 0

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex flex-col justify-end">
      <div className="bg-stone-50 rounded-t-3xl flex flex-col overflow-hidden" style={{ maxHeight: '92vh' }}>

        {/* Header */}
        <div className="bg-white flex items-center justify-between px-5 py-4 border-b border-stone-100 rounded-t-3xl flex-shrink-0">
          <div>
            <div className="text-lg font-black text-stone-800">📋 Colar Pedido do WhatsApp</div>
            <div className="text-xs text-stone-400">{etapa === 1 ? 'Cole a mensagem do cliente' : 'Confirme os dados'}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-stone-100 text-xl">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">

          {/* ETAPA 1: colar texto */}
          {etapa === 1 && <>
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder={"Cole aqui a mensagem do WhatsApp:\n\nJane\nCódigo 8: 2 bandejas\nCódigo 9: 2 bandejas\n..."}
              rows={10}
              className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-green-500 bg-white resize-none"
            />
            {erro && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-semibold">{erro}</div>}
            <button onClick={interpretar} disabled={loading || !texto.trim()}
              className="w-full py-4 bg-green-700 text-white rounded-2xl font-black text-lg active:bg-green-800 disabled:opacity-40 flex items-center justify-center gap-2">
              {loading ? <><span className="animate-spin">⟳</span> Interpretando…</> : '🤖 Interpretar Pedido'}
            </button>
          </>}

          {/* ETAPA 2: confirmar */}
          {etapa === 2 && parsed && <>
            <div className="bg-white rounded-2xl p-4 border border-stone-100 shadow-sm space-y-3">
              <div className="text-xs font-black text-stone-400 uppercase tracking-widest">Cliente</div>
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo *"
                className="w-full border border-stone-200 rounded-xl px-4 py-3 text-base font-semibold focus:outline-none focus:border-green-500"/>
              <input value={tel} onChange={e => setTel(e.target.value)} placeholder="WhatsApp (opcional)"
                className="w-full border border-stone-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-green-500"/>
              <select value={pagto} onChange={e => setPagto(e.target.value)}
                className="w-full border border-stone-200 rounded-xl px-4 py-3 text-base bg-white focus:outline-none focus:border-green-500 font-semibold">
                {PAGAMENTOS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>

            <div className="bg-green-50 rounded-2xl p-4 border border-green-100">
              <div className="text-xs font-black text-green-700 uppercase tracking-widest mb-3">✅ Itens Identificados ({parsed.itens.length})</div>
              {sortByCod(parsed.itens, produtos).map(it => {
                const p = produtos.find(x => x.id === it.produtoId)
                if (!p) return null
                return (
                  <div key={it.produtoId} className="flex justify-between items-center py-2 border-b border-green-100 last:border-0">
                    <span className="text-sm font-bold text-stone-700">
                      <span className="text-xs bg-green-200 text-green-800 px-1.5 py-0.5 rounded font-black mr-1.5">{p.cod}</span>
                      {it.qty}× {p.nome}
                    </span>
                    <span className="text-sm font-black text-green-700">{fmt(p.preco * it.qty)}</span>
                  </div>
                )
              })}
              <div className="flex justify-between pt-3 mt-1 font-black">
                <span className="text-stone-700">Total</span>
                <span className="text-green-800">{fmt(total)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setEtapa(1)} className="px-5 py-4 bg-stone-100 text-stone-600 rounded-2xl font-black active:bg-stone-200">← Redigitar</button>
              <button onClick={confirmar} className="flex-1 py-4 bg-green-700 text-white rounded-2xl font-black text-lg active:bg-green-800">
                Salvar Pedido — {fmt(total)}
              </button>
            </div>
          </>}

        </div>
      </div>
    </div>
  )
}

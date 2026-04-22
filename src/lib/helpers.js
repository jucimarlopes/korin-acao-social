export const fmt = (v) =>
  'R$ ' + Number(v).toFixed(2).replace('.', ',')

export const calcTotal = (pedido, produtos) =>
  pedido.itens.reduce((s, it) => {
    const p = produtos.find(x => x.id === it.produtoId)
    return s + (p ? p.preco * it.qty : 0)
  }, 0)

export const sortByCod = (itens, produtos) =>
  [...itens].sort((a, b) => {
    const pa = produtos.find(x => x.id === a.produtoId)
    const pb = produtos.find(x => x.id === b.produtoId)
    return (pa?.cod || 0) - (pb?.cod || 0)
  })

// api/interpretar.js — Vercel Serverless Function
// A chave fica só no servidor, nunca exposta no frontend

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { texto } = req.body
  if (!texto) return res.status(400).json({ error: 'texto obrigatório' })

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: `Você interpreta mensagens de pedidos do WhatsApp do Clube Korin.
Extraia: nome do cliente (se houver) e itens (código numérico + quantidade).
Responda SOMENTE JSON válido, sem texto, sem markdown:
{"nome":"Nome ou null","itens":[{"cod":9,"qty":2}]}
Ignore textos irrelevantes. Quantidade mínima é 1.`,
        messages: [{ role: 'user', content: texto }]
      })
    })

    const data = await response.json()
    res.status(200).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}

# 🌿 Korin Clube — Lattuga Orgânicos

App de gestão do Ação Social Korin para a Valéria.  
**Offline-first**: funciona sem internet. Sincroniza automaticamente quando a conexão volta.

---

## Stack

- **React + Vite** — frontend
- **Tailwind CSS** — estilos
- **Supabase** — banco de dados na nuvem (backup + sync)
- **Vercel** — hospedagem (deploy automático via GitHub)
- **localStorage** — cache local + operação offline

---

## Deploy (passo a passo)

### 1. Supabase

1. Acesse [supabase.com](https://supabase.com) → **New Project**
2. Dê um nome (ex: `korin-acao-social`) → escolha região **South America (São Paulo)**
3. Vá em **SQL Editor** → cole e execute o conteúdo de `supabase/schema.sql`
4. Vá em **Project Settings → API** e copie:
   - `Project URL` → será seu `VITE_SUPABASE_URL`
   - `anon public key` → será seu `VITE_SUPABASE_ANON_KEY`

### 2. GitHub

```bash
git init
git add .
git commit -m "feat: korin clube inicial"
git remote add origin https://github.com/SEU_USER/korin-acao-social.git
git push -u origin main
```

### 3. Vercel

1. Acesse [vercel.com](https://vercel.com) → **Add New Project** → importe o repositório
2. Em **Environment Variables**, adicione:
   ```
   VITE_SUPABASE_URL     = https://xxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY = eyJ...
   ```
3. Clique em **Deploy** ✅
4. A URL gerada (ex: `korin-acao-social.vercel.app`) é o link que a Valéria adiciona na tela inicial do celular

### 4. Valéria (configuração no celular)

1. Abrir o link no **Chrome**
2. Menu (3 pontos) → **"Adicionar à tela inicial"**
3. Pronto — aparece como ícone de app, funciona offline

---

## Desenvolvimento local

```bash
cp .env.example .env
# preencha com suas keys do Supabase

npm install
npm run dev
```

---

## Como funciona o offline-first

```
Escreve operação
      │
      ▼
localStorage ← imediato, sempre disponível
      │
      ▼
Tenta Supabase
   │        │
 Sucesso  Falha (offline)
   │        │
   ✅     Fila local (korin-sync-queue)
              │
              ▼
        Quando volta online
              │
              ▼
        Processa fila → Supabase
```

**No startup (online):** puxa do Supabase → atualiza localStorage.  
Isso garante que se a Valéria acessar de outro dispositivo, os dados mais recentes são carregados.

---

## Atualizando o catálogo (novo mês)

1. Abrir o app → aba **Produtos**
2. Editar os preços que mudaram (botão ✏️)
3. Tocar no período no header → alterar para o novo mês (ex: `Maio/2026`)
4. Os pedidos antigos ficam preservados no histórico

---

## Estrutura do projeto

```
korin-acao-social/
├── src/
│   ├── App.jsx          # Interface completa (screens + modais)
│   ├── main.jsx         # Entry point React
│   ├── index.css        # Tailwind base
│   └── lib/
│       ├── catalog.js   # Catálogo inicial Korin + constantes
│       ├── helpers.js   # fmt(), calcTotal(), sortByCod()
│       ├── print.js     # Geração de impressão A4
│       ├── store.js     # Camada de dados (localStorage + Supabase + fila)
│       └── supabase.js  # Cliente Supabase
├── supabase/
│   └── schema.sql       # SQL para criar tabela no Supabase
├── .env.example
├── index.html
├── package.json
├── tailwind.config.js
└── vite.config.js
```

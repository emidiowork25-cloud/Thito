# Chapa Quente 🔥

**Sistema de Pedidos e Cardápio Digital para Hamburgueria**

Um sistema completo de gerenciamento de pedidos e cardápio digital, desenvolvido com tecnologias modernas e foco em experiência do usuário fluida para clientes e donos de loja.

## 🎯 Funcionalidades

### Para Clientes
- ✅ Navegação intuitiva de cardápio digital
- ✅ Filtragem por categorias
- ✅ Carrinho persistente (localStorage)
- ✅ Checkout simples e rápido
- ✅ Acompanhamento de pedidos em tempo real
- ✅ Notificação quando pedido fica pronto

### Para Lojas
- ✅ Dashboard completo de gerenciamento
- ✅ CRUD de itens do cardápio
- ✅ Visualização de pedidos em tempo real
- ✅ Atualização de status de pedidos (pending → confirmed → preparing → ready → completed)
- ✅ Autenticação e controle de acesso
- ✅ Interface responsiva e moderna

## 🏗️ Arquitetura

```
Chapa Quente (Monorepo)
├── apps/
│   ├── backend/          # API Node.js/Express
│   └── web/              # Frontend Next.js 14
├── packages/
│   └── types/            # Tipos compartilhados
└── docker-compose.yml    # PostgreSQL + Redis
```

### Stack Tecnológico

**Backend:**
- Node.js + Express.js
- TypeScript
- PostgreSQL (Banco de Dados)
- Redis (Cache + PubSub)
- Socket.io (WebSocket em tempo real)
- JWT (Autenticação)

**Frontend:**
- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- Zustand (State Management)
- Axios (HTTP Client)

**DevOps:**
- Docker Compose
- Git + GitHub

## 🚀 Como Começar

### Pré-requisitos
- Node.js 18+
- npm ou yarn
- Docker e Docker Compose

### Setup Local

#### 1. Clone o repositório
```bash
git clone https://github.com/seu-repo/chapa-quente.git
cd chapa-quente
```

#### 2. Instale as dependências
```bash
npm install
```

#### 3. Configure o ambiente
```bash
cp .env.example .env
```

Edite `.env` com suas configurações:
```bash
DATABASE_URL=postgresql://postgres:thito123@localhost:5432/thito_db
REDIS_URL=redis://localhost:6379
JWT_SECRET=sua-chave-secreta-segura
BACKEND_PORT=5000
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_WS_URL=ws://localhost:5000
```

#### 4. Inicie os serviços
```bash
# Terminal 1: Suba PostgreSQL e Redis
docker-compose up -d

# Terminal 2: Inicie o backend
cd apps/backend
npm run dev

# Terminal 3: Inicie o frontend
cd apps/web
npm run dev
```

#### 5. Acesse a aplicação
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5000
- **Health Check:** http://localhost:5000/api/health

### 📱 Fluxos de Uso

#### Fluxo Cliente
1. Acesse a home → Escolha "Sou Cliente"
2. Cadastre-se (ou faça login se já tiver conta)
3. Selecione a loja e navegue o cardápio
4. Adicione itens ao carrinho
5. Vá ao carrinho e confirme pedido
6. Acompanhe seu pedido em tempo real

#### Fluxo Loja
1. Acesse a home → Escolha "Sou Loja"
2. Cadastre-se (ou faça login como loja)
3. Acesse o Dashboard
4. **Cardápio:** Crie, edite e delete itens do cardápio
5. **Pedidos:** Visualize e gerenciem pedidos em tempo real
6. Confirme, comece preparo, marque como pronto e entregue

## 📚 API Endpoints

### Autenticação
```
POST   /api/auth/register     # Criar conta
POST   /api/auth/login        # Fazer login
GET    /api/auth/me           # Dados do usuário atual
```

### Cardápio
```
GET    /api/menu              # Listar itens (público)
GET    /api/menu/categories   # Listar categorias
GET    /api/menu/:itemId      # Detalhes de um item
POST   /api/menu              # Criar item (loja)
PUT    /api/menu/:itemId      # Atualizar item (loja)
DELETE /api/menu/:itemId      # Deletar item (loja)
```

### Pedidos
```
POST   /api/orders            # Criar pedido (cliente)
GET    /api/orders            # Listar meus pedidos (cliente)
GET    /api/orders/:orderId   # Detalhes do pedido
PATCH  /api/orders/:orderId/status  # Atualizar status (loja)
GET    /api/orders/store/dashboard  # Pedidos da loja (loja)
```

### WebSocket (Real-time)
```
URL: ws://localhost:5000

Eventos:
- order:created      # Novo pedido criado
- order:status       # Status do pedido atualizado
- order:cancelled    # Pedido cancelado
- inventory:updated  # Inventário atualizado
- item:unavailable   # Item ficou indisponível
```

## 🗄️ Modelos de Dados

### Users
```
{
  id: UUID,
  email: string (unique),
  password_hash: string,
  user_type: 'customer' | 'store',
  name: string,
  created_at: timestamp,
  updated_at: timestamp
}
```

### Stores
```
{
  id: UUID,
  user_id: UUID (refs users),
  name: string,
  description?: string,
  phone?: string,
  address?: string,
  logo_url?: string,
  created_at: timestamp,
  updated_at: timestamp
}
```

### MenuItems
```
{
  id: UUID,
  store_id: UUID (refs stores),
  name: string,
  description?: string,
  price: decimal(10,2),
  category?: string,
  image_url?: string,
  is_available: boolean,
  created_at: timestamp,
  updated_at: timestamp
}
```

### Orders
```
{
  id: UUID,
  store_id: UUID (refs stores),
  customer_id: UUID (refs users),
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled',
  total_price: decimal(10,2),
  notes?: string,
  estimated_time_minutes?: int,
  created_at: timestamp,
  updated_at: timestamp
}
```

### OrderItems
```
{
  id: UUID,
  order_id: UUID (refs orders),
  menu_item_id: UUID (refs menu_items),
  quantity: int,
  unit_price: decimal(10,2),
  subtotal: decimal(10,2),
  notes?: string,
  created_at: timestamp
}
```

## 🔐 Autenticação

O sistema usa JWT (JSON Web Tokens) para autenticação:

1. **Register/Login:** Retorna token JWT válido por 7 dias
2. **Header:** `Authorization: Bearer <token>`
3. **Validação:** Middleware `verifyToken` valida em todas as rotas protegidas
4. **Logout:** Remove token do localStorage no cliente

## 🚀 Deploy

### Produção (Recomendado com Docker)

```bash
# Build das imagens
docker build -t chapa-quente-backend ./apps/backend
docker build -t chapa-quente-web ./apps/web

# Deploy com docker-compose
docker-compose -f docker-compose.prod.yml up -d
```

### Variáveis de Ambiente (Produção)
```
NODE_ENV=production
JWT_SECRET=<gerar-chave-segura>
DATABASE_URL=postgresql://user:pass@prod-db:5432/db
REDIS_URL=redis://prod-redis:6379
BACKEND_PORT=5000
FRONTEND_URL=https://seu-dominio.com
```

## 📋 Roadmap

### Fase 1 ✅ (MVP)
- [x] Setup inicial
- [x] Autenticação básica
- [x] Cardápio (CRUD)
- [x] Pedidos (criar, acompanhar)
- [x] Dashboard loja
- [x] Real-time com WebSocket

### Fase 2 (Próxima)
- [ ] Upload de imagens (S3/Cloudinary)
- [ ] Gerenciamento de inventário
- [ ] Cupons e promoções
- [ ] Avaliações e comentários
- [ ] Histórico de pedidos
- [ ] Notificações push

### Fase 3 (Futuro)
- [ ] Integração pagamento (Stripe/PagSeguro)
- [ ] App mobile (React Native)
- [ ] Analytics e relatórios
- [ ] Múltiplas lojas por usuário
- [ ] Sistema de delivery integrado
- [ ] AI para recomendações

## 🤝 Contribuindo

1. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
2. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
3. Push para a branch (`git push origin feature/AmazingFeature`)
4. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença MIT - veja o arquivo LICENSE para detalhes.

## 👨‍💻 Desenvolvido com Claude Code

Sistema criado e mantido com a ajuda de Claude Code AI.

---

**Chapa Quente** - *O ponto certo da sua fome* 🔥🍔

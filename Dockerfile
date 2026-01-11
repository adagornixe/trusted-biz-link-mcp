FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
```

---

## Étape 2 : Déployer dans Dokploy

### Dans l'interface Dokploy :

1. **Créer un nouveau projet** (ou utilise celui de Supabase)

2. **Ajouter un service** → Type : **Application**

3. **Source** : Git Repository → colle l'URL de ton repo

4. **Build** :
   - Build Type : `Dockerfile`
   - Dockerfile Path : `Dockerfile`

5. **Variables d'environnement** :
```
   SUPABASE_URL=http://supabase-kong:8000
   SUPABASE_SERVICE_KEY=eyJ... (ta service_role key)
   PORT=3001
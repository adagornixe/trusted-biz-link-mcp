import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createClient } from "@supabase/supabase-js";
import express from "express";

const app = express();
app.use(express.json());

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || "http://localhost:8000",
  process.env.SUPABASE_SERVICE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjgxNTkwNTMsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.zFABHlPPUJl7zwUGoC-wxQtEwhj6VnUOENrN3XHlioc"
);

// MCP Server
const mcpServer = new McpServer({
  name: "trusted-biz-link",
  version: "1.0.0",
});

// === TOOLS ===

// 1. Lister les tables
mcpServer.tool(
  "list_tables",
  "Liste toutes les tables de la base de données",
  {},
  async () => {
    const { data, error } = await supabase
      .from("information_schema.tables")
      .select("table_name")
      .eq("table_schema", "public");
    
    if (error) {
      // Fallback avec requête SQL directe
      const { data: tables, error: sqlError } = await supabase.rpc("get_tables");
      if (sqlError) return { content: [{ type: "text", text: `Erreur: ${sqlError.message}` }] };
      return { content: [{ type: "text", text: JSON.stringify(tables, null, 2) }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// 2. Requête SELECT
mcpServer.tool(
  "query_table",
  "Exécute une requête SELECT sur une table",
  {
    table: { type: "string", description: "Nom de la table" },
    select: { type: "string", description: "Colonnes à sélectionner (défaut: *)", default: "*" },
    limit: { type: "number", description: "Nombre de lignes max", default: 20 },
    filters: { type: "object", description: "Filtres {colonne: valeur}", default: {} }
  },
  async ({ table, select = "*", limit = 20, filters = {} }) => {
    let query = supabase.from(table).select(select).limit(limit);
    
    for (const [key, value] of Object.entries(filters)) {
      query = query.eq(key, value);
    }
    
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: `Erreur: ${error.message}` }] };
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// 3. Insérer des données
mcpServer.tool(
  "insert_row",
  "Insère une nouvelle ligne dans une table",
  {
    table: { type: "string", description: "Nom de la table" },
    data: { type: "object", description: "Données à insérer {colonne: valeur}" }
  },
  async ({ table, data }) => {
    const { data: result, error } = await supabase.from(table).insert([data]).select();
    if (error) return { content: [{ type: "text", text: `Erreur: ${error.message}` }] };
    return { content: [{ type: "text", text: `Inséré: ${JSON.stringify(result)}` }] };
  }
);

// 4. Mettre à jour
mcpServer.tool(
  "update_rows",
  "Met à jour des lignes dans une table",
  {
    table: { type: "string", description: "Nom de la table" },
    data: { type: "object", description: "Nouvelles valeurs" },
    match: { type: "object", description: "Conditions de filtre {colonne: valeur}" }
  },
  async ({ table, data, match }) => {
    let query = supabase.from(table).update(data);
    for (const [key, value] of Object.entries(match)) {
      query = query.eq(key, value);
    }
    const { data: result, error } = await query.select();
    if (error) return { content: [{ type: "text", text: `Erreur: ${error.message}` }] };
    return { content: [{ type: "text", text: `Mis à jour: ${JSON.stringify(result)}` }] };
  }
);

// 5. Supprimer
mcpServer.tool(
  "delete_rows",
  "Supprime des lignes d'une table",
  {
    table: { type: "string", description: "Nom de la table" },
    match: { type: "object", description: "Conditions {colonne: valeur}" }
  },
  async ({ table, match }) => {
    let query = supabase.from(table).delete();
    for (const [key, value] of Object.entries(match)) {
      query = query.eq(key, value);
    }
    const { data: result, error } = await query.select();
    if (error) return { content: [{ type: "text", text: `Erreur: ${error.message}` }] };
    return { content: [{ type: "text", text: `Supprimé: ${JSON.stringify(result)}` }] };
  }
);

// 6. SQL brut (lecture seule)
mcpServer.tool(
  "run_sql",
  "Exécute une requête SQL SELECT",
  {
    query: { type: "string", description: "Requête SQL (SELECT uniquement)" }
  },
  async ({ query }) => {
    if (!/^\s*SELECT/i.test(query)) {
      return { content: [{ type: "text", text: "Erreur: Seules les requêtes SELECT sont autorisées" }] };
    }
    const { data, error } = await supabase.rpc("exec_sql", { sql_query: query });
    if (error) return { content: [{ type: "text", text: `Erreur: ${error.message}` }] };
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// 7. Stats rapides
mcpServer.tool(
  "get_stats",
  "Obtient des statistiques sur une table",
  {
    table: { type: "string", description: "Nom de la table" }
  },
  async ({ table }) => {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) return { content: [{ type: "text", text: `Erreur: ${error.message}` }] };
    return { content: [{ type: "text", text: `Table "${table}": ${count} lignes` }] };
  }
);

// === EXPRESS ROUTES ===

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", server: "trusted-biz-link-mcp" });
});

// SSE endpoint pour MCP
let transport: SSEServerTransport | null = null;

app.get("/sse", (req, res) => {
  console.log("Nouvelle connexion SSE");
  transport = new SSEServerTransport("/messages", res);
  mcpServer.connect(transport);
});

app.post("/messages", async (req, res) => {
  if (!transport) {
    res.status(400).json({ error: "Pas de connexion SSE active" });
    return;
  }
  await transport.handlePostMessage(req, res);
});

// Démarrage
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 MCP Server Trusted Biz Link sur port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   SSE: http://localhost:${PORT}/sse`);
});

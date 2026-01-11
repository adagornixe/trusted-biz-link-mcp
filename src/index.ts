import express from "express";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_KEY || ""
);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "trusted-biz-link-mcp" });
});

// Liste les tables
app.get("/tables", async (_req, res) => {
  const { data, error } = await supabase.rpc("get_tables");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Query générique
app.post("/query", async (req, res) => {
  const { table, select = "*", limit = 20 } = req.body;
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Insert
app.post("/insert", async (req, res) => {
  const { table, row } = req.body;
  const { data, error } = await supabase.from(table).insert([row]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// SSE endpoint simple
app.get("/sse", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

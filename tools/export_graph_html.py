#!/usr/bin/env python3
"""
Exporta o grafo de memorias do Noctis (todos os projetos/mapas) para um
unico arquivo HTML autocontido, navegavel com vis-network.

Uso:
    python tools/export_graph_html.py [--out outputs/graph_export.html] [--base http://localhost:5501]
"""
import argparse
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path

TYPE_COLORS = {
    "fundacao": "#8b5cf6",
    "decisao": "#f59e0b",
    "referencia": "#3b82f6",
    "estado": "#10b981",
    "output": "#ec4899",
    "nota": "#6b7280",
}


def fetch(base, path):
    url = f"{base}{path}"
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.URLError as e:
        print(f"[aviso] falha em {url}: {e}", file=sys.stderr)
        return None


def build_dataset(base):
    projects = fetch(base, "/api/projects") or []
    mem_types = fetch(base, "/api/memory-types") or {}
    dataset = {"projects": [], "memoryTypes": mem_types}

    for proj in projects:
        slug = proj["slug"]
        canvases = fetch(base, f"/api/projects/{slug}/canvases") or []
        cosmos = fetch(base, f"/api/projects/{slug}/cosmos") or {"nodes": [], "edges": []}
        proj_entry = {
            "slug": slug,
            "displayName": proj.get("displayName", slug),
            "counts": proj.get("counts", {}),
            "cosmos": cosmos,
            "canvases": [],
        }
        for cv in canvases:
            cid = cv.get("id")
            if not cid:
                continue
            payload = fetch(base, f"/api/projects/{slug}/memory-canvas?canvas={cid}")
            if payload is None:
                continue
            proj_entry["canvases"].append({
                "id": cid,
                "name": cv.get("name", cid),
                "lanes": payload.get("lanes", []),
                "nodes": payload.get("nodes", []),
                "edges": payload.get("edges", []),
            })
        dataset["projects"].append(proj_entry)
    return dataset


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Grafo de memórias — export</title>
<script src="https://unpkg.com/vis-network@9/standalone/umd/vis-network.min.js"></script>
<style>
  html, body { margin:0; height:100%; font-family: -apple-system, Segoe UI, sans-serif; background:#0f1115; color:#eee; }
  #bar { display:flex; gap:12px; align-items:center; padding:10px 14px; background:#1a1d24; border-bottom:1px solid #2a2e37; }
  #bar select { background:#22262f; color:#eee; border:1px solid #3a3f4a; border-radius:6px; padding:6px 10px; }
  #bar span.count { color:#9aa; font-size:12px; }
  #graph { position:absolute; top:48px; left:0; right:0; bottom:0; }
  #legend { position:absolute; bottom:12px; left:12px; background:#1a1d24cc; padding:8px 12px; border-radius:8px; font-size:12px; line-height:1.6; }
  .dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; }
</style>
</head>
<body>
<div id="bar">
  <label>Projeto: <select id="projSel"></select></label>
  <label>Mapa: <select id="canvasSel"></select></label>
  <span class="count" id="countInfo"></span>
</div>
<div id="graph"></div>
<div id="legend"></div>
<script>
const DATA = __DATA_JSON__;
const TYPE_COLORS = __TYPE_COLORS_JSON__;

const projSel = document.getElementById('projSel');
const canvasSel = document.getElementById('canvasSel');
const countInfo = document.getElementById('countInfo');
const legendEl = document.getElementById('legend');
let network = null;

DATA.projects.forEach((p, i) => {
  const opt = document.createElement('option');
  opt.value = i; opt.textContent = `${p.displayName} (${p.canvases.length} mapas)`;
  projSel.appendChild(opt);
});

function colorFor(node) {
  if (node.color) return node.color;
  if (node.type && TYPE_COLORS[node.type]) return TYPE_COLORS[node.type];
  return '#5b6472';
}

function renderLegend() {
  legendEl.innerHTML = Object.entries(TYPE_COLORS)
    .map(([k,c]) => `<div><span class="dot" style="background:${c}"></span>${k}</div>`).join('');
}

function populateCanvases() {
  const p = DATA.projects[projSel.value];
  canvasSel.innerHTML = '';
  const cosmosOpt = document.createElement('option');
  cosmosOpt.value = '__cosmos__';
  cosmosOpt.textContent = `— Cosmos (mapa dos mapas) —`;
  canvasSel.appendChild(cosmosOpt);
  p.canvases.forEach((c, i) => {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = `${c.name} (${c.nodes.length} nós)`;
    canvasSel.appendChild(opt);
  });
  renderGraph();
}

function renderGraph() {
  const p = DATA.projects[projSel.value];
  let nodes, edges;
  if (canvasSel.value === '__cosmos__') {
    nodes = (p.cosmos.nodes || []).map(n => ({
      id: n.id, label: (p.canvases.find(c => c.id === n.id) || {}).name || n.id,
      x: n.x, y: n.y, shape: 'box', color: '#3b4252', font: {color:'#fff'}
    }));
    edges = (p.cosmos.edges || []).map(e => ({ id: e.id, from: e.source, to: e.target }));
  } else {
    const c = p.canvases[canvasSel.value];
    nodes = (c.nodes || []).map(n => ({
      id: n.id,
      label: n.title || n.name || n.id,
      title: n.excerpt || n.title || n.name || '',
      x: n.x, y: n.y,
      color: colorFor(n),
      shape: 'dot', size: 10,
      font: { color: '#eee', size: 12 }
    }));
    edges = (c.edges || []).map(e => ({ id: e.id, from: e.source, to: e.target, arrows: 'to', color: {color:'#5b6472'} }));
  }
  countInfo.textContent = `${nodes.length} nós · ${edges.length} arestas`;
  const options = {
    physics: { enabled: true, stabilization: { iterations: 150 } },
    interaction: { hover: true, tooltipDelay: 100 },
    edges: { smooth: { type: 'continuous' } }
  };
  if (network) network.destroy();
  network = new vis.Network(document.getElementById('graph'), {nodes, edges}, options);
}

projSel.addEventListener('change', populateCanvases);
canvasSel.addEventListener('change', renderGraph);

renderLegend();
populateCanvases();
</script>
</body>
</html>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="outputs/graph_export.html")
    ap.add_argument("--base", default="http://localhost:5501")
    args = ap.parse_args()

    dataset = build_dataset(args.base)
    html = HTML_TEMPLATE.replace("__DATA_JSON__", json.dumps(dataset, ensure_ascii=False))
    html = html.replace("__TYPE_COLORS_JSON__", json.dumps(TYPE_COLORS))

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    print(f"OK: {out_path.resolve()}")
    total_canvases = sum(len(p["canvases"]) for p in dataset["projects"])
    total_nodes = sum(len(c["nodes"]) for p in dataset["projects"] for c in p["canvases"])
    print(f"{len(dataset['projects'])} projetos, {total_canvases} mapas, {total_nodes} nós")


if __name__ == "__main__":
    main()

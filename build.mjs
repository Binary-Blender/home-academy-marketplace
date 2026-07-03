// ============================================================
//  Home Academy Marketplace — static site generator
//  Zero dependencies. The lessons/ tree IS the database; this
//  script walks it, parses each RECORD Lesson .agi, and emits a
//  deployable static site into ./dist:
//    index.html                 — filterable catalog
//    <subject>/<grade>/<slug>.html — one page per lesson
//    style.css                  — shared styling
//
//  Run:  node build.mjs         → writes ./dist
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const LESSONS = join(ROOT, 'lessons');
const DIST = join(ROOT, 'dist');
const APP_URL = 'https://homeacademy.binary-blender.com';

// ---------------------------------------------------------------
//  .agi RECORD parser (mirrors the app's agi-record.ts)
// ---------------------------------------------------------------
const HEADER_RE = /^RECORD\s+(\w+)\s+([\w-]+)\s*\{\s*$/;
const FIELD_RE = /^\s*(\w+)\s*:\s*(.+?)\s*$/;

function parseAgi(text) {
  const lines = text.split(/\r?\n/);
  const fields = {};
  let id = '';
  let started = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!started) {
      const h = line.match(HEADER_RE);
      if (h) { id = h[2]; started = true; }
      continue;
    }
    if (line === '}') break;
    const m = line.match(FIELD_RE);
    if (!m) continue;
    const [, name, rawVal] = m;
    if (rawVal.startsWith('"') && rawVal.endsWith('"')) {
      try { fields[name] = JSON.parse(rawVal); } catch { fields[name] = rawVal.slice(1, -1); }
    } else if (/^-?\d+(\.\d+)?$/.test(rawVal)) {
      fields[name] = Number(rawVal);
    } else {
      fields[name] = rawVal;
    }
  }
  return { id, fields };
}

// ---------------------------------------------------------------
//  Minimal Markdown → HTML (headings, lists, quote, hr, inline)
// ---------------------------------------------------------------
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function renderMarkdown(md) {
  const lines = String(md || '').split('\n');
  const out = [];
  let i = 0;
  let para = [];
  const flushPara = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { flushPara(); i++; continue; }
    let m;
    if ((m = t.match(/^(#{1,4})\s+(.*)$/))) { flushPara(); const n = m[1].length; out.push('<h' + n + '>' + inline(m[2]) + '</h' + n + '>'); i++; continue; }
    if (/^---+$/.test(t)) { flushPara(); out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(t)) {
      flushPara(); const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) { buf.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
      out.push('<blockquote>' + inline(buf.join(' ')) + '</blockquote>'); continue;
    }
    if (/^[-*]\s+/.test(t)) {
      flushPara(); const buf = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) { buf.push('<li>' + inline(lines[i].trim().replace(/^[-*]\s+/, '')) + '</li>'); i++; }
      out.push('<ul>' + buf.join('') + '</ul>'); continue;
    }
    if (/^\d+\.\s+/.test(t)) {
      flushPara(); const buf = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) { buf.push('<li>' + inline(lines[i].trim().replace(/^\d+\.\s+/, '')) + '</li>'); i++; }
      out.push('<ol>' + buf.join('') + '</ol>'); continue;
    }
    para.push(t); i++;
  }
  flushPara();
  return out.join('\n');
}

// ---------------------------------------------------------------
//  Discovery
// ---------------------------------------------------------------
function walk(dir) {
  const found = [];
  let entries; try { entries = readdirSync(dir); } catch { return found; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) found.push(...walk(p));
    else if (e.endsWith('.agi')) found.push(p);
  }
  return found;
}

// ---------------------------------------------------------------
//  Templates
// ---------------------------------------------------------------
function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="site">
  <a class="brand" href="/">🌍 Home Academy Marketplace</a>
  <a class="cta" href="${APP_URL}" rel="noopener">Open Home Academy →</a>
</header>
<main>
${body}
</main>
<footer class="site">
  <p>Free homeschool lessons, shared by families and stored as open <code>.agi</code> files in
  <a href="https://github.com/Binary-Blender/home-academy-marketplace" rel="noopener">a public git repo</a>.
  Lessons are <strong>CC-BY-4.0</strong> unless noted. Built for
  <a href="${APP_URL}" rel="noopener">NovaSyn Home Academy</a>.</p>
</footer>
</body>
</html>`;
}

function lessonPage(l) {
  const f = l.fields;
  const meta = [];
  if (f.grade_level) meta.push(`<span><b>Grade</b> ${esc(f.grade_level)}</span>`);
  if (f.duration_minutes) meta.push(`<span><b>Time</b> ~${esc(f.duration_minutes)} min</span>`);
  if (f.standards) meta.push(`<span><b>Standards</b> ${esc(f.standards)}</span>`);
  if (f.author) meta.push(`<span><b>By</b> ${esc(f.author)}</span>`);
  meta.push(`<span><b>License</b> ${esc(f.license || 'CC-BY-4.0')}</span>`);
  const body = `
<nav class="crumb"><a href="/">Catalog</a> › ${esc(f.subject)} · ${esc(f.grade_level || '')}</nav>
<article class="lesson">
  <span class="badge">${esc(f.subject)}${f.grade_level ? ' · ' + esc(f.grade_level) : ''}</span>
  <h1>${esc(f.title)}</h1>
  <div class="meta">${meta.join('')}</div>
  <div class="content">${renderMarkdown(f.content)}</div>
  <div class="addbox">
    <p>Want this on your child's schedule? Open it in the app — it drops straight into your planner.</p>
    <a class="cta big" href="${APP_URL}" rel="noopener">Add in Home Academy →</a>
  </div>
</article>`;
  return page(f.title + ' · Home Academy Marketplace', body);
}

function indexPage(lessons) {
  const subjects = [...new Set(lessons.map((l) => l.fields.subject).filter(Boolean))].sort();
  const grades = [...new Set(lessons.map((l) => l.fields.grade_level).filter(Boolean))].sort();
  const cards = lessons.map((l) => {
    const f = l.fields;
    const hay = [f.title, f.subject, f.grade_level, f.tags].filter(Boolean).join(' ').toLowerCase();
    return `<a class="card" href="/${esc(l.htmlPath.replace(/\.html$/, ''))}" data-subject="${esc(f.subject || '')}" data-grade="${esc(f.grade_level || '')}" data-hay="${esc(hay)}">
  <div class="card-top"><span class="card-title">${esc(f.title)}</span><span class="card-badge">${esc(f.subject)}${f.grade_level ? ' · ' + esc(f.grade_level) : ''}</span></div>
  <div class="card-sub">${f.author ? 'by ' + esc(f.author) : ''}${f.duration_minutes ? ' · ~' + esc(f.duration_minutes) + ' min' : ''}${f.tags ? ' · ' + esc(f.tags) : ''}</div>
</a>`;
  }).join('\n');
  const opt = (arr) => arr.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  const body = `
<section class="hero">
  <h1>Free homeschool lessons, shared by families</h1>
  <p>Browse ${lessons.length} open lesson${lessons.length === 1 ? '' : 's'} — grab any one for your own child in <a href="${APP_URL}" rel="noopener">Home Academy</a>. No account needed to look around.</p>
</section>
<div class="filters">
  <input id="q" placeholder="Search lessons…" autocomplete="off">
  <select id="fsubject"><option value="">All subjects</option>${opt(subjects)}</select>
  <select id="fgrade"><option value="">All grades</option>${opt(grades)}</select>
</div>
<div id="grid" class="grid">
${cards || '<p class="empty">No lessons yet — be the first to share one from inside Home Academy.</p>'}
</div>
<script>
(function () {
  var q = document.getElementById('q'), fs = document.getElementById('fsubject'), fg = document.getElementById('fgrade');
  var cards = [].slice.call(document.querySelectorAll('.card'));
  function apply() {
    var t = (q.value || '').toLowerCase(), s = fs.value, g = fg.value, shown = 0;
    cards.forEach(function (c) {
      var ok = (!s || c.getAttribute('data-subject') === s) && (!g || c.getAttribute('data-grade') === g) && (!t || c.getAttribute('data-hay').indexOf(t) >= 0);
      c.style.display = ok ? '' : 'none'; if (ok) shown++;
    });
    document.getElementById('nomatch').style.display = shown ? 'none' : 'block';
  }
  q.addEventListener('input', apply); fs.addEventListener('change', apply); fg.addEventListener('change', apply);
})();
</script>
<p id="nomatch" class="empty" style="display:none">No lessons match those filters.</p>`;
  return page('Home Academy Marketplace — free homeschool lessons', body);
}

const STYLE = `:root{--bg:#fbf6ee;--card:#fff;--ink:#3d405b;--muted:#8a8577;--line:#eadfce;--accent:#e07a5f;--accent-deep:#c65a3f;--sage:#81b29a;--radius:16px}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent-deep)}
header.site,footer.site{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1rem 1.5rem;flex-wrap:wrap}
header.site{border-bottom:1px solid var(--line);background:#fff}
.brand{font-weight:800;text-decoration:none;color:var(--ink)}
.cta{background:var(--accent);color:#fff;padding:.5rem .9rem;border-radius:10px;text-decoration:none;font-weight:600}
.cta:hover{background:var(--accent-deep)}
.cta.big{display:inline-block;margin-top:.6rem;padding:.7rem 1.2rem}
main{max-width:860px;margin:0 auto;padding:1.5rem}
.hero h1{font-size:2rem;margin:.4rem 0}
.hero p{color:var(--muted);font-size:1.05rem}
.filters{display:flex;gap:.5rem;flex-wrap:wrap;margin:1.4rem 0}
.filters input{flex:1;min-width:200px}
input,select{padding:.55rem .7rem;border:1px solid var(--line);border-radius:10px;font-size:.95rem;background:#fff;color:var(--ink)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.8rem}
.card{display:block;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:1rem 1.1rem;text-decoration:none;color:inherit;transition:transform .1s,box-shadow .1s}
.card:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(61,64,91,.08)}
.card-top{display:flex;justify-content:space-between;gap:.6rem;align-items:baseline}
.card-title{font-weight:700}
.card-badge{color:var(--accent-deep);font-weight:600;font-size:.78rem;white-space:nowrap}
.card-sub{color:var(--muted);font-size:.85rem;margin-top:.3rem}
.badge{display:inline-block;background:var(--sage);color:#fff;font-size:.78rem;font-weight:700;padding:.2rem .6rem;border-radius:999px}
.crumb{color:var(--muted);font-size:.85rem;margin-bottom:.6rem}
.lesson h1{font-size:1.7rem;margin:.5rem 0}
.meta{display:flex;flex-wrap:wrap;gap:.4rem 1.1rem;color:var(--muted);font-size:.88rem;margin:.4rem 0 1.2rem;padding-bottom:1rem;border-bottom:1px solid var(--line)}
.meta b{color:var(--ink)}
.content h2{font-size:1.3rem;margin:1.4rem 0 .4rem}
.content h3{font-size:1.1rem;margin:1.1rem 0 .3rem}
.content blockquote{margin:.6rem 0;padding:.4rem 1rem;border-left:3px solid var(--sage);background:#fff;border-radius:0 8px 8px 0;color:#555}
.content code{background:#f2ece0;padding:.1rem .35rem;border-radius:4px;font-size:.9em}
.content ul,.content ol{padding-left:1.3rem}
.addbox{margin-top:2rem;padding:1.2rem 1.3rem;background:#fff;border:1px solid var(--line);border-radius:var(--radius)}
.addbox p{margin:0;color:var(--muted)}
.empty{color:var(--muted);text-align:center;padding:2rem}
footer.site{border-top:1px solid var(--line);color:var(--muted);font-size:.85rem;margin-top:2rem}
footer.site p{margin:0}`;

// ---------------------------------------------------------------
//  Build
// ---------------------------------------------------------------
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
writeFileSync(join(DIST, 'style.css'), STYLE);

const lessons = walk(LESSONS).map((abs) => {
  const rel = relative(LESSONS, abs).replace(/\\/g, '/');       // math/3rd/adding-fractions.agi
  const htmlPath = rel.replace(/\.agi$/, '.html');              // math/3rd/adding-fractions.html
  const depth = htmlPath.split('/').length - 1;                 // nesting for relative links
  const { fields } = parseAgi(readFileSync(abs, 'utf8'));
  return { rel, htmlPath, depth, fields };
}).filter((l) => l.fields.title && l.fields.content);

lessons.sort((a, b) => ((a.fields.subject + a.fields.grade_level + a.fields.title)).localeCompare(b.fields.subject + b.fields.grade_level + b.fields.title));

for (const l of lessons) {
  const outPath = join(DIST, l.htmlPath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, lessonPage(l));
}
writeFileSync(join(DIST, 'index.html'), indexPage(lessons));

console.log(`Built ${lessons.length} lesson page(s) + index → ${relative(ROOT, DIST)}/`);

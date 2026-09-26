// GQA-3 static SQL contract analysis. Local text analysis only: no database, no network.
//
// A small tokenizer (single-quoted strings, double-quoted identifiers, dollar-quoted bodies, line and
// block comments) so that a GRANT or RLS statement written only inside a comment never counts, and a
// quoted or oddly-cased identifier cannot hide a public table.

export const DATA_API_MODES = Object.freeze([
  "SEALED_RPC_ONLY", "SERVER_ONLY", "AUTHENTICATED_READ", "AUTHENTICATED_READ_WRITE", "PUBLIC_READ"
]);
export const RLS_MODES = Object.freeze(["ENABLED", "FORCED"]);
export const CLIENT_ROLES = Object.freeze(["anon", "authenticated"]);
export const TABLE_PRIVILEGES = Object.freeze(["select", "insert", "update", "delete", "truncate", "references", "trigger"]);
export const WRITE_PRIVILEGES = Object.freeze(["insert", "update", "delete"]);
export const MIGRATION_NAME = /^(\d{14})_[a-z0-9_]+\.sql$/;

/** Replace comments with spaces, keeping strings, identifiers and dollar bodies intact. */
export function stripSqlComments(text) {
  let out = "", i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i], d = text[i + 1];
    if (c === "-" && d === "-") { while (i < n && text[i] !== "\n") { out += " "; i += 1; } continue; }
    if (c === "/" && d === "*") {
      let depth = 1; out += "  "; i += 2;
      while (i < n && depth > 0) {
        if (text[i] === "/" && text[i + 1] === "*") { depth += 1; out += "  "; i += 2; continue; }
        if (text[i] === "*" && text[i + 1] === "/") { depth -= 1; out += "  "; i += 2; continue; }
        out += text[i] === "\n" ? "\n" : " "; i += 1;
      }
      continue;
    }
    if (c === "'") { const j = endOfQuoted(text, i, "'"); out += text.slice(i, j); i = j; continue; }
    if (c === '"') { const j = endOfQuoted(text, i, '"'); out += text.slice(i, j); i = j; continue; }
    if (c === "$") {
      const tag = text.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (tag) {
        const close = text.indexOf(tag[0], i + tag[0].length);
        const j = close < 0 ? n : close + tag[0].length;
        out += text.slice(i, j); i = j; continue;
      }
    }
    out += c; i += 1;
  }
  return out;
}
function endOfQuoted(text, start, quote) {
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === quote) { if (text[i + 1] === quote) { i += 2; continue; } return i + 1; }
    i += 1;
  }
  return text.length;
}

/** Split comment-free SQL into top-level statements (semicolons inside strings/bodies are ignored). */
export function splitStatements(code) {
  const statements = [];
  let i = 0, start = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    if (c === "'" || c === '"') { i = endOfQuoted(code, i, c); continue; }
    if (c === "$") {
      const tag = code.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (tag) { const close = code.indexOf(tag[0], i + tag[0].length); i = close < 0 ? n : close + tag[0].length; continue; }
    }
    if (c === ";") { statements.push(code.slice(start, i)); start = i + 1; }
    i += 1;
  }
  if (code.slice(start).trim()) statements.push(code.slice(start));
  return statements.map((s) => s.trim()).filter(Boolean);
}

/** Mask dollar-quoted bodies so that function bodies are not parsed as top-level DDL. */
export function maskDollarBodies(statement) {
  return statement.replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g, " $$body$$ ");
}

const IDENT = `(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QNAME = `${IDENT}(?:\\s*\\.\\s*${IDENT})?`;
/** Normalize a possibly quoted, possibly schema-qualified name to lower-case schema.name. */
export function qualify(raw, defaultSchema = "public") {
  const parts = raw.split(/\s*\.\s*(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((p) => p.trim().replace(/^"|"$/g, "").replace(/""/g, '"').toLowerCase());
  return parts.length === 1 ? `${defaultSchema}.${parts[0]}` : `${parts[0]}.${parts[1]}`;
}
const splitList = (value) => value.split(",").map((s) => s.trim()).filter(Boolean);
const collapse = (s) => s.replace(/\s+/g, " ").trim();

function normalizePrivileges(list) {
  const out = new Set();
  for (const item of splitList(list.replace(/\([^)]*\)/g, ""))) {
    const p = item.toLowerCase().replace(/\s+/g, " ");
    if (p === "all" || p === "all privileges") TABLE_PRIVILEGES.forEach((x) => out.add(x));
    else if (TABLE_PRIVILEGES.includes(p)) out.add(p);
    else out.add(`unknown:${p}`);
  }
  return out;
}
const normalizeRole = (r) => { const x = r.trim().replace(/^"|"$/g, "").toLowerCase(); return x === "public" ? "PUBLIC" : x; };

/**
 * Parse one migration into structured facts. `code` is comment-free; markers come from the raw text.
 */
export function parseMigration(rawText) {
  const code = stripSqlComments(rawText);
  const facts = {
    createdTables: [], renamedTables: [], schemaMovedTables: [], droppedTables: [],
    tableGrants: [], tableRevokes: [], rls: [], policies: [], droppedPolicies: [],
    broadGrants: [], defaultPrivilegeGrants: [], functions: [], droppedFunctions: [],
    functionGrants: [], functionRevokes: [], views: [], unknownPrivileges: []
  };
  let order = 0;
  const pending = splitStatements(code).map((statement) => ({ statement, depth: 0 }));
  while (pending.length) {
    const { statement, depth } = pending.shift();
    order += 1;
    // DO blocks run their DDL at migration time: parse their bodies (including EXECUTE '...' strings)
    // so a table, grant or RLS change inside a DO block cannot evade the contract. Function bodies are
    // not migration-time DDL and stay masked.
    if (/^do\b/i.test(statement) && depth < 3) {
      pending.unshift(...doBlockStatements(statement).map((inner) => ({ statement: inner, depth: depth + 1 })));
      continue;
    }
    const s = maskDollarBodies(statement);
    const flat = collapse(s);
    let m;
    if ((m = flat.match(new RegExp(`^create\\s+(?:(?:global|local)\\s+)?(temp|temporary|unlogged\\s+)?\\s*table\\s+(?:if\\s+not\\s+exists\\s+)?(${QNAME})`, "i")))) {
      if (!/^(temp|temporary)$/i.test((m[1] ?? "").trim())) facts.createdTables.push(qualify(m[2]));
    } else if ((m = flat.match(new RegExp(`^create\\s+(?:or\\s+replace\\s+)?(?:materialized\\s+)?view\\s+(?:if\\s+not\\s+exists\\s+)?(${QNAME})`, "i")))) {
      facts.views.push(qualify(m[1]));
    } else if ((m = flat.match(new RegExp(`^alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?(${QNAME})\\s+rename\\s+to\\s+(${IDENT})`, "i")))) {
      const from = qualify(m[1]); facts.renamedTables.push({ from, to: `${from.split(".")[0]}.${m[2].replace(/^"|"$/g, "").toLowerCase()}` });
    } else if ((m = flat.match(new RegExp(`^alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?(${QNAME})\\s+set\\s+schema\\s+(${IDENT})`, "i")))) {
      const from = qualify(m[1]); facts.schemaMovedTables.push({ from, to: `${m[2].replace(/^"|"$/g, "").toLowerCase()}.${from.split(".")[1]}` });
    } else if ((m = flat.match(new RegExp(`^alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?(${QNAME})\\s+(enable|disable|force|no\\s+force)\\s+row\\s+level\\s+security`, "i")))) {
      facts.rls.push({ table: qualify(m[1]), action: m[2].toLowerCase().replace(/\s+/g, " ") });
    } else if ((m = flat.match(new RegExp(`^drop\\s+table\\s+(?:if\\s+exists\\s+)?(.+?)(?:\\s+(?:cascade|restrict))?$`, "i")))) {
      splitList(m[1]).forEach((t) => facts.droppedTables.push(qualify(t)));
    } else if ((m = flat.match(new RegExp(`^create\\s+policy\\s+(${IDENT})\\s+on\\s+(?:only\\s+)?(${QNAME})(.*)$`, "i")))) {
      const rest = m[3];
      const cmd = (rest.match(/\bfor\s+(all|select|insert|update|delete)\b/i)?.[1] ?? "all").toLowerCase();
      const roles = (rest.match(/\bto\s+(.+?)(?=\s+using\b|\s+with\s+check\b|$)/i)?.[1] ?? "public");
      facts.policies.push({ name: m[1].replace(/^"|"$/g, "").toLowerCase(), table: qualify(m[2]), cmd, roles: splitList(roles).map(normalizeRole) });
    } else if ((m = flat.match(new RegExp(`^drop\\s+policy\\s+(?:if\\s+exists\\s+)?(${IDENT})\\s+on\\s+(${QNAME})`, "i")))) {
      facts.droppedPolicies.push({ name: m[1].replace(/^"|"$/g, "").toLowerCase(), table: qualify(m[2]) });
    } else if (/^alter\s+default\s+privileges\b/i.test(flat)) {
      if (/\bgrant\b/i.test(flat)) facts.defaultPrivilegeGrants.push(flat);
    } else if ((m = flat.match(/^(grant|revoke)\s+(?:grant\s+option\s+for\s+)?(.+?)\s+on\s+(.+?)\s+(to|from)\s+(.+?)(?:\s+with\s+grant\s+option|\s+granted\s+by\s+\S+|\s+cascade|\s+restrict)*$/i))) {
      const [, verb, privs, target, , rolesRaw] = m;
      const roles = splitList(rolesRaw).map(normalizeRole);
      let t;
      if (/^all\s+(tables|sequences|functions|routines)\s+in\s+schema\b/i.test(target)) {
        if (verb.toLowerCase() === "grant") facts.broadGrants.push(flat);
      } else if ((t = target.match(/^(?:function|procedure|routine)\s+([\s\S]+)$/i))) {
        const names = [...t[1].matchAll(new RegExp(`(${QNAME})\\s*\\(`, "g"))].map((x) => qualify(x[1]));
        (verb.toLowerCase() === "grant" ? facts.functionGrants : facts.functionRevokes).push({ functions: names, roles, privileges: privs.toLowerCase() });
      } else if (!/^(schema|sequence|database|type|domain|language|large\s+object|tablespace|foreign)\b/i.test(target)) {
        const tables = splitList(target.replace(/^table\s+/i, "")).map((x) => qualify(x));
        const set = normalizePrivileges(privs);
        if (verb.toLowerCase() === "grant" && /^all(\s+privileges)?$/i.test(privs.trim())) facts.broadGrants.push(flat);
        for (const p of set) if (p.startsWith("unknown:")) facts.unknownPrivileges.push(flat);
        const entry = { tables, roles, privileges: [...set].filter((p) => !p.startsWith("unknown:")), text: flat, order };
        (verb.toLowerCase() === "grant" ? facts.tableGrants : facts.tableRevokes).push(entry);
      }
    } else if ((m = flat.match(new RegExp(`^create\\s+(?:or\\s+replace\\s+)?(?:function|procedure)\\s+(${QNAME})\\s*\\(`, "i")))) {
      const name = qualify(m[1]);
      const header = flat.slice(0, flat.indexOf("$$body$$") < 0 ? undefined : flat.indexOf("$$body$$"));
      facts.functions.push({
        name,
        securityDefiner: /\bsecurity\s+definer\b/i.test(flat),
        searchPath: flat.match(/\bset\s+search_path\s*(?:=|to)\s*('[^']*'|[^\s]+(?:\s*,\s*[^\s]+)*)/i)?.[1] ?? null,
        header: header.slice(0, 400)
      });
    } else if ((m = flat.match(/^drop\s+(?:function|procedure)\s+(?:if\s+exists\s+)?(.+?)(?:\s+(?:cascade|restrict))?$/i))) {
      [...m[1].matchAll(new RegExp(`(${QNAME})\\s*\\(`, "g"))].forEach((x) => facts.droppedFunctions.push(qualify(x[1])));
    }
  }
  return facts;
}

const DDL_START = /\b(create\s+(?:or\s+replace\s+)?(?:(?:global|local)\s+)?(?:temp\s+|temporary\s+|unlogged\s+)?(?:table|view|materialized\s+view|policy|function|procedure)|alter\s+table|alter\s+default\s+privileges|grant|revoke|drop\s+(?:table|policy|function|procedure))\b/i;
/** Extract the migration-time statements of a DO block body. */
export function doBlockStatements(statement) {
  const body = statement.match(/\$([A-Za-z_][A-Za-z0-9_]*)?\$([\s\S]*)\$\1\$/)?.[2] ?? "";
  const out = [];
  for (const piece of splitStatements(body)) {
    // Dynamic SQL: EXECUTE 'sql' or EXECUTE format('sql', ...).
    for (const lit of piece.matchAll(/\bexecute\s+(?:format\s*\(\s*)?'((?:[^']|'')*)'/gi)) {
      out.push(...splitStatements(lit[1].replace(/''/g, "'")));
    }
    const m = piece.match(DDL_START);
    if (!m) continue;
    const prefix = piece.slice(0, m.index).trim();
    if (prefix === "" || /\b(then|begin|else|loop)$/i.test(prefix)) out.push(piece.slice(m.index));
  }
  return out;
}

/**
 * Markers are the only source of an access decision. Format (one line per public table):
 *   -- TASTKIND_DATA_API: public.<table> mode=<MODE> rls=<ENABLED|FORCED> [justification="..."]
 * Existing tables whose grants, policies or RLS a new migration changes must carry:
 *   -- TASTKIND_DATA_API_CHANGE: public.<table> mode=<MODE> rls=<ENABLED|FORCED> [justification="..."]
 */
export function parseMarkers(rawText) {
  const markers = [], malformed = [];
  for (const line of rawText.split(/\r?\n/)) {
    const hit = line.match(/^\s*--\s*TASTKIND_DATA_API(_CHANGE)?\s*:\s*(.*)$/);
    if (!hit) { if (/TASTKIND_DATA_API/i.test(line)) malformed.push(line.trim()); continue; }
    const body = hit[2].trim();
    const m = body.match(/^(\S+)\s+mode=([A-Z_]+)\s+rls=([A-Z]+)(?:\s+justification="([^"]{12,})")?\s*$/);
    if (!m) { malformed.push(line.trim()); continue; }
    markers.push({ kind: hit[1] ? "change" : "create", table: qualify(m[1]), mode: m[2], rls: m[3], justification: m[4] ?? null, raw: line.trim() });
  }
  return { markers, malformed };
}

/** Fold ordered migrations into the cumulative per-table security state. */
export function foldSecurityState(parsedList) {
  const state = new Map();
  const get = (t) => { if (!state.has(t)) state.set(t, { kind: "unknown", enabled: false, forced: false, grants: new Map(), policies: new Map() }); return state.get(t); };
  for (const facts of parsedList) {
    for (const t of facts.createdTables) get(t).kind = "table";
    for (const v of facts.views) get(v).kind = "view";
    for (const { from, to } of [...facts.renamedTables, ...facts.schemaMovedTables]) { if (state.has(from)) { state.set(to, state.get(from)); state.delete(from); } else get(to); }
    for (const t of facts.droppedTables) state.delete(t);
    for (const r of facts.rls) {
      const s = get(r.table);
      if (r.action === "enable") s.enabled = true; else if (r.action === "disable") s.enabled = false;
      else if (r.action === "force") s.forced = true; else if (r.action === "no force") s.forced = false;
    }
    // Grants and revokes are applied in statement order within a migration.
    const ordered = [...facts.tableGrants.map((g) => ({ ...g, verb: "grant" })), ...facts.tableRevokes.map((g) => ({ ...g, verb: "revoke" }))]
      .sort((a, b) => a.order - b.order);
    for (const g of ordered) {
      for (const t of g.tables) {
        const s = get(t);
        for (const role of g.roles) {
          const set = s.grants.get(role) ?? new Set();
          for (const p of g.privileges) g.verb === "grant" ? set.add(p) : set.delete(p);
          s.grants.set(role, set);
        }
      }
    }
    for (const p of facts.policies) get(p.table).policies.set(p.name, p);
    for (const p of facts.droppedPolicies) state.get(p.table)?.policies.delete(p.name);
  }
  return state;
}

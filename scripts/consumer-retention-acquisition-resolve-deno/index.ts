// ENT-W1 Edge composition (index.ts -> Deno.serve) under the real Deno runtime, in a CHILD process whose only network permission is listening on 0.0.0.0:8000 (no outbound connection is possible).
// Case A: no ENT-W1 environment at all -> every request 503 'unavailable'. Case B: enabled with a database URL on 127.0.0.1:5999 -> wrong secret 401; the correct secret makes the composition create the real driver,
// whose connection is refused by the child's permissions -> 503 'failed' (an ordinary failure, not 'unknown'). usage: deno run --allow-run=<deno> --allow-net=127.0.0.1:8000 --allow-env entw1-deno-index.ts <deno> <index.ts> <denodir>
const [denoExe, indexTs, denoDir] = Deno.args;
const SECRET = "k".repeat(40);
const checks: Record<string, { pass: boolean; observed: unknown }> = {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function serve(env: Record<string, string>) {
  const base: Record<string, string> = { DENO_DIR: denoDir, DENO_NO_UPDATE_CHECK: "1", SystemRoot: Deno.env.get("SystemRoot") ?? "C:\\Windows", PATH: Deno.env.get("PATH") ?? "", USERPROFILE: Deno.env.get("USERPROFILE") ?? "", TEMP: Deno.env.get("TEMP") ?? "" };
  const child = new Deno.Command(denoExe, { args: ["run", "--no-config", "--no-lock", "--cached-only", "--no-prompt", "--allow-net=0.0.0.0:8000", "--allow-env", indexTs], env: { ...base, ...env }, clearEnv: true, stdout: "piped", stderr: "piped" }).spawn();
  for (let i = 0; i < 100; i++) { try { const r = await fetch("http://127.0.0.1:8000/", { method: "OPTIONS" }); await r.body?.cancel(); return child; } catch { await sleep(100); } }
  child.kill(); throw new Error("SETUP_SERVER_NOT_READY");
}
async function stop(child: Deno.ChildProcess) { try { child.kill("SIGTERM"); } catch { /* already gone */ } const out = await child.output().catch(() => null); return out ? { code: out.code, stderr: new TextDecoder().decode(out.stderr).slice(-600) } : null; }
const req = async (method: string, secret: string | null) => { const headers: Record<string, string> = {}; if (secret !== null) headers["x-retention-resolve-secret"] = secret; const r = await fetch("http://127.0.0.1:8000/", { method, headers }); const text = await r.text(); let body: unknown = text; try { body = JSON.parse(text); } catch { /* text */ } return { status: r.status, body }; };

const a = await serve({});
const aPost = await req("POST", SECRET), aGet = await req("GET", null);
const aStop = await stop(a);
checks.X01_ENTRY_DEFAULT_DISABLED = { pass: aPost.status === 503 && (aPost.body as { status?: string }).status === "unavailable" && aGet.status === 503, observed: { aPost, aGet, child: aStop } };

const b = await serve({ RETENTION_RESOLVE_ENABLED: "true", RETENTION_RESOLVER_DB_URL: "postgres://w:pw@127.0.0.1:5999/x", RETENTION_RESOLVE_SECRET: SECRET });
const bWrong = await req("POST", "z".repeat(40)), bGet = await req("GET", SECRET), bOk = await req("POST", SECRET);
const bStop = await stop(b);
checks.X02_ENTRY_ENABLED_SECRET_THEN_REAL_DRIVER_PRE_COMMIT_FAILURE = {
  pass: bWrong.status === 401 && bGet.status === 405 && bOk.status === 503 && (bOk.body as { status?: string; commitOutcomeUnknown?: boolean }).status === "failed" && (bOk.body as { commitOutcomeUnknown?: boolean }).commitOutcomeUnknown === false,
  observed: { bWrong, bGet, bOk, child: bStop }
};
const all = Object.values(checks).every((c) => c.pass);
console.log("RESULT " + JSON.stringify({ status: all ? "PASS" : "FAIL", passed: Object.values(checks).filter((c) => c.pass).length, total: Object.keys(checks).length, checks }));
Deno.exit(all ? 0 : 1);

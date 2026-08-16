#!/usr/bin/env node
// SR-2E shared/Edge contract equivalence proof.
//
// SR-2D's Edge bytes are frozen and are NOT rewritten to consume the new shared DTO. Instead this
// proves that the additive packages/shared client contract describes exactly the same client-visible
// response shape the frozen Edge module emits. Any future divergence — a renamed field, a widened
// nullability, a leaked identifier, a changed policy version — fails here.
//
// This is a compatibility proof, never a modification of SR-2D.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

export const EDGE_TYPES = "supabase/functions/_shared/social-candidate-api/types.ts";
export const EDGE_POLICY = "supabase/functions/_shared/social-candidate-api/policy.ts";
export const SHARED_TYPES = "packages/shared/src/domain/social-candidate/types.ts";

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const parse = (file) => ts.createSourceFile(file, read(file), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

function typeAlias(source, name) {
  return source.statements.find((node) => ts.isTypeAliasDeclaration(node) && node.name.text === name);
}
function typeLiteral(alias) {
  if (!alias) return null;
  if (ts.isTypeLiteralNode(alias.type)) return alias.type;
  if (
    ts.isTypeReferenceNode(alias.type)
    && alias.type.typeName.getText(alias.getSourceFile()) === "Readonly"
    && alias.type.typeArguments?.length === 1
    && ts.isTypeLiteralNode(alias.type.typeArguments[0])
  ) {
    return alias.type.typeArguments[0];
  }
  return null;
}

// Normalises one type literal to `name:type` pairs so the two declarations are compared structurally
// rather than textually. `typeof CONST` is reduced to the literal policy version both sides pin.
function members(alias) {
  const literal = typeLiteral(alias);
  if (!literal) return null;
  return literal.members
    .filter(ts.isPropertySignature)
    .map((member) => {
      const name = member.name.getText(alias.getSourceFile()).replaceAll('"', "");
      const declared = member.type ? member.type.getText(alias.getSourceFile()) : "unknown";
      const normalized = declared
        .replace(/\s+/g, " ")
        .replace(/typeof SOCIAL_CANDIDATE_API_POLICY_VERSION/g, '"social-candidate-api-v1"')
        .trim();
      return `${name}${member.questionToken ? "?" : ""}:${normalized}`;
    })
    .sort();
}

export function proveContractEquivalence() {
  const edge = parse(EDGE_TYPES);
  const shared = parse(SHARED_TYPES);

  const edgeCandidate = members(typeAlias(edge, "SocialCandidateDto"));
  const sharedCandidate = members(typeAlias(shared, "SocialCandidateDto"));
  const edgeResponse = members(typeAlias(edge, "SocialCandidateApiResponse"));
  const sharedResponse = members(typeAlias(shared, "SocialCandidateApiResponse"));

  const edgePolicy = /SOCIAL_CANDIDATE_API_POLICY_VERSION = "([^"]+)" as const/.exec(read(EDGE_POLICY))?.[1] ?? null;
  const sharedPolicy = /SOCIAL_CANDIDATE_API_POLICY_VERSION = "([^"]+)" as const/.exec(read(SHARED_TYPES))?.[1] ?? null;

  const edgeAllowList = /SOCIAL_CANDIDATE_API_PUBLIC_FIELDS = Object\.freeze\(\[([\s\S]*?)\] as const\)/
    .exec(read(EDGE_POLICY))?.[1];
  const sharedAllowList = /SOCIAL_CANDIDATE_FIELDS = Object\.freeze\(\[([\s\S]*?)\] as const\)/
    .exec(read(SHARED_TYPES))?.[1];
  const fieldsOf = (block) => (block ? [...block.matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]).sort() : null);

  return Object.freeze({
    candidateMembersEdge: edgeCandidate,
    candidateMembersShared: sharedCandidate,
    candidateEquivalent: Boolean(edgeCandidate) && JSON.stringify(edgeCandidate) === JSON.stringify(sharedCandidate),
    responseMembersEdge: edgeResponse,
    responseMembersShared: sharedResponse,
    responseEquivalent: Boolean(edgeResponse) && JSON.stringify(edgeResponse) === JSON.stringify(sharedResponse),
    policyVersionEdge: edgePolicy,
    policyVersionShared: sharedPolicy,
    policyVersionEquivalent: Boolean(edgePolicy) && edgePolicy === sharedPolicy,
    allowListEdge: fieldsOf(edgeAllowList),
    allowListShared: fieldsOf(sharedAllowList),
    allowListEquivalent: Boolean(fieldsOf(edgeAllowList))
      && JSON.stringify(fieldsOf(edgeAllowList)) === JSON.stringify(fieldsOf(sharedAllowList))
  });
}

if (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const proof = proveContractEquivalence();
  const passed = proof.candidateEquivalent && proof.responseEquivalent
    && proof.policyVersionEquivalent && proof.allowListEquivalent;
  console.log(JSON.stringify({
    suite: "social-candidate-sr2e-contract-equivalence",
    status: passed ? "passed" : "failed",
    ...proof
  }, null, 2));
  process.exit(passed ? 0 : 1);
}

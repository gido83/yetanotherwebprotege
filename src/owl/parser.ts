import type { OWLDoc, OWLClass, OWLObjectProperty, OWLDatatypeProperty, OWLIndividual, OWLAssertion } from "../workspace/WorkspaceStore";

// ─── Namespace helpers ────────────────────────────────────────────────────────

const NS = {
  rdf:  "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl:  "http://www.w3.org/2002/07/owl#",
  xsd:  "http://www.w3.org/2001/XMLSchema#",
};

function localName(iri: string): string {
  const hash = iri.lastIndexOf("#");
  const slash = iri.lastIndexOf("/");
  const pos = Math.max(hash, slash);
  return pos >= 0 ? iri.slice(pos + 1) : iri;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── XML/RDF OWL parser ───────────────────────────────────────────────────────

function getAttr(el: Element, ns: string, local: string): string | null {
  return el.getAttributeNS(ns, local) ?? el.getAttribute(local) ?? null;
}

function getLabel(el: Element): string | null {
  const labelEls = el.getElementsByTagNameNS(NS.rdfs, "label");
  if (labelEls.length > 0 && labelEls[0].textContent) return labelEls[0].textContent.trim();
  return null;
}

function getComment(el: Element): string | null {
  const commentEls = el.getElementsByTagNameNS(NS.rdfs, "comment");
  if (commentEls.length > 0 && commentEls[0].textContent) return commentEls[0].textContent.trim();
  return null;
}

function getResourceAttr(el: Element): string | null {
  return getAttr(el, NS.rdf, "about") ?? getAttr(el, NS.rdf, "ID") ?? null;
}

function getSubClassOf(el: Element): string | null {
  const sub = el.getElementsByTagNameNS(NS.rdfs, "subClassOf");
  if (sub.length > 0) {
    return getAttr(sub[0], NS.rdf, "resource");
  }
  return null;
}

function getDomains(el: Element): string[] {
  const doms = el.getElementsByTagNameNS(NS.rdfs, "domain");
  const result: string[] = [];
  for (let i = 0; i < doms.length; i++) {
    const r = getAttr(doms[i], NS.rdf, "resource");
    if (r) result.push(r);
  }
  return result;
}

function getRanges(el: Element): string[] {
  const rngs = el.getElementsByTagNameNS(NS.rdfs, "range");
  const result: string[] = [];
  for (let i = 0; i < rngs.length; i++) {
    const r = getAttr(rngs[i], NS.rdf, "resource");
    if (r) result.push(r);
  }
  return result;
}

function getTypes(el: Element): string[] {
  const typeEls = el.getElementsByTagNameNS(NS.rdf, "type");
  const iris: string[] = [];
  for (let i = 0; i < typeEls.length; i++) {
    const r = getAttr(typeEls[i], NS.rdf, "resource");
    if (r && !r.startsWith(NS.owl) && !r.startsWith(NS.rdf) && !r.startsWith(NS.rdfs)) {
      iris.push(r);
    }
  }
  return iris;
}

// ─── Turtle / N3 parser ───────────────────────────────────────────────────────

export function parseTurtle(raw: string, filename: string): OWLDoc {
  // ── 1. Collect @prefix / @base declarations ─────────────────────────────────
  const prefixMap: Record<string, string> = {
    rdf:  NS.rdf,
    rdfs: NS.rdfs,
    owl:  NS.owl,
    xsd:  NS.xsd,
  };
  let baseIri = "";

  const prefixRe = /^@prefix\s+(\S*):\s*<([^>]*)>\s*\.?/gim;
  const baseRe   = /^@base\s+<([^>]*)>\s*\.?/gim;

  let m: RegExpExecArray | null;
  while ((m = prefixRe.exec(raw)) !== null) prefixMap[m[1]] = m[2];
  while ((m = baseRe.exec(raw)) !== null)   baseIri = m[1];

  // ── 2. Strip comments and directive lines so they don't confuse the scanner ─
  const stripped = raw
    .replace(/#[^\n]*/g, "")           // # comments
    .replace(/^@prefix[^\n]*/gim, "")  // @prefix lines already captured
    .replace(/^@base[^\n]*/gim, "");   // @base lines already captured

  // ── 3. Helper: resolve a Turtle term to an absolute IRI ─────────────────────
  function resolveIri(term: string): string {
    term = term.trim();
    if (term === "a") return NS.rdf + "type";
    if (term.startsWith("<") && term.endsWith(">")) {
      const inner = term.slice(1, -1);
      return inner.startsWith("http") ? inner : baseIri + inner;
    }
    const colonIdx = term.indexOf(":");
    if (colonIdx >= 0) {
      const prefix = term.slice(0, colonIdx);
      const local  = term.slice(colonIdx + 1);
      const ns     = prefixMap[prefix];
      if (ns != null) return ns + local;
    }
    return baseIri + term;
  }

  // ── 4. Helper: extract a plain string from a literal token ──────────────────
  function stringValue(token: string): string {
    // triple-quoted
    const tripleMatch = token.match(/^"""([\s\S]*?)"""/);
    if (tripleMatch) return tripleMatch[1].trim();
    // single-quoted
    const singleMatch = token.match(/^"((?:[^"\\]|\\.)*)"/);
    if (singleMatch) return singleMatch[1].replace(/\\(.)/g, "$1");
    return "";
  }

  // ── 5. Tokenise the stripped source into Turtle statements ──────────────────
  // We split on '.' that is NOT inside a string literal or IRI.
  // Strategy: walk char by char, collecting statement text.
  const statements: string[] = [];
  let cur = "";
  let inString = false;
  let inIri    = false;
  let tripleQ  = false;

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    const ch2 = stripped.slice(i, i + 3);

    if (!inString && !inIri) {
      if (ch2 === '"""') { inString = true; tripleQ = true; cur += ch2; i += 2; continue; }
      if (ch === '"')   { inString = true; tripleQ = false; cur += ch; continue; }
      if (ch === '<')   { inIri = true;  cur += ch; continue; }
      if (ch === '.') {
        // end of statement — flush if non-empty
        const trimmed = cur.trim();
        if (trimmed) statements.push(trimmed);
        cur = "";
        continue;
      }
    } else if (inString) {
      cur += ch;
      if (tripleQ && ch2 === '"""') { cur += stripped.slice(i + 1, i + 3); i += 2; inString = false; tripleQ = false; }
      else if (!tripleQ && ch === '"' && stripped[i - 1] !== "\\") inString = false;
      continue;
    } else if (inIri) {
      cur += ch;
      if (ch === '>') inIri = false;
      continue;
    }
    cur += ch;
  }
  const last = cur.trim();
  if (last) statements.push(last);

  // ── 6. Parse each statement into (subject, predicate, object) triples ───────
  // A statement looks like:  <subject>  pred1 obj1 ; pred2 obj2 , obj3 .
  // We'll split on ';' for predicate groups, then on first whitespace-run for pred/obj.

  // Helper: tokenise a predicate+object string honoring IRIs and literals
  function tokenisePoList(s: string): string[] {
    const tokens: string[] = [];
    let t = "";
    let si = false; let tq = false; let ii = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      const c3 = s.slice(i, i + 3);
      if (!si && !ii) {
        if (c3 === '"""') { si = true; tq = true; t += c3; i += 2; continue; }
        if (c === '"')    { si = true; tq = false; t += c; continue; }
        if (c === '<')    { ii = true; t += c; continue; }
        if (/\s/.test(c) || c === ',') {
          if (t.trim()) { tokens.push(t.trim()); t = ""; }
          continue;
        }
      } else if (si) {
        t += c;
        if (tq && c3 === '"""')  { t += s.slice(i+1,i+3); i += 2; si = false; tq = false; }
        else if (!tq && c === '"' && s[i-1] !== "\\") si = false;
        continue;
      } else if (ii) {
        t += c; if (c === '>') ii = false; continue;
      }
      t += c;
    }
    if (t.trim()) tokens.push(t.trim());
    return tokens;
  }

  type Triple = { s: string; p: string; o: string };
  const triples: Triple[] = [];

  for (const stmt of statements) {
    // Extract subject: first IRI/prefixed-name token
    const subjMatch = stmt.match(/^(<[^>]*>|\S+)/);
    if (!subjMatch) continue;
    const rawSubject = subjMatch[1];
    const subject = resolveIri(rawSubject);
    const rest = stmt.slice(subjMatch[0].length).trim();

    // Split on ';' separating predicate-object groups
    // (must not be inside a string or IRI — simplified: split naively then re-join broken IRIs)
    const poGroups = rest.split(/\s*;\s*/);

    for (const group of poGroups) {
      const tokens = tokenisePoList(group);
      if (tokens.length < 2) continue;
      const predicate = resolveIri(tokens[0]);
      // Everything after the predicate is objects (comma-separated, already split by tokeniser)
      for (let oi = 1; oi < tokens.length; oi++) {
        triples.push({ s: subject, p: predicate, o: tokens[oi] });
      }
    }
  }

  // ── 7. Group triples by subject ──────────────────────────────────────────────
  type SubjectData = { types: string[]; props: Record<string, string[]> };
  const subjects = new Map<string, SubjectData>();

  function getSubject(iri: string): SubjectData {
    if (!subjects.has(iri)) subjects.set(iri, { types: [], props: {} });
    return subjects.get(iri)!;
  }

  for (const { s, p, o } of triples) {
    const sd = getSubject(s);
    if (p === NS.rdf + "type") {
      sd.types.push(resolveIri(o));
    } else {
      if (!sd.props[p]) sd.props[p] = [];
      sd.props[p].push(o);
    }
  }

  // ── 8. Extract ontology IRI / name ──────────────────────────────────────────
  let ontologyIri = baseIri;
  let ontologyName = "";
  let imports: string[] = [];

  for (const [iri, sd] of subjects) {
    if (sd.types.includes(NS.owl + "Ontology")) {
      ontologyIri = iri;
      const labelVals = sd.props[NS.rdfs + "label"];
      ontologyName = labelVals ? stringValue(labelVals[0]) : localName(iri);
      imports = (sd.props[NS.owl + "imports"] ?? []).map((v) => resolveIri(v));
      break;
    }
  }
  if (!ontologyName) ontologyName = filename.replace(/\.(ttl|n3|turtle)$/i, "");

  // ── 9. Build OWLDoc arrays ────────────────────────────────────────────────────
  const classes: OWLClass[] = [];
  const objectProperties: OWLObjectProperty[] = [];
  const datatypeProperties: OWLDatatypeProperty[] = [];
  const individuals: OWLIndividual[] = [];

  for (const [iri, sd] of subjects) {
    if (iri === ontologyIri) continue;

    const label = sd.props[NS.rdfs + "label"] ? stringValue(sd.props[NS.rdfs + "label"][0]) : localName(iri);
    const description = sd.props[NS.rdfs + "comment"] ? stringValue(sd.props[NS.rdfs + "comment"][0]) : undefined;

    if (sd.types.includes(NS.owl + "Class")) {
      const parentRaw  = sd.props[NS.rdfs + "subClassOf"]?.[0];
      const parentIri  = parentRaw ? resolveIri(parentRaw) : undefined;
      classes.push({ id: uid(), label, iri, parentIri, description });

    } else if (sd.types.includes(NS.owl + "ObjectProperty")) {
      const domainArr = (sd.props[NS.rdfs + "domain"] ?? []).map(v => localName(resolveIri(v)));
      const domain = domainArr.length > 0 ? domainArr : undefined;
      const rangeArr  = (sd.props[NS.rdfs + "range"] ?? []).map(v => localName(resolveIri(v)));
      const range = rangeArr.length > 0 ? rangeArr : undefined;
      const inverseOfRaw = sd.props[NS.owl + "inverseOf"]?.[0];
      const inverseOf = inverseOfRaw ? resolveIri(inverseOfRaw) : undefined;
      const characteristics = sd.types
        .filter(t => t.startsWith(NS.owl) && t !== NS.owl + "ObjectProperty");
      objectProperties.push({ id: uid(), label, iri, domain, range, description, inverseOf,
        characteristics: characteristics.length > 0 ? characteristics : undefined });

    } else if (sd.types.includes(NS.owl + "DatatypeProperty")) {
      const domainArr = (sd.props[NS.rdfs + "domain"] ?? []).map(v => localName(resolveIri(v)));
      const domain = domainArr.length > 0 ? domainArr : undefined;
      const rangeArr  = (sd.props[NS.rdfs + "range"] ?? []).map(v => localName(resolveIri(v)));
      const range = rangeArr.length > 0 ? rangeArr : undefined;
      datatypeProperties.push({ id: uid(), label, iri, domain, range, description });

    } else if (sd.types.includes(NS.owl + "NamedIndividual")) {
      // Collect class-type IRIs (non-OWL/RDF/RDFS)
      const typeIris = sd.types.filter(
        (t) => !t.startsWith(NS.owl) && !t.startsWith(NS.rdf) && !t.startsWith(NS.rdfs)
      );
      // Collect property assertions: props that are not builtins
      const builtinProps = new Set([
        NS.rdfs + "label", NS.rdfs + "comment", NS.rdfs + "subClassOf",
        NS.rdfs + "domain", NS.rdfs + "range",
      ]);
      const objectPropertyIriSet = new Set(objectProperties.map((p) => p.iri));
      const dataAssertions: OWLAssertion[] = [];
      const objectAssertions: OWLAssertion[] = [];
      for (const [prop, vals] of Object.entries(sd.props)) {
        if (builtinProps.has(prop)) continue;
        for (const rawVal of vals) {
          const trimmed = rawVal.trim();
          if (trimmed.startsWith("<") || trimmed.includes(":")) {
            // Likely an IRI → object assertion
            objectAssertions.push({ property: localName(prop), value: localName(resolveIri(trimmed)) });
          } else {
            dataAssertions.push({ property: localName(prop), value: stringValue(trimmed) || trimmed });
          }
        }
      }
      individuals.push({ id: uid(), label, iri, types: typeIris.map(localName), description, dataAssertions, objectAssertions });
    }
  }

  return { iri: ontologyIri, name: ontologyName, classes, objectProperties, datatypeProperties, individuals, imports };
}

// ─── XML/RDF OWL parser ───────────────────────────────────────────────────────

export function parseOWL(raw: string, filename: string): OWLDoc {
  // Detect Turtle/N3 by filename extension or content heuristic
  const isTurtle =
    /\.(ttl|n3|turtle)$/i.test(filename) ||
    /^(\s*(#[^\n]*\n\s*)*@(?:prefix|base)\s)/i.test(raw);
  if (isTurtle) return parseTurtle(raw, filename);

  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, "application/xml");

  const parserErr = doc.querySelector("parsererror");
  if (parserErr) {
    return {
      iri: "",
      name: filename,
      classes: [],
      objectProperties: [],
      datatypeProperties: [],
      individuals: [],
    };
  }

  // Ontology IRI
  const ontologyEls = doc.getElementsByTagNameNS(NS.owl, "Ontology");
  const ontologyIri =
    ontologyEls.length > 0
      ? getAttr(ontologyEls[0], NS.rdf, "about") ?? ""
      : "";
  const ontologyLabel =
    ontologyEls.length > 0
      ? (getLabel(ontologyEls[0]) ?? (localName(ontologyIri) || filename))
      : filename;
  const imports: string[] = [];
  if (ontologyEls.length > 0) {
    const importEls = ontologyEls[0].getElementsByTagNameNS(NS.owl, "imports");
    for (let i = 0; i < importEls.length; i++) {
      const r = getAttr(importEls[i], NS.rdf, "resource");
      if (r) imports.push(r);
    }
  }

  // Classes
  const classes: OWLClass[] = [];
  const classEls = doc.getElementsByTagNameNS(NS.owl, "Class");
  for (let i = 0; i < classEls.length; i++) {
    const el = classEls[i];
    const iri = getResourceAttr(el);
    if (!iri) continue;
    const label = getLabel(el) ?? localName(iri);
    const parentIri = getSubClassOf(el) ?? undefined;
    const description = getComment(el) ?? undefined;
    classes.push({ id: uid(), label, iri, parentIri, description });
  }

  // Object properties
  const objectProperties: OWLObjectProperty[] = [];
  const objPropEls = doc.getElementsByTagNameNS(NS.owl, "ObjectProperty");
  for (let i = 0; i < objPropEls.length; i++) {
    const el = objPropEls[i];
    const iri = getResourceAttr(el);
    if (!iri) continue;
    const label = getLabel(el) ?? localName(iri);
    const domainIris = getDomains(el).map(localName);
    const domain = domainIris.length > 0 ? domainIris : undefined;
    const rangeIris = getRanges(el).map(localName);
    const range = rangeIris.length > 0 ? rangeIris : undefined;
    const description = getComment(el) ?? undefined;
    // inverseOf
    const invOfEls = el.getElementsByTagNameNS(NS.owl, "inverseOf");
    const inverseOf = invOfEls.length > 0 ? (getAttr(invOfEls[0], NS.rdf, "resource") ?? undefined) : undefined;
    // characteristics (owl:* rdf:type declarations)
    const typeEls = el.getElementsByTagNameNS(NS.rdf, "type");
    const characteristics: string[] = [];
    for (let j = 0; j < typeEls.length; j++) {
      const r = getAttr(typeEls[j], NS.rdf, "resource");
      if (r && r.startsWith(NS.owl)) characteristics.push(r);
    }
    objectProperties.push({ id: uid(), label, iri, domain, range, description, inverseOf,
      characteristics: characteristics.length > 0 ? characteristics : undefined });
  }

  // Datatype properties
  const datatypeProperties: OWLDatatypeProperty[] = [];
  const dtPropEls = doc.getElementsByTagNameNS(NS.owl, "DatatypeProperty");
  for (let i = 0; i < dtPropEls.length; i++) {
    const el = dtPropEls[i];
    const iri = getResourceAttr(el);
    if (!iri) continue;
    const label = getLabel(el) ?? localName(iri);
    const domainIris = getDomains(el).map(localName);
    const domain = domainIris.length > 0 ? domainIris : undefined;
    const rangeIris = getRanges(el).map(localName);
    const range = rangeIris.length > 0 ? rangeIris : undefined;
    const description = getComment(el) ?? undefined;
    datatypeProperties.push({ id: uid(), label, iri, domain, range, description });
  }

  // Build sets of known property IRIs for assertion classification
  const objectPropertyIris = new Set(objectProperties.map((p) => p.iri));
  const datatypePropertyIris = new Set(datatypeProperties.map((p) => p.iri));

  // Named individuals
  const individuals: OWLIndividual[] = [];
  const indEls = doc.getElementsByTagNameNS(NS.owl, "NamedIndividual");
  for (let i = 0; i < indEls.length; i++) {
    const el = indEls[i];
    const iri = getResourceAttr(el);
    if (!iri) continue;
    const label = getLabel(el) ?? localName(iri);
    const typeIris = getTypes(el);
    const types = typeIris.map(localName);
    const description = getComment(el) ?? undefined;

    // Extract property assertions: child elements that are not rdf/rdfs/owl builtins
    const dataAssertions: OWLAssertion[] = [];
    const objectAssertions: OWLAssertion[] = [];
    for (let j = 0; j < el.children.length; j++) {
      const child = el.children[j];
      const ns = child.namespaceURI ?? "";
      if (ns === NS.owl || ns === NS.rdf || ns === NS.rdfs) continue;
      // Reconstruct the property IRI from namespace + local name
      const propIri = ns + child.localName;
      const resource = getAttr(child, NS.rdf, "resource");
      const text = child.textContent?.trim() ?? "";
      if (resource) {
        // Object assertion: rdf:resource attribute points to another individual
        objectAssertions.push({ property: child.localName, value: localName(resource) });
      } else if (text) {
        // Data assertion: literal value
        const propLabel = objectPropertyIris.has(propIri)
          ? child.localName
          : datatypePropertyIris.has(propIri)
          ? child.localName
          : child.localName;
        if (objectPropertyIris.has(propIri)) {
          objectAssertions.push({ property: propLabel, value: text });
        } else {
          dataAssertions.push({ property: child.localName, value: text });
        }
      }
    }

    individuals.push({ id: uid(), label, iri, types, description, dataAssertions, objectAssertions });
  }

  return {
    iri: ontologyIri,
    name: ontologyLabel,
    classes,
    objectProperties,
    datatypeProperties,
    individuals,
    imports,
  };
}

// ─── Convert App Entity[] → OWLDoc ───────────────────────────────────────────

export function reverseEntitiesToOWLDoc(entities: AppEntity[], base: OWLDoc): OWLDoc {
  const baseIri = base.iri || `http://www.example.org/${encodeURIComponent(base.name)}`;
  const ns = baseIri.endsWith("/") || baseIri.endsWith("#") ? baseIri : `${baseIri}#`;

  function toIri(entity: AppEntity): string {
    // Entities loaded from file always have iriLocalName set (the original IRI local name).
    // Use it to preserve the canonical IRI regardless of label edits.
    if (entity.iriLocalName) {
      return `${ns}${entity.iriLocalName}`;
    }
    // Newly created entities: derive IRI from the current label.
    // Replace spaces with underscores to avoid %20 noise; strip other non-IRI chars.
    const safeLocal = entity.label.trim().replace(/\s+/g, "_").replace(/[^\w\-.]/g, "") || "entity";
    return `${ns}${safeLocal}`;
  }

  // Build entity-id → IRI map for resolving parentId / domain / range
  const idToIri: Record<string, string> = {};
  for (const e of entities) idToIri[e.id] = toIri(e);

  const classes: OWLClass[] = entities
    .filter((e) => e.kind === "class")
    .map((e) => ({
      id: e.id,
      label: e.label,
      iri: idToIri[e.id],
      parentIri: e.parentId ? idToIri[e.parentId] : (e.unresolvedParentIri ?? undefined),
      description: e.description,
    }));

  // Build label → IRI map for object properties (used to resolve inverseOf)
  const opLabelToIri: Record<string, string> = {};
  for (const e of entities) {
    if (e.kind === "objectProperty") opLabelToIri[e.label] = toIri(e);
  }

  const objectProperties: OWLObjectProperty[] = entities
    .filter((e) => e.kind === "objectProperty")
    .map((e) => {
      // inverseOf may be stored as a label string — resolve to full IRI
      const inverseOfIri = e.inverseOf
        ? (e.inverseOf.startsWith("http") ? e.inverseOf : (opLabelToIri[e.inverseOf] ?? `${ns}${e.inverseOf}`))
        : undefined;
      return {
        id: e.id,
        label: e.label,
        iri: idToIri[e.id],
        domain: e.domain,
        range: e.range,
        description: e.description,
        inverseOf: inverseOfIri,
        characteristics: e.characteristics,
      };
    });

  const datatypeProperties: OWLDatatypeProperty[] = entities
    .filter((e) => e.kind === "datatypeProperty")
    .map((e) => ({
      id: e.id,
      label: e.label,
      iri: idToIri[e.id],
      domain: e.domain,
      range: e.range,
      description: e.description,
    }));

  const individuals: OWLIndividual[] = entities
    .filter((e) => e.kind === "individual")
    .map((e) => ({
      id: e.id,
      label: e.label,
      iri: idToIri[e.id],
      types: e.types ?? [],
      description: e.description,
      dataAssertions: e.dataAssertions ?? [],
      objectAssertions: e.objectAssertions ?? [],
    }));

  return { iri: base.iri, name: base.name, classes, objectProperties, datatypeProperties, individuals, imports: base.imports };
}

// ─── Convert OWLDoc → App Entity[] ───────────────────────────────────────────
// Bridges the parsed OWL structure to the Entity type used by the existing editor.

export type AppEntity = {
  id: string;
  label: string;
  kind: "class" | "objectProperty" | "datatypeProperty" | "annotation" | "individual" | "builtinDatatype";
  description?: string;
  parentId?: string;
  superClassIds?: string[];
  domain?: string[];
  range?: string[];
  types?: string[];
  subjectId?: string;
  annotations?: string[];
  equivalentClassIds?: string[];
  disjointWithClassIds?: string[];
  disjointUnionClassIds?: string[];
  characteristics?: string[];
  inverseOf?: string;
  propertyAssertions?: { property: string; value: string }[];
  iriLocalName?: string;
  dataAssertions?: { property: string; value: string }[];
  objectAssertions?: { property: string; value: string }[];
  readOnly?: boolean;
  importedFrom?: string;
  iri?: string;
  // Set when a class's rdfs:subClassOf points to an IRI not found within the same
  // document (e.g. a superclass defined in an imported ontology). Preserved so the
  // relationship survives re-export even when the parent can't be resolved to a
  // local entity id. See main.tsx's cross-ontology parent resolution for display.
  unresolvedParentIri?: string;
};

export function owlDocToEntities(doc: OWLDoc): AppEntity[] {
  const entities: AppEntity[] = [];

  // Build IRI → id map for classes so we can resolve parentId
  const iriToId: Record<string, string> = {};
  for (const cls of doc.classes) {
    iriToId[cls.iri] = cls.id;
  }

  for (const cls of doc.classes) {
    const parentId = cls.parentIri ? iriToId[cls.parentIri] : undefined;
    entities.push({
      id: cls.id,
      label: cls.label,
      iri: cls.iri,
      iriLocalName: localName(cls.iri),
      kind: "class",
      description: cls.description,
      parentId,
      unresolvedParentIri: cls.parentIri && !parentId ? cls.parentIri : undefined,
    });
  }

  for (const op of doc.objectProperties) {
    entities.push({
      id: op.id,
      label: op.label,
      iriLocalName: localName(op.iri),
      kind: "objectProperty",
      description: op.description,
      domain: op.domain,
      range: op.range,
      inverseOf: op.inverseOf,
      characteristics: op.characteristics,
    });
  }

  for (const dp of doc.datatypeProperties) {
    entities.push({
      id: dp.id,
      label: dp.label,
      iriLocalName: localName(dp.iri),
      kind: "datatypeProperty",
      description: dp.description,
      domain: dp.domain,
      range: dp.range,
    });
  }

  for (const ind of doc.individuals) {
    entities.push({
      id: ind.id,
      label: ind.label,
      iriLocalName: localName(ind.iri),
      kind: "individual",
      description: ind.description,
      types: ind.types,
      dataAssertions: ind.dataAssertions ?? [],
      objectAssertions: ind.objectAssertions ?? [],
    });
  }

  return entities;
}

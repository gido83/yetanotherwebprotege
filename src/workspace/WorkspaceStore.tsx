import React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OWLClass = {
  id: string;
  label: string;
  iri: string;
  parentIri?: string;
  description?: string;
};

export type OWLObjectProperty = {
  id: string;
  label: string;
  iri: string;
  domain?: string[];
  range?: string[];
  description?: string;
  inverseOf?: string;        // full IRI of the inverse property
  characteristics?: string[]; // full IRIs e.g. owl:InverseFunctionalProperty
};

export type OWLDatatypeProperty = {
  id: string;
  label: string;
  iri: string;
  domain?: string[];
  range?: string[];
  description?: string;
};

export type OWLAssertion = { property: string; value: string };

export type OWLIndividual = {
  id: string;
  label: string;
  iri: string;
  types: string[];
  description?: string;
  dataAssertions?: OWLAssertion[];
  objectAssertions?: OWLAssertion[];
};

export type OWLDoc = {
  iri: string;
  name: string;
  classes: OWLClass[];
  objectProperties: OWLObjectProperty[];
  datatypeProperties: OWLDatatypeProperty[];
  individuals: OWLIndividual[];
  imports?: string[]; // IRIs of owl:imports declarations (modular ontologies)
};

export type WorkspaceFolder = {
  id: string;
  type: "folder";
  name: string;
  children: WorkspaceNode[];
  expanded: boolean;
};

export type WorkspaceOntology = {
  id: string;
  type: "ontology";
  name: string;
  raw: string;
  parsed: OWLDoc | null;
};

export type WorkspaceNode = WorkspaceFolder | WorkspaceOntology;

export type WorkspaceState = {
  tree: WorkspaceNode[];
  activeOntologyId: string | null;
};

// ─── Actions ─────────────────────────────────────────────────────────────────

type Action =
  | { type: "ADD_FOLDER"; parentId: string | null; name: string }
  | { type: "ADD_ONTOLOGY"; parentId: string | null; name: string; raw: string; parsed: OWLDoc | null }
  | { type: "UPDATE_ONTOLOGY"; id: string; parsed: OWLDoc }
  | { type: "SET_IMPORTS"; id: string; imports: string[] }
  | { type: "RENAME_NODE"; id: string; name: string }
  | { type: "DELETE_NODE"; id: string }
  | { type: "TOGGLE_FOLDER"; id: string }
  | { type: "SET_ACTIVE"; id: string | null }
  | { type: "MOVE_NODE"; id: string; targetFolderId: string | null };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function mapTree(
  nodes: WorkspaceNode[],
  fn: (node: WorkspaceNode) => WorkspaceNode | null
): WorkspaceNode[] {
  const result: WorkspaceNode[] = [];
  for (const node of nodes) {
    const mapped = fn(node);
    if (!mapped) continue;
    if (mapped.type === "folder") {
      result.push({ ...mapped, children: mapTree(mapped.children, fn) });
    } else {
      result.push(mapped);
    }
  }
  return result;
}

function removeNode(nodes: WorkspaceNode[], id: string): WorkspaceNode[] {
  return mapTree(nodes, (node) => (node.id === id ? null : node));
}

export function flattenOntologies(nodes: WorkspaceNode[]): WorkspaceOntology[] {
  const result: WorkspaceOntology[] = [];
  for (const node of nodes) {
    if (node.type === "ontology") result.push(node);
    else result.push(...flattenOntologies(node.children));
  }
  return result;
}

function findNode(nodes: WorkspaceNode[], id: string): WorkspaceNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.type === "folder") {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function insertIntoFolder(
  nodes: WorkspaceNode[],
  folderId: string,
  child: WorkspaceNode
): WorkspaceNode[] {
  return nodes.map((node) => {
    if (node.id === folderId && node.type === "folder") {
      return { ...node, children: [...node.children, child] };
    }
    if (node.type === "folder") {
      return { ...node, children: insertIntoFolder(node.children, folderId, child) };
    }
    return node;
  });
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case "ADD_FOLDER": {
      const node: WorkspaceFolder = {
        id: uid(),
        type: "folder",
        name: action.name,
        children: [],
        expanded: true,
      };
      if (action.parentId === null) {
        return { ...state, tree: [...state.tree, node] };
      }
      return { ...state, tree: insertIntoFolder(state.tree, action.parentId, node) };
    }
    case "ADD_ONTOLOGY": {
      const node: WorkspaceOntology = {
        id: uid(),
        type: "ontology",
        name: action.name,
        raw: action.raw,
        parsed: action.parsed,
      };
      if (action.parentId === null) {
        return { ...state, tree: [...state.tree, node] };
      }
      return { ...state, tree: insertIntoFolder(state.tree, action.parentId, node) };
    }
    case "UPDATE_ONTOLOGY": {
      return {
        ...state,
        tree: mapTree(state.tree, (node) =>
          node.id === action.id && node.type === "ontology"
            ? { ...node, parsed: action.parsed }
            : node
        ),
      };
    }
    case "SET_IMPORTS": {
      return {
        ...state,
        tree: mapTree(state.tree, (node) =>
          node.id === action.id && node.type === "ontology" && node.parsed
            ? { ...node, parsed: { ...node.parsed, imports: action.imports } }
            : node
        ),
      };
    }
    case "RENAME_NODE": {
      return {
        ...state,
        tree: mapTree(state.tree, (node) =>
          node.id === action.id ? { ...node, name: action.name } : node
        ),
      };
    }
    case "DELETE_NODE": {
      return {
        ...state,
        tree: removeNode(state.tree, action.id),
        activeOntologyId:
          state.activeOntologyId === action.id ? null : state.activeOntologyId,
      };
    }
    case "TOGGLE_FOLDER": {
      return {
        ...state,
        tree: mapTree(state.tree, (node) =>
          node.id === action.id && node.type === "folder"
            ? { ...node, expanded: !node.expanded }
            : node
        ),
      };
    }
    case "SET_ACTIVE": {
      return { ...state, activeOntologyId: action.id };
    }
    case "MOVE_NODE": {
      const node = findNode(state.tree, action.id);
      if (!node) return state;
      const without = removeNode(state.tree, action.id);
      if (action.targetFolderId === null) {
        return { ...state, tree: [...without, node] };
      }
      return { ...state, tree: insertIntoFolder(without, action.targetFolderId, node) };
    }
    default:
      return state;
  }
}

// ─── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "yawp_workspace_v1";

function loadState(): WorkspaceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as WorkspaceState;
  } catch {
    // ignore
  }
  return { tree: [], activeOntologyId: null };
}

function saveState(state: WorkspaceState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

type WorkspaceContextValue = {
  state: WorkspaceState;
  dispatch: React.Dispatch<Action>;
  activeOntology: WorkspaceOntology | null;
};

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(reducer, undefined, loadState);

  React.useEffect(() => {
    saveState(state);
  }, [state]);

  const activeOntology = React.useMemo(() => {
    if (!state.activeOntologyId) return null;
    const node = findNode(state.tree, state.activeOntologyId);
    return node?.type === "ontology" ? node : null;
  }, [state.activeOntologyId, state.tree]);

  return (
    <WorkspaceContext.Provider value={{ state, dispatch, activeOntology }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

// ─── OWL/RDF XML serialiser ───────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CHARACTERISTIC_LABEL_TO_IRI: Record<string, string> = {
  "Functional":           "http://www.w3.org/2002/07/owl#FunctionalProperty",
  "Inverse functional":   "http://www.w3.org/2002/07/owl#InverseFunctionalProperty",
  "Transitive":           "http://www.w3.org/2002/07/owl#TransitiveProperty",
  "Symmetric":            "http://www.w3.org/2002/07/owl#SymmetricProperty",
  "Asymmetric":           "http://www.w3.org/2002/07/owl#AsymmetricProperty",
  "Reflexive":            "http://www.w3.org/2002/07/owl#ReflexiveProperty",
  "Irreflexive":          "http://www.w3.org/2002/07/owl#IrreflexiveProperty",
};

function characteristicIri(c: string): string {
  // Already a full IRI (loaded from file)
  if (c.startsWith("http")) return c;
  return CHARACTERISTIC_LABEL_TO_IRI[c] ?? c;
}

export function exportOWL(doc: OWLDoc): string {
  const base = doc.iri || `http://www.example.org/${encodeURIComponent(doc.name)}`;
  // Entity namespace: ends with "#" → use as-is; otherwise append "#"
  const ns = base.endsWith("#") || base.endsWith("/") ? base : `${base}#`;
  // Default namespace / xml:base use the "/" form (Protégé convention)
  const baseSlash = base.endsWith("/") ? base
    : base.endsWith("#") ? `${base.slice(0, -1)}/`
    : `${base}/`;
  // Short namespace prefix: last path-segment of base (minus any trailing # or /)
  const lastSlash = base.lastIndexOf("/");
  const shortName = base.slice(lastSlash + 1).replace(/[/#]$/, "") || "ont";

  // ── helpers ──────────────────────────────────────────────────────────────────

  const XSD_TYPES = new Set([
    "string","integer","int","long","float","double","boolean","decimal",
    "dateTime","date","anyURI","byte","short","nonNegativeInteger",
    "positiveInteger","unsignedInt","negativeInteger","duration","hexBinary","base64Binary",
  ]);

  /** Expand a local-name or full IRI to an absolute IRI. */
  function expandIri(localOrFull: string): string {
    if (!localOrFull) return localOrFull;
    if (localOrFull.startsWith("http")) return localOrFull;
    if (XSD_TYPES.has(localOrFull)) return `http://www.w3.org/2001/XMLSchema#${localOrFull}`;
    return `${ns}${localOrFull}`;
  }

  /** Local-name of a full IRI. */
  function localN(iri: string): string {
    const h = iri.lastIndexOf("#"); const s = iri.lastIndexOf("/");
    const p = Math.max(h, s); return p >= 0 ? iri.slice(p + 1) : iri;
  }

  /** Whether to emit an explicit rdfs:label (only when label ≠ IRI local-name). */
  function needsLabel(label: string, iri: string): boolean {
    return label !== localN(iri);
  }

  // Build datatype-range map for assertions: propLocalName → XSD IRI
  const dtRangeMap = new Map<string, string>();
  for (const dp of doc.datatypeProperties) {
    if (dp.range?.[0]) dtRangeMap.set(localN(dp.iri), expandIri(dp.range[0]));
  }

  const lines: string[] = [];

  // ── Header ───────────────────────────────────────────────────────────────────
  lines.push(`<?xml version="1.0"?>`);
  lines.push(`<rdf:RDF xmlns="${xmlEscape(baseSlash)}"`);
  lines.push(`     xml:base="${xmlEscape(baseSlash)}"`);
  lines.push(`     xmlns:owl="http://www.w3.org/2002/07/owl#"`);
  lines.push(`     xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"`);
  lines.push(`     xmlns:xml="http://www.w3.org/XML/1998/namespace"`);
  lines.push(`     xmlns:xsd="http://www.w3.org/2001/XMLSchema#"`);
  lines.push(`     xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"`);
  lines.push(`     xmlns:${xmlEscape(shortName)}="${xmlEscape(ns)}">`);

  // Ontology declaration (with owl:imports for modular ontologies, if any)
  if (doc.imports && doc.imports.length > 0) {
    lines.push(`    <owl:Ontology rdf:about="${xmlEscape(base)}">`);
    for (const imp of doc.imports) {
      lines.push(`        <owl:imports rdf:resource="${xmlEscape(imp)}"/>`);
    }
    lines.push(`    </owl:Ontology>`);
  } else {
    lines.push(`    <owl:Ontology rdf:about="${xmlEscape(base)}"/>`);
  }
  lines.push(``);

  // ── Section comment helper ───────────────────────────────────────────────────
  function sectionComment(title: string) {
    lines.push(``);
    lines.push(`    <!-- `);
    lines.push(`    ///////////////////////////////////////////////////////////////////////////////////////`);
    lines.push(`    //`);
    lines.push(`    // ${title}`);
    lines.push(`    //`);
    lines.push(`    ///////////////////////////////////////////////////////////////////////////////////////`);
    lines.push(`     -->`);
    lines.push(``);
    lines.push(``);
  }

  // ── Object Properties ────────────────────────────────────────────────────────
  if (doc.objectProperties.length > 0) {
    sectionComment("Object Properties");
    for (const op of doc.objectProperties) {
      lines.push(`    <!-- ${xmlEscape(op.iri)} -->`);
      lines.push(``);
      const children: string[] = [];
      if (op.inverseOf) {
        children.push(`<owl:inverseOf rdf:resource="${xmlEscape(op.inverseOf)}"/>`);
      }
      for (const c of op.characteristics ?? []) {
        children.push(`<rdf:type rdf:resource="${xmlEscape(characteristicIri(c))}"/>`);
      }
      for (const d of op.domain ?? []) children.push(`<rdfs:domain rdf:resource="${xmlEscape(expandIri(d))}"/>`);
      for (const r of op.range ?? [])  children.push(`<rdfs:range rdf:resource="${xmlEscape(expandIri(r))}"/>`);
      if (op.description) children.push(`<rdfs:comment xml:lang="en">${xmlEscape(op.description)}</rdfs:comment>`);
      if (needsLabel(op.label, op.iri)) children.push(`<rdfs:label xml:lang="en">${xmlEscape(op.label)}</rdfs:label>`);
      if (children.length === 0) {
        lines.push(`    <owl:ObjectProperty rdf:about="${xmlEscape(op.iri)}"/>`);
      } else {
        lines.push(`    <owl:ObjectProperty rdf:about="${xmlEscape(op.iri)}">`);
        for (const c of children) lines.push(`        ${c}`);
        lines.push(`    </owl:ObjectProperty>`);
      }
      lines.push(``);
    }
  }

  // ── Datatype Properties ──────────────────────────────────────────────────────
  if (doc.datatypeProperties.length > 0) {
    sectionComment("Data properties");
    for (const dp of doc.datatypeProperties) {
      lines.push(`    <!-- ${xmlEscape(dp.iri)} -->`);
      lines.push(``);
      const children: string[] = [];
      for (const d of dp.domain ?? []) children.push(`<rdfs:domain rdf:resource="${xmlEscape(expandIri(d))}"/>`);
      for (const r of dp.range ?? [])  children.push(`<rdfs:range rdf:resource="${xmlEscape(expandIri(r))}"/>`);
      if (dp.description) children.push(`<rdfs:comment xml:lang="en">${xmlEscape(dp.description)}</rdfs:comment>`);
      if (needsLabel(dp.label, dp.iri)) children.push(`<rdfs:label xml:lang="en">${xmlEscape(dp.label)}</rdfs:label>`);
      if (children.length === 0) {
        lines.push(`    <owl:DatatypeProperty rdf:about="${xmlEscape(dp.iri)}"/>`);
      } else {
        lines.push(`    <owl:DatatypeProperty rdf:about="${xmlEscape(dp.iri)}">`);
        for (const c of children) lines.push(`        ${c}`);
        lines.push(`    </owl:DatatypeProperty>`);
      }
      lines.push(``);
    }
  }

  // ── Classes ──────────────────────────────────────────────────────────────────
  if (doc.classes.length > 0) {
    sectionComment("Classes");
    for (const cls of doc.classes) {
      lines.push(`    <!-- ${xmlEscape(cls.iri)} -->`);
      lines.push(``);
      const children: string[] = [];
      if (cls.parentIri) children.push(`<rdfs:subClassOf rdf:resource="${xmlEscape(cls.parentIri)}"/>`);
      if (cls.description) children.push(`<rdfs:comment xml:lang="en">${xmlEscape(cls.description)}</rdfs:comment>`);
      if (needsLabel(cls.label, cls.iri)) children.push(`<rdfs:label xml:lang="en">${xmlEscape(cls.label)}</rdfs:label>`);
      if (children.length === 0) {
        lines.push(`    <owl:Class rdf:about="${xmlEscape(cls.iri)}"/>`);
      } else {
        lines.push(`    <owl:Class rdf:about="${xmlEscape(cls.iri)}">`);
        for (const c of children) lines.push(`        ${c}`);
        lines.push(`    </owl:Class>`);
      }
      lines.push(``);
    }
  }

  // ── Individuals ──────────────────────────────────────────────────────────────
  if (doc.individuals.length > 0) {
    sectionComment("Individuals");
    for (const ind of doc.individuals) {
      lines.push(`    <!-- ${xmlEscape(ind.iri)} -->`);
      lines.push(``);
      lines.push(`    <owl:NamedIndividual rdf:about="${xmlEscape(ind.iri)}">`);
      for (const typeName of ind.types) {
        lines.push(`        <rdf:type rdf:resource="${xmlEscape(expandIri(typeName))}"/>`);
      }
      for (const da of ind.dataAssertions ?? []) {
        const rangeIri = dtRangeMap.get(da.property);
        const dtAttr = rangeIri ? ` rdf:datatype="${xmlEscape(rangeIri)}"` : "";
        lines.push(`        <${shortName}:${da.property}${dtAttr}>${xmlEscape(da.value)}</${shortName}:${da.property}>`);
      }
      for (const oa of ind.objectAssertions ?? []) {
        lines.push(`        <${shortName}:${oa.property} rdf:resource="${xmlEscape(expandIri(oa.value))}"/>`);
      }
      if (ind.description) {
        lines.push(`        <rdfs:comment xml:lang="en">${xmlEscape(ind.description)}</rdfs:comment>`);
      }
      if (needsLabel(ind.label, ind.iri)) {
        lines.push(`        <rdfs:label xml:lang="en">${xmlEscape(ind.label)}</rdfs:label>`);
      }
      lines.push(`    </owl:NamedIndividual>`);
      lines.push(``);
    }
  }

  lines.push(`</rdf:RDF>`);
  return lines.join("\n");
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = React.useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

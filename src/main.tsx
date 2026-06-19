import React from "react";
import ReactDOM from "react-dom/client";
import { WorkspaceProvider, useWorkspace, exportOWL, flattenOntologies, type WorkspaceOntology } from "./workspace/WorkspaceStore";
import { WorkspacePanel } from "./workspace/WorkspacePanel";
import { owlDocToEntities, reverseEntitiesToOWLDoc } from "./owl/parser";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node as FlowNode,
  type NodeChange,
  type NodeProps,
  type NodeTypes
} from "@xyflow/react";
import "bootstrap/dist/css/bootstrap.min.css";
import "@xyflow/react/dist/style.css";
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Clock3,
  CornerDownRight,
  FileDown,
  FileCode,
  FolderOpen,
  GitBranch,
  Import,
  Lock,
  MessageSquareText,
  Minus,
  Plus,
  Search,
  Settings,
  Trash2,
  Wand2
} from "lucide-react";
import styles from "./App.module.css";
import "./global.css";

type OntologyItemKind = "class" | "objectProperty" | "datatypeProperty" | "annotation" | "individual" | "builtinDatatype";
type PropertyKind = "objectProperty" | "datatypeProperty";
type NavigatorTab = PropertyKind | "individual";

type PropertyAssertion = {
  property: string;
  value: string;
};

type PropertyCharacteristic =
  | "Functional"
  | "Inverse functional"
  | "Transitive"
  | "Symmetric"
  | "Asymmetric"
  | "Reflexive"
  | "Irreflexive";

type Entity = {
  id: string;
  label: string;
  kind: OntologyItemKind;
  description: string;
  parentId?: string;
  superClassIds?: string[];
  domain?: string[];
  range?: string[];
  subjectId?: string;
  annotationProperty?: string;
  annotationValue?: string;
  annotationLanguage?: string;
  annotationDatatype?: string;
  isUserAnnotation?: boolean;
  equivalentClassIds?: string[];
  disjointWithClassIds?: string[];
  disjointUnionClassIds?: string[];
  iriLocalName?: string;
  types?: string[];
  sameAs?: string[];
  differentFrom?: string[];
  objectAssertions?: PropertyAssertion[];
  dataAssertions?: PropertyAssertion[];
  characteristics?: PropertyCharacteristic[];
  inverseOf?: string;
  readOnly?: boolean;
  importedFrom?: string;
  iri?: string;
  unresolvedParentIri?: string;
};

type ActivityKind = "create" | "update" | "delete" | "select";

type ActivityEntry = {
  id: string;
  timestamp: Date;
  kind: ActivityKind;
  entityLabel: string;
  entityKind?: OntologyItemKind;
  detail: string;
};

type OntologyMetrics = {
  totalAxioms: number;
  logicalAxioms: number;
  declarationAxioms: number;
  classCount: number;
  objectPropertyCount: number;
  datatypePropertyCount: number;
  individualCount: number;
  annotationPropertyCount: number;
  classAxioms: {
    subClassOf: number;
    equivalentClasses: number;
    disjointClasses: number;
    disjointUnion: number;
  };
  objectPropertyAxioms: {
    subObjectPropertyOf: number;
    inverseOf: number;
    domain: number;
    range: number;
    characteristics: number;
  };
  datatypePropertyAxioms: {
    subDataPropertyOf: number;
    domain: number;
    range: number;
    characteristics: number;
  };
  individualAxioms: {
    classAssertions: number;
    sameIndividual: number;
    differentIndividuals: number;
    objectAssertions: number;
    dataAssertions: number;
  };
};

const kindLabels: Record<OntologyItemKind, string> = {
  class: "Class",
  objectProperty: "Object property",
  datatypeProperty: "Datatype property",
  annotation: "Annotation",
  builtinDatatype: "Built-in datatype",
  individual: "Individual"
};

// For individuals, the IRI local name is the primary identifier; for all others the label is.
function displayName(entity: Entity): string {
  if (entity.kind === "individual") {
    return entity.iriLocalName ?? entity.label;
  }
  return entity.label;
}

const initialEntities: Entity[] = [
  {
    id: "vehicle",
    label: "Vehicle",
    kind: "class",
    description: "A thing used to move people or goods."
  },
  {
    id: "electric-vehicle",
    label: "Electric vehicle",
    kind: "class",
    parentId: "vehicle",
    description: "A vehicle powered by one or more electric motors."
  },
  {
    id: "battery-electric-car",
    label: "Battery electric car",
    kind: "class",
    parentId: "electric-vehicle",
    description: "A passenger car powered only by a rechargeable battery."
  },
  {
    id: "fleet-vehicle",
    label: "Fleet vehicle",
    kind: "class",
    parentId: "vehicle",
    description: "A vehicle managed as part of an organization fleet."
  },
  {
    id: "manufactured-by",
    label: "manufactured by",
    kind: "objectProperty",
    domain: ["Vehicle"],
    range: ["Organization"],
    description: "Connects a vehicle to the organization that manufactured it.",
    characteristics: []
  },
  {
    id: "supplied-by",
    label: "supplied by",
    kind: "objectProperty",
    parentId: "manufactured-by",
    domain: ["Vehicle"],
    range: ["Organization"],
    description: "Connects a vehicle to the organization that supplied it.",
    characteristics: []
  },
  {
    id: "has-range",
    label: "has range",
    kind: "datatypeProperty",
    domain: ["Vehicle"],
    range: ["decimal with unit"],
    description: "Stores the estimated driving range as a value.",
    characteristics: ["Functional"]
  },
  {
    id: "has-certified-range",
    label: "has certified range",
    kind: "datatypeProperty",
    parentId: "has-range",
    domain: ["Vehicle"],
    range: ["decimal with unit"],
    description: "Stores the certified driving range as a value.",
    characteristics: ["Functional"]
  },
  {
    id: "ev-definition",
    label: "definition",
    kind: "annotation",
    subjectId: "electric-vehicle",
    annotationProperty: "definition",
    annotationValue: "A vehicle powered by one or more electric motors.",
    description: "Definition annotation for Electric vehicle."
  },
  {
    id: "ev-label",
    label: "preferred label",
    kind: "annotation",
    subjectId: "electric-vehicle",
    annotationProperty: "rdfs:label",
    annotationValue: "Electric vehicle",
    description: "Preferred display label."
  },
  {
    id: "demo-car",
    label: "Demo car 01",
    kind: "individual",
    description: "Example individual used to test the model.",
    types: ["Battery electric car"],
    sameAs: ["Demo EV 01"],
    differentFrom: ["Service van 12"],
    objectAssertions: [{ property: "manufactured by", value: "Volta Motors" }],
    dataAssertions: [{ property: "has range", value: "420 km" }]
  },
  {
    id: "fleet-van",
    label: "Service van 12",
    kind: "individual",
    description: "Example fleet vehicle.",
    types: ["Fleet vehicle"],
    sameAs: [],
    differentFrom: ["Demo car 01"],
    objectAssertions: [{ property: "manufactured by", value: "Acme Fleet" }],
    dataAssertions: [{ property: "has range", value: "210 km" }]
  }
];

const annotationProperties = [
  "owl:backwardCompatibleWith",
  "owl:deprecated",
  "owl:incompatibleWith",
  "owl:priorVersion",
  "owl:versionInfo",
  "rdfs:comment",
  "rdfs:isDefinedBy",
  "rdfs:label",
  "rdfs:seeAlso"
];

const xsdDatatypes = [
  "owl:rational",
  "owl:real",
  "rdf:langString",
  "rdf:PlainLiteral",
  "rdf:XMLLiteral",
  "rdfs:Literal",
  "xsd:anyURI",
  "xsd:base64Binary",
  "xsd:boolean",
  "xsd:byte",
  "xsd:dateTime",
  "xsd:dateTimeStamp",
  "xsd:decimal",
  "xsd:double",
  "xsd:float",
  "xsd:hexBinary",
  "xsd:int",
  "xsd:integer",
  "xsd:language",
  "xsd:long",
  "xsd:Name",
  "xsd:NCName",
  "xsd:negativeInteger",
  "xsd:NMTOKEN",
  "xsd:nonNegativeInteger",
  "xsd:nonPositiveInteger",
  "xsd:normalizedString",
  "xsd:positiveInteger",
  "xsd:short",
  "xsd:string",
  "xsd:token",
  "xsd:unsignedByte",
  "xsd:unsignedInt",
  "xsd:unsignedLong",
  "xsd:unsignedShort"
];

const xsdDatatypeEntities: Entity[] = xsdDatatypes.map((label) => ({
  id: label,
  label,
  kind: "builtinDatatype" as const,
  description: "",
}));

const activityStorageKey = "yawebprotege.activityLog";

type AnnotationPropertyItem = {
  id: string;
  label: string;
  parentId?: string;
};

function cx(...classNames: Array<string | false | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

function createInitialActivity(): ActivityEntry {
  return {
    id: "activity-initial",
    timestamp: new Date(),
    kind: "select",
    entityLabel: "Fleet ontology",
    detail: "Opened ontology workspace"
  };
}

function loadActivityLog() {
  try {
    const stored = window.localStorage.getItem(activityStorageKey);
    if (!stored) {
      return [createInitialActivity()];
    }
    const parsed = JSON.parse(stored) as Array<Omit<ActivityEntry, "timestamp"> & { timestamp: string }>;
    return parsed.map((entry) => ({ ...entry, timestamp: new Date(entry.timestamp) }));
  } catch {
    return [createInitialActivity()];
  }
}

function getClassAndAncestorLabels(classes: Entity[], classEntity: Entity) {
  const labels = new Set<string>([classEntity.label]);
  let current = classEntity;
  const visitedIds = new Set<string>([classEntity.id]);

  while (current.parentId) {
    const parent = classes.find((candidate) => candidate.id === current.parentId);
    if (!parent || visitedIds.has(parent.id)) {
      break;
    }
    labels.add(parent.label);
    visitedIds.add(parent.id);
    current = parent;
  }

  return labels;
}

// Resolves an ontology's owl:imports (transitively, cycle-safe) against the
// workspace tree and returns their entities tagged as read-only.
function getImportedEntities(ontology: WorkspaceOntology | null, tree: import("./workspace/WorkspaceStore").WorkspaceNode[]): Entity[] {
  if (!ontology?.parsed?.imports?.length) return [];
  const allOntologies = flattenOntologies(tree);
  const visited = new Set<string>([ontology.parsed.iri]);
  const queue = [...ontology.parsed.imports];
  const result: Entity[] = [];

  while (queue.length > 0) {
    const iri = queue.shift()!;
    if (visited.has(iri)) continue;
    visited.add(iri);
    const match = allOntologies.find((o) => o.parsed?.iri === iri);
    if (!match?.parsed) continue;
    const loaded = owlDocToEntities(match.parsed) as Entity[];
    for (const e of loaded) result.push({ ...e, readOnly: true, importedFrom: match.name });
    queue.push(...(match.parsed.imports ?? []));
  }

  return result;
}

function App() {
  const { state: workspaceState, activeOntology, dispatch: workspaceDispatch } = useWorkspace();
  // Keep a ref so effects can always read the latest activeOntology
  // without listing it as a dependency (avoids stale closures).
  const activeOntologyRef = React.useRef(activeOntology);
  activeOntologyRef.current = activeOntology;
  const [entities, setEntities] = React.useState<Entity[]>([]);
  const [selectedId, setSelectedId] = React.useState("electric-vehicle");
  // Tracks which ontology the current `entities` state was loaded from, set only
  // by the load effect below. This MUST be React state (not a ref): a ref would be
  // mutated synchronously by the load effect before the sync-back effect below runs
  // in the same commit, masking the one-commit window where `entities` (stale, from
  // the previous ontology) and `activeOntology` (already the new one) are mismatched
  // — which would otherwise briefly write ontology A's classes into ontology B's file.
  // State updates are only visible starting the next render, so the sync-back effect
  // still sees the stale id during that commit and correctly skips.
  const [entitiesOwnerId, setEntitiesOwnerId] = React.useState<string | null>(null);

  // When the active ontology changes, populate entities from parsed OWL
  React.useEffect(() => {
    if (activeOntology?.parsed) {
      const loaded = owlDocToEntities(activeOntology.parsed) as Entity[];
      setEntities(loaded);
      setEntitiesOwnerId(activeOntology.id);
      setSelectedId(loaded[0]?.id ?? "electric-vehicle");
      // Collapse every class that has at least one child, so the tree starts
      // fully collapsed and users expand only what they need.
      const classIds = new Set(loaded.filter((e) => e.kind === "class").map((e) => e.id));
      const parentIds = new Set(
        loaded.filter((e) => e.kind === "class" && e.parentId && classIds.has(e.parentId)).map((e) => e.parentId as string)
      );
      setCollapsedClassIds(parentIds);
    }
  }, [activeOntology?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the WorkspaceStore in sync when entities are edited in the designer.
  // Guard: skip when entities is empty to avoid overwriting the stored doc during
  // the initial render before the load effect has had a chance to populate entities.
  // activeOntology is read via ref so we always get the latest value without
  // adding it as a dependency (which would cause unnecessary re-runs).
  // Also guard against the entities/ontology mismatch that occurs for one commit
  // right after switching ontologies (see entitiesOwnerId above).
  React.useEffect(() => {
    const ontology = activeOntologyRef.current;
    if (!ontology?.parsed || entities.length === 0) return;
    if (entitiesOwnerId !== ontology.id) return;
    const updatedDoc = reverseEntitiesToOWLDoc(entities as import("./owl/parser").AppEntity[], ontology.parsed);
    workspaceDispatch({ type: "UPDATE_ONTOLOGY", id: ontology.id, parsed: updatedDoc });
  }, [entities, entitiesOwnerId, workspaceDispatch]);

  const [collapsedClassIds, setCollapsedClassIds] = React.useState<Set<string>>(new Set());
  const [navigatorWidth, setNavigatorWidth] = React.useState<number | null>(null);
  const [collapsedPropertyIds, setCollapsedPropertyIds] = React.useState<Set<string>>(new Set());
  const [propertyTab, setPropertyTab] = React.useState<NavigatorTab>("objectProperty");
  const [mode, setMode] = React.useState<"ontology" | "guide" | "expert" | "source">("guide");
  const [section, setSection] = React.useState<"workspace" | "history">(() =>
    window.location.hash === "#history" ? "history" : "workspace"
  );
  const [activityLog, setActivityLog] = React.useState<ActivityEntry[]>(loadActivityLog);
  const [annotationEditorSubjectId, setAnnotationEditorSubjectId] = React.useState<string | undefined>();
  const [ontologyAnnotations, setOntologyAnnotations] = React.useState<Entity[]>([]);
  const [ontologyAnnotationEditorOpen, setOntologyAnnotationEditorOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const activeOntologyName = activeOntology?.parsed?.name ?? activeOntology?.name ?? "Fleet ontology";
  const ontologySubject: Entity = { id: "ontology", label: activeOntologyName, kind: "class", description: "" };

  // Entities from owl:imports declarations, resolved transitively against the
  // workspace and exposed read-only (never written back to this ontology's file).
  // Gated on entitiesOwnerId matching the active ontology: for the one render right
  // after switching ontologies, `entities` (state) still holds the *previous*
  // ontology's data while `activeOntology` already points to the new one. Without
  // this guard, that render would combine the previous ontology's own classes with
  // the new ontology's imported classes — producing duplicate React keys (e.g. an
  // ontology's classes appearing as both "own" and "imported") that corrupt the
  // tree's reconciliation even after the data corrects itself on the next render.
  const importedEntities = React.useMemo(() => {
    if (entitiesOwnerId !== activeOntology?.id) return [];
    return getImportedEntities(activeOntology, workspaceState.tree);
  }, [activeOntology, workspaceState.tree, entitiesOwnerId]);

  const annotationEditorSubject = annotationEditorSubjectId
    ? entities.find((entity) => entity.id === annotationEditorSubjectId)
    : undefined;

  const ownClasses = React.useMemo(() => entities.filter((entity) => entity.kind === "class"), [entities]);
  const ownIndividuals = React.useMemo(() => entities.filter((entity) => entity.kind === "individual"), [entities]);
  const ownObjectProperties = React.useMemo(() => entities.filter((entity) => entity.kind === "objectProperty"), [entities]);
  const ownDatatypeProperties = React.useMemo(() => entities.filter((entity) => entity.kind === "datatypeProperty"), [entities]);

  const importedClasses = React.useMemo(() => importedEntities.filter((entity) => entity.kind === "class"), [importedEntities]);
  const importedIndividuals = React.useMemo(() => importedEntities.filter((entity) => entity.kind === "individual"), [importedEntities]);
  const importedObjectProperties = React.useMemo(() => importedEntities.filter((entity) => entity.kind === "objectProperty"), [importedEntities]);
  const importedDatatypeProperties = React.useMemo(() => importedEntities.filter((entity) => entity.kind === "datatypeProperty"), [importedEntities]);

  // Own classes whose rdfs:subClassOf points outside this ontology (unresolvedParentIri,
  // set by owlDocToEntities when the parent isn't one of this doc's own classes) get their
  // parentId patched to the matching imported class, so the hierarchy renders correctly
  // instead of these classes appearing as flat roots. This is display-only — `entities`
  // (the source of truth for export/persistence) is left untouched; export continues to
  // use unresolvedParentIri directly to re-emit the original subClassOf IRI.
  const patchedOwnClasses = React.useMemo(() => {
    if (importedClasses.length === 0) return ownClasses;
    const importedIriToId = new Map(importedClasses.map((c) => [c.iri, c.id]));
    return ownClasses.map((c) => {
      if (c.parentId || !c.unresolvedParentIri) return c;
      const matchId = importedIriToId.get(c.unresolvedParentIri);
      return matchId ? { ...c, parentId: matchId } : c;
    });
  }, [ownClasses, importedClasses]);

  // Navigator/picker-facing lists: own entities (with cross-ontology parents patched
  // in for classes) plus read-only imported ones.
  const classes = React.useMemo(() => [...patchedOwnClasses, ...importedClasses], [patchedOwnClasses, importedClasses]);
  const individuals = React.useMemo(() => [...ownIndividuals, ...importedIndividuals], [ownIndividuals, importedIndividuals]);
  const objectProperties = React.useMemo(() => [...ownObjectProperties, ...importedObjectProperties], [ownObjectProperties, importedObjectProperties]);
  const datatypeProperties = React.useMemo(() => [...ownDatatypeProperties, ...importedDatatypeProperties], [ownDatatypeProperties, importedDatatypeProperties]);

  const selected = classes.find((entity) => entity.id === selectedId)
    ?? individuals.find((entity) => entity.id === selectedId)
    ?? objectProperties.find((entity) => entity.id === selectedId)
    ?? datatypeProperties.find((entity) => entity.id === selectedId)
    ?? entities.find((entity) => entity.id === selectedId)
    ?? entities[0];

  const searchLower = searchQuery.toLowerCase();
  const filteredClasses = React.useMemo(
    () => searchLower ? classes.filter((e) => e.label.toLowerCase().includes(searchLower) || e.id.toLowerCase().includes(searchLower)) : classes,
    [classes, searchLower]
  );
  const filteredIndividuals = React.useMemo(
    () => searchLower ? individuals.filter((e) => e.label.toLowerCase().includes(searchLower) || e.id.toLowerCase().includes(searchLower)) : individuals,
    [individuals, searchLower]
  );
  const filteredObjectProperties = React.useMemo(
    () => searchLower ? objectProperties.filter((e) => e.label.toLowerCase().includes(searchLower) || e.id.toLowerCase().includes(searchLower)) : objectProperties,
    [objectProperties, searchLower]
  );
  const filteredDatatypeProperties = React.useMemo(
    () => searchLower ? datatypeProperties.filter((e) => e.label.toLowerCase().includes(searchLower) || e.id.toLowerCase().includes(searchLower)) : datatypeProperties,
    [datatypeProperties, searchLower]
  );
  const selectedClass = selected?.kind === "class" ? selected : undefined;
  if (!selected && entities.length > 0) return null; // safety: should never happen
  const selectedClassLabels = selectedClass ? getClassAndAncestorLabels(classes, selectedClass) : new Set<string>();
  const relatedProperties = selectedClass
    ? entities.filter(
        (entity) =>
          (entity.kind === "objectProperty" || entity.kind === "datatypeProperty") &&
          (entity.domain ?? []).some(d => selectedClassLabels.has(d))
      )
    : [];
  const relatedAnnotations = selectedClass
    ? entities.filter((entity) => entity.kind === "annotation" && entity.subjectId === selectedClass.id)
    : [];
  const selectedAnnotations = entities.filter((entity) => entity.kind === "annotation" && entity.subjectId === selected?.id);
  const relatedIndividuals = selectedClass
    ? entities.filter((entity) => entity.kind === "individual" && (entity.types ?? []).includes(selectedClass.label))
    : [];
  const equivalentClasses = selectedClass
    ? classes.filter((classItem) => (selectedClass.equivalentClassIds ?? []).includes(classItem.id))
    : [];
  const disjointWithClasses = selectedClass
    ? classes.filter((classItem) => (selectedClass.disjointWithClassIds ?? []).includes(classItem.id))
    : [];
  const disjointUnionClasses = selectedClass
    ? classes.filter((classItem) => (selectedClass.disjointUnionClassIds ?? []).includes(classItem.id))
    : [];
  const superClasses = selectedClass
    ? classes.filter((classItem) =>
        [selectedClass.parentId, ...(selectedClass.superClassIds ?? [])].filter(Boolean).includes(classItem.id)
      )
    : [];
  const ontologyMetrics = React.useMemo(
    () => getOntologyMetrics(entities, ownClasses, ownObjectProperties, ownDatatypeProperties, ownIndividuals),
    [entities, ownClasses, ownObjectProperties, ownDatatypeProperties, ownIndividuals]
  );

  React.useEffect(() => {
    function handleHashChange() {
      setSection(window.location.hash === "#history" ? "history" : "workspace");
    }

    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  React.useEffect(() => {
    window.localStorage.setItem(activityStorageKey, JSON.stringify(activityLog));
  }, [activityLog]);

  function logActivity(entry: Omit<ActivityEntry, "id" | "timestamp">) {
    setActivityLog((current) => [
      {
        ...entry,
        id: `activity-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        timestamp: new Date()
      },
      ...current
    ]);
  }

  function selectEntity(id: string) {
    const target = entities.find((entity) => entity.id === id);
    setSelectedId(id);
    if (target?.kind === "objectProperty" || target?.kind === "datatypeProperty") {
      setPropertyTab(target.kind);
    }
    if (target && target.id !== selectedId) {
      logActivity({
        kind: "select",
        entityLabel: target.label,
        entityKind: target.kind,
        detail: `Selected ${kindLabels[target.kind].toLowerCase()}`
      });
    }
  }

  function updateEntity(id: string, patch: Partial<Entity>) {
    const target = entities.find((entity) => entity.id === id);
    setEntities((current) => {
      let updated = current.map((entity) => (entity.id === id ? { ...entity, ...patch } : entity));

      // Symmetric inverseOf: if A.inverseOf = B then B.inverseOf = A; if cleared, clear B too.
      if ("inverseOf" in patch && target?.kind === "objectProperty") {
        const prevInverseLabel = target.inverseOf;
        const nextInverseLabel = patch.inverseOf;

        // Clear the old inverse's back-reference
        if (prevInverseLabel) {
          updated = updated.map((entity) =>
            entity.kind === "objectProperty" && entity.label === prevInverseLabel && entity.inverseOf === target.label
              ? { ...entity, inverseOf: undefined }
              : entity
          );
        }

        // Set the new inverse's back-reference
        if (nextInverseLabel) {
          updated = updated.map((entity) =>
            entity.kind === "objectProperty" && entity.label === nextInverseLabel
              ? { ...entity, inverseOf: target.label }
              : entity
          );
        }
      }

      return updated;
    });
    if (target && Object.keys(patch).length > 0) {
      logActivity({
        kind: "update",
        entityLabel: patch.label ?? target.label,
        entityKind: target.kind,
        detail: `Updated ${formatPatchFields(patch)}`
      });
    }
  }

  function removeEntity(id: string) {
    const target = entities.find((entity) => entity.id === id);
    setEntities((current) => current.filter((entity) => entity.id !== id));
    if (target) {
      logActivity({
        kind: "delete",
        entityLabel: target.label,
        entityKind: target.kind,
        detail: `Deleted ${kindLabels[target.kind].toLowerCase()}`
      });
    }
  }

  function removeSelectedTreeEntity(kind: "class" | PropertyKind) {
    if (selected.kind !== kind) {
      return;
    }

    const idsToRemove = collectDescendantIds(entities, selected.id, kind);
    idsToRemove.add(selected.id);
    const labelsToRemove = new Set(
      entities.filter((entity) => idsToRemove.has(entity.id)).map((entity) => entity.label)
    );
    const fallback =
      kind === "class"
        ? classes.find((classItem) => !idsToRemove.has(classItem.id))
        : entities.find((entity) => entity.kind === kind && !idsToRemove.has(entity.id));

    setEntities((current) =>
      current
        .filter((entity) => !idsToRemove.has(entity.id) && !(entity.kind === "annotation" && entity.subjectId && idsToRemove.has(entity.subjectId)))
        .map((entity) => ({
          ...entity,
          parentId: entity.parentId && idsToRemove.has(entity.parentId) ? undefined : entity.parentId,
          superClassIds: entity.superClassIds?.filter((id) => !idsToRemove.has(id)),
          equivalentClassIds: entity.equivalentClassIds?.filter((id) => !idsToRemove.has(id)),
          disjointWithClassIds: entity.disjointWithClassIds?.filter((id) => !idsToRemove.has(id)),
          disjointUnionClassIds: entity.disjointUnionClassIds?.filter((id) => !idsToRemove.has(id)),
          domain: entity.domain?.filter(d => !labelsToRemove.has(d)) ?? entity.domain,
          range: entity.range?.filter(r => !labelsToRemove.has(r)) ?? entity.range,
          types: entity.types?.filter((type) => !labelsToRemove.has(type)),
          objectAssertions: entity.objectAssertions?.filter((assertion) => !labelsToRemove.has(assertion.property)),
          dataAssertions: entity.dataAssertions?.filter((assertion) => !labelsToRemove.has(assertion.property))
        }))
    );
    setCollapsedClassIds((current) => {
      const next = new Set(current);
      idsToRemove.forEach((id) => next.delete(id));
      return next;
    });
    setCollapsedPropertyIds((current) => {
      const next = new Set(current);
      idsToRemove.forEach((id) => next.delete(id));
      return next;
    });
    setSelectedId(fallback?.id ?? entities.find((entity) => !idsToRemove.has(entity.id))?.id ?? "");
    logActivity({
      kind: "delete",
      entityLabel: selected.label,
      entityKind: selected.kind,
      detail:
        idsToRemove.size > 1
          ? `Deleted ${kindLabels[selected.kind].toLowerCase()} and ${idsToRemove.size - 1} child item(s)`
          : `Deleted ${kindLabels[selected.kind].toLowerCase()}`
    });
  }

  function updateSelected(patch: Partial<Entity>) {
    if (patch.label && patch.label !== selected.label) {
      const previousLabel = selected.label;
      const nextLabel = patch.label!;
      setEntities((current) =>
        current.map((entity) => {
          if (entity.id === selected.id) {
            return { ...entity, ...patch };
          }
          if (selected.kind === "class") {
            return {
              ...entity,
              domain: entity.domain?.map(d => d === previousLabel ? nextLabel : d),
              range: entity.range?.map(r => r === previousLabel ? nextLabel : r),
              types: entity.types?.map((type) => (type === previousLabel ? nextLabel : type))
            };
          }
          if (selected.kind === "objectProperty" || selected.kind === "datatypeProperty") {
            return {
              ...entity,
              // Keep inverseOf references in sync when a property is renamed
              inverseOf: entity.inverseOf === previousLabel ? nextLabel : entity.inverseOf,
              objectAssertions: entity.objectAssertions?.map((assertion) =>
                assertion.property === previousLabel ? { ...assertion, property: nextLabel } : assertion
              ),
              dataAssertions: entity.dataAssertions?.map((assertion) =>
                assertion.property === previousLabel ? { ...assertion, property: nextLabel } : assertion
              )
            };
          }
          return entity;
        })
      );
      logActivity({
        kind: "update",
        entityLabel: nextLabel,
        entityKind: selected.kind,
        detail: `Renamed from ${previousLabel} to ${nextLabel}`
      });
      return;
    }
    updateEntity(selected.id, patch);
  }

  function addEntity(kind: OntologyItemKind, parentId?: string) {
    const count = entities.filter((entity) => entity.kind === kind).length + 1;
    const classContext = selected?.kind === "class" ? selected : classes[0];
    const next: Entity = {
      id: `${kind}-${Date.now()}`,
      kind,
      label: `New ${kindLabels[kind].toLowerCase()} ${count}`,
      description: "",
      parentId,
      domain: undefined,
      range: undefined,
      subjectId: kind === "annotation" ? classContext.id : undefined,
      annotationProperty: kind === "annotation" ? "rdfs:comment" : undefined,
      annotationValue: kind === "annotation" ? "" : undefined,
      types: kind === "individual" ? [classContext.label] : undefined,
      sameAs: kind === "individual" ? [] : undefined,
      differentFrom: kind === "individual" ? [] : undefined,
      objectAssertions: kind === "individual" ? [] : undefined,
      dataAssertions: kind === "individual" ? [] : undefined,
      characteristics: kind === "objectProperty" || kind === "datatypeProperty" ? [] : undefined
    };
    setEntities((current) => [...current, next]);
    if (parentId && kind === "class") {
      setCollapsedClassIds((current) => {
        const nextCollapsed = new Set(current);
        nextCollapsed.delete(parentId);
        return nextCollapsed;
      });
    }
    if (parentId && (kind === "objectProperty" || kind === "datatypeProperty")) {
      setCollapsedPropertyIds((current) => {
        const nextCollapsed = new Set(current);
        nextCollapsed.delete(parentId);
        return nextCollapsed;
      });
    }
    setSelectedId(next.id);
    logActivity({
      kind: "create",
      entityLabel: next.label,
      entityKind: next.kind,
      detail: parentId
        ? `Created child ${kindLabels[next.kind].toLowerCase()}`
        : `Created root ${kindLabels[next.kind].toLowerCase()}`
    });
  }

  function addIndividualOfType(typeName: string) {
    const count = entities.filter((e) => e.kind === "individual").length + 1;
    const next: Entity = {
      id: `individual-${Date.now()}`,
      kind: "individual",
      label: `New individual ${count}`,
      description: "",
      types: typeName !== "(No type)" ? [typeName] : [],
      sameAs: [],
      differentFrom: [],
      objectAssertions: [],
      dataAssertions: [],
    };
    setEntities((current) => [...current, next]);
    setSelectedId(next.id);
    logActivity({ kind: "create", entityLabel: next.label, entityKind: "individual", detail: `Created individual of type ${typeName}` });
  }

  function saveOntologyAnnotation(draft: { property: string; value: string; language: string; datatype: string }) {
    const next: Entity = {
      id: `ontology-annotation-${Date.now()}`,
      kind: "annotation",
      label: draft.property,
      description: "Ontology annotation",
      subjectId: "ontology",
      annotationProperty: draft.property,
      annotationValue: draft.value,
      annotationLanguage: draft.language,
      annotationDatatype: draft.datatype,
      isUserAnnotation: true
    };
    setOntologyAnnotations((current) => [...current, next]);
    setOntologyAnnotationEditorOpen(false);
  }

  function updateOntologyAnnotation(annotationId: string, patch: Partial<Entity>) {
    setOntologyAnnotations((current) =>
      current.map((annotation) => (annotation.id === annotationId ? { ...annotation, ...patch } : annotation))
    );
  }

  function removeOntologyAnnotation(annotationId: string) {
    setOntologyAnnotations((current) => current.filter((annotation) => annotation.id !== annotationId));
  }

  function saveAnnotation(draft: {
    property: string;
    value: string;
    language: string;
    datatype: string;
  }) {
    const subject = annotationEditorSubject;
    if (!subject) {
      return;
    }

    const count = entities.filter((entity) => entity.kind === "annotation").length + 1;
    const next: Entity = {
      id: `annotation-${Date.now()}`,
      kind: "annotation",
      label: draft.property,
      description: `Annotation for ${subject.label}`,
      subjectId: subject.id,
      annotationProperty: draft.property,
      annotationValue: draft.value,
      annotationLanguage: draft.language,
      annotationDatatype: draft.datatype,
      isUserAnnotation: true
    };

    setEntities((current) => [...current, next]);
    setAnnotationEditorSubjectId(undefined);
    logActivity({
      kind: "create",
      entityLabel: draft.property,
      entityKind: "annotation",
      detail: `Added annotation to ${subject.label}`
    });
  }

  function toggleClass(classId: string) {
    setCollapsedClassIds((current) => {
      const next = new Set(current);
      if (next.has(classId)) {
        next.delete(classId);
      } else {
        next.add(classId);
      }
      return next;
    });
  }

  function toggleProperty(propertyId: string) {
    setCollapsedPropertyIds((current) => {
      const next = new Set(current);
      if (next.has(propertyId)) {
        next.delete(propertyId);
      } else {
        next.add(propertyId);
      }
      return next;
    });
  }

  function addIndividualForClass(classEntity: Entity) {
    const count = entities.filter((entity) => entity.kind === "individual").length + 1;
    const next: Entity = {
      id: `individual-${Date.now()}`,
      kind: "individual",
      label: `New ${classEntity.label.toLowerCase()} ${count}`,
      description: "",
      types: [classEntity.label],
      sameAs: [],
      differentFrom: [],
      objectAssertions: [],
      dataAssertions: []
    };
    setEntities((current) => [...current, next]);
    setSelectedId(next.id);
    logActivity({
      kind: "create",
      entityLabel: next.label,
      entityKind: "individual",
      detail: `Created individual of ${classEntity.label}`
    });
  }

  function updateSelectedIndividual(patch: Partial<Entity>) {
    if (selected.kind !== "individual") {
      return;
    }
    updateSelected(patch);
  }

  function addTypeAssertion(className: string) {
    updateSelectedIndividual({ types: Array.from(new Set([...(selected.types ?? []), className])) });
  }

  function addSameAs() {
    updateSelectedIndividual({ sameAs: [...(selected.sameAs ?? []), "New same individual"] });
  }

  function addDifferentFrom() {
    updateSelectedIndividual({ differentFrom: [...(selected.differentFrom ?? []), "New different individual"] });
  }

  function addObjectAssertion(property: string, value: string) {
    updateSelectedIndividual({
      objectAssertions: [...(selected.objectAssertions ?? []), { property, value }]
    });
  }

  function addDataAssertion(property: string, value: string) {
    updateSelectedIndividual({
      dataAssertions: [...(selected.dataAssertions ?? []), { property, value }]
    });
  }

  return (
    <main className={styles.appShell}>
      <aside className={styles.sidebar} aria-label="Workspace navigation">
        <div className={styles.brand}>
          <div className={styles.brandMark}>
            <GitBranch size={22} />
          </div>
          <div>
            <strong>YetAnotherWebProtege</strong>
            <span>Ontology studio</span>
          </div>
        </div>



        <nav className={styles.navList} aria-label="Main navigation">
          <a
            className={section === "workspace" ? styles.active : undefined}
            href="#workspace"
            onClick={() => setSection("workspace")}
          >
            <FolderOpen size={18} />
            Workspace
          </a>

          <a className={section === "history" ? styles.active : undefined} href="#history" onClick={() => setSection("history")}>
            <Clock3 size={18} />
            History
          </a>
          <a href="#settings">
            <Settings size={18} />
            Settings
          </a>
        </nav>

        <WorkspacePanel />
      </aside>

      <section className={styles.workspace} id="workspace">
        <header className={styles.topbar}>
          <div className={styles.projectTitle}>
            <FolderOpen size={18} />
            <div>
              <strong>{activeOntologyName}</strong>
              <span>{activeOntology ? `${entities.length} items` : "No ontology loaded"}</span>
            </div>
          </div>
          <div className={styles.topbarActions}>
            <div className={styles.search}>
              <Search size={17} />
              <input
                aria-label="Search ontology"
                placeholder="Search classes, properties, individuals"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>


          </div>
        </header>

        {section === "history" ? (
          <HistoryView activities={activityLog} onClear={() => setActivityLog([])} />
        ) : (
          <div className={styles.workspaceBody}>
            {(!activeOntology || entitiesOwnerId !== activeOntology.id) ? (
              <div className={styles.noOntologyOverlay}>
                <div className={styles.noOntologyCard}>
                  <FolderOpen size={36} strokeWidth={1.5} />
                  <strong>{!activeOntology ? "No ontology loaded" : "Loading…"}</strong>
                  {!activeOntology && <p>Select an ontology in the Workspace panel on the left, or import one with the&nbsp;<strong>+</strong>&nbsp;button.</p>}
                </div>
              </div>
            ) : (<>
            <div className={styles.modeStrip} aria-label="Editing mode">
              <button className={cx("btn btn-sm", mode === "ontology" ? styles.selected : "btn-light")} onClick={() => setMode("ontology")}>
                <FolderOpen size={16} />
                Active Ontology
              </button>
              <button className={cx("btn btn-sm", mode === "guide" ? styles.selected : "btn-light")} onClick={() => setMode("guide")}>
                <Wand2 size={16} />
                Entities
              </button>
              <button className={cx("btn btn-sm", mode === "expert" ? styles.selected : "btn-light")} onClick={() => setMode("expert")}>
                <Boxes size={16} />
                Visual
              </button>
              <button className={cx("btn btn-sm", mode === "source" ? styles.selected : "btn-light")} onClick={() => setMode("source")}>
                <FileCode size={16} />
                OWL/RDF
              </button>
              <span>{mode === "ontology" ? "Ontology header" : mode === "guide" ? "Entity fields" : mode === "expert" ? "Ontology graph" : "OWL/RDF source"}</span>
              <div className={styles.prefixStrip} aria-label="OWL standard prefixes">
                <code>owl</code>
                <code>rdf</code>
                <code>rdfs</code>
                <code>xsd</code>
              </div>
            </div>

            <div className={styles.ontologySummary} aria-label="Ontology summary">
              <div className="card border-0 shadow-sm">
                <span className={styles.summaryMarkerClass} />
                <small>Classes</small>
                <strong>{ownClasses.length}</strong>
              </div>
              <div className="card border-0 shadow-sm">
                <span className={styles.summaryMarkerObject} />
                <small>Object properties</small>
                <strong>{ownObjectProperties.length}</strong>
              </div>
              <div className="card border-0 shadow-sm">
                <span className={styles.summaryMarkerDatatype} />
                <small>Datatype properties</small>
                <strong>{ownDatatypeProperties.length}</strong>
              </div>
              <div className="card border-0 shadow-sm">
                <span className={styles.summaryMarkerIndividual} />
                <small>Individuals</small>
                <strong>{ownIndividuals.length}</strong>
              </div>
            </div>

            <div
              className={cx(styles.editorGrid, (mode === "ontology" || mode === "source" || !selected) && styles.editorGridOntology)}
              style={navigatorWidth ? { gridTemplateColumns: `${navigatorWidth}px 14px minmax(0, 1fr)` } : undefined}
            >
          {mode !== "ontology" && mode !== "source" && selected && (
            <NavigatorColumn
              classes={filteredClasses}
              individuals={filteredIndividuals}
              selectedId={selectedId}
              selected={selected}
              collapsedClassIds={collapsedClassIds}
              propertyTab={propertyTab}
              objectProperties={filteredObjectProperties}
              datatypeProperties={filteredDatatypeProperties}
              collapsedPropertyIds={collapsedPropertyIds}
              onSelectEntity={selectEntity}
              onToggleClass={toggleClass}
              onToggleProperty={toggleProperty}
              onSetPropertyTab={setPropertyTab}
              onAddEntity={addEntity}
              onRemoveSelectedTreeEntity={removeSelectedTreeEntity}
              onRemoveProperty={removeEntity}
              onAddIndividual={addIndividualOfType}
              onRemoveIndividual={removeEntity}
            />
          )}

          {mode !== "ontology" && mode !== "source" && selected && (
            <div
              className={styles.columnResizeHandle}
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startW = navigatorWidth ?? (e.currentTarget.previousElementSibling as HTMLElement)?.offsetWidth ?? 320;
                function onMove(ev: MouseEvent) {
                  const delta = ev.clientX - startX;
                  setNavigatorWidth(Math.max(220, Math.min(600, startW + delta)));
                }
                function onUp() {
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                }
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              }}
            />
          )}
          <div className={styles.middleColumn}>
            <section
              className={cx(styles.relatedPanel, "card border-0 shadow-sm")}
              aria-label={mode === "ontology" ? "Active ontology information" : mode === "expert" ? "Ontology visual representation" : mode === "source" ? "OWL/RDF source" : "Related class content"}
            >
              {mode === "ontology" ? (
                <ActiveOntologyView
                  activeOntologyId={activeOntology?.id ?? null}
                  activeOntologyName={activeOntologyName}
                  activeOntologyIri={activeOntology?.parsed?.iri ?? ""}
                  imports={activeOntology?.parsed?.imports ?? []}
                  metrics={ontologyMetrics}
                  annotations={ontologyAnnotations}
                  onAddAnnotation={() => setOntologyAnnotationEditorOpen(true)}
                  onUpdateAnnotation={updateOntologyAnnotation}
                  onRemoveAnnotation={removeOntologyAnnotation}
                />
              ) : mode === "expert" ? (
                <OntologyVisual
                  activeOntologyName={activeOntologyName}
                  classes={classes}
                  objectProperties={objectProperties}
                  datatypeProperties={datatypeProperties}
                  individuals={individuals}
                  selectedId={selectedId}
                  onSelect={selectEntity}
                />
              ) : mode === "source" ? (
                <OWLSourceView
                  entities={entities}
                  activeOntology={activeOntology!}
                />
              ) : !selected ? (
                <div className={styles.noOntologyOverlay}>
                  <div className={styles.noOntologyCard}>
                    <FolderOpen size={36} strokeWidth={1.5} />
                    <strong>This ontology is empty</strong>
                    <p>Add your first class to get started.</p>
                    <button className="btn btn-sm btn-light" onClick={() => addEntity("class")}>
                      <Plus size={14} /> Add class
                    </button>
                  </div>
                </div>
              ) : selectedClass?.readOnly ? (
                <ReadOnlyClassPanel key={selectedClass.id} selectedClass={selectedClass} superClasses={superClasses} />
              ) : selectedClass ? (
                <ClassRelatedPanels
                  key={selectedClass.id}
                  selectedClass={selectedClass}
                  classes={classes}
                  properties={relatedProperties}
                  objectProperties={objectProperties}
                  datatypeProperties={datatypeProperties}
                  annotations={relatedAnnotations}
                  individuals={relatedIndividuals}
                  equivalentClasses={equivalentClasses}
                  disjointWithClasses={disjointWithClasses}
                  disjointUnionClasses={disjointUnionClasses}
                  superClasses={superClasses}
                  allIndividuals={individuals}
                  onUpdate={updateSelected}
                  onSelect={selectEntity}
                  onAddAnnotation={() => setAnnotationEditorSubjectId(selectedClass.id)}
                  onUpdateAnnotation={(annotationId, patch) => updateEntity(annotationId, patch)}
                  onRemoveAnnotation={removeEntity}
                  onAttachProperty={(propertyId) => {
                    const prop = entities.find(e => e.id === propertyId);
                    updateEntity(propertyId, { domain: Array.from(new Set([...(prop?.domain ?? []), selectedClass.label])) });
                  }}
                  onDetachProperty={(propertyId) => {
                    const prop = entities.find(e => e.id === propertyId);
                    const next = (prop?.domain ?? []).filter(d => d !== selectedClass.label);
                    updateEntity(propertyId, { domain: next.length > 0 ? next : undefined });
                  }}
                  onAttachEquivalentClass={(classId) =>
                    updateSelected({
                      equivalentClassIds: Array.from(new Set([...(selectedClass.equivalentClassIds ?? []), classId]))
                    })
                  }
                  onDetachEquivalentClass={(classId) =>
                    updateSelected({
                      equivalentClassIds: (selectedClass.equivalentClassIds ?? []).filter((id) => id !== classId)
                    })
                  }
                  onAttachDisjointWithClass={(classId) =>
                    updateSelected({
                      disjointWithClassIds: Array.from(new Set([...(selectedClass.disjointWithClassIds ?? []), classId]))
                    })
                  }
                  onDetachDisjointWithClass={(classId) =>
                    updateSelected({
                      disjointWithClassIds: (selectedClass.disjointWithClassIds ?? []).filter((id) => id !== classId)
                    })
                  }
                  onAttachDisjointUnionClass={(classId) =>
                    updateSelected({
                      disjointUnionClassIds: Array.from(new Set([...(selectedClass.disjointUnionClassIds ?? []), classId]))
                    })
                  }
                  onDetachDisjointUnionClass={(classId) =>
                    updateSelected({
                      disjointUnionClassIds: (selectedClass.disjointUnionClassIds ?? []).filter((id) => id !== classId)
                    })
                  }
                  onAttachSuperClass={(classId) => {
                    if (!selectedClass.parentId) {
                      updateSelected({ parentId: classId });
                      return;
                    }
                    updateSelected({
                      superClassIds: Array.from(new Set([...(selectedClass.superClassIds ?? []), classId])).filter(
                        (id) => id !== selectedClass.parentId
                      )
                    });
                  }}
                  onDetachSuperClass={(classId) => {
                    if (selectedClass.parentId === classId) {
                      const [nextParentId, ...remainingSuperClassIds] = selectedClass.superClassIds ?? [];
                      updateSelected({ parentId: nextParentId, superClassIds: remainingSuperClassIds });
                      return;
                    }
                    updateSelected({
                      superClassIds: (selectedClass.superClassIds ?? []).filter((id) => id !== classId)
                    });
                  }}
                  onAttachIndividual={(individualId) => {
                    const individual = individuals.find((candidate) => candidate.id === individualId);
                    updateEntity(individualId, {
                      types: Array.from(new Set([...(individual?.types ?? []), selectedClass.label]))
                    });
                  }}
                  onDetachIndividual={(individualId) => {
                    const individual = individuals.find((candidate) => candidate.id === individualId);
                    updateEntity(individualId, {
                      types: (individual?.types ?? []).filter((type) => type !== selectedClass.label)
                    });
                  }}
                  onCreateIndividual={() => addIndividualOfType(selectedClass.label)}
                />
              ) : selected?.readOnly ? (
                <ReadOnlyEntityPanel key={selected.id} selected={selected} />
              ) : (
                <EntityEditor
                  selected={selected}
                  classes={classes}
                  individuals={individuals}
                  objectProperties={objectProperties}
                  datatypeProperties={datatypeProperties}
                  annotations={selectedAnnotations}
                  onUpdate={updateSelected}
                  onAddAnnotation={() => setAnnotationEditorSubjectId(selected.id)}
                  onUpdateAnnotation={(annotationId, patch) => updateEntity(annotationId, patch)}
                  onRemoveAnnotation={removeEntity}
                  onAddType={addTypeAssertion}
                  onAddSameAs={addSameAs}
                  onAddDifferentFrom={addDifferentFrom}
                  onAddObjectAssertion={addObjectAssertion}
                  onAddDataAssertion={addDataAssertion}
                />
              )}
            </section>
          </div>
        </div>
            </>)}
          </div>
        )}
        {annotationEditorSubject && (
          <AnnotationEditorDialog
            subject={annotationEditorSubject}
            onCancel={() => setAnnotationEditorSubjectId(undefined)}
            onSave={saveAnnotation}
          />
        )}
        {ontologyAnnotationEditorOpen && (
          <AnnotationEditorDialog
            subject={ontologySubject}
            onCancel={() => setOntologyAnnotationEditorOpen(false)}
            onSave={saveOntologyAnnotation}
          />
        )}
      </section>
    </main>
  );
}

function getClassDepth(classes: Entity[], classItem: Entity) {
  let depth = 0;
  let current = classItem;
  const visitedIds = new Set<string>([classItem.id]);

  while (current.parentId) {
    const parent = classes.find((candidate) => candidate.id === current.parentId);
    if (!parent || visitedIds.has(parent.id)) {
      break;
    }
    depth += 1;
    visitedIds.add(parent.id);
    current = parent;
  }

  return depth;
}

function collectDescendantIds(entities: Entity[], parentId: string, kind: OntologyItemKind) {
  const ids = new Set<string>();
  const stack = entities
    .filter((entity) => entity.kind === kind && entity.parentId === parentId)
    .map((entity) => entity.id);

  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || ids.has(id)) {
      continue;
    }
    ids.add(id);
    entities
      .filter((entity) => entity.kind === kind && entity.parentId === id)
      .forEach((entity) => stack.push(entity.id));
  }

  return ids;
}

function formatPatchFields(patch: Partial<Entity>) {
  const fieldLabels: Partial<Record<keyof Entity, string>> = {
    label: "name",
    description: "description",
    parentId: "parent",
    superClassIds: "subclass axioms",
    equivalentClassIds: "equivalent classes",
    disjointWithClassIds: "disjoint classes",
    disjointUnionClassIds: "disjoint union",
    domain: "domain",
    range: "range",
    annotationProperty: "annotation property",
    annotationValue: "annotation value",
    annotationLanguage: "annotation language",
    annotationDatatype: "annotation datatype",
    types: "types",
    sameAs: "same individual as",
    differentFrom: "different individuals",
    objectAssertions: "object property assertions",
    dataAssertions: "data property assertions",
    characteristics: "characteristics"
  };

  const labels = Object.keys(patch)
    .map((key) => fieldLabels[key as keyof Entity] ?? key)
    .filter(Boolean);

  return labels.length > 0 ? labels.join(", ") : "entity";
}

function getOntologyMetrics(
  entities: Entity[],
  classes: Entity[],
  objectProperties: Entity[],
  datatypeProperties: Entity[],
  individuals: Entity[]
): OntologyMetrics {
  const annotationEntities = entities.filter((entity) => entity.kind === "annotation");
  const classAxioms = {
    subClassOf:
      classes.filter((entity) => Boolean(entity.parentId)).length +
      classes.reduce((total, entity) => total + (entity.superClassIds?.length ?? 0), 0),
    equivalentClasses: classes.reduce((total, entity) => total + (entity.equivalentClassIds?.length ?? 0), 0),
    disjointClasses: classes.reduce((total, entity) => total + (entity.disjointWithClassIds?.length ?? 0), 0),
    disjointUnion: classes.reduce((total, entity) => total + (entity.disjointUnionClassIds?.length ?? 0), 0)
  };
  const objectPropertyAxioms = {
    subObjectPropertyOf: objectProperties.filter((entity) => Boolean(entity.parentId)).length,
    inverseOf: objectProperties.filter((entity) => Boolean(entity.inverseOf)).length,
    domain: objectProperties.reduce((n, e) => n + (e.domain?.length ?? 0), 0),
    range: objectProperties.reduce((n, e) => n + (e.range?.length ?? 0), 0),
    characteristics: objectProperties.reduce((total, entity) => total + (entity.characteristics?.length ?? 0), 0)
  };
  const datatypePropertyAxioms = {
    subDataPropertyOf: datatypeProperties.filter((entity) => Boolean(entity.parentId)).length,
    domain: datatypeProperties.reduce((n, e) => n + (e.domain?.length ?? 0), 0),
    range: datatypeProperties.reduce((n, e) => n + (e.range?.length ?? 0), 0),
    characteristics: datatypeProperties.reduce((total, entity) => total + (entity.characteristics?.length ?? 0), 0)
  };
  const individualAxioms = {
    classAssertions: individuals.reduce((total, entity) => total + (entity.types?.length ?? 0), 0),
    sameIndividual: individuals.reduce((total, entity) => total + (entity.sameAs?.length ?? 0), 0),
    differentIndividuals: individuals.reduce((total, entity) => total + (entity.differentFrom?.length ?? 0), 0),
    objectAssertions: individuals.reduce((total, entity) => total + (entity.objectAssertions?.length ?? 0), 0),
    dataAssertions: individuals.reduce((total, entity) => total + (entity.dataAssertions?.length ?? 0), 0)
  };
  const logicalAxioms =
    Object.values(classAxioms).reduce((total, count) => total + count, 0) +
    Object.values(objectPropertyAxioms).reduce((total, count) => total + count, 0) +
    Object.values(datatypePropertyAxioms).reduce((total, count) => total + count, 0) +
    Object.values(individualAxioms).reduce((total, count) => total + count, 0);
  const declarationAxioms =
    classes.length +
    objectProperties.length +
    datatypeProperties.length +
    individuals.length;

  // AnnotationAssertion axioms: rdfs:label (when label differs from IRI local name) + rdfs:comment (description)
  const allNamedEntities = [...classes, ...objectProperties, ...datatypeProperties, ...individuals];
  const annotationAssertions = allNamedEntities.reduce((total, entity) => {
    let count = 0;
    // rdfs:label assertion (Protégé writes it when label differs from IRI local name)
    const localName = entity.iriLocalName ?? entity.label.trim().replace(/\s+/g, "_").replace(/[^\w\-.]/g, "");
    if (entity.label && entity.label !== localName) count++;
    // rdfs:comment assertion
    if (entity.description && entity.description.trim()) count++;
    return total + count;
  }, 0);

  return {
    totalAxioms: logicalAxioms + declarationAxioms + annotationAssertions,
    logicalAxioms,
    declarationAxioms,
    classCount: classes.length,
    objectPropertyCount: objectProperties.length,
    datatypePropertyCount: datatypeProperties.length,
    individualCount: individuals.length,
    annotationPropertyCount: 0, // owl:AnnotationProperty declarations not yet parsed from file
    classAxioms,
    objectPropertyAxioms,
    datatypePropertyAxioms,
    individualAxioms
  };
}

type PrefixEntry = { id: string; prefix: string; iri: string };

function ActiveOntologyView({
  activeOntologyId,
  activeOntologyName,
  activeOntologyIri,
  imports,
  metrics,
  annotations,
  onAddAnnotation,
  onUpdateAnnotation,
  onRemoveAnnotation
}: {
  activeOntologyId: string | null;
  activeOntologyName: string;
  activeOntologyIri: string;
  imports: string[];
  metrics: OntologyMetrics;
  annotations: Entity[];
  onAddAnnotation: () => void;
  onUpdateAnnotation: (annotationId: string, patch: Partial<Entity>) => void;
  onRemoveAnnotation: (annotationId: string) => void;
}) {
  const { state, dispatch: workspaceDispatch } = useWorkspace();
  const [newImportIri, setNewImportIri] = React.useState("");

  const otherOntologies = React.useMemo(
    () =>
      flattenOntologies(state.tree).filter(
        (o) => o.id !== activeOntologyId && o.parsed?.iri
      ),
    [state.tree, activeOntologyId]
  );

  function resolveImportName(iri: string): WorkspaceOntology | undefined {
    return otherOntologies.find((o) => o.parsed?.iri === iri);
  }

  function addImport(iri: string) {
    const trimmed = iri.trim();
    if (!trimmed || imports.includes(trimmed) || !activeOntologyId) return;
    workspaceDispatch({ type: "SET_IMPORTS", id: activeOntologyId, imports: [...imports, trimmed] });
    setNewImportIri("");
  }

  function removeImport(iri: string) {
    if (!activeOntologyId) return;
    workspaceDispatch({ type: "SET_IMPORTS", id: activeOntologyId, imports: imports.filter((i) => i !== iri) });
  }

  const [versionIri, setVersionIri] = React.useState("");
  const [prefixes, setPrefixes] = React.useState<PrefixEntry[]>([
    { id: "p1", prefix: ":", iri: "http://www.semanticweb.org/admin/ontologies/2026/4/dpp-spl/" },
    { id: "p2", prefix: "dpp-spl:", iri: "http://www.semanticweb.org/admin/ontologies/2026/4/dpp-spl#" },
    { id: "p3", prefix: "owl:", iri: "http://www.w3.org/2002/07/owl#" },
    { id: "p4", prefix: "rdf:", iri: "http://www.w3.org/1999/02/22-rdf-syntax-ns#" },
    { id: "p5", prefix: "rdfs:", iri: "http://www.w3.org/2000/01/rdf-schema#" },
    { id: "p6", prefix: "xml:", iri: "http://www.w3.org/XML/1998/namespace" },
    { id: "p7", prefix: "xsd:", iri: "http://www.w3.org/2001/XMLSchema#" }
  ]);

  function addPrefix() {
    setPrefixes((current) => [
      ...current,
      { id: `prefix-${Date.now()}`, prefix: "", iri: "" }
    ]);
  }

  function updatePrefix(id: string, field: "prefix" | "iri", value: string) {
    setPrefixes((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry))
    );
  }

  function removePrefix(id: string) {
    setPrefixes((current) => current.filter((entry) => entry.id !== id));
  }

  return (
    <div className={cx(styles.protegeEditor, styles.ontologyProtegeEditor)} aria-label="Active ontology">
      {/* Title bar */}
      <div className={styles.protegeTitleBar}>
        <span className={styles.ontologyDot} />
        <input
          aria-label="Ontology name"
          value={activeOntologyName}
          readOnly
          style={{ flex: 1 }}
        />
        <span className={cx(styles.status, styles.ontology)}>Ontology</span>
      </div>

      {/* Ontology header: IRI fields */}
      <section className={styles.protegePane}>
        <div className={cx(styles.protegePaneHeader, styles.ontologyAccent)}>Ontology header: {activeOntologyName}</div>
        <div className={styles.ontologyHeaderForm}>
          <label>
            <span>Ontology IRI</span>
            <input
              value={activeOntologyIri}
              readOnly
              placeholder="e.g. http://www.example.org/my-ontology"
            />
          </label>
          <label>
            <span>Ontology Version IRI</span>
            <input
              value={versionIri}
              onChange={(e) => setVersionIri(e.target.value)}
              placeholder={`e.g. ${activeOntologyIri || "http://..."}/1.0.0`}
            />
          </label>
        </div>
      </section>

      {/* Imported ontologies: modular ontology support */}
      <section className={styles.protegePane}>
        <div className={cx(styles.protegePaneHeader, styles.ontologyAccent)}>Imported ontologies</div>
        <div className={styles.importsList}>
          {imports.length === 0 && (
            <p className={styles.importEmpty}>No imports</p>
          )}
          {imports.map((iri) => {
            const resolved = resolveImportName(iri);
            return (
              <div className={styles.importRow} key={iri}>
                <span className={styles.importRowLabel} title={iri}>
                  {resolved ? resolved.name : iri}
                  <em className={styles.importRowBadge}>{resolved ? "in workspace" : "external"}</em>
                </span>
                <button
                  className={styles.axiomRemoveButton}
                  aria-label={`Remove import ${iri}`}
                  title={`Remove ${iri}`}
                  onClick={() => removeImport(iri)}
                >
                  <Minus size={12} />
                </button>
              </div>
            );
          })}
        </div>
        {otherOntologies.filter((o) => !imports.includes(o.parsed!.iri)).length > 0 && (
          <div className={styles.importPickerRow}>
            <select
              key={imports.length}
              className={styles.importSelect}
              aria-label="Import an ontology from the workspace"
              defaultValue=""
              onChange={(e) => { if (e.target.value) addImport(e.target.value); }}
            >
              <option value="">Import from workspace…</option>
              {otherOntologies
                .filter((o) => !imports.includes(o.parsed!.iri))
                .map((o) => (
                  <option key={o.id} value={o.parsed!.iri}>{o.name}</option>
                ))}
            </select>
          </div>
        )}
        <div className={styles.importPickerRow}>
          <input
            className={styles.importInput}
            aria-label="External ontology IRI to import"
            value={newImportIri}
            onChange={(e) => setNewImportIri(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addImport(newImportIri); }}
            placeholder="or paste an external ontology IRI…"
          />
          <button className={styles.importAddButton} onClick={() => addImport(newImportIri)} disabled={!newImportIri.trim()}>
            Add
          </button>
        </div>
      </section>

      {/* Annotations: same behaviour as entity */}
      <section className={styles.protegePane}>
        <div className={cx(styles.protegePaneHeader, styles.ontologyAccent)}>Annotations: {activeOntologyName}</div>
        <div className={styles.annotationBody}>
          <div className={styles.annotationToolbar}>
            <span>Annotations</span>
            <button aria-label="Add ontology annotation" type="button" onClick={onAddAnnotation}>
              <Plus size={14} />
            </button>
          </div>
          {annotations.filter((a) => a.isUserAnnotation).length === 0 && (
            <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 13 }}>No annotations</p>
          )}
          <AnnotationRows annotations={annotations} onUpdate={onUpdateAnnotation} onRemove={onRemoveAnnotation} />
        </div>
      </section>

      {/* Metrics + Prefixes side-by-side */}
      <div className={styles.ontologyBottomGrid}>
        <section className={cx(styles.protegePane, styles.prefixPane)}>
          <div className={cx(styles.protegePaneHeader, styles.ontologyAccent)}>Ontology metrics</div>
          <div className={styles.metricsScroll}>
            <MetricsGroup
              title="Metrics"
              rows={[
                ["Axiom", metrics.totalAxioms],
                ["Logical axiom count", metrics.logicalAxioms],
                ["Declaration axioms count", metrics.declarationAxioms],
                ["Class count", metrics.classCount],
                ["Object property count", metrics.objectPropertyCount],
                ["Data property count", metrics.datatypePropertyCount],
                ["Individual count", metrics.individualCount],
                ["Annotation Property count", metrics.annotationPropertyCount]
              ]}
            />
            <MetricsGroup
              title="Class axioms"
              rows={[
                ["SubClassOf", metrics.classAxioms.subClassOf],
                ["EquivalentClasses", metrics.classAxioms.equivalentClasses],
                ["DisjointClasses", metrics.classAxioms.disjointClasses],
                ["DisjointUnion", metrics.classAxioms.disjointUnion]
              ]}
            />
            <MetricsGroup
              title="Object property axioms"
              rows={[
                ["SubObjectPropertyOf", metrics.objectPropertyAxioms.subObjectPropertyOf],
                ["InverseObjectProperties", metrics.objectPropertyAxioms.inverseOf],
                ["ObjectPropertyDomain", metrics.objectPropertyAxioms.domain],
                ["ObjectPropertyRange", metrics.objectPropertyAxioms.range],
                ["Characteristics", metrics.objectPropertyAxioms.characteristics]
              ]}
            />
            <MetricsGroup
              title="Data property axioms"
              rows={[
                ["SubDataPropertyOf", metrics.datatypePropertyAxioms.subDataPropertyOf],
                ["DataPropertyDomain", metrics.datatypePropertyAxioms.domain],
                ["DataPropertyRange", metrics.datatypePropertyAxioms.range],
                ["Characteristics", metrics.datatypePropertyAxioms.characteristics]
              ]}
            />
            <MetricsGroup
              title="Individual axioms"
              rows={[
                ["ClassAssertion", metrics.individualAxioms.classAssertions],
                ["SameIndividual", metrics.individualAxioms.sameIndividual],
                ["DifferentIndividuals", metrics.individualAxioms.differentIndividuals],
                ["ObjectPropertyAssertion", metrics.individualAxioms.objectAssertions],
                ["DataPropertyAssertion", metrics.individualAxioms.dataAssertions]
              ]}
            />
          </div>
        </section>

        <section className={cx(styles.protegePane, styles.prefixPane)}>
          <div className={cx(styles.protegePaneHeader, styles.ontologyAccent)}>
            <span style={{ flex: 1 }}>Ontology prefixes</span>
            <button
              className={styles.prefixAddButton}
              aria-label="Add prefix"
              title="Add prefix"
              onClick={addPrefix}
            >
              <Plus size={13} />
            </button>
          </div>
          <div className={styles.prefixEditRows}>
            {prefixes.map((entry) => (
              <div className={styles.prefixEditRow} key={entry.id}>
                <input
                  className={styles.prefixEditKey}
                  aria-label="Prefix"
                  value={entry.prefix}
                  onChange={(e) => updatePrefix(entry.id, "prefix", e.target.value)}
                  placeholder="prefix:"
                />
                <input
                  className={styles.prefixEditIri}
                  aria-label="IRI"
                  value={entry.iri}
                  onChange={(e) => updatePrefix(entry.id, "iri", e.target.value)}
                  placeholder="http://..."
                />
                <button
                  className={styles.axiomRemoveButton}
                  aria-label={`Remove prefix ${entry.prefix}`}
                  title={`Remove ${entry.prefix}`}
                  onClick={() => removePrefix(entry.id)}
                >
                  <Minus size={12} />
                </button>
              </div>
            ))}
            {prefixes.length === 0 && (
              <p style={{ margin: "8px 12px", color: "var(--muted)", fontSize: 13 }}>No prefixes</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricsGroup({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div className={styles.metricsGroup}>
      <h3>{title}</h3>
      {rows.map(([label, value]) => (
        <div className={styles.metricsRow} key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function HistoryView({ activities, onClear }: { activities: ActivityEntry[]; onClear: () => void }) {
  return (
    <section className={cx(styles.historyPanel, "card border-0 shadow-sm")} aria-label="Ontology history">
      <div className={styles.historyHeader}>
        <div>
          <p className={styles.contextLabel}>History</p>
          <h2>Ontology activity log</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>{activities.length} events</span>
          {activities.length > 0 && (
            <button
              onClick={onClear}
              title="Clear history"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "#fff", color: "var(--muted)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              <Trash2 size={13} /> Clear
            </button>
          )}
        </div>
      </div>
      <div className={styles.historyList}>
        {activities.map((activity) => (
          <article className={styles.historyRow} key={activity.id}>
            <span className={cx(styles.activityBadge, styles[activity.kind])}>{activity.kind}</span>
            <div>
              <strong>{activity.entityLabel}</strong>
              <p>{activity.detail}</p>
            </div>
            <time>{activity.timestamp.toLocaleString()}</time>
            {activity.entityKind && <small>{kindLabels[activity.entityKind]}</small>}
          </article>
        ))}
      </div>
    </section>
  );
}

type OntologyFlowNodeKind = "class" | "objectProperty" | "datatypeProperty" | "individual" | "datatype";

type OntologyFlowNodeData = {
  label: string;
  kind: OntologyFlowNodeKind;
  entityId?: string;
};

type OntologyFlowEdgeData = {
  label: string;
  kind: "class" | "objectProperty" | "datatypeProperty" | "individual";
};

type OntologyFlowNode = FlowNode<OntologyFlowNodeData, "ontologyNode">;
type OntologyFlowEdge = Edge<OntologyFlowEdgeData, "ontologyEdge">;

const ontologyNodeTypes: NodeTypes = {
  ontologyNode: OntologyGraphNode
};

const ontologyEdgeTypes: EdgeTypes = {
  ontologyEdge: OntologyGraphEdge
};

function OntologyGraphNode({ data, selected }: NodeProps<OntologyFlowNode>) {
  const shapeClass = data.kind === "objectProperty" || data.kind === "datatypeProperty" || data.kind === "datatype"
    ? styles.propertyShape
    : styles.kindDot;

  return (
    <div className={cx(styles.graphNode, styles[data.kind], selected && styles.selectedGraphNode)}>
      <Handle type="target" position={Position.Left} className={styles.flowHandle} />
      <span className={cx(shapeClass, styles[data.kind])} />
      <strong>{data.label}</strong>
      <Handle type="source" position={Position.Right} className={styles.flowHandle} />
    </div>
  );
}

function OntologyGraphEdge(props: EdgeProps<OntologyFlowEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath(props);
  const edgeKind = props.data?.kind ?? "class";

  return (
    <>
      <BaseEdge id={props.id} path={edgePath} markerEnd={props.markerEnd} className={cx(styles.graphEdgePath, styles[edgeKind])} />
      <EdgeLabelRenderer>
        <div
          className={cx(styles.graphEdgeHandle, styles[edgeKind])}
          style={{
            transform: `translate(-7px, -50%) translate(${labelX}px, ${labelY}px)`
          }}
        >
          <span className={styles.graphEdgeHandleDot} />
          <span>{props.data?.label}</span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const ROOT_NODE_ID = "__owl_thing__";

function OWLSourceView({
  entities,
  activeOntology
}: {
  entities: Entity[];
  activeOntology: import("./workspace/WorkspaceStore").WorkspaceOntology;
}) {
  const owlSource = React.useMemo(() => {
    if (!activeOntology?.parsed) return "";
    try {
      const updatedDoc = reverseEntitiesToOWLDoc(
        entities as import("./owl/parser").AppEntity[],
        activeOntology.parsed
      );
      return exportOWL(updatedDoc);
    } catch {
      return "// Error generating OWL source";
    }
  }, [entities, activeOntology]);

  function handleCopy() {
    navigator.clipboard.writeText(owlSource).catch(() => {});
  }

  function handleDownload() {
    const blob = new Blob([owlSource], { type: "application/rdf+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeOntology?.name ?? "ontology"}.owl`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Basic XML syntax highlighting via splitting on tags
  const highlighted = owlSource
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // re-mark XML tags: &lt;...&gt;
    .replace(/&lt;(\/?[\w:.-]+)([^&]*?)(\/?&gt;)/g,
      (_m, tag, attrs, close) => {
        const coloredAttrs = attrs.replace(/([\w:.-]+)(=)(&quot;[^&]*&quot;)/g,
          (_m2: string, attr: string, eq: string, val: string) =>
            `<span class="xml-attr">${attr}</span>${eq}<span class="xml-val">${val}</span>`
        );
        return `<span class="xml-tag">&lt;${tag}${coloredAttrs}${close}</span>`;
      }
    )
    // XML comments
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="xml-comment">$1</span>')
    // Processing instructions
    .replace(/(&lt;\?[\s\S]*?\?&gt;)/g, '<span class="xml-pi">$1</span>');

  return (
    <div className={styles.owlSourceView}>
      <div className={styles.owlSourceToolbar}>
        <span className={styles.owlSourceTitle}>
          <FileCode size={15} />
          OWL/RDF source — {activeOntology?.name ?? "ontology"}
        </span>
        <div className={styles.owlSourceActions}>
          <button className="btn btn-sm btn-light" onClick={handleCopy} title="Copy to clipboard">
            Copy
          </button>
          <button className="btn btn-sm btn-light" onClick={handleDownload} title="Download .owl file">
            Download
          </button>
        </div>
      </div>
      <pre
        className={styles.owlSourcePre}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  );
}

function OntologyVisual({
  activeOntologyName,
  classes,
  objectProperties,
  datatypeProperties,
  individuals,
  selectedId,
  onSelect
}: {
  activeOntologyName: string;
  classes: Entity[];
  objectProperties: Entity[];
  datatypeProperties: Entity[];
  individuals: Entity[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  // Track which class IDs have been expanded (double-clicked)
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set([ROOT_NODE_ID]));
  const [nodePositions, setNodePositions] = React.useState<Record<string, { x: number; y: number }>>({});

  // Reset when ontology changes
  const classCount = classes.length;
  React.useEffect(() => {
    setExpandedIds(new Set([ROOT_NODE_ID]));
    setNodePositions({});
  }, [classCount]);

  // Determine which class IDs are visible: a class is visible if its parent is expanded
  const visibleClassIds = React.useMemo(() => {
    const visible = new Set<string>();
    // Root-level classes (no parentId) are visible if ROOT_NODE_ID is expanded
    if (expandedIds.has(ROOT_NODE_ID)) {
      classes.filter((c) => !c.parentId).forEach((c) => visible.add(c.id));
    }
    // Deeper classes: visible if their direct parent is expanded
    classes.forEach((c) => {
      if (c.parentId && expandedIds.has(c.parentId)) visible.add(c.id);
    });
    return visible;
  }, [expandedIds, classes]);

  const visibleClasses = classes.filter((c) => visibleClassIds.has(c.id));
  const visibleClassLabelSet = new Set(visibleClasses.map((c) => c.label));

  // Object property range nodes for visible properties
  const visibleObjectProps = objectProperties.filter(
    (p) => (p.domain ?? []).some(d => visibleClassLabelSet.has(d))
  );
  const visibleDatatypeProps = datatypeProperties.filter(
    (p) => (p.domain ?? []).some(d => visibleClassLabelSet.has(d))
  );
  const visibleIndividuals = individuals.filter(
    (ind) => (ind.types ?? []).some((t) => visibleClassLabelSet.has(t))
  );

  const objectRangeLabels = Array.from(
    new Set(visibleObjectProps.flatMap((p) => p.range ?? []))
  ).filter((r) => !visibleClassLabelSet.has(r));
  const datatypeLabels = Array.from(
    new Set(visibleDatatypeProps.flatMap((p) => p.range ?? []))
  );

  // Build nodes
  const rootNode: OntologyFlowNode = {
    id: ROOT_NODE_ID,
    type: "ontologyNode",
    data: { label: "owl:Thing", kind: "class" },
    position: nodePositions[ROOT_NODE_ID] ?? { x: 300, y: 40 },
    width: 148, height: 40,
    measured: { width: 148, height: 40 },
  };

  const classNodes = visibleClasses.map((classItem, index) => {
    const hasChildren = classes.some((c) => c.parentId === classItem.id);
    const isExpanded = expandedIds.has(classItem.id);
    return {
      id: classItem.id,
      type: "ontologyNode" as const,
      data: {
        label: classItem.label + (hasChildren ? (isExpanded ? " ▾" : " ▸") : ""),
        kind: "class" as const,
        entityId: classItem.id
      },
      position: {
        x: 72 + getClassDepth(classes, classItem) * 220,
        y: 74 + index * 80
      },
      width: 148, height: 40,
      measured: { width: 148, height: 40 },
      selected: selectedId === classItem.id
    };
  });

  const objectRangeNodes = objectRangeLabels.map((label, index) => ({
    id: `object-range-${label}`,
    type: "ontologyNode" as const,
    data: { label, kind: "class" as const },
    position: { x: 780, y: 74 + index * 80 },
    width: 148, height: 40, measured: { width: 148, height: 40 }, selectable: false
  }));
  const datatypeNodes = datatypeLabels.map((label, index) => ({
    id: `datatype-${label}`,
    type: "ontologyNode" as const,
    data: { label, kind: "datatype" as const },
    position: { x: 780, y: 330 + index * 80 },
    width: 148, height: 40, measured: { width: 148, height: 40 }, selectable: false
  }));
  const individualNodes = visibleIndividuals.map((individual, index) => ({
    id: individual.id,
    type: "ontologyNode" as const,
    data: { label: displayName(individual), kind: "individual" as const, entityId: individual.id },
    position: { x: 780, y: 500 + index * 80 },
    width: 148, height: 40, measured: { width: 148, height: 40 },
    selected: selectedId === individual.id
  }));

  // Add a hint indicator to root node if it has expandable children
  const rootHasChildren = classes.some((c) => !c.parentId);
  rootNode.data = {
    ...rootNode.data,
    label: "owl:Thing" + (rootHasChildren ? (expandedIds.has(ROOT_NODE_ID) ? " ▾" : " ▸") : "")
  };

  const allNodes: OntologyFlowNode[] = [rootNode, ...classNodes, ...objectRangeNodes, ...datatypeNodes, ...individualNodes].map((node) => ({
    ...node,
    position: nodePositions[node.id] ?? node.position
  }));

  const nodeById = new Map(allNodes.map((node) => [node.id, node]));
  const classByLabel = new Map(
    allNodes
      .filter((node) => node.data.kind === "class" && !node.id.startsWith("object-range-"))
      .map((node) => [node.data.label.replace(/ [▸▾]$/, ""), node])
  );
  const rangeNodeByLabel = new Map(
    allNodes.filter((node) => node.id.startsWith("object-range-")).map((node) => [node.data.label, node])
  );
  const datatypeNodeByLabel = new Map(
    allNodes.filter((node) => node.id.startsWith("datatype-")).map((node) => [node.data.label, node])
  );

  const flowEdges = [
    // owl:Thing → root-level classes
    ...visibleClasses
      .filter((c) => !c.parentId)
      .flatMap((c) => {
        const to = nodeById.get(c.id);
        return to ? [createOntologyEdge(`sub-${c.id}`, ROOT_NODE_ID, to.id, "subClassOf", "class")] : [];
      }),
    // class → subclass edges
    ...visibleClasses
      .filter((c) => c.parentId)
      .flatMap((c) => {
        const from = nodeById.get(c.parentId!);
        const to = nodeById.get(c.id);
        return from && to ? [createOntologyEdge(`sub-${c.id}`, from.id, to.id, "subClassOf", "class")] : [];
      }),
    ...visibleObjectProps.flatMap((property) =>
      (property.domain ?? []).flatMap((d, di) =>
        (property.range ?? []).flatMap((r, ri) => {
          const from = classByLabel.get(d);
          const to = classByLabel.get(r) ?? rangeNodeByLabel.get(r);
          return from && to ? [createOntologyEdge(`obj-${property.id}-${di}-${ri}`, from.id, to.id, property.label, "objectProperty")] : [];
        })
      )
    ),
    ...visibleDatatypeProps.flatMap((property) =>
      (property.domain ?? []).flatMap((d, di) =>
        (property.range ?? []).flatMap((r, ri) => {
          const from = classByLabel.get(d);
          const to = datatypeNodeByLabel.get(r);
          return from && to ? [createOntologyEdge(`data-${property.id}-${di}-${ri}`, from.id, to.id, property.label, "datatypeProperty")] : [];
        })
      )
    ),
    ...visibleIndividuals.flatMap((individual) =>
      (individual.types ?? []).flatMap((type) => {
        const from = nodeById.get(individual.id);
        const to = classByLabel.get(type);
        return from && to ? [createOntologyEdge(`type-${individual.id}-${type}`, from.id, to.id, "type", "individual")] : [];
      })
    )
  ] satisfies OntologyFlowEdge[];

  const onNodesChange = React.useCallback((changes: NodeChange<OntologyFlowNode>[]) => {
    setNodePositions((current) => {
      const next = { ...current };
      changes.forEach((change) => {
        if (change.type === "position" && change.position) {
          next[change.id] = change.position;
        }
      });
      return next;
    });
  }, []);

  const onNodeDoubleClick = React.useCallback((_: React.MouseEvent, node: OntologyFlowNode) => {
    const nodeId = node.id;
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        // Collapse: remove this node and all its descendants
        const toRemove = new Set<string>();
        const queue = [nodeId];
        while (queue.length) {
          const id = queue.pop()!;
          toRemove.add(id);
          classes.filter((c) => c.parentId === id).forEach((c) => queue.push(c.id));
        }
        toRemove.forEach((id) => next.delete(id));
      } else {
        next.add(nodeId);
      }
      return next;
    });
    // Also select the entity
    if (node.data.entityId) onSelect(node.data.entityId);
  }, [classes, onSelect]);

  return (
    <div className={styles.visualPanel}>
      <div className={styles.visualHeader}>
        <div>
          <p className={styles.contextLabel}>Ontology visual representation · double-click a node to expand/collapse</p>
          <h2>{activeOntologyName} graph</h2>
        </div>
        <div className={styles.visualLegend} aria-label="Graph legend">
          <span><i className={styles.class} />Class</span>
          <span><i className={styles.objectProperty} />Object property</span>
          <span><i className={styles.datatypeProperty} />Datatype property</span>
          <span><i className={styles.individual} />Individual</span>
        </div>
      </div>
      <div className={styles.graphViewport}>
        <ReactFlow
          nodes={allNodes}
          edges={flowEdges}
          nodeTypes={ontologyNodeTypes}
          edgeTypes={ontologyEdgeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => node.data.entityId && onSelect(node.data.entityId)}
          onNodeDoubleClick={onNodeDoubleClick}
          nodesDraggable
          edgesFocusable
          fitView
          fitViewOptions={{ padding: 0.22 }}
          minZoom={0.4}
          maxZoom={1.8}
          proOptions={{ hideAttribution: true }}
        >
          <MiniMap pannable zoomable nodeClassName={(node) => styles[(node.data as OntologyFlowNodeData).kind]} />
          <Controls showInteractive={false} />
          <Background gap={18} size={1} color="#dfe7e3" />
        </ReactFlow>
      </div>
    </div>
  );
}

function createOntologyEdge(
  id: string,
  source: string,
  target: string,
  label: string,
  kind: OntologyFlowEdgeData["kind"]
): OntologyFlowEdge {
  return {
    id,
    source,
    target,
    type: "ontologyEdge",
    data: {
      label,
      kind
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: getEdgeColor(kind)
    }
  };
}

function getEdgeColor(kind: OntologyFlowEdgeData["kind"]) {
  switch (kind) {
    case "class":
      return "#d0a500";
    case "objectProperty":
      return "#087fb7";
    case "datatypeProperty":
      return "#2fa34a";
    case "individual":
      return "#91479a";
  }
}

function ClassTree({
  classes,
  selectedId,
  collapsedClassIds,
  parentId,
  onSelect,
  onToggle,
  onAddRoot,
  onAddChild,
  onRemove
}: {
  classes: Entity[];
  selectedId: string;
  collapsedClassIds: Set<string>;
  parentId?: string;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onAddRoot?: () => void;
  onAddChild?: (parentId: string) => void;
  onRemove?: (id: string) => void;
}) {
  const children = classes.filter((classItem) => classItem.parentId === parentId);

  if (children.length === 0 && parentId !== undefined) {
    return null;
  }

  function renderClassItem(classItem: Entity) {
    const hasChildren = classes.some((candidate) => candidate.parentId === classItem.id);
    const isCollapsed = collapsedClassIds.has(classItem.id);
    const readOnly = !!classItem.readOnly;
    return (
      <li key={classItem.id} className={styles.propertyTreeRow}>
        <button
          className={cx(styles.treeNode, selectedId === classItem.id && styles.activeNode, readOnly && styles.readOnlyTreeNode)}
          onClick={() => onSelect(classItem.id)}
          style={{ flex: 1 }}
          title={readOnly ? `Imported from ${classItem.importedFrom} — read-only` : undefined}
        >
          <span
            className={styles.treeToggle}
            role={hasChildren ? "button" : undefined}
            aria-label={hasChildren ? `${isCollapsed ? "Expand" : "Collapse"} ${classItem.label}` : undefined}
            onClick={(event) => {
              if (!hasChildren) return;
              event.stopPropagation();
              onToggle(classItem.id);
            }}
          >
            {hasChildren && (isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />)}
          </span>
          <span className={styles.classIcon} />
          <span>{classItem.label}</span>
          {readOnly && <Lock size={10} className={styles.readOnlyLockIcon} aria-label="Read-only (imported)" />}
        </button>
        {onAddChild && !readOnly && (
          <button
            className={styles.propertyTreeAddBtn}
            title={`Add child class under ${classItem.label}`}
            onClick={(e) => { e.stopPropagation(); onAddChild(classItem.id); }}
          >
            <CornerDownRight size={11} />
          </button>
        )}
        {onRemove && !readOnly && (
          <button
            className={styles.propertyTreeRemoveBtn}
            title={`Remove ${classItem.label}`}
            onClick={(e) => { e.stopPropagation(); onRemove(classItem.id); }}
          >
            <Minus size={11} />
          </button>
        )}
        {!isCollapsed && (
          <ClassTree
            classes={classes}
            selectedId={selectedId}
            collapsedClassIds={collapsedClassIds}
            parentId={classItem.id}
            onSelect={onSelect}
            onToggle={onToggle}
            onAddChild={onAddChild}
            onRemove={onRemove}
          />
        )}
      </li>
    );
  }

  if (parentId === undefined) {
    return (
      <ul className={cx(styles.classTree, styles.rootTree)}>
        <li>
          <div className={styles.thingNode}>
            <ChevronDown size={15} />
            <span className={styles.thingIcon} />
            <span style={{ flex: 1 }}>owl:Thing</span>
            {onAddRoot && (
              <button
                className={styles.individualGroupAddBtn}
                title="Add root class"
                onClick={(e) => { e.stopPropagation(); onAddRoot(); }}
              >
                <Plus size={11} />
              </button>
            )}
          </div>
          <ul className={styles.classTree}>{children.map(renderClassItem)}</ul>
        </li>
      </ul>
    );
  }

  return (
    <ul className={styles.classTree}>
      {children.map(renderClassItem)}
    </ul>
  );
}

function PropertyHierarchyTabs({
  activeTab,
  objectProperties,
  datatypeProperties,
  individuals,
  classes,
  selectedEntity,
  selectedId,
  collapsedPropertyIds,
  onTabChange,
  onSelect,
  onToggle,
  onAddRootProperty,
  onAddChildProperty,
  onRemoveSelectedProperty,
  onRemoveProperty,
  onAddIndividual,
  onRemoveIndividual
}: {
  activeTab: NavigatorTab;
  objectProperties: Entity[];
  datatypeProperties: Entity[];
  individuals: Entity[];
  classes: Entity[];
  selectedEntity: Entity;
  selectedId: string;
  collapsedPropertyIds: Set<string>;
  onTabChange: (kind: NavigatorTab) => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onAddRootProperty: (kind: PropertyKind) => void;
  onAddChildProperty: (kind: PropertyKind, parentId: string) => void;
  onRemoveSelectedProperty: (kind: PropertyKind) => void;
  onRemoveProperty: (id: string) => void;
  onAddIndividual: (typeName: string) => void;
  onRemoveIndividual: (id: string) => void;
}) {
  const isIndividualTab = activeTab === "individual";
  const isObjectTab = activeTab === "objectProperty";
  const properties = isObjectTab ? objectProperties : datatypeProperties;
  const rootLabel = isObjectTab ? "owl:topObjectProperty" : "owl:topDataProperty";
  const canMutateActiveTree = !isIndividualTab && selectedEntity.kind === activeTab;
  const [rootCollapsed, setRootCollapsed] = React.useState(false);

  // Group individuals by their first type (class label)
  const individualsByType = React.useMemo(() => {
    const map = new Map<string, Entity[]>();
    for (const ind of individuals) {
      const types = ind.types ?? [];
      const key = types.length > 0 ? types[0] : "(No type)";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ind);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [individuals]);

  return (
    <section className={cx(styles.navigatorPanel, styles.propertyTabbedPanel, "card border-0 shadow-sm")} aria-label="Property hierarchy panel">
      <div className={styles.propertyTabs} role="tablist" aria-label="Property hierarchy tabs">
        <button
          className={activeTab === "objectProperty" ? styles.activePropertyTab : undefined}
          type="button" role="tab"
          aria-selected={activeTab === "objectProperty"}
          title="Object property hierarchy"
          onClick={() => onTabChange("objectProperty")}
        >
          Object property hierarchy
        </button>
        <button
          className={activeTab === "datatypeProperty" ? styles.activePropertyTab : undefined}
          type="button" role="tab"
          aria-selected={activeTab === "datatypeProperty"}
          title="Data property hierarchy"
          onClick={() => onTabChange("datatypeProperty")}
        >
          Data property hierarchy
        </button>
        <button
          className={activeTab === "individual" ? styles.activePropertyTab : undefined}
          type="button" role="tab"
          aria-selected={activeTab === "individual"}
          title="Individuals by type"
          onClick={() => onTabChange("individual")}
        >
          Individuals by type
        </button>
      </div>

      {isIndividualTab ? (
        <>
          <div className={cx(styles.propertyHierarchyTitle, styles.individualTitle)}>
            Individuals by type
          </div>
          <div className={cx(styles.treeViewport, styles.propertyTabbedTreeViewport)}>
            {individualsByType.length === 0 && <div className={styles.emptyTreeNode}>No individuals</div>}
            <ul className={styles.propertyTree}>
              {individualsByType.map(([typeName, members]) => (
                <IndividualTypeGroup
                  key={typeName}
                  typeName={typeName}
                  members={members}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onAddIndividual={onAddIndividual}
                  onRemoveIndividual={onRemoveIndividual}
                />
              ))}
            </ul>
          </div>
        </>
      ) : (
        <>
          <div className={cx(styles.propertyHierarchyTitle, isObjectTab ? styles.objectPropertyTitle : styles.datatypePropertyTitle)}>
            {isObjectTab ? "Object property hierarchy" : "Data property hierarchy"}: {rootLabel}
          </div>
          <div className={cx(styles.treeViewport, styles.propertyTabbedTreeViewport)}>
            <ul className={styles.propertyTree}>
              <li>
                <div className={styles.propertyRootNode} onClick={() => setRootCollapsed(c => !c)} style={{ cursor: "pointer" }}>
                  {rootCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                  <span className={cx(styles.propertyShape, styles[activeTab])} />
                  <span style={{ flex: 1 }}>{rootLabel}</span>
                  <small>{properties.length}</small>
                  <button
                    className={styles.individualGroupAddBtn}
                    title={`Add root ${isObjectTab ? "object property" : "data property"}`}
                    onClick={(e) => { e.stopPropagation(); onAddRootProperty(activeTab as PropertyKind); }}
                  >
                    <Plus size={11} />
                  </button>
                </div>
                {!rootCollapsed && (
                  <>
                    <PropertyTree
                      properties={properties}
                      selectedId={selectedId}
                      collapsedPropertyIds={collapsedPropertyIds}
                      parentId={undefined}
                      onSelect={onSelect}
                      onToggle={onToggle}
                      onAddChild={(parentId) => onAddChildProperty(activeTab as PropertyKind, parentId)}
                      onRemove={onRemoveProperty}
                    />
                    {properties.length === 0 && <div className={styles.emptyTreeNode}>No properties</div>}
                  </>
                )}
              </li>
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

function IndividualTypeGroup({
  typeName,
  members,
  selectedId,
  onSelect,
  onAddIndividual,
  onRemoveIndividual
}: {
  typeName: string;
  members: Entity[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAddIndividual: (typeName: string) => void;
  onRemoveIndividual: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  return (
    <li>
      <div className={styles.propertyRootNode} onClick={() => setCollapsed((c) => !c)} style={{ cursor: "pointer" }}>
        {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        <span className={cx(styles.kindDot, styles.class)} />
        <span style={{ flex: 1 }}>{typeName}</span>
        <small>{members.length}</small>
        <button
          className={styles.individualGroupAddBtn}
          title={`Add individual of type ${typeName}`}
          onClick={(e) => { e.stopPropagation(); onAddIndividual(typeName); }}
        >
          <Plus size={11} />
        </button>
      </div>
      {!collapsed && (
        <ul className={cx(styles.propertyTree, styles.propertyChildren)}>
          {members.map((ind) => (
            <li key={ind.id} className={styles.individualGroupRow}>
              <button
                className={cx(styles.treeNode, selectedId === ind.id && styles.activeNode)}
                onClick={() => onSelect(ind.id)}
                style={{ flex: 1 }}
              >
                <span className={cx(styles.kindDot, styles.individual)} />
                <span>{displayName(ind)}</span>
              </button>
              <button
                className={styles.individualRemoveBtn}
                title={`Remove ${ind.label}`}
                onClick={(e) => { e.stopPropagation(); onRemoveIndividual(ind.id); }}
              >
                <Minus size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function NavigatorColumn({
  classes,
  individuals,
  selectedId,
  selected,
  collapsedClassIds,
  propertyTab,
  objectProperties,
  datatypeProperties,
  collapsedPropertyIds,
  onSelectEntity,
  onToggleClass,
  onToggleProperty,
  onSetPropertyTab,
  onAddEntity,
  onRemoveSelectedTreeEntity,
  onRemoveProperty,
  onAddIndividual,
  onRemoveIndividual
}: {
  classes: Entity[];
  individuals: Entity[];
  selectedId: string;
  selected: Entity;
  collapsedClassIds: Set<string>;
  propertyTab: NavigatorTab;
  objectProperties: Entity[];
  datatypeProperties: Entity[];
  collapsedPropertyIds: Set<string>;
  onSelectEntity: (id: string) => void;
  onToggleClass: (id: string) => void;
  onToggleProperty: (id: string) => void;
  onSetPropertyTab: (kind: NavigatorTab) => void;
  onAddEntity: (kind: OntologyItemKind, parentId?: string) => void;
  onRemoveSelectedTreeEntity: (kind: "class" | PropertyKind) => void;
  onRemoveProperty: (id: string) => void;
  onAddIndividual: (typeName: string) => void;
  onRemoveIndividual: (id: string) => void;
}) {
  const MIN_PX = 120;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [classFraction, setClassFraction] = React.useState(0.42);
  const dragging = React.useRef(false);

  function onDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    function onMouseMove(ev: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const raw = (ev.clientY - rect.top) / rect.height;
      const minFrac = MIN_PX / rect.height;
      const maxFrac = 1 - MIN_PX / rect.height;
      setClassFraction(Math.min(Math.max(raw, minFrac), maxFrac));
    }

    function onMouseUp() {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div ref={containerRef} className={styles.navigatorColumn} aria-label="Ontology IDE navigator">
      <section
        className={cx(styles.navigatorPanel, "card border-0 shadow-sm")}
        style={{ height: `calc(${classFraction * 100}% - 5px)` }}
        aria-label="Classes panel"
      >
        <div className={styles.panelHeading}>
          <div>
            <p className={styles.contextLabel}>Classes</p>
          </div>
        </div>

        <div className={styles.treeViewport} style={{ maxHeight: "none", flex: 1 }}>
          <ClassTree
            classes={classes}
            selectedId={selectedId}
            collapsedClassIds={collapsedClassIds}
            parentId={undefined}
            onSelect={onSelectEntity}
            onToggle={onToggleClass}
            onAddRoot={() => onAddEntity("class")}
            onAddChild={(parentId) => onAddEntity("class", parentId)}
            onRemove={onRemoveProperty}
          />
        </div>
      </section>

      <div
        className={styles.panelDivider}
        aria-hidden="true"
        onMouseDown={onDividerMouseDown}
      />

      <div style={{ flex: 1, minHeight: 0 }}>
        <PropertyHierarchyTabs
          activeTab={propertyTab}
          objectProperties={objectProperties}
          datatypeProperties={datatypeProperties}
          individuals={individuals}
          classes={classes}
          selectedId={selectedId}
          collapsedPropertyIds={collapsedPropertyIds}
          selectedEntity={selected}
          onTabChange={onSetPropertyTab}
          onSelect={onSelectEntity}
          onToggle={onToggleProperty}
          onAddRootProperty={onAddEntity}
          onAddChildProperty={onAddEntity}
          onRemoveSelectedProperty={onRemoveSelectedTreeEntity}
          onRemoveProperty={onRemoveProperty}
          onAddIndividual={onAddIndividual}
          onRemoveIndividual={onRemoveIndividual}
        />
      </div>
    </div>
  );
}

function PropertyPanel({
  kind,
  title,
  rootLabel,
  properties,
  selectedEntity,
  selectedId,
  collapsedPropertyIds,
  onSelect,
  onToggle,
  onAddRootProperty,
  onAddChildProperty,
  onRemoveSelectedProperty,
  onRemoveProperty
}: {
  kind: PropertyKind;
  title: string;
  rootLabel: string;
  properties: Entity[];
  selectedEntity: Entity;
  selectedId: string;
  collapsedPropertyIds: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onAddRootProperty: (kind: PropertyKind) => void;
  onAddChildProperty: (kind: PropertyKind, parentId: string) => void;
  onRemoveSelectedProperty: (kind: PropertyKind) => void;
  onRemoveProperty: (id: string) => void;
}) {
  const [rootCollapsed, setRootCollapsed] = React.useState(false);

  return (
    <section className={cx(styles.navigatorPanel, "card border-0 shadow-sm")} aria-label={`${title} panel`}>
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.contextLabel}>{title}</p>
          <h2>{rootLabel}</h2>
        </div>
      </div>
      <div className={styles.treeViewport}>
        <ul className={styles.propertyTree}>
          <li>
            <div className={styles.propertyRootNode} onClick={() => setRootCollapsed(c => !c)} style={{ cursor: "pointer" }}>
              {rootCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
              <span className={cx(styles.propertyShape, styles[kind])} />
              <span style={{ flex: 1 }}>{rootLabel}</span>
              <small>{properties.length}</small>
              <button
                className={styles.individualGroupAddBtn}
                title={`Add root ${title}`}
                onClick={(e) => { e.stopPropagation(); onAddRootProperty(kind); }}
              >
                <Plus size={11} />
              </button>
            </div>
            {!rootCollapsed && (
              <>
                <PropertyTree
                  properties={properties}
                  selectedId={selectedId}
                  collapsedPropertyIds={collapsedPropertyIds}
                  parentId={undefined}
                  onSelect={onSelect}
                  onToggle={onToggle}
                  onAddChild={(parentId) => onAddChildProperty(kind, parentId)}
                  onRemove={onRemoveProperty}
                />
                {properties.length === 0 && <div className={styles.emptyTreeNode}>No properties</div>}
              </>
            )}
          </li>
        </ul>
      </div>
    </section>
  );
}

function PropertyTree({
  properties,
  selectedId,
  collapsedPropertyIds,
  parentId,
  onSelect,
  onToggle,
  onAddChild,
  onRemove
}: {
  properties: Entity[];
  selectedId: string;
  collapsedPropertyIds: Set<string>;
  parentId?: string;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onAddChild?: (parentId: string) => void;
  onRemove?: (id: string) => void;
}) {
  const children = properties.filter((property) => {
    if (parentId !== undefined) {
      return property.parentId === parentId;
    }
    return !property.parentId || !properties.some((candidate) => candidate.id === property.parentId);
  });

  if (children.length === 0) {
    return null;
  }

  return (
    <ul className={styles.propertyChildren}>
      {children.map((property) => {
        const hasChildren = properties.some((candidate) => candidate.parentId === property.id);
        const isCollapsed = collapsedPropertyIds.has(property.id);
        const readOnly = !!property.readOnly;
        return (
          <li key={property.id} className={styles.propertyTreeRow}>
            <button
              className={cx(styles.treeNode, selectedId === property.id && styles.activeNode, readOnly && styles.readOnlyTreeNode)}
              onClick={() => onSelect(property.id)}
              style={{ flex: 1 }}
              title={readOnly ? `Imported from ${property.importedFrom} — read-only` : undefined}
            >
              <span
                className={styles.treeToggle}
                role={hasChildren ? "button" : undefined}
                aria-label={hasChildren ? `${isCollapsed ? "Expand" : "Collapse"} ${property.label}` : undefined}
                onClick={(event) => {
                  if (!hasChildren) return;
                  event.stopPropagation();
                  onToggle(property.id);
                }}
              >
                {hasChildren && (isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />)}
              </span>
              <span className={cx(styles.propertyShape, styles[property.kind])} />
              <span>
                {property.label}
                <small className={styles.propertyMeta}>
                  {(property.domain ?? []).join(", ")}{(property.domain?.length ?? 0) > 0 && (property.range?.length ?? 0) > 0 ? " → " : ""}{(property.range ?? []).join(", ")}
                </small>
                {readOnly && <Lock size={10} className={styles.readOnlyLockIcon} aria-label="Read-only (imported)" />}
              </span>
            </button>
            {onAddChild && !readOnly && (
              <button
                className={styles.propertyTreeAddBtn}
                title={`Add child property under ${property.label}`}
                onClick={(e) => { e.stopPropagation(); onAddChild(property.id); }}
              >
                <CornerDownRight size={11} />
              </button>
            )}
            {onRemove && !readOnly && (
              <button
                className={styles.propertyTreeRemoveBtn}
                title={`Remove ${property.label}`}
                onClick={(e) => { e.stopPropagation(); onRemove(property.id); }}
              >
                <Minus size={11} />
              </button>
            )}
            {hasChildren && !isCollapsed && (
              <PropertyTree
                properties={properties}
                selectedId={selectedId}
                collapsedPropertyIds={collapsedPropertyIds}
                parentId={property.id}
                onSelect={onSelect}
                onToggle={onToggle}
                onAddChild={onAddChild}
                onRemove={onRemove}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

const readOnlyAccentByKind: Partial<Record<OntologyItemKind, string>> = {
  class: "classAccent",
  objectProperty: "objectAccent",
  datatypeProperty: "datatypeAccent",
  individual: "individualAccent",
};

function ReadOnlyEntityPanel({ selected }: { selected: Entity }) {
  const accentClass = (styles as Record<string, string>)[readOnlyAccentByKind[selected.kind] ?? "classAccent"];
  return (
    <div className={cx(styles.protegeEditor)} aria-label={`Imported ${kindLabels[selected.kind].toLowerCase()} (read-only)`}>
      <div className={styles.protegeTitleBar}>
        <Lock size={14} />
        <input aria-label={`${kindLabels[selected.kind]} name`} value={selected.label} readOnly style={{ flex: 1 }} />
        <span className={cx(styles.status, styles[selected.kind])}>{kindLabels[selected.kind]}</span>
      </div>
      <section className={styles.protegePane}>
        <div className={cx(styles.protegePaneHeader, accentClass)}>
          Imported from {selected.importedFrom ?? "another ontology"} — read-only
        </div>
        <div style={{ padding: 12, display: "grid", gap: 10 }}>
          <label>
            <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>IRI local name</span>
            <input value={selected.iriLocalName ?? ""} readOnly style={{ width: "100%" }} />
          </label>
          <label>
            <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Description</span>
            <input value={selected.description ?? ""} readOnly placeholder="No description" style={{ width: "100%" }} />
          </label>
          {(selected.kind === "objectProperty" || selected.kind === "datatypeProperty") && (
            <>
              <div>
                <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Domain</span>
                {(selected.domain ?? []).length === 0
                  ? <span className={styles.emptyAxiom}>No domain</span>
                  : (selected.domain ?? []).map((d) => <div key={d}>{d}</div>)}
              </div>
              <div>
                <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Range</span>
                {(selected.range ?? []).length === 0
                  ? <span className={styles.emptyAxiom}>No range</span>
                  : (selected.range ?? []).map((r) => <div key={r}>{r}</div>)}
              </div>
            </>
          )}
          {selected.kind === "individual" && (
            <div>
              <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Types</span>
              {(selected.types ?? []).length === 0
                ? <span className={styles.emptyAxiom}>No types</span>
                : (selected.types ?? []).map((t) => <div key={t}>{t}</div>)}
            </div>
          )}
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>
            This {kindLabels[selected.kind].toLowerCase()} belongs to an imported ontology and can't be edited from here. Open it in its own ontology to make changes.
          </p>
        </div>
      </section>
    </div>
  );
}

function ReadOnlyClassPanel({ selectedClass, superClasses }: { selectedClass: Entity; superClasses: Entity[] }) {
  return (
    <div className={cx(styles.protegeEditor)} aria-label="Imported class (read-only)">
      <div className={styles.protegeTitleBar}>
        <Lock size={14} />
        <input aria-label="Class name" value={selectedClass.label} readOnly style={{ flex: 1 }} />
        <span className={cx(styles.status, styles.class)}>Class</span>
      </div>
      <section className={styles.protegePane}>
        <div className={cx(styles.protegePaneHeader, styles.classAccent)}>
          Imported from {selectedClass.importedFrom ?? "another ontology"} — read-only
        </div>
        <div style={{ padding: 12, display: "grid", gap: 10 }}>
          <label>
            <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>IRI local name</span>
            <input value={selectedClass.iriLocalName ?? ""} readOnly style={{ width: "100%" }} />
          </label>
          <label>
            <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Description</span>
            <input value={selectedClass.description ?? ""} readOnly placeholder="No description" style={{ width: "100%" }} />
          </label>
          <div>
            <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>SubClass Of</span>
            {superClasses.length === 0
              ? <span className={styles.emptyAxiom}>owl:Thing</span>
              : superClasses.map((c) => <div key={c.id}>{c.label}</div>)}
          </div>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>
            This class belongs to an imported ontology and can't be edited from here. Open it in its own ontology to make changes.
          </p>
        </div>
      </section>
    </div>
  );
}

function ClassRelatedPanels({
  selectedClass,
  classes,
  properties,
  objectProperties,
  datatypeProperties,
  annotations,
  individuals,
  equivalentClasses,
  disjointWithClasses,
  disjointUnionClasses,
  superClasses,
  allIndividuals,
  onUpdate,
  onSelect,
  onAddAnnotation,
  onUpdateAnnotation,
  onRemoveAnnotation,
  onAttachProperty,
  onDetachProperty,
  onAttachEquivalentClass,
  onDetachEquivalentClass,
  onAttachDisjointWithClass,
  onDetachDisjointWithClass,
  onAttachDisjointUnionClass,
  onDetachDisjointUnionClass,
  onAttachSuperClass,
  onDetachSuperClass,
  onAttachIndividual,
  onDetachIndividual,
  onCreateIndividual
}: {
  selectedClass: Entity;
  classes: Entity[];
  properties: Entity[];
  objectProperties: Entity[];
  datatypeProperties: Entity[];
  annotations: Entity[];
  individuals: Entity[];
  equivalentClasses: Entity[];
  disjointWithClasses: Entity[];
  disjointUnionClasses: Entity[];
  superClasses: Entity[];
  allIndividuals: Entity[];
  onUpdate: (patch: Partial<Entity>) => void;
  onSelect: (id: string) => void;
  onAddAnnotation: () => void;
  onUpdateAnnotation: (annotationId: string, patch: Partial<Entity>) => void;
  onRemoveAnnotation: (annotationId: string) => void;
  onAttachProperty: (propertyId: string) => void;
  onDetachProperty: (propertyId: string) => void;
  onAttachEquivalentClass: (classId: string) => void;
  onDetachEquivalentClass: (classId: string) => void;
  onAttachDisjointWithClass: (classId: string) => void;
  onDetachDisjointWithClass: (classId: string) => void;
  onAttachDisjointUnionClass: (classId: string) => void;
  onDetachDisjointUnionClass: (classId: string) => void;
  onAttachSuperClass: (classId: string) => void;
  onDetachSuperClass: (classId: string) => void;
  onAttachIndividual: (individualId: string) => void;
  onDetachIndividual: (individualId: string) => void;
  onCreateIndividual: () => void;
}) {
  const relatedObjectProperties = properties.filter((property) => property.kind === "objectProperty");
  const relatedDatatypeProperties = properties.filter((property) => property.kind === "datatypeProperty");
  const availableObjectProperties = objectProperties;
  const availableDatatypeProperties = datatypeProperties;
  const availableEquivalentClasses = classes.filter(
    (classItem) => classItem.id !== selectedClass.id && !(selectedClass.equivalentClassIds ?? []).includes(classItem.id)
  );
  const availableDisjointWithClasses = classes.filter(
    (classItem) => classItem.id !== selectedClass.id && !(selectedClass.disjointWithClassIds ?? []).includes(classItem.id)
  );
  const availableDisjointUnionClasses = classes.filter(
    (classItem) => classItem.id !== selectedClass.id && !(selectedClass.disjointUnionClassIds ?? []).includes(classItem.id)
  );
  const availableParentClasses = classes.filter(
    (classItem) =>
      classItem.id !== selectedClass.id &&
      ![selectedClass.parentId, ...(selectedClass.superClassIds ?? [])].filter(Boolean).includes(classItem.id)
  );
  const availableIndividuals = allIndividuals.filter(
    (individual) => !(individual.types ?? []).includes(selectedClass.label)
  );

  return (
    <div className={styles.protegeEditor}>
      <div className={styles.protegeTitleBar}>
        <span className={styles.classIcon} />
        <input
          aria-label="Class name"
          value={selectedClass.label}
          onChange={(event) => onUpdate({ label: event.target.value })}
        />
        <span className={cx(styles.status, styles.class)}>Class</span>
      </div>

      <section className={styles.protegePane}>
        <div className={cx(styles.protegePaneHeader, styles.classAccent)}>Annotations: {selectedClass.label}</div>
        <div className={styles.annotationBody}>
          <div className={styles.annotationToolbar}>
            <span>Annotations</span>
            <button aria-label="Create annotation" title="Create annotation" onClick={onAddAnnotation}>
              <Plus size={14} />
            </button>
          </div>
          <div className={styles.annotationValueFrame}>
            <label className={styles.annotationValue}>
              <strong>rdfs:comment</strong>
              <span>[language: en]</span>
              <textarea value={selectedClass.description} onChange={(event) => onUpdate({ description: event.target.value })} />
            </label>
            <button className={styles.axiomRemoveButton} aria-label="Remove rdfs:comment" title="Remove rdfs:comment" onClick={() => onUpdate({ description: "" })}>
              <Minus size={12} />
            </button>
          </div>
          <AnnotationRows annotations={annotations} onUpdate={onUpdateAnnotation} onRemove={onRemoveAnnotation} />
        </div>
      </section>

      <section className={styles.protegePane}>
        <div className={cx(styles.protegePaneHeader, styles.classAccent)}>Description: {selectedClass.label}</div>
        <div className={styles.axiomRows}>
          <ClassEntityListRow
            label="Equivalent To"
            values={equivalentClasses}
            markerClass={styles.class}
            emptyText="No axioms"
            action={
              <EntityPickerButton
                label="Add equivalent class"
                options={availableEquivalentClasses}
                markerClass={styles.class}
                emptyText="No available classes"
                onSelect={onAttachEquivalentClass}
              />
            }
            onSelect={onSelect}
            onRemove={onDetachEquivalentClass}
          />
          <ClassParentRow
            superClasses={superClasses}
            availableClasses={availableParentClasses}
            onAdd={onAttachSuperClass}
            onRemove={onDetachSuperClass}
            onSelect={onSelect}
          />
          <ClassEntityListRow
            label="Object properties"
            values={relatedObjectProperties}
            markerClass={styles.objectProperty}
            emptyText="No object properties"
            action={
              <EntityPickerButton
                label="Add object property"
                options={availableObjectProperties}
                markerClass={styles.objectProperty}
                emptyText="No available object properties"
                onSelect={onAttachProperty}
              />
            }
            onSelect={onSelect}
            onRemove={onDetachProperty}
          />
          <ClassEntityListRow
            label="Datatype properties"
            values={relatedDatatypeProperties}
            markerClass={styles.datatypeProperty}
            emptyText="No datatype properties"
            action={
              <EntityPickerButton
                label="Add datatype property"
                options={availableDatatypeProperties}
                markerClass={styles.datatypeProperty}
                emptyText="No available datatype properties"
                onSelect={onAttachProperty}
              />
            }
            onSelect={onSelect}
            onRemove={onDetachProperty}
          />
          <ClassEntityListRow
            label="Instances"
            values={individuals}
            markerClass={styles.individual}
            emptyText="No instances"
            action={
              <EntityPickerButton
                label="Add instance"
                options={availableIndividuals}
                markerClass={styles.individual}
                emptyText="No available individuals"
                onSelect={onAttachIndividual}
                onCreate={onCreateIndividual}
              />
            }
            onSelect={onSelect}
            onRemove={onDetachIndividual}
          />
          <ClassEntityListRow
            label="Disjoint With"
            values={disjointWithClasses}
            markerClass={styles.class}
            emptyText="No axioms"
            action={
              <EntityPickerButton
                label="Add disjoint class"
                options={availableDisjointWithClasses}
                markerClass={styles.class}
                emptyText="No available classes"
                onSelect={onAttachDisjointWithClass}
              />
            }
            onSelect={onSelect}
            onRemove={onDetachDisjointWithClass}
          />
          <ClassEntityListRow
            label="Disjoint Union Of"
            values={disjointUnionClasses}
            markerClass={styles.class}
            emptyText="No axioms"
            action={
              <EntityPickerButton
                label="Add disjoint union class"
                options={availableDisjointUnionClasses}
                markerClass={styles.class}
                emptyText="No available classes"
                onSelect={onAttachDisjointUnionClass}
              />
            }
            onSelect={onSelect}
            onRemove={onDetachDisjointUnionClass}
          />
        </div>
      </section>
    </div>
  );
}

function AnnotationRows({
  annotations,
  onUpdate,
  onRemove
}: {
  annotations: Entity[];
  onUpdate: (annotationId: string, patch: Partial<Entity>) => void;
  onRemove: (annotationId: string) => void;
}) {
  const visibleAnnotations = annotations.filter((annotation) => annotation.isUserAnnotation);

  if (visibleAnnotations.length === 0) {
    return null;
  }

  return (
    <div className={styles.annotationRows}>
      {visibleAnnotations.map((annotation) => (
        <div className={styles.annotationValueFrame} key={annotation.id}>
          <label className={styles.annotationValue}>
            <strong>{annotation.annotationProperty}</strong>
            <span>
              {annotation.annotationLanguage ? `[language: ${annotation.annotationLanguage}]` : annotation.annotationDatatype}
            </span>
            <textarea
              value={annotation.annotationValue ?? ""}
              onChange={(event) => onUpdate(annotation.id, { annotationValue: event.target.value })}
            />
          </label>
          <button
            className={styles.axiomRemoveButton}
            aria-label={`Remove ${annotation.annotationProperty}`}
            title={`Remove ${annotation.annotationProperty}`}
            onClick={() => onRemove(annotation.id)}
          >
            <Minus size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function DatatypeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const pickerRef = React.useRef<HTMLDetailsElement>(null);

  React.useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (pickerRef.current?.open && !pickerRef.current.contains(event.target as Node)) {
        pickerRef.current.removeAttribute("open");
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <details className={styles.datatypeSelectDetails} ref={pickerRef}>
      <summary
        className={styles.datatypeSelectSummary}
        onClick={(event) => {
          event.preventDefault();
          const details = event.currentTarget.parentElement as HTMLDetailsElement | null;
          if (details) details.open = !details.open;
        }}
      >
        <span className={cx(styles.kindDot, styles.builtinDatatype)} />
        <span className={styles.datatypeSelectLabel}>{value}</span>
        <ChevronDown size={12} className={styles.datatypeSelectChevron} />
      </summary>
      <span className={styles.datatypeSelectMenu}>
        {xsdDatatypes.map((option) => (
          <button
            key={option}
            className={option === value ? styles.datatypeSelectOptionActive : undefined}
            onClick={() => {
              onChange(option);
              pickerRef.current?.removeAttribute("open");
            }}
          >
            <span className={cx(styles.kindDot, styles.builtinDatatype)} />
            {option}
          </button>
        ))}
      </span>
    </details>
  );
}

function AnnotationEditorDialog({
  subject,
  onCancel,
  onSave
}: {
  subject: Entity;
  onCancel: () => void;
  onSave: (draft: { property: string; value: string; language: string; datatype: string }) => void;
}) {
  const [propertyItems, setPropertyItems] = React.useState<AnnotationPropertyItem[]>(() =>
    annotationProperties.map((label) => ({ id: label, label }))
  );
  const [selectedPropertyId, setSelectedPropertyId] = React.useState("rdfs:comment");
  const [deleteCandidateId, setDeleteCandidateId] = React.useState<string | undefined>();
  const [alwaysConfirmDelete, setAlwaysConfirmDelete] = React.useState(true);
  const [value, setValue] = React.useState("");
  const [language, setLanguage] = React.useState("en");
  const [datatype, setDatatype] = React.useState("xsd:string");
  const selectedProperty = propertyItems.find((property) => property.id === selectedPropertyId) ?? propertyItems[0];
  const deleteCandidate = deleteCandidateId
    ? propertyItems.find((property) => property.id === deleteCandidateId)
    : undefined;

  function handleSave() {
    onSave({
      property: selectedProperty.label,
      value,
      language,
      datatype
    });
  }

  function addAnnotationProperty(parentId?: string) {
    const count = propertyItems.filter((property) => property.parentId === parentId).length + 1;
    const next: AnnotationPropertyItem = {
      id: `annotation-property-${Date.now()}-${count}`,
      label: parentId ? `New child annotation property ${count}` : `New annotation property ${count}`,
      parentId
    };
    setPropertyItems((current) => [...current, next]);
    setSelectedPropertyId(next.id);
  }

  function requestDeleteSelectedProperty() {
    if (alwaysConfirmDelete) {
      setDeleteCandidateId(selectedProperty.id);
      return;
    }
    deleteAnnotationProperty(selectedProperty.id);
  }

  function deleteAnnotationProperty(propertyId: string) {
    setPropertyItems((current) => {
      const removedIds = new Set<string>([propertyId]);
      let changed = true;
      while (changed) {
        changed = false;
        current.forEach((property) => {
          if (property.parentId && removedIds.has(property.parentId) && !removedIds.has(property.id)) {
            removedIds.add(property.id);
            changed = true;
          }
        });
      }
      return current.filter((property) => !removedIds.has(property.id));
    });
    setSelectedPropertyId((current) => (current === propertyId ? propertyItems.find((property) => property.id !== propertyId)?.id ?? "" : current));
    setDeleteCandidateId(undefined);
  }

  function getPropertyDepth(property: AnnotationPropertyItem) {
    let depth = 0;
    let current = property;
    const visitedIds = new Set([property.id]);
    while (current.parentId) {
      const parent = propertyItems.find((candidate) => candidate.id === current.parentId);
      if (!parent || visitedIds.has(parent.id)) {
        break;
      }
      depth += 1;
      visitedIds.add(parent.id);
      current = parent;
    }
    return depth;
  }

  return (
    <div className={styles.modalBackdrop} role="presentation">
      <section className={styles.annotationDialog} role="dialog" aria-modal="true" aria-label={`Add annotation to ${subject.label}`}>
        <div className={styles.dialogTitleBar}>
          <span className={styles.windowDotRed} />
          <span className={styles.windowDotYellow} />
          <span className={styles.windowDotGreen} />
          <strong>{subject.label}</strong>
        </div>
        <div className={styles.annotationDialogBody}>
          <aside className={styles.annotationPropertyPane} aria-label="Annotation properties">
            <div className={styles.dialogToolbar}>
              <button
                aria-label="Create annotation property"
                title="Create annotation property"
                onClick={() => addAnnotationProperty()}
              >
                <Plus size={14} />
              </button>
              <button
                aria-label="Create child annotation property"
                title="Create child annotation property"
                onClick={() => addAnnotationProperty(selectedProperty.id)}
              >
                <CornerDownRight size={14} />
              </button>
              <button
                aria-label="Remove annotation property"
                title="Remove annotation property"
                onClick={requestDeleteSelectedProperty}
              >
                <Minus size={14} />
              </button>
            </div>
            <div className={styles.annotationPropertyList}>
              {propertyItems.map((property) => (
                <button
                  key={property.id}
                  className={selectedPropertyId === property.id ? styles.selectedAnnotationProperty : ""}
                  style={{ paddingLeft: `${8 + getPropertyDepth(property) * 18}px` }}
                  onClick={() => setSelectedPropertyId(property.id)}
                >
                  <span className={styles.annotationPropertyIcon} />
                  {property.label}
                </button>
              ))}
            </div>
          </aside>

          <div className={styles.annotationEditorPane}>
            <div className={styles.annotationTabs} aria-label="Annotation value type">
              <button className={styles.selectedTab}>Literal</button>
            </div>

            <label className={styles.dialogField}>
              <span>Value</span>
              <textarea
                value={value}
                onChange={(event) => setValue(event.target.value)}
                autoFocus
              />
            </label>

            <label className={styles.dialogField}>
              <span>Language Tag</span>
              <input value={language} onChange={(event) => setLanguage(event.target.value)} />
            </label>

            <label className={styles.dialogField}>
              <span>Datatype</span>
              <DatatypeSelect value={datatype} onChange={setDatatype} />
            </label>
          </div>
        </div>
        <footer className={styles.dialogActions}>
          <button onClick={onCancel}>Cancel</button>
          <button className={styles.dialogPrimaryAction} onClick={handleSave}>
            OK
          </button>
        </footer>
        {deleteCandidate && (
          <section className={styles.deleteDialog} role="dialog" aria-modal="true" aria-label={`Delete ${deleteCandidate.label}`}>
            <div className={styles.dialogTitleBar}>
              <span className={styles.windowDotRed} />
              <span className={styles.windowDotYellow} />
              <span className={styles.windowDotGreen} />
              <strong>Delete {deleteCandidate.label}</strong>
            </div>
            <div className={styles.deleteDialogBody}>
              <p>
                Delete {deleteCandidate.label}?<br />
                All references to {deleteCandidate.label} will be removed from the active ontologies.
              </p>
              <label className={styles.deleteConfirmOption}>
                <input
                  type="checkbox"
                  checked={alwaysConfirmDelete}
                  onChange={(event) => setAlwaysConfirmDelete(event.target.checked)}
                />
                <span>Always show this confirmation before deleting</span>
              </label>
            </div>
            <footer className={styles.deleteDialogActions}>
              <button onClick={() => setDeleteCandidateId(undefined)}>Cancel</button>
              <button className={styles.dialogPrimaryAction} onClick={() => deleteAnnotationProperty(deleteCandidate.id)}>
                OK
              </button>
            </footer>
          </section>
        )}
      </section>
    </div>
  );
}

function ClassParentRow({
  superClasses,
  availableClasses,
  onAdd,
  onRemove,
  onSelect
}: {
  superClasses: Entity[];
  availableClasses: Entity[];
  onAdd: (classId: string) => void;
  onRemove: (classId: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className={cx(styles.axiomRow, styles.classAxiomRow)}>
      <div className={styles.axiomLabel}>
        <span>SubClass Of</span>
        <EntityPickerButton
          label="Add superclass"
          options={availableClasses}
          markerClass={styles.class}
          emptyText="No available classes"
          onSelect={onAdd}
        />
      </div>
      <div className={styles.classAxiomList}>
        {superClasses.length === 0 && <span className={styles.emptyAxiom}>owl:Thing</span>}
        {superClasses.map((superClass) => (
          <ClassAxiomItem
            key={superClass.id}
            entity={superClass}
            markerClass={styles.class}
            onSelect={() => onSelect(superClass.id)}
            onRemove={() => onRemove(superClass.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ClassEntityListRow({
  label,
  values,
  markerClass,
  emptyText,
  action,
  onSelect,
  onRemove
}: {
  label: string;
  values: Entity[];
  markerClass: string;
  emptyText: string;
  action: React.ReactNode;
  onSelect: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  return (
    <div className={cx(styles.axiomRow, styles.classAxiomRow, values.length === 0 && styles.emptyClassAxiomRow)}>
      <div className={styles.axiomLabel}>
        <span>{label}</span>
        {action}
      </div>
      <div className={styles.classAxiomList}>
        {values.length === 0 && <span className={styles.emptyAxiom}>{emptyText}</span>}
        {values.map((value) => (
          <ClassAxiomItem
            key={value.id}
            entity={value}
            markerClass={markerClass}
            onSelect={() => onSelect(value.id)}
            onRemove={onRemove ? () => onRemove(value.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function ClassAxiomItem({
  entity,
  markerClass,
  onSelect,
  onRemove
}: {
  entity: Entity;
  markerClass: string;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className={styles.classAxiomItem}>
      <button className={styles.classAxiomEntity} onClick={onSelect}>
        <span className={cx(entity.kind === "individual" || entity.kind === "class" || entity.kind === "builtinDatatype" ? styles.kindDot : styles.propertyShape, markerClass)} />
        <strong>{displayName(entity)}</strong>
        {entity.kind !== "individual" && entity.kind !== "class" && entity.kind !== "builtinDatatype" && <small>{entity.range?.join(", ") ?? "Thing"}</small>}
      </button>
      {onRemove && (
        <button className={styles.axiomRemoveButton} aria-label={`Remove ${displayName(entity)}`} title={`Remove ${displayName(entity)}`} onClick={onRemove}>
          <Minus size={12} />
        </button>
      )}
    </div>
  );
}

function RelatedSection({
  title,
  action,
  children
}: {
  title: string;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.relatedSection}>
      <div className={styles.sectionHeader}>
        <strong>{title}</strong>
        {action}
      </div>
      <div className={styles.sectionList}>{children}</div>
    </section>
  );
}

function EntityPickerButton({
  label,
  options,
  markerClass,
  emptyText,
  onSelect,
  onCreate
}: {
  label: string;
  options: Entity[];
  markerClass: string;
  emptyText: string;
  onSelect: (id: string) => void;
  onCreate?: () => void;
}) {
  const pickerRef = React.useRef<HTMLDetailsElement>(null);

  React.useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (pickerRef.current?.open && !pickerRef.current.contains(event.target as Node)) {
        pickerRef.current.removeAttribute("open");
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <details className={styles.pickerWrap} ref={pickerRef}>
      <summary
        className={styles.formAddButton}
        aria-label={label}
        title={label}
        onClick={(event) => {
          event.preventDefault();
          const details = event.currentTarget.parentElement as HTMLDetailsElement | null;
          if (details) {
            details.open = !details.open;
          }
        }}
      >
        <Plus size={14} />
      </summary>
      <span className={styles.pickerMenu}>
        {onCreate && (
          <>
            <button
              className={styles.pickerCreateNew}
              onClick={() => {
                onCreate();
                pickerRef.current?.removeAttribute("open");
              }}
            >
              <Plus size={12} />
              Create new individual
            </button>
            {options.length > 0 && <span className={styles.pickerDivider} />}
          </>
        )}
        {options.length === 0 && !onCreate && <span className={styles.pickerEmpty}>{emptyText}</span>}
        {options.map((option) => (
          <button
            key={option.id}
            onClick={() => {
              onSelect(option.id);
              pickerRef.current?.removeAttribute("open");
            }}
          >
            <span className={cx(option.kind === "individual" || option.kind === "builtinDatatype" ? styles.kindDot : styles.propertyShape, markerClass)} />
            {displayName(option)}
          </button>
        ))}
      </span>
    </details>
  );
}

function EntityEditor({
  selected,
  classes,
  individuals,
  objectProperties,
  datatypeProperties,
  annotations,
  onUpdate,
  onAddAnnotation,
  onUpdateAnnotation,
  onRemoveAnnotation,
  onAddType,
  onAddSameAs,
  onAddDifferentFrom,
  onAddObjectAssertion,
  onAddDataAssertion
}: {
  selected: Entity;
  classes: Entity[];
  individuals: Entity[];
  objectProperties: Entity[];
  datatypeProperties: Entity[];
  annotations: Entity[];
  onUpdate: (patch: Partial<Entity>) => void;
  onAddAnnotation: () => void;
  onUpdateAnnotation: (annotationId: string, patch: Partial<Entity>) => void;
  onRemoveAnnotation: (annotationId: string) => void;
  onAddType: (className: string) => void;
  onAddSameAs: () => void;
  onAddDifferentFrom: () => void;
  onAddObjectAssertion: (property: string, value: string) => void;
  onAddDataAssertion: (property: string, value: string) => void;
}) {
  function toggleCharacteristic(characteristic: PropertyCharacteristic) {
    const current = selected.characteristics ?? [];
    onUpdate({
      characteristics: current.includes(characteristic)
        ? current.filter((item) => item !== characteristic)
        : [...current, characteristic]
    });
  }

  if (selected.kind === "objectProperty" || selected.kind === "datatypeProperty") {
    return (
      <PropertyEditor
        selected={selected}
        classes={classes}
        properties={selected.kind === "objectProperty" ? objectProperties : datatypeProperties}
        annotations={annotations}
        onUpdate={onUpdate}
        onAddAnnotation={onAddAnnotation}
        onUpdateAnnotation={onUpdateAnnotation}
        onRemoveAnnotation={onRemoveAnnotation}
        onToggleCharacteristic={toggleCharacteristic}
      />
    );
  }

  if (selected.kind === "individual") {
    return (
      <IndividualEditor
        selected={selected}
        classes={classes}
        individuals={individuals}
        objectProperties={objectProperties}
        datatypeProperties={datatypeProperties}
        annotations={annotations}
        onUpdate={onUpdate}
        onAddAnnotation={onAddAnnotation}
        onUpdateAnnotation={onUpdateAnnotation}
        onRemoveAnnotation={onRemoveAnnotation}
        onAddType={onAddType}
        onAddSameAs={onAddSameAs}
        onAddDifferentFrom={onAddDifferentFrom}
        onAddObjectAssertion={onAddObjectAssertion}
        onAddDataAssertion={onAddDataAssertion}
      />
    );
  }

  return (
    <>
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.contextLabel}>Selected {kindLabels[selected.kind]}</p>
          <h2>{selected.label}</h2>
        </div>
        <span className={cx(styles.status, styles[selected.kind])}>{kindLabels[selected.kind]}</span>
      </div>

      <label className={styles.field}>
        <span>Name</span>
        <input value={selected.label} onChange={(event) => onUpdate({ label: event.target.value })} />
      </label>

      <label className={styles.field}>
        <span>Description</span>
        <textarea value={selected.description} onChange={(event) => onUpdate({ description: event.target.value })} />
      </label>

      {selected.kind === "class" && (
        <label className={styles.field}>
          <span>Parent class</span>
          <select value={selected.parentId ?? ""} onChange={(event) => onUpdate({ parentId: event.target.value || undefined })}>
            <option value="">owl:Thing</option>
            {classes
              .filter((classItem) => classItem.id !== selected.id)
              .map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.label}
                </option>
              ))}
          </select>
        </label>
      )}

      {selected.kind === "annotation" && (
        <>
          <label className={styles.field}>
            <span>Subject</span>
            <select value={selected.subjectId ?? ""} onChange={(event) => onUpdate({ subjectId: event.target.value })}>
              {classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Annotation property</span>
            <input
              value={selected.annotationProperty ?? ""}
              onChange={(event) => onUpdate({ annotationProperty: event.target.value, label: event.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span>Value</span>
            <textarea value={selected.annotationValue ?? ""} onChange={(event) => onUpdate({ annotationValue: event.target.value })} />
          </label>
        </>
      )}

    </>
  );
}

function PropertyEditor({
  selected,
  classes,
  properties,
  annotations,
  onUpdate,
  onAddAnnotation,
  onUpdateAnnotation,
  onRemoveAnnotation,
  onToggleCharacteristic
}: {
  selected: Entity;
  classes: Entity[];
  properties: Entity[];
  annotations: Entity[];
  onUpdate: (patch: Partial<Entity>) => void;
  onAddAnnotation: () => void;
  onUpdateAnnotation: (annotationId: string, patch: Partial<Entity>) => void;
  onRemoveAnnotation: (annotationId: string) => void;
  onToggleCharacteristic: (characteristic: PropertyCharacteristic) => void;
}) {
  const characteristics: PropertyCharacteristic[] =
    selected.kind === "objectProperty"
      ? ["Functional", "Inverse functional", "Transitive", "Symmetric", "Asymmetric", "Reflexive", "Irreflexive"]
      : ["Functional"];
  const accentClass = selected.kind === "objectProperty" ? styles.objectAccent : styles.datatypeAccent;

  return (
    <div className={styles.protegeEditor}>
      <div className={styles.protegeTitleBar}>
        <span className={cx(styles.propertyShape, styles[selected.kind])} />
        <input
          aria-label="Property name"
          value={selected.label}
          onChange={(event) => onUpdate({ label: event.target.value })}
        />
        <span className={cx(styles.status, styles[selected.kind])}>{kindLabels[selected.kind]}</span>
      </div>

      <section className={styles.protegePane}>
        <div className={cx(styles.protegePaneHeader, accentClass)}>Annotations: {selected.iriLocalName ?? selected.label}</div>
        <div className={styles.annotationBody}>
          <div className={styles.annotationToolbar}>
            <span>Annotations</span>
            <button aria-label="Create annotation" title="Create annotation" onClick={onAddAnnotation}>
              <Plus size={14} />
            </button>
          </div>
          <div className={styles.annotationValueFrame}>
            <label className={styles.annotationValue}>
              <strong>rdfs:comment</strong>
              <span>[language: en]</span>
              <textarea value={selected.description} onChange={(event) => onUpdate({ description: event.target.value })} />
            </label>
            <button className={styles.axiomRemoveButton} aria-label="Remove rdfs:comment" title="Remove rdfs:comment" onClick={() => onUpdate({ description: "" })}>
              <Minus size={12} />
            </button>
          </div>
          <AnnotationRows annotations={annotations} onUpdate={onUpdateAnnotation} onRemove={onRemoveAnnotation} />
        </div>
      </section>

      <div className={styles.propertyFormGrid}>
        <section className={styles.protegePane}>
          <div className={cx(styles.protegePaneHeader, accentClass)}>Characteristics</div>
          <div className={styles.characteristicList}>
            {characteristics.map((characteristic) => (
              <label key={characteristic}>
                <input
                  type="checkbox"
                  checked={(selected.characteristics ?? []).includes(characteristic)}
                  onChange={() => onToggleCharacteristic(characteristic)}
                />
                <span>{characteristic}</span>
              </label>
            ))}
          </div>
        </section>

        <section className={styles.protegePane}>
          <div className={cx(styles.protegePaneHeader, accentClass)}>Description: {selected.iriLocalName ?? selected.label}</div>
          <div className={styles.axiomRows}>
            <AxiomRow label="Equivalent To" options={properties} markerClass={styles[selected.kind as keyof typeof styles] as string} />
            <SubPropertyRow
              selected={selected}
              properties={properties}
              onChange={(parentId) => onUpdate({ parentId })}
            />
            {selected.kind === "objectProperty" && (
              <EditableAxiomRow
                label="Inverse Of"
                value={selected.inverseOf ?? ""}
                onChange={(value) => onUpdate({ inverseOf: value || undefined })}
                markerClass={styles.objectProperty as string}
                options={properties.filter((p) => p.kind === "objectProperty" && p.id !== selected.id)}
              />
            )}
            <MultiAxiomRow
              label="Domains (intersection)"
              values={classes.filter(c => (selected.domain ?? []).includes(c.label))}
              markerClass={styles.class}
              options={classes.filter(c => !(selected.domain ?? []).includes(c.label))}
              onAdd={(id) => {
                const label = classes.find(c => c.id === id)?.label;
                if (label) onUpdate({ domain: [...(selected.domain ?? []), label] });
              }}
              onRemove={(id) => {
                const label = classes.find(c => c.id === id)?.label;
                if (label) {
                  const next = (selected.domain ?? []).filter(d => d !== label);
                  onUpdate({ domain: next.length > 0 ? next : undefined });
                }
              }}
            />
            <MultiAxiomRow
              label={selected.kind === "objectProperty" ? "Ranges (intersection)" : "Ranges"}
              values={(selected.kind === "objectProperty" ? classes : xsdDatatypeEntities).filter(c => (selected.range ?? []).includes(c.label))}
              markerClass={selected.kind === "objectProperty" ? styles.class : styles.builtinDatatype}
              options={(selected.kind === "objectProperty" ? classes : xsdDatatypeEntities).filter(c => !(selected.range ?? []).includes(c.label))}
              onAdd={(id) => {
                const opts = selected.kind === "objectProperty" ? classes : xsdDatatypeEntities;
                const label = opts.find(c => c.id === id)?.label;
                if (label) onUpdate({ range: [...(selected.range ?? []), label] });
              }}
              onRemove={(id) => {
                const opts = selected.kind === "objectProperty" ? classes : xsdDatatypeEntities;
                const label = opts.find(c => c.id === id)?.label;
                if (label) {
                  const next = (selected.range ?? []).filter(r => r !== label);
                  onUpdate({ range: next.length > 0 ? next : undefined });
                }
              }}
            />
            <AxiomRow label="Disjoint With" options={properties} markerClass={styles[selected.kind as keyof typeof styles] as string} />
            {selected.kind === "objectProperty" && <AxiomRow label="SuperProperty Of (Chain)" options={properties.filter(p => p.kind === "objectProperty")} markerClass={styles.objectProperty as string} />}
          </div>
        </section>
      </div>

    </div>
  );
}

function SubPropertyRow({
  selected,
  properties,
  onChange
}: {
  selected: Entity;
  properties: Entity[];
  onChange: (parentId: string | undefined) => void;
}) {
  const rootLabel = selected.kind === "objectProperty" ? "owl:ObjectProperty" : "owl:DatatypeProperty";
  const descendantIds = getDescendantPropertyIds(properties, selected.id);
  const parentOptions = properties.filter(
    (property) => property.id !== selected.id && !descendantIds.has(property.id)
  );
  const markerClass = styles[selected.kind as keyof typeof styles] as string;
  const parent = selected.parentId ? properties.find((p) => p.id === selected.parentId) : undefined;

  return (
    <div className={cx(styles.axiomRow, styles.classAxiomRow, !parent && styles.emptyClassAxiomRow)}>
      <div className={styles.axiomLabel}>
        <span>SubProperty Of</span>
        <EntityPickerButton
          label="Set parent property"
          options={parentOptions}
          markerClass={markerClass}
          emptyText="No available properties"
          onSelect={(id) => onChange(id)}
        />
      </div>
      <div className={styles.classAxiomList}>
        {!parent && <span className={styles.emptyAxiom}>{rootLabel}</span>}
        {parent && (
          <ClassAxiomItem
            entity={parent}
            markerClass={markerClass}
            onSelect={() => {}}
            onRemove={() => onChange(undefined)}
          />
        )}
      </div>
    </div>
  );
}

function getDescendantPropertyIds(properties: Entity[], parentId: string) {
  const descendantIds = new Set<string>();
  const pending = properties.filter((property) => property.parentId === parentId);

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || descendantIds.has(current.id)) {
      continue;
    }
    descendantIds.add(current.id);
    pending.push(...properties.filter((property) => property.parentId === current.id));
  }

  return descendantIds;
}

function AxiomRow({ label, options, markerClass }: { label: string; options?: Entity[]; markerClass?: string }) {
  return (
    <div className={cx(styles.axiomRow, styles.classAxiomRow, styles.emptyClassAxiomRow)}>
      <div className={styles.axiomLabel}>
        <span>{label}</span>
        {options ? (
          <EntityPickerButton
            label={`Add ${label}`}
            options={options}
            markerClass={markerClass ?? ""}
            emptyText="No available options"
            onSelect={() => {}}
          />
        ) : (
          <button aria-label={`Add ${label}`} title={`Add ${label}`} className={styles.formAddButton}>
            <Plus size={14} />
          </button>
        )}
      </div>
      <div className={styles.classAxiomList}>
        <span className={styles.emptyAxiom}>No axioms</span>
      </div>
    </div>
  );
}

function MultiAxiomRow({
  label,
  values,
  markerClass,
  options,
  onAdd,
  onRemove
}: {
  label: string;
  values: Entity[];
  markerClass: string;
  options: Entity[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className={cx(styles.axiomRow, styles.classAxiomRow, values.length === 0 && styles.emptyClassAxiomRow)}>
      <div className={styles.axiomLabel}>
        <span>{label}</span>
        <EntityPickerButton
          label={`Add ${label}`}
          options={options}
          markerClass={markerClass}
          emptyText="No available options"
          onSelect={(id) => onAdd(id)}
        />
      </div>
      <div className={styles.classAxiomList}>
        {values.length === 0 && <span className={styles.emptyAxiom}>No axioms</span>}
        {values.map((entity) => (
          <ClassAxiomItem
            key={entity.id}
            entity={entity}
            markerClass={markerClass}
            onSelect={() => {}}
            onRemove={() => onRemove(entity.id)}
          />
        ))}
      </div>
    </div>
  );
}

function EditableAxiomRow({
  label,
  value,
  markerClass,
  options,
  onChange
}: {
  label: string;
  value: string;
  markerClass: string;
  options?: Entity[];
  onChange: (value: string) => void;
}) {
  const selected = options?.find((o) => o.label === value);
  return (
    <div className={cx(styles.axiomRow, styles.classAxiomRow, !selected && styles.emptyClassAxiomRow)}>
      <div className={styles.axiomLabel}>
        <span>{label}</span>
        {options ? (
          <EntityPickerButton
            label={`Add ${label}`}
            options={options.filter((o) => o.label !== value)}
            markerClass={markerClass}
            emptyText="No available options"
            onSelect={(id) => onChange(options.find((o) => o.id === id)?.label ?? "")}
          />
        ) : (
          <button aria-label={`Create ${label}`} title={`Create ${label}`} className={styles.formAddButton}>
            <Plus size={14} />
          </button>
        )}
      </div>
      <div className={styles.classAxiomList}>
        {!selected && <span className={styles.emptyAxiom}>No axioms</span>}
        {selected && (
          <ClassAxiomItem
            entity={selected}
            markerClass={markerClass}
            onSelect={() => {}}
            onRemove={() => onChange("")}
          />
        )}
      </div>
    </div>
  );
}

function IndividualEditor({
  selected,
  classes,
  individuals,
  objectProperties,
  datatypeProperties,
  annotations,
  onUpdate,
  onAddAnnotation,
  onUpdateAnnotation,
  onRemoveAnnotation,
  onAddType,
  onAddSameAs,
  onAddDifferentFrom,
  onAddObjectAssertion,
  onAddDataAssertion
}: {
  selected: Entity;
  classes: Entity[];
  individuals: Entity[];
  objectProperties: Entity[];
  datatypeProperties: Entity[];
  annotations: Entity[];
  onUpdate: (patch: Partial<Entity>) => void;
  onAddAnnotation: () => void;
  onUpdateAnnotation: (annotationId: string, patch: Partial<Entity>) => void;
  onRemoveAnnotation: (annotationId: string) => void;
  onAddType: (className: string) => void;
  onAddSameAs: () => void;
  onAddDifferentFrom: () => void;
  onAddObjectAssertion: (property: string, value: string) => void;
  onAddDataAssertion: (property: string, value: string) => void;
}) {
  function updateObjectAssertion(index: number, patch: Partial<PropertyAssertion>) {
    onUpdate({
      objectAssertions: (selected.objectAssertions ?? []).map((assertion, currentIndex) =>
        currentIndex === index ? { ...assertion, ...patch } : assertion
      )
    });
  }

  function removeObjectAssertion(index: number) {
    onUpdate({ objectAssertions: (selected.objectAssertions ?? []).filter((_, i) => i !== index) });
  }

  function updateDataAssertion(index: number, patch: Partial<PropertyAssertion>) {
    onUpdate({
      dataAssertions: (selected.dataAssertions ?? []).map((assertion, currentIndex) =>
        currentIndex === index ? { ...assertion, ...patch } : assertion
      )
    });
  }

  function removeDataAssertion(index: number) {
    onUpdate({ dataAssertions: (selected.dataAssertions ?? []).filter((_, i) => i !== index) });
  }

  function addSameIndividual(label: string) {
    onUpdate({ sameAs: Array.from(new Set([...(selected.sameAs ?? []), label])) });
  }

  function addDifferentIndividual(label: string) {
    onUpdate({ differentFrom: Array.from(new Set([...(selected.differentFrom ?? []), label])) });
  }

  const availableSameIndividuals = individuals
    .filter((individual) => individual.id !== selected.id)
    .map((individual) => displayName(individual));
  const availableDifferentIndividuals = individuals
    .filter((individual) => individual.id !== selected.id)
    .map((individual) => displayName(individual));
  const availableTypes = classes
    .map((classItem) => classItem.label);

  const derivedIriName = selected.iriLocalName
    ?? (selected.label.trim().replace(/\s+/g, "_").replace(/[^\w\-.]/g, "") || "entity");

  return (
    <div className={styles.protegeEditor}>
      <div className={styles.protegeTitleBar}>
        <span className={cx(styles.kindDot, styles.individual)} />
        <input
          aria-label="Individual IRI name"
          value={derivedIriName}
          onChange={(event) => {
            const safe = event.target.value.replace(/\s/g, "_").replace(/[^\w\-.]/g, "");
            onUpdate({ iriLocalName: safe || undefined });
          }}
          spellCheck={false}
        />
        <span className={cx(styles.status, styles.individual)}>Individual</span>
      </div>

      <section className={styles.protegePane}>
        <div className={cx(styles.protegePaneHeader, styles.individualAccent)}>Annotations: {derivedIriName}</div>
        <div className={styles.annotationBody}>
          <div className={styles.annotationToolbar}>
            <span>Annotations</span>
            <button aria-label="Create annotation" title="Create annotation" onClick={onAddAnnotation}>
              <Plus size={14} />
            </button>
          </div>
          {selected.label && (
            <div className={styles.annotationValueFrame}>
              <label className={styles.annotationValue}>
                <strong>rdfs:label</strong>
                <span>[language: en]</span>
                <textarea value={selected.label} onChange={(event) => onUpdate({ label: event.target.value })} />
              </label>
              <button className={styles.axiomRemoveButton} aria-label="Remove rdfs:label" title="Remove rdfs:label" onClick={() => onUpdate({ label: "" })}>
                <Minus size={12} />
              </button>
            </div>
          )}
          {(selected.description !== undefined && selected.description !== "") && (
            <div className={styles.annotationValueFrame}>
              <label className={styles.annotationValue}>
                <strong>rdfs:comment</strong>
                <span>[language: en]</span>
                <textarea value={selected.description} onChange={(event) => onUpdate({ description: event.target.value })} />
              </label>
              <button className={styles.axiomRemoveButton} aria-label="Remove rdfs:comment" title="Remove rdfs:comment" onClick={() => onUpdate({ description: "" })}>
                <Minus size={12} />
              </button>
            </div>
          )}
          <AnnotationRows annotations={annotations} onUpdate={onUpdateAnnotation} onRemove={onRemoveAnnotation} />
        </div>
      </section>

      <div className={styles.individualFormGrid}>
        <section className={styles.protegePane}>
          <div className={cx(styles.protegePaneHeader, styles.individualAccent)}>Description: {selected.iriLocalName ?? selected.label}</div>
          <div className={styles.axiomRows}>
            <IndividualValueRow
              label="Types"
              values={selected.types ?? []}
              markerClass={styles.class}
              action={
                <PickerButton label="Add type" options={availableTypes} markerClass={styles.class} onSelect={onAddType} />
              }
            />
            <IndividualValueRow
              label="Same Individual As"
              values={selected.sameAs ?? []}
              markerClass={styles.individual}
              action={<PickerButton label="Add same individual" options={availableSameIndividuals} markerClass={styles.individual} onSelect={addSameIndividual} fallback={onAddSameAs} />}
            />
            <IndividualValueRow
              label="Different Individuals"
              values={selected.differentFrom ?? []}
              markerClass={styles.individual}
              action={<PickerButton label="Add different individual" options={availableDifferentIndividuals} markerClass={styles.individual} onSelect={addDifferentIndividual} fallback={onAddDifferentFrom} />}
            />
          </div>
        </section>

        <section className={styles.protegePane}>
          <div className={cx(styles.protegePaneHeader, styles.individualAccent)}>Property assertions: {selected.iriLocalName ?? selected.label}</div>
          <div className={styles.axiomRows}>
            <EditableAssertionSection
              title="Object property assertions"
              propertyLabel="Enter object property name"
              valueLabel="Enter individual name"
              propertySuggestions={objectProperties.map((e) => e.label)}
              valueSuggestions={individuals.map((e) => e.label)}
              propertyMarkerClass={styles.objectProperty}
              valueMarkerClass={styles.individual}
              assertions={selected.objectAssertions ?? []}
              markerClass={styles.objectProperty}
              onAdd={onAddObjectAssertion}
              onUpdate={updateObjectAssertion}
              onRemove={removeObjectAssertion}
            />
            <EditableAssertionSection
              title="Data property assertions"
              propertyLabel="Enter data property name"
              valueLabel="Enter value"
              propertySuggestions={datatypeProperties.map((e) => e.label)}
              valueSuggestions={[]}
              propertyMarkerClass={styles.datatypeProperty}
              valueMarkerClass={styles.datatypeProperty}
              assertions={selected.dataAssertions ?? []}
              markerClass={styles.datatypeProperty}
              onAdd={onAddDataAssertion}
              onUpdate={updateDataAssertion}
              onRemove={removeDataAssertion}
            />
            <AxiomRow label="Negative object property assertions" />
            <AxiomRow label="Negative data property assertions" />
          </div>
        </section>
      </div>

    </div>
  );
}

function PickerButton({
  label,
  options,
  markerClass,
  fallback,
  onSelect
}: {
  label: string;
  options: string[];
  markerClass: string;
  fallback?: () => void;
  onSelect: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const pickerRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  function handleClick() {
    if (options.length === 0) {
      fallback?.();
      return;
    }
    setIsOpen((current) => !current);
  }

  return (
    <span className={styles.pickerWrap} ref={pickerRef}>
      <button className={styles.formAddButton} aria-label={label} title={label} onClick={handleClick}>
        <Plus size={14} />
      </button>
      {isOpen && options.length > 0 && (
        <span className={styles.pickerMenu}>
          {options.map((option) => (
            <button
              key={option}
              onClick={() => {
                onSelect(option);
                setIsOpen(false);
              }}
            >
              <span className={cx(styles.kindDot, markerClass)} />
              {option}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function IndividualValueRow({
  label,
  values,
  markerClass,
  action
}: {
  label: string;
  values: string[];
  markerClass: string;
  action: React.ReactNode;
}) {
  return (
    <div className={styles.individualAxiomGroup}>
      <div className={styles.axiomLabel}>
        <span>{label}</span>
        {action}
      </div>
      <div className={styles.individualValueList}>
        {values.length === 0 && <span className={styles.emptyAxiom}>No values</span>}
        {values.map((value) => (
          <span key={value} className={styles.individualValue}>
            <span className={cx(styles.kindDot, markerClass)} />
            <strong>{value}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function AssertionInputDialog({
  title,
  propertyLabel,
  valueLabel,
  propertySuggestions,
  valueSuggestions,
  propertyMarkerClass,
  valueMarkerClass,
  onConfirm,
  onCancel
}: {
  title: string;
  propertyLabel: string;
  valueLabel: string;
  propertySuggestions: string[];
  valueSuggestions: string[];
  propertyMarkerClass: string;
  valueMarkerClass: string;
  onConfirm: (property: string, value: string) => void;
  onCancel: () => void;
}) {
  const [property, setProperty] = React.useState("");
  const [value, setValue] = React.useState("");
  const [activeField, setActiveField] = React.useState<"property" | "value" | null>(null);
  const [showAutocomplete, setShowAutocomplete] = React.useState(false);
  const blurTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeSuggestions = React.useMemo(() => {
    const query = activeField === "property" ? property : value;
    const pool = activeField === "property" ? propertySuggestions : valueSuggestions;
    if (!query) return pool.slice(0, 10);
    return pool.filter((s) => s.toLowerCase().includes(query.toLowerCase())).slice(0, 10);
  }, [activeField, property, value, propertySuggestions, valueSuggestions]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, field: "property" | "value") {
    if (e.key === " " && e.ctrlKey) {
      e.preventDefault();
      setActiveField(field);
      setShowAutocomplete(true);
    } else if (e.key === "Escape") {
      setShowAutocomplete(false);
    } else if (e.key === "Enter") {
      if (!showAutocomplete) handleConfirm();
    } else {
      setActiveField(field);
      setShowAutocomplete(true);
    }
  }

  function handleConfirm() {
    if (property.trim() || value.trim()) {
      onConfirm(property.trim(), value.trim());
    }
  }

  function pickSuggestion(suggestion: string) {
    if (activeField === "property") setProperty(suggestion);
    else setValue(suggestion);
    setShowAutocomplete(false);
  }

  return (
    <div
      className={styles.assertionDialogBackdrop}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className={styles.assertionDialog} role="dialog" aria-label={title}>
        <div className={styles.assertionDialogInputRow}>
          <div className={styles.assertionDialogInputWrap}>
            <input
              autoFocus
              placeholder={propertyLabel}
              value={property}
              onChange={(e) => setProperty(e.target.value)}
              onFocus={() => { if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null; } setActiveField("property"); setShowAutocomplete(true); }}
              onBlur={() => { blurTimerRef.current = setTimeout(() => setShowAutocomplete(false), 150); }}
              onKeyDown={(e) => handleKeyDown(e, "property")}
            />
            {showAutocomplete && activeField === "property" && activeSuggestions.length > 0 && (
              <ul className={styles.assertionAutocomplete}>
                {activeSuggestions.map((s) => (
                  <li key={s} onMouseDown={() => pickSuggestion(s)}>
                    <span className={cx(styles.kindDot, propertyMarkerClass)} />
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={styles.assertionDialogInputWrap}>
            <input
              placeholder={valueLabel}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => { if (blurTimerRef.current) { clearTimeout(blurTimerRef.current); blurTimerRef.current = null; } setActiveField("value"); setShowAutocomplete(true); }}
              onBlur={() => { blurTimerRef.current = setTimeout(() => setShowAutocomplete(false), 150); }}
              onKeyDown={(e) => handleKeyDown(e, "value")}
            />
            {showAutocomplete && activeField === "value" && activeSuggestions.length > 0 && (
              <ul className={styles.assertionAutocomplete}>
                {activeSuggestions.map((s) => (
                  <li key={s} onMouseDown={() => pickSuggestion(s)}>
                    <span className={cx(styles.kindDot, valueMarkerClass)} />
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <p className={styles.assertionDialogTip}>(Tip: Use CTRL+Space to auto-complete names)</p>
        <div className={styles.assertionDialogActions}>
          <button className="btn btn-sm btn-light" onClick={onCancel}>Cancel</button>
          <button className="btn btn-sm btn-primary" onClick={handleConfirm}>OK</button>
        </div>
      </div>
    </div>
  );
}

function EditableAssertionSection({
  title,
  propertyLabel,
  valueLabel,
  propertySuggestions,
  valueSuggestions,
  propertyMarkerClass,
  valueMarkerClass,
  assertions,
  markerClass,
  onAdd,
  onUpdate,
  onRemove
}: {
  title: string;
  propertyLabel: string;
  valueLabel: string;
  propertySuggestions: string[];
  valueSuggestions: string[];
  propertyMarkerClass: string;
  valueMarkerClass: string;
  assertions: PropertyAssertion[];
  markerClass: string;
  onAdd: (property: string, value: string) => void;
  onUpdate: (index: number, patch: Partial<PropertyAssertion>) => void;
  onRemove: (index: number) => void;
}) {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  return (
    <div className={styles.individualAxiomGroup}>
      <div className={styles.axiomLabel}>
        <span>{title}</span>
        <button aria-label={`Create ${title}`} title={`Create ${title}`} onClick={() => setDialogOpen(true)}>
          <Plus size={14} />
        </button>
      </div>
      <div className={styles.assertionTable}>
        {assertions.length === 0 && <span className={styles.emptyAxiom}>No assertions</span>}
        {assertions.map((assertion, index) => (
          <span key={`${assertion.property}-${index}`} className={styles.assertionEditRow}>
            <span className={cx(styles.propertyShape, markerClass)} />
            <span className={styles.assertionReadValue} title={assertion.property}>{assertion.property}</span>
            <span className={styles.assertionReadValue} title={assertion.value}>{assertion.value}</span>
            <button
              className={styles.assertionRemoveBtn}
              aria-label={`Remove ${assertion.property} assertion`}
              title={`Remove ${assertion.property}`}
              onClick={() => onRemove(index)}
            >
              <Minus size={12} />
            </button>
          </span>
        ))}
      </div>
      {dialogOpen && (
        <AssertionInputDialog
          title={title}
          propertyLabel={propertyLabel}
          valueLabel={valueLabel}
          propertySuggestions={propertySuggestions}
          valueSuggestions={valueSuggestions}
          propertyMarkerClass={propertyMarkerClass}
          valueMarkerClass={valueMarkerClass}
          onConfirm={(property, value) => { onAdd(property, value); setDialogOpen(false); }}
          onCancel={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}

function AssertionSection({
  title,
  sublabel,
  action,
  children
}: {
  title: string;
  sublabel?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.assertionSection}>
      <div className={styles.assertionHeading}>
        <strong>{title}</strong>
        {sublabel && <span>{sublabel}</span>}
        {action}
      </div>
      {children}
    </section>
  );
}

function ChipList({ values }: { values: string[] }) {
  if (values.length === 0) {
    return <p className={styles.emptyText}>None</p>;
  }
  return (
    <div className={styles.chipList}>
      {values.map((value) => (
        <span key={value}>{value}</span>
      ))}
    </div>
  );
}

function AssertionRows({ assertions }: { assertions: PropertyAssertion[] }) {
  if (assertions.length === 0) {
    return <p className={styles.emptyText}>None</p>;
  }
  return (
    <div className={styles.assertionRows}>
      {assertions.map((assertion, index) => (
        <span key={`${assertion.property}-${assertion.value}-${index}`}>
          <strong>{assertion.property}</strong>
          {assertion.value}
        </span>
      ))}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <WorkspaceProvider>
    <App />
  </WorkspaceProvider>
);

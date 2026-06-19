import React from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronRight,
  Download,
  File,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useWorkspace, exportOWL, type WorkspaceNode, type WorkspaceFolder, type WorkspaceOntology } from "./WorkspaceStore";
import { parseOWL } from "../owl/parser";
import styles from "./WorkspacePanel.module.css";

// ─── Context menu ─────────────────────────────────────────────────────────────

type ContextMenuState = {
  x: number;
  y: number;
  nodeId: string;
  nodeType: "folder" | "ontology";
};

// ─── Import dialog ────────────────────────────────────────────────────────────

function ImportDialog({
  parentId,
  onClose,
}: {
  parentId: string | null;
  onClose: () => void;
}) {
  const { dispatch } = useWorkspace();
  const [file, setFile] = React.useState<File | null>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    setFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function handleImport() {
    if (!file) return;
    const raw = await file.text();
    const parsed = parseOWL(raw, file.name);
    dispatch({
      type: "ADD_ONTOLOGY",
      parentId,
      name: file.name.replace(/\.(owl|rdf|ttl|n3|turtle|xml)$/i, ""),
      raw,
      parsed,
    });
    onClose();
  }

  return createPortal(
    <div className={styles.dialogBackdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Import ontology">
        <div className={styles.dialogHeader}>
          <strong>Import ontology</strong>
          <button className={styles.iconBtn} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className={styles.dialogBody}>
          {file ? (
            <div className={styles.selectedFile}>
              <File size={15} />
              {file.name}
            </div>
          ) : (
            <div
              className={`${styles.dropZone}${dragActive ? ` ${styles.dragActive}` : ""}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              <Upload size={22} />
              <p>Click to browse or drop a file here</p>
              <small>.owl · .rdf · .ttl · .n3 · .xml</small>
            </div>
          )}
          <input
            ref={inputRef}
            className={styles.hiddenInput}
            type="file"
            accept=".owl,.rdf,.ttl,.n3,.turtle,.xml"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>

        <div className={styles.dialogActions}>
          <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
          <button className={styles.btnPrimary} disabled={!file} onClick={handleImport}>
            Import
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── New ontology dialog ──────────────────────────────────────────────────────

function suggestIri(name: string): string {
  const slug = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "") || "ontology";
  return `http://www.example.org/${slug}`;
}

function NewOntologyDialog({
  parentId,
  onClose,
}: {
  parentId: string | null;
  onClose: () => void;
}) {
  const { dispatch } = useWorkspace();
  const [name, setName] = React.useState("");
  const [iri, setIri] = React.useState("");
  const [iriTouched, setIriTouched] = React.useState(false);
  const nameInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const effectiveIri = iriTouched ? iri : suggestIri(name);

  function handleCreate() {
    const finalName = name.trim() || "New ontology";
    const finalIri = effectiveIri.trim() || suggestIri(finalName);
    dispatch({
      type: "ADD_ONTOLOGY",
      parentId,
      name: finalName,
      raw: "",
      parsed: {
        iri: finalIri,
        name: finalName,
        classes: [],
        objectProperties: [],
        datatypeProperties: [],
        individuals: [],
        imports: [],
      },
    });
    onClose();
  }

  return createPortal(
    <div className={styles.dialogBackdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="New ontology">
        <div className={styles.dialogHeader}>
          <strong>New ontology</strong>
          <button className={styles.iconBtn} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className={styles.dialogBody}>
          <label className={styles.fieldLabel}>
            Name
            <input
              ref={nameInputRef}
              className={styles.textField}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              placeholder="e.g. dpp-packaging"
            />
          </label>
          <label className={styles.fieldLabel}>
            Ontology IRI
            <input
              className={styles.textField}
              value={effectiveIri}
              onChange={(e) => { setIri(e.target.value); setIriTouched(true); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              placeholder="http://www.example.org/my-ontology"
            />
          </label>
        </div>

        <div className={styles.dialogActions}>
          <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
          <button className={styles.btnPrimary} onClick={handleCreate}>
            Create
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Inline rename input ──────────────────────────────────────────────────────

function RenameInput({
  initialValue,
  onCommit,
  onCancel,
}: {
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = React.useState(initialValue);
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      className={styles.nodeNameInput}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value.trim() || initialValue)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(value.trim() || initialValue);
        if (e.key === "Escape") onCancel();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

// ─── Tree nodes ───────────────────────────────────────────────────────────────

function OntologyNode({
  node,
  depth,
  activeId,
  renamingId,
  onRenameEnd,
  onContextMenu,
  onOpen,
}: {
  node: WorkspaceOntology;
  depth: number;
  activeId: string | null;
  renamingId: string | null;
  onRenameEnd: () => void;
  onContextMenu: (e: React.MouseEvent, node: WorkspaceNode) => void;
  onOpen: (id: string) => void;
}) {
  const { dispatch } = useWorkspace();
  const isActive = node.id === activeId;
  const renaming = renamingId === node.id;

  return (
    <div
      className={`${styles.nodeRow}${isActive ? ` ${styles.active}` : ""}`}
      style={{ paddingLeft: depth * 16 }}
      onClick={() => onOpen(node.id)}
      onDoubleClick={() => onOpen(node.id)}
      onContextMenu={(e) => onContextMenu(e, node)}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("nodeId", node.id)}
      title={node.parsed?.iri || node.name}
    >
      <span className={styles.toggleSpacer} />
      <span className={styles.nodeIcon}>
        <File size={14} color={isActive ? "#146b5b" : "#8a9a93"} />
      </span>
      {renaming ? (
        <RenameInput
          initialValue={node.name}
          onCommit={(v) => {
            dispatch({ type: "RENAME_NODE", id: node.id, name: v });
            onRenameEnd();
          }}
          onCancel={onRenameEnd}
        />
      ) : (
        <span className={styles.nodeName}>{node.name}</span>
      )}
      {isActive && (
        <>
          <span className={styles.activeBadge} title="Active" />
          <button
            className={styles.iconBtn}
            title="Download as OWL"
            aria-label="Download as OWL"
            onClick={(e) => {
              e.stopPropagation();
              if (!node.parsed) return;
              const xml = exportOWL(node.parsed);
              const blob = new Blob([xml], { type: "application/rdf+xml" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${node.name}.owl`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download size={13} />
          </button>
        </>
      )}
    </div>
  );
}

function FolderNode({
  node,
  depth,
  activeId,
  renamingId,
  onRenameEnd,
  onContextMenu,
  onOpen,
}: {
  node: WorkspaceFolder;
  depth: number;
  activeId: string | null;
  renamingId: string | null;
  onRenameEnd: () => void;
  onContextMenu: (e: React.MouseEvent, node: WorkspaceNode) => void;
  onOpen: (id: string) => void;
}) {
  const { dispatch } = useWorkspace();
  const [dragOver, setDragOver] = React.useState(false);
  const renaming = renamingId === node.id;

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const id = e.dataTransfer.getData("nodeId");
    if (id && id !== node.id) {
      dispatch({ type: "MOVE_NODE", id, targetFolderId: node.id });
    }
  }

  return (
    <>
      <div
        className={`${styles.nodeRow}${dragOver ? ` ${styles.dragOver}` : ""}`}
        style={{ paddingLeft: depth * 16 }}
        onClick={() => dispatch({ type: "TOGGLE_FOLDER", id: node.id })}
        onContextMenu={(e) => onContextMenu(e, node)}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        draggable
        onDragStart={(e) => e.dataTransfer.setData("nodeId", node.id)}
      >
        <span className={styles.toggle}>
          {node.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <span className={styles.nodeIcon}>
          {node.expanded
            ? <FolderOpen size={14} color="#d0a300" />
            : <Folder size={14} color="#d0a300" />}
        </span>
        {renaming ? (
          <RenameInput
            initialValue={node.name}
            onCommit={(v) => {
              dispatch({ type: "RENAME_NODE", id: node.id, name: v });
              onRenameEnd();
            }}
            onCancel={onRenameEnd}
          />
        ) : (
          <span className={styles.nodeName}>{node.name}</span>
        )}
      </div>
      {node.expanded && (
        <TreeLevel nodes={node.children} depth={depth + 1} activeId={activeId} renamingId={renamingId} onRenameEnd={onRenameEnd} onContextMenu={onContextMenu} onOpen={onOpen} />
      )}
    </>
  );
}

function TreeLevel({
  nodes,
  depth,
  activeId,
  renamingId,
  onRenameEnd,
  onContextMenu,
  onOpen,
}: {
  nodes: WorkspaceNode[];
  depth: number;
  activeId: string | null;
  renamingId: string | null;
  onRenameEnd: () => void;
  onContextMenu: (e: React.MouseEvent, node: WorkspaceNode) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <>
      {nodes.map((node) =>
        node.type === "folder" ? (
          <FolderNode key={node.id} node={node} depth={depth} activeId={activeId} renamingId={renamingId} onRenameEnd={onRenameEnd} onContextMenu={onContextMenu} onOpen={onOpen} />
        ) : (
          <OntologyNode key={node.id} node={node} depth={depth} activeId={activeId} renamingId={renamingId} onRenameEnd={onRenameEnd} onContextMenu={onContextMenu} onOpen={onOpen} />
        )
      )}
    </>
  );
}

// ─── WorkspacePanel ───────────────────────────────────────────────────────────

export function WorkspacePanel() {
  const { state, dispatch } = useWorkspace();
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(null);
  const [importForParent, setImportForParent] = React.useState<string | null | undefined>(undefined);
  const [newOntologyForParent, setNewOntologyForParent] = React.useState<string | null | undefined>(undefined);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const contextMenuRef = React.useRef<HTMLDivElement>(null);
  // undefined = closed, null = import/create at root, string = import/create into folder

  // Close context menu on mousedown outside the menu.
  // Using mousedown (not click) so that item clicks fire *after* the menu
  // closes gracefully, without React removing the DOM node mid-dispatch.
  React.useEffect(() => {
    if (!contextMenu) return;
    function handleMouseDown(e: MouseEvent) {
      if (contextMenuRef.current && contextMenuRef.current.contains(e.target as Node)) return;
      setContextMenu(null);
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [contextMenu]);

  function handleContextMenu(e: React.MouseEvent, node: WorkspaceNode) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id, nodeType: node.type });
  }

  function handleOpen(id: string) {
    dispatch({ type: "SET_ACTIVE", id });
  }

  function addFolder(parentId: string | null) {
    const name = `New folder`;
    dispatch({ type: "ADD_FOLDER", parentId, name });
  }

  // Root drop zone
  function handleRootDrop(e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData("nodeId");
    if (id) dispatch({ type: "MOVE_NODE", id, targetFolderId: null });
  }

  return (
    <aside className={styles.panel} aria-label="Ontology workspace">
      <div className={styles.header}>
        <strong>My Ontologies</strong>
        <div className={styles.headerActions}>
          <button
            className={styles.iconBtn}
            title="New folder"
            onClick={() => addFolder(null)}
          >
            <FolderPlus size={15} />
          </button>
          <button
            className={styles.iconBtn}
            title="New ontology"
            onClick={() => setNewOntologyForParent(null)}
          >
            <FilePlus size={15} />
          </button>
          <button
            className={styles.iconBtn}
            title="Import ontology"
            onClick={() => setImportForParent(null)}
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      <div
        className={styles.tree}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleRootDrop}
      >
        {state.tree.length === 0 ? (
          <div className={styles.emptyState}>
            <FolderOpen size={28} color="#b8ccc7" />
            <p>No ontologies yet.<br />Click <strong>+</strong> to import an OWL file.</p>
          </div>
        ) : (
          <TreeLevel
            nodes={state.tree}
            depth={1}
            activeId={state.activeOntologyId}
            renamingId={renamingId}
            onRenameEnd={() => setRenamingId(null)}
            onContextMenu={handleContextMenu}
            onOpen={handleOpen}
          />
        )}
      </div>

      {/* Context menu */}
      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className={styles.contextMenu}
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.nodeType === "folder" && (
            <>
              <button
                className={styles.contextMenuItem}
                onClick={() => {
                  setNewOntologyForParent(contextMenu.nodeId);
                  setContextMenu(null);
                }}
              >
                <FilePlus size={13} /> New ontology here
              </button>
              <button
                className={styles.contextMenuItem}
                onClick={() => {
                  setImportForParent(contextMenu.nodeId);
                  setContextMenu(null);
                }}
              >
                <Upload size={13} /> Import ontology here
              </button>
              <button
                className={styles.contextMenuItem}
                onClick={() => {
                  addFolder(contextMenu.nodeId);
                  setContextMenu(null);
                }}
              >
                <FolderPlus size={13} /> New subfolder
              </button>
              <div className={styles.contextMenuDivider} />
            </>
          )}
          {contextMenu.nodeType === "ontology" && (
            <>
              <button
                className={styles.contextMenuItem}
                onClick={() => {
                  dispatch({ type: "SET_ACTIVE", id: contextMenu.nodeId });
                  setContextMenu(null);
                }}
              >
                <MoreHorizontal size={13} /> Open in designer
              </button>
              <div className={styles.contextMenuDivider} />
            </>
          )}
          <button
            className={styles.contextMenuItem}
            onClick={() => {
              setRenamingId(contextMenu.nodeId);
              setContextMenu(null);
            }}
          >
            <Pencil size={13} /> Rename
          </button>
          <div className={styles.contextMenuDivider} />
          <button
            className={`${styles.contextMenuItem} ${styles.contextMenuDanger}`}
            onClick={() => {
              dispatch({ type: "DELETE_NODE", id: contextMenu.nodeId });
              setContextMenu(null);
            }}
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>,
        document.body
      )}

      {/* Import dialog */}
      {importForParent !== undefined && (
        <ImportDialog
          parentId={importForParent}
          onClose={() => setImportForParent(undefined)}
        />
      )}

      {/* New ontology dialog */}
      {newOntologyForParent !== undefined && (
        <NewOntologyDialog
          parentId={newOntologyForParent}
          onClose={() => setNewOntologyForParent(undefined)}
        />
      )}
    </aside>
  );
}

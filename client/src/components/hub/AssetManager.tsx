import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  assetUrl,
  downloadAssetZip,
  type Asset,
  type AssetFolder,
  type Visibility,
} from '../../api';
import { useAuth } from '../../auth';
import Icon from '../Icon';
import SearchField from '../SearchField';
import VisibilityToggle from '../VisibilityToggle';

/** Sentinel for the root drop target; folder names can't contain it. */
const ROOT = '\u0000root';

const KINDS = [
  { value: 'image', label: 'Imagen' },
  { value: 'map', label: 'Mapa' },
  { value: 'token', label: 'Token' },
  { value: 'audio', label: 'Audio' },
  { value: 'doc', label: 'Documento' },
];

function formatDate(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function AssetManager({ campaignId }: { campaignId: string }) {
  const user = useAuth((s) => s.user);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [cwd, setCwd] = useState(''); // '' = root (sin carpeta)
  const [uploadKind, setUploadKind] = useState('image');
  const [onlyKind, setOnlyKind] = useState('all');
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Asset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPrivate, setUploadPrivate] = useState(false);
  const [error, setError] = useState('');
  const [dropActive, setDropActive] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFolderPrivate, setNewFolderPrivate] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // Reset navigation when switching campaign.
  useEffect(() => {
    setCwd('');
    setQuery('');
    setSelectedId(null);
    setCreating(false);
    setRenaming(null);
  }, [campaignId]);

  async function load() {
    // Each request fails on its own: one broken endpoint should not wipe out
    // the assets list too, and the error shown should name the real cause.
    setError('');
    try {
      const assetsRes = await api.get<{ assets: Asset[] }>(`/campaigns/${campaignId}/assets`);
      setAssets(assetsRes.assets);
    } catch (e) {
      setAssets([]);
      setError((e as Error).message);
    }

    try {
      const foldersRes = await api.get<{ folders: AssetFolder[] }>(
        `/campaigns/${campaignId}/folders`,
      );
      setFolders(foldersRes.folders);
    } catch {
      // Folders are optional; without them the browser still lists loose files.
      setFolders([]);
    }

    try {
      const d = await api.get<{ role: string }>(`/campaigns/${campaignId}`);
      setCanEdit(d.role === 'owner' || d.role === 'gm');
    } catch {
      setCanEdit(false);
    }
  }

  /** Uploads land in the folder currently open - no separate target field. */
  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        form.append('campaignId', campaignId);
        form.append('name', file.name);
        form.append('kind', uploadKind);
        form.append('folder', cwd);
        form.append('visibility', uploadPrivate ? 'private' : 'public');
        await api.upload('/upload', form);
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar este recurso?')) return;
    await api.del(`/assets/${id}`);
    setViewing(null);
    setSelectedId(null);
    load();
  }

  /** Move an asset into another folder (or to the root). Optimistic. */
  async function moveAsset(asset: Asset, toFolder: string) {
    if ((asset.folder || '') === toFolder) return;
    const previous = asset.folder || '';
    setAssets((cur) =>
      cur.map((a) => (a.id === asset.id ? { ...a, folder: toFolder } : a)),
    );
    try {
      await api.patch(`/assets/${asset.id}`, { folder: toFolder });
    } catch (e) {
      setAssets((cur) =>
        cur.map((a) => (a.id === asset.id ? { ...a, folder: previous } : a)),
      );
      setError((e as Error).message);
    }
  }

  const [movePickerId, setMovePickerId] = useState<string | null>(null);
  // Folder name being hovered as a drop target, or `__root__` for the root.
  const [dropFolder, setDropFolder] = useState<string | null>(null);

  function copyUrl(url: string) {
    navigator.clipboard?.writeText(assetUrl(url) || url);
  }

  /* ---------------- folders ---------------- */

  /**
   * Folders can predate the asset_folders table (assets only stored a name),
   * so the visible list is the union of both sources. Mutations resolve the id
   * lazily, which keeps us from writing on every page load.
   */
  const folderNames = useMemo(() => {
    const set = new Set<string>();
    for (const f of folders) set.add(f.name);
    for (const a of assets) if (a.folder) set.add(a.folder);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [folders, assets]);

  /** Mirrors canManageFolder on the server: GM, or the folder's own creator. */
  const canManage = useCallback(
    (folder: AssetFolder | undefined) => !!folder && (canEdit || folder.ownerId === user?.id),
    [canEdit, user?.id],
  );

  async function ensureFolder(name: string): Promise<string> {
    const existing = folders.find((f) => f.name === name);
    if (existing) return existing.id;
    const r = await api.post<{ folder: AssetFolder }>(`/campaigns/${campaignId}/folders`, { name });
    setFolders((prev) => (prev.some((f) => f.name === name) ? prev : [...prev, r.folder]));
    return r.folder.id;
  }

  function manageError(): string | null {
    return canEdit ? null : 'Solo puedes gestionar las carpetas que creaste tú.';
  }

  /**
   * Flip a folder's visibility. The server only accepts this from the folder's
   * creator, so the toggle is hidden for a GM acting on someone else's folder.
   */
  async function setFolderVisibility(folder: AssetFolder, next: Visibility) {
    setError('');
    if (folder.ownerId !== user?.id) {
      setError('Solo quien creó la carpeta puede cambiar su visibilidad.');
      return;
    }
    try {
      await api.patch(`/folders/${folder.id}`, { visibility: next });
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, visibility: next } : f)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /**
   * Optimistic flip for an asset, rolled back if the server refuses. The
   * rollback restores this one asset's previous value rather than the whole
   * array, otherwise two quick toggles in the same render would make the first
   * failure undo the second as well.
   */
  async function setAssetVisibility(asset: Asset, next: Visibility) {
    const previous = asset.visibility || 'public';
    setAssets((cur) => cur.map((a) => (a.id === asset.id ? { ...a, visibility: next } : a)));
    try {
      await api.patch(`/assets/${asset.id}`, { visibility: next });
    } catch (e) {
      setAssets((cur) =>
        cur.map((a) => (a.id === asset.id ? { ...a, visibility: previous } : a)),
      );
      setError((e as Error).message);
    }
  }

  async function createFolder() {
    const name = newName.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    setError('');
    try {
      await api.post(`/campaigns/${campaignId}/folders`, {
        name,
        visibility: newFolderPrivate ? 'private' : 'public',
      });
      setNewName('');
      setNewFolderPrivate(false);
      setCreating(false);
      await load();
      setCwd(name);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function renameFolder(from: string, to: string) {
    const name = to.trim();
    setRenaming(null);
    if (!name || name === from) return;
    setError('');
    const folder = folders.find((f) => f.name === from);
    if (!canManage(folder)) {
      setError(manageError());
      return;
    }
    try {
      const id = await ensureFolder(from);
      await api.patch(`/folders/${id}`, { name });
      if (cwd === from) setCwd(name);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteFolder(name: string) {
    const folder = folders.find((f) => f.name === name);
    if (!canManage(folder)) {
      setError(manageError());
      return;
    }
    if (!confirm(`¿Eliminar la carpeta “${name}”? Sus archivos se moverán a la raíz.`)) return;
    setError('');
    try {
      const id = await ensureFolder(name);
      await api.del(`/folders/${id}`);
      if (cwd === name) setCwd('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const files = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets
      .filter((a) => (a.folder || '') === cwd)
      .filter((a) => onlyKind === 'all' || a.kind === onlyKind)
      .filter((a) => !q || a.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assets, cwd, onlyKind, query]);

  // Sub-folders only exist at the root: `folder` is a flat, single-level field.
  const subFolders = cwd === '' ? folderNames : [];

  function openFolder(name: string) {
    setCwd(name);
    setSelectedId(null);
    setQuery('');
    setRenaming(null);
  }

  function goUp() {
    if (cwd) {
      setCwd('');
      setSelectedId(null);
    }
  }

  function openAsset(a: Asset) {
    if (a.mime.startsWith('image/') || a.mime.startsWith('audio/')) setViewing(a);
    else window.open(assetUrl(a.url) || a.url, '_blank', 'noreferrer');
  }

  async function downloadZip() {
    setError('');
    try {
      await downloadAssetZip(campaignId, cwd === '' ? undefined : cwd);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      if (viewing) setViewing(null);
      else if (query) setQuery('');
      else goUp();
      return;
    }
    if (e.key === 'Backspace' && !query) {
      e.preventDefault();
      goUp();
      return;
    }
    if (e.key !== 'Enter' || !selectedId) return;
    const asset = assets.find((a) => a.id === selectedId);
    if (asset) openAsset(asset);
  }

  return (
    <div className="fm" onKeyDown={onKeyDown} tabIndex={-1}>
      {/* ---------------- toolbar ---------------- */}
      <div className="fm-toolbar">
        <div className="fm-nav">
          <button className="icon-btn" onClick={goUp} disabled={!cwd} title="Subir un nivel">
            <Icon name="back" size={15} />
          </button>
          <nav className="fm-crumbs" aria-label="Ruta de carpetas">
            <button className={`fm-crumb ${cwd === '' ? 'active' : ''}`} onClick={() => openFolder('')}>
              Recursos
            </button>
            {cwd && (
              <>
                <span className="fm-sep">/</span>
                <span className="fm-crumb active" title={cwd}>
                  {cwd}
                </span>
              </>
            )}
          </nav>
        </div>

        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Buscar en esta carpeta…"
          label="Buscar recursos"
        />

        <div className="fm-actions">
          <select
            className="fm-select"
            value={onlyKind}
            onChange={(e) => setOnlyKind(e.target.value)}
            title="Filtrar por tipo"
            aria-label="Filtrar por tipo"
          >
            <option value="all">Todos los tipos</option>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>

          <div className="fm-viewtoggle" role="group" aria-label="Vista">
            <button
              className={layout === 'grid' ? 'on' : ''}
              onClick={() => setLayout('grid')}
              title="Vista de iconos"
              aria-label="Vista de iconos"
            >
              <Icon name="overview" size={14} />
            </button>
            <button
              className={layout === 'list' ? 'on' : ''}
              onClick={() => setLayout('list')}
              title="Vista de lista"
              aria-label="Vista de lista"
            >
              <Icon name="file" size={14} />
            </button>
          </div>

          <button className="btn" onClick={downloadZip} title="Descargar esta carpeta en ZIP">
            <Icon name="file" size={14} />
            <span className="hide-sm">ZIP</span>
          </button>

          <div className="fm-upload">
            <VisibilityToggle
              value={uploadPrivate ? 'private' : 'public'}
              onChange={(next) => setUploadPrivate(next === 'private')}
              label="Visibilidad de lo que se suba ahora"
            />
            <select
              className="fm-select"
              value={uploadKind}
              onChange={(e) => setUploadKind(e.target.value)}
              title="Tipo de archivo al subir"
              aria-label="Tipo de archivo al subir"
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <button
              className="btn primary"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <Icon name="upload" size={14} />
              {uploading ? 'Subiendo…' : 'Subir'}
            </button>
          </div>
        </div>
      </div>

      <p className="fm-hint muted">
        {subFolders.length + files.length === 0
          ? 'Esta carpeta está vacía. Arrastra archivos aquí o usa Subir.'
          : `${subFolders.length} ${subFolders.length === 1 ? 'carpeta' : 'carpetas'} · ${files.length} ${
              files.length === 1 ? 'archivo' : 'archivos'
            }${query ? ` para “${query}”` : ''}`}
      </p>

      {/* ---------------- body ---------------- */}
      <div className="fm-body">
        <aside className="fm-side">
          <button
            className={`fm-side-item ${cwd === '' ? 'active' : ''} ${
              dropFolder === ROOT ? 'drag-over' : ''
            }`}
            onClick={() => openFolder('')}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('application/x-asset-id')) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDropFolder(ROOT);
            }}
            onDragLeave={() => setDropFolder((t) => (t === ROOT ? null : t))}
            onDrop={(e) => {
              const id = e.dataTransfer.getData('application/x-asset-id');
              setDropFolder(null);
              if (!id) return;
              e.preventDefault();
              const asset = assets.find((x) => x.id === id);
              if (asset) void moveAsset(asset, '');
            }}
          >
            <Icon name="home" size={15} />
            <span>Todos los recursos</span>
          </button>

          {folderNames.map((f) => {
            const folder = folders.find((x) => x.name === f);
            const isPrivate = folder?.visibility === 'private';
            const mine = canManage(folder);
            return renaming === f ? (
              <input
                key={f}
                className="fm-side-input"
                value={renameValue}
                autoFocus
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => renameFolder(f, renameValue)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameFolder(f, renameValue);
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
            ) : (
              <div key={f} className={`fm-side-row ${cwd === f ? 'active' : ''}`}>
                <button className="fm-side-item" onClick={() => openFolder(f)} title={f}>
                  <Icon name={isPrivate ? 'lock' : 'folder'} size={15} />
                  <span className="fm-side-name">{f}</span>
                  <em>{assets.filter((a) => a.folder === f).length}</em>
                </button>
                {folder && folder.ownerId === user?.id && (
                  <VisibilityToggle
                    value={folder.visibility || 'public'}
                    onChange={(next) => setFolderVisibility(folder, next)}
                    label={`Visibilidad de la carpeta ${f}`}
                  />
                )}
                {mine && (
                  <span className="fm-side-tools">
                    <button
                      className="icon-btn"
                      title="Renombrar carpeta"
                      onClick={() => {
                        setRenaming(f);
                        setRenameValue(f);
                      }}
                    >
                      <Icon name="edit" size={13} />
                    </button>
                    <button className="icon-btn danger" title="Eliminar carpeta" onClick={() => deleteFolder(f)}>
                      <Icon name="trash" size={13} />
                    </button>
                  </span>
                )}
              </div>
            );
          })}

          {creating ? (
            <div className="fm-newfolder">
              <input
                className="fm-side-input"
                placeholder="Nombre de la carpeta"
                value={newName}
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onBlur={createFolder}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createFolder();
                  if (e.key === 'Escape') {
                    setCreating(false);
                    setNewName('');
                    setNewFolderPrivate(false);
                  }
                }}
              />
              <VisibilityToggle
                value={newFolderPrivate ? 'private' : 'public'}
                onChange={(next) => setNewFolderPrivate(next === 'private')}
                label="Visibilidad de la nueva carpeta"
              />
            </div>
          ) : (
            <button className="fm-side-new" onClick={() => setCreating(true)}>
              <Icon name="plus" size={14} /> Nueva carpeta
            </button>
          )}
        </aside>

        <div
          className={`fm-content ${layout === 'list' ? 'as-list' : ''} ${dropActive ? 'drop' : ''}`}
          onDragEnter={(e) => {
            if (!e.dataTransfer.types.includes('Files')) return;
            dragDepth.current += 1;
            setDropActive(true);
          }}
          onDragOver={(e) => {
            // Accept both real files from the OS and our own asset drags, so
            // dropping a card on empty space files it into the open folder.
            if (
              e.dataTransfer.types.includes('Files') ||
              e.dataTransfer.types.includes('application/x-asset-id')
            ) {
              e.preventDefault();
            }
          }}
          onDragLeave={() => {
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDropActive(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragDepth.current = 0;
            setDropActive(false);
            setDropFolder(null);
            const assetId = e.dataTransfer.getData('application/x-asset-id');
            if (assetId) {
              const asset = assets.find((x) => x.id === assetId);
              if (asset) void moveAsset(asset, cwd);
              return;
            }
            void onFiles(e.dataTransfer.files);
          }}
        >
          {subFolders.map((f) => {
            const folder = folders.find((x) => x.name === f);
            const isPrivate = folder?.visibility === 'private';
            const count = assets.filter((a) => a.folder === f).length;
            return (
              <button
                key={f}
                className={`fm-item fm-folder ${dropFolder === f ? 'drag-over' : ''}`}
                onClick={() => openFolder(f)}
                onDragOver={(e) => {
                  // Only accept our own asset drags, not files from outside.
                  if (!e.dataTransfer.types.includes('application/x-asset-id')) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDropFolder(f);
                }}
                onDragLeave={() => setDropFolder((t) => (t === f ? null : t))}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData('application/x-asset-id');
                  setDropFolder(null);
                  if (!id) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const asset = assets.find((x) => x.id === id);
                  if (asset) void moveAsset(asset, f);
                }}
              >
                <span className="fm-thumb">
                  <Icon name={isPrivate ? 'lock' : 'folder'} size={34} />
                </span>
                <span className="fm-item-name">{f}</span>
                <span className="fm-item-sub">
                  {count} {count === 1 ? 'archivo' : 'archivos'}
                  {isPrivate ? ' · privado' : ''}
                </span>
              </button>
            );
          })}

          {files.map((a) => (
            <div
              key={a.id}
              className={`fm-item ${selectedId === a.id ? 'selected' : ''}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-asset-id', a.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onClick={() => setSelectedId(a.id)}
              onDoubleClick={() => openAsset(a)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') openAsset(a);
              }}
            >
              <span className="fm-thumb">
                {a.mime.startsWith('image/') ? (
                  <img src={assetUrl(a.url) || a.url} alt="" loading="lazy" />
                ) : (
                  <Icon name="file" size={30} />
                )}
              </span>
              <span className="fm-item-name" title={a.name}>
                {a.name}
              </span>
              <span className="fm-item-sub">
                {kindLabel(a.kind)}
                {formatDate(a.createdAt) ? ` · ${formatDate(a.createdAt)}` : ''}
                {a.visibility === 'private' ? ' · privado' : ''}
              </span>
              <span className="fm-item-actions">
                <VisibilityToggle
                  value={a.visibility || 'public'}
                  onChange={(next) => setAssetVisibility(a, next)}
                  label={`Visibilidad de ${a.name}`}
                />
                <div className="fm-move">
                  <button
                    className="icon-btn"
                    title="Mover a otra carpeta"
                    aria-label={`Mover ${a.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMovePickerId(movePickerId === a.id ? null : a.id);
                    }}
                  >
                    <Icon name="folderOpen" size={14} />
                  </button>
                  {movePickerId === a.id && (
                    <select
                      className="fm-select fm-move-select"
                      value={a.folder || ''}
                      aria-label={`Carpeta destino para ${a.name}`}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        void moveAsset(a, e.target.value);
                        setMovePickerId(null);
                      }}
                      onBlur={() => setMovePickerId(null)}
                    >
                      {folderNames.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                      {/* Only offer the root when it is not where it already is. */}
                      {a.folder ? <option value="">Sin carpeta (raíz)</option> : null}
                    </select>
                  )}
                </div>
                <button
                  className="icon-btn"
                  title="Copiar URL"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyUrl(a.url);
                  }}
                >
                  <Icon name="link" size={14} />
                </button>
                <button
                  className="icon-btn danger"
                  title="Eliminar"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(a.id);
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
              </span>
            </div>
          ))}

          {subFolders.length === 0 && files.length === 0 && (
            <p className="muted fm-empty">
              {query ? `Ningún archivo coincide con “${query}”.` : 'Esta carpeta está vacía.'}
            </p>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => onFiles(e.target.files)}
      />
      {error && <p className="error">{error}</p>}

      {viewing && (
        <div className="overlay" onClick={() => setViewing(null)}>
          <div className="card wide" onClick={(e) => e.stopPropagation()}>
            <div className="row spread">
              <h1 style={{ fontSize: 18 }}>{viewing.name}</h1>
              <button className="icon-btn" onClick={() => setViewing(null)} title="Cerrar">
                <Icon name="close" size={16} />
              </button>
            </div>
            {viewing.mime.startsWith('image/') ? (
              <img className="asset-viewer" src={assetUrl(viewing.url) || viewing.url} alt={viewing.name} />
            ) : (
              <audio controls src={assetUrl(viewing.url) || viewing.url} style={{ width: '100%' }} />
            )}
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" onClick={() => copyUrl(viewing.url)}>
                <Icon name="link" size={14} /> Copiar URL
              </button>
              <a className="btn" href={assetUrl(viewing.url) || viewing.url} target="_blank" rel="noreferrer">
                Abrir
              </a>
              <button className="btn danger" onClick={() => remove(viewing.id)}>
                <Icon name="trash" size={14} /> Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    image: 'Imagen',
    map: 'Mapa',
    token: 'Token',
    audio: 'Audio',
    doc: 'Documento',
  };
  return map[kind] || kind;
}
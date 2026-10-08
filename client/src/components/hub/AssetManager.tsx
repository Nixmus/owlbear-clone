import { useEffect, useMemo, useRef, useState } from 'react';
import { api, assetUrl, downloadAssetZip, type Asset } from '../../api';
import Icon from '../Icon';

const KINDS = [
  { value: 'image', label: 'Imagen' },
  { value: 'map', label: 'Mapa' },
  { value: 'token', label: 'Token' },
  { value: 'audio', label: 'Audio' },
  { value: 'doc', label: 'Documento' },
];

export default function AssetManager({ campaignId }: { campaignId: string }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [kind, setKind] = useState('image');
  const [folder, setFolder] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState<Asset | null>(null);
  const [onlyKind, setOnlyKind] = useState('all');
  const [onlyFolder, setOnlyFolder] = useState('all');
  const [query, setQuery] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function load() {
    const d = await api.get<{ assets: Asset[] }>(`/campaigns/${campaignId}/assets`);
    setAssets(d.assets);
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        form.append('campaignId', campaignId);
        form.append('name', file.name);
        form.append('kind', kind);
        form.append('folder', folder);
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
    load();
  }

  function copyUrl(url: string) {
    navigator.clipboard?.writeText(assetUrl(url) || url);
  }

  const folderNames = useMemo(
    () => [...new Set(assets.map((a) => a.folder).filter(Boolean))].sort(),
    [assets],
  );

  const visible = useMemo(
    () =>
      assets.filter((a) => {
        if (onlyKind !== 'all' && a.kind !== onlyKind) return false;
        if (onlyFolder !== 'all' && a.folder !== onlyFolder) return false;
        if (query && !a.name.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      }),
    [assets, onlyKind, onlyFolder, query],
  );

  async function downloadZip() {
    setError('');
    try {
      await downloadAssetZip(campaignId, onlyFolder === 'all' ? undefined : onlyFolder);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="hub">
      <div className="hub-card">
        <div className="row spread">
          <div>
            <h3>Recursos de la campaña</h3>
            <p className="muted" style={{ margin: 0 }}>
              Mapas, retratos, tokens, música y documentos. Organízalos en carpetas y descárgalos en ZIP.
            </p>
          </div>
          <div className="row" style={{ flex: 'none', gap: 8 }}>
            <button className="btn" onClick={downloadZip} title="Descargar recursos en ZIP">
              <Icon name="file" size={14} /> ZIP
            </button>
            <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? (
                'Subiendo…'
              ) : (
                <>
                  <Icon name="upload" size={14} /> Subir
                </>
              )}
            </button>
          </div>
        </div>

        <div className="filters">
          <div className="field">
            <label>Búsqueda</label>
            <input placeholder="Buscar por nombre…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="field">
            <label>Tipo</label>
            <select value={onlyKind} onChange={(e) => setOnlyKind(e.target.value)}>
              <option value="all">Todos</option>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Carpeta</label>
            <select value={onlyFolder} onChange={(e) => setOnlyFolder(e.target.value)}>
              <option value="all">Todas</option>
              {folderNames.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Subir a carpeta</label>
            <input
              placeholder="(sin carpeta)"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              list="folder-list"
            />
            <datalist id="folder-list">
              {folderNames.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="row" style={{ flex: 'none', gap: 8 }}>
          <span className="muted" style={{ alignSelf: 'center' }}>
            Tipo al subir:
          </span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ maxWidth: 160 }}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => onFiles(e.target.files)}
        />
        {error && <p className="error">{error}</p>}

        <div className="asset-grid">
          {visible.map((a) => (
            <div key={a.id} className="asset-card">
              <div className="asset-preview" onClick={() => setViewing(a)}>
                {a.mime.startsWith('image/') ? (
                  <img src={assetUrl(a.url) || a.url} alt={a.name} />
                ) : (
                  <div className="asset-file">
                    <Icon name="file" size={34} />
                  </div>
                )}
              </div>
              <div className="asset-meta">
                <span className="asset-name" title={a.name}>
                  {a.name}
                </span>
                <div className="row" style={{ gap: 4 }}>
                  <span className="chip">{kindLabel(a.kind)}</span>
                  {a.folder && <span className="chip">{a.folder}</span>}
                </div>
              </div>
              <div className="asset-actions">
                <button className="icon-btn" onClick={() => copyUrl(a.url)} title="Copiar URL">
                  <Icon name="link" size={15} />
                </button>
                <button className="icon-btn danger" onClick={() => remove(a.id)} title="Eliminar">
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </div>
          ))}
          {visible.length === 0 && <p className="muted">No hay recursos que coincidan.</p>}
        </div>
      </div>

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
            ) : viewing.mime.startsWith('audio/') ? (
              <audio controls src={assetUrl(viewing.url) || viewing.url} style={{ width: '100%' }} />
            ) : (
              <p className="muted">Vista previa no disponible. Usa el enlace para abrirlo.</p>
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

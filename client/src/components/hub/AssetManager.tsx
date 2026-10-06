import { useEffect, useRef, useState } from 'react';
import { api, assetUrl, type Asset } from '../../api';

const KINDS = ['image', 'map', 'token', 'audio', 'doc'];

export default function AssetManager({ campaignId }: { campaignId: string }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [kind, setKind] = useState('image');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
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
    if (!confirm('Delete this asset?')) return;
    await api.del(`/assets/${id}`);
    load();
  }

  function copyUrl(url: string) {
    navigator.clipboard?.writeText(assetUrl(url) || url);
  }

  return (
    <div className="hub">
      <div className="hub-card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Campaign assets</h3>
          <div className="row" style={{ flex: 'none', gap: 8 }}>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : '⬆️ Upload'}
            </button>
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

        <div className="asset-grid">
          {assets.map((a) => (
            <div key={a.id} className="asset-card">
              {a.mime.startsWith('image/') ? (
                <img src={assetUrl(a.url) || a.url} alt={a.name} />
              ) : (
                <div className="asset-file">📄</div>
              )}
              <div className="asset-meta">
                <span className="asset-name" title={a.name}>
                  {a.name}
                </span>
                <span className="chip">{a.kind}</span>
              </div>
              <div className="asset-actions">
                <button className="btn sm" onClick={() => copyUrl(a.url)} title="Copy URL">
                  🔗
                </button>
                <button className="btn sm danger" onClick={() => remove(a.id)}>
                  🗑️
                </button>
              </div>
            </div>
          ))}
          {assets.length === 0 && <p className="muted">No assets uploaded yet.</p>}
        </div>
      </div>
    </div>
  );
}

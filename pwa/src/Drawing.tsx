import {useEffect,useRef,useState} from 'react';
import type {ApiClient} from './api';
import {ApiError} from './api';
import {flushMutations} from './sync';
import {listDrafts,listLocalBlobs,putLocalBlob,saveDraftAndQueue,resolveConflictedDocument,type Draft,type LocalBlob} from './storage';
import {addPoint,createBoard,finishStroke,undo,redo,type BoardState,type PointerSample} from './whiteboard';
const uid=()=>crypto.randomUUID();
function PhotoPreview({ photo }: { photo: LocalBlob }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo.blob); setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo.blob]);
  return url ? <img src={url} alt={photo.name} style={{ maxWidth: '100%', maxHeight: 240, display: 'block' }} /> : null;
}

export function Drawing({ api: client, accountId, spaceId, documentId = 'whiteboard-main', syncedVersion, onNotice, editing = true, onEdit, photoInputId, readOnly = false, pageMode = false, inkTool = 'pen', inkColor = '#20343b', inkWidth = 3, registerUploader }: { api?: ApiClient; accountId: string; spaceId: string; documentId?: string; syncedVersion: number|string; onNotice: (message: string) => void; editing?: boolean; onEdit?: () => void; photoInputId?: string; readOnly?: boolean; pageMode?: boolean; inkTool?: 'pen'|'highlighter'|'eraser'; inkColor?: string; inkWidth?: number; registerUploader?: (upload: ((file:File)=>Promise<LocalBlob|undefined>)|null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [board, setBoard] = useState<BoardState>(createBoard);
  const inkUndo=useRef<BoardState[]>([]),inkRedo=useRef<BoardState[]>([]);
  const [canvasSize, setCanvasSize] = useState(0);
  const [loading,setLoading]=useState(true);
  const [penColor, setPenColor] = useState('#20343b');
  const [penWidth, setPenWidth] = useState(3);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setCanvasSize(value => value + 1));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [editing, loading, board.strokes.length>0]);
  const editRevision = useRef(0);
  const savedRevision = useRef(0);
  const localSave = useRef<Promise<void>>(Promise.resolve());
  const editBoard = (update: (old: BoardState) => BoardState) => { editRevision.current += 1; setBoard(update); };
  const [photos, setPhotos] = useState<LocalBlob[]>([]);
  const [conflicted,setConflicted]=useState(false);
  const [loadFailed,setLoadFailed]=useState(false);
  const [reloadKey,setReloadKey]=useState(0);
  const [resolving,setResolving]=useState(false);
  const [photoMessage, setPhotoMessage] = useState('');
  const [baseVersion, setBaseVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listLocalBlobs(accountId, spaceId),listDrafts(accountId, spaceId)]).then(([local,items])=>{
      if(cancelled || editRevision.current!==savedRevision.current)return;
      const saved=items.find(item=>item.type==='whiteboard' && item.documentId===documentId);
      const content=saved?.content as {board?:BoardState;paperLayout?:number;photos?:Omit<LocalBlob,'blob'|'accountId'|'spaceId'|'createdAt'>[]} | undefined;
      const references=content?.photos ?? [];
      // Unloaded remote attachments keep their references even if a download fails.
      const selected=references.map(ref=>local.find(photo=>photo.id===ref.id) ?? {...ref,accountId,spaceId,createdAt:Date.now(),blob:new Blob(),status:ref.serverId?'uploaded' as const:'pending' as const});
      for(const photo of local.filter(photo=>!photo.removedFromNote && (photo.documentId===documentId || (documentId==='whiteboard-main' && !photo.documentId)))) if(!selected.some(item=>item.id===photo.id)){selected.push(photo);editRevision.current++;}
      if(pageMode && saved && !content?.paperLayout)editRevision.current++;
      setPhotos(selected); setBoard(content?.board ?? createBoard());setBaseVersion(saved?.baseVersion ?? 0);setConflicted(saved?.syncState==='conflict');setLoadFailed(false);setLoading(false);
    }).catch(()=>{if(!cancelled){setLoadFailed(true);setLoading(false);onNotice('Les pièces jointes n’ont pas pu être chargées. Réessayez avant de modifier cette note.');}});
    return () => { cancelled = true; };
  }, [accountId, spaceId, documentId, syncedVersion, reloadKey]);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if(!client)return;
      try {
        await flushMutations(client, accountId, spaceId, () => !cancelled && mounted.current);
        const local = await listLocalBlobs(accountId, spaceId);
        const saved = (await listDrafts(accountId, spaceId)).find(item => item.type === 'whiteboard' && item.documentId === documentId);
        const references = (saved?.content as { photos?: { id: string; name: string; serverId?: string }[] } | undefined)?.photos ?? [];
        for (const reference of references) {
          if (cancelled) return;
          if (!reference.serverId || local.some(photo => photo.id === reference.id && photo.blob.size)) continue;
          const blob = await client.downloadBlob(spaceId, reference.serverId);
          const photo: LocalBlob = { ...reference, documentId, accountId, spaceId, blob, createdAt: Date.now(), status: 'uploaded' };
          await putLocalBlob(photo); const index=local.findIndex(item=>item.id===photo.id); if(index>=0)local[index]=photo;else local.push(photo);
        }
        if (!cancelled && editRevision.current===savedRevision.current) setPhotos(references.map(ref=>local.find(photo=>photo.id===ref.id) ?? {...ref,accountId,spaceId,createdAt:Date.now(),blob:new Blob(),status:'uploaded'}));
      } catch { if (!cancelled) setPhotoMessage('Certaines photos attendent la connexion.'); }
    };
    void refresh(); addEventListener('online', refresh);
    return () => { cancelled = true; removeEventListener('online', refresh); };
  }, [accountId, spaceId, documentId, syncedVersion, reloadKey]);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ratio = window.devicePixelRatio || 1; const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio; canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.setTransform(ratio * board.zoom, 0, 0, ratio * board.zoom, board.offsetX, board.offsetY);
    ctx.clearRect(-board.offsetX, -board.offsetY, canvas.width / ratio / board.zoom, canvas.height / ratio / board.zoom);
    for (const stroke of [...board.strokes, ...(board.active ? [board.active] : [])]) {
      if (stroke.points.length < 1) continue; ctx.beginPath(); ctx.strokeStyle = stroke.color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (stroke.points.length === 1) {
        const point = stroke.points[0]; ctx.fillStyle = stroke.color; ctx.arc(point.x, point.y, stroke.width * (0.5 + point.pressure) / 2, 0, Math.PI * 2); ctx.fill();
      } else {
        for (let index = 1; index < stroke.points.length; index++) {
          const previous = stroke.points[index - 1], point = stroke.points[index];
          ctx.beginPath(); ctx.lineWidth = stroke.width * (0.5 + point.pressure);
          ctx.moveTo(previous.x, previous.y); ctx.lineTo(point.x, point.y); ctx.stroke();
        }
      }
    }
  }, [board, canvasSize, editing, loading]);
  const sample = (event: React.PointerEvent<HTMLCanvasElement>): PointerSample => { const rect = event.currentTarget.getBoundingClientRect(); return { id: event.pointerId, pointerType: event.pointerType, x: (event.clientX - rect.left - board.offsetX) / board.zoom, y: (event.clientY - rect.top - board.offsetY) / board.zoom, pressure: event.pressure, width: event.width, height: event.height, isPrimary: event.isPrimary }; };
  useEffect(()=>{registerUploader?.(addPhoto);return()=>registerUploader?.(null);},[loading,loadFailed,conflicted,readOnly,photos,baseVersion]);
  useEffect(()=>{const action=(event:Event)=>{const data=(event as CustomEvent).detail;if(data?.documentId!==documentId||readOnly||conflicted||loading)return;if(pageMode){const from=data.action==='undo'?inkUndo:inkRedo,to=data.action==='undo'?inkRedo:inkUndo;const previous=from.current.pop();if(previous){to.current.push(board);editBoard(()=>previous);}return;}if(data.action==='undo')editBoard(undo);if(data.action==='redo')editBoard(redo);};addEventListener('dowze:ink-action',action);return()=>removeEventListener('dowze:ink-action',action);},[documentId,readOnly,conflicted,loading,pageMode,board]);
  async function addPhoto(file?: File):Promise<LocalBlob|undefined> {
    if (!file || loading || loadFailed || conflicted || readOnly) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 16 * 1024 * 1024) { setPhotoMessage('Choisissez une image JPEG, PNG ou WebP de moins de 16 Mio.'); return; }
    const local: LocalBlob = { id: uid(), documentId, accountId, spaceId, blob: file, name: file.name, createdAt: Date.now(), status: 'pending' };
    await putLocalBlob(local); if (!mounted.current) return; editRevision.current++; setPhotos((old) => [...old, local]); setPhotoMessage('Photo conservée localement, en attente d’envoi.');
    if (!client || !navigator.onLine) return local;
    try {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const sha = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      if (!mounted.current) return;
      const uploaded = await client.uploadBlob(spaceId, file, sha, local.id);
      const done = { ...local, status: 'uploaded' as const, serverId: uploaded.id }; await putLocalBlob(done);
      if (!mounted.current) return;
      editRevision.current++; setPhotos((old) => old.map((item) => item.id === local.id ? done : item)); setPhotoMessage('Photo envoyée dans le stockage privé.');return done;
    } catch { setPhotoMessage('Photo locale en attente de synchronisation. Aucun envoi confirmé.');return local; }
  }
  async function saveDrawing(localOnly = false) {
    if(loading || loadFailed || conflicted || readOnly)return;
    const revision = editRevision.current;
    const draft: Draft = { accountId, spaceId, documentId, type: 'whiteboard', title: 'Feuille libre', content: { ...(pageMode?{paperLayout:1}:{}), board, blob_ids: photos.flatMap(photo => photo.serverId ? [photo.serverId] : []), photos: photos.map(({ id, name, status, serverId }) => ({ id, name, status, serverId })) }, baseVersion, updatedAt: Date.now(), syncState: 'queued' };
    // Start local durability immediately; only the server upload is debounced.
    // Ordered writes prevent an older completed stroke overwriting a newer one.
    const write = localSave.current.catch(() => {}).then(async () => {
      if (revision <= savedRevision.current) return;
      const id = uid();
      await saveDraftAndQueue(draft, { id, accountId, spaceId, documentId: draft.documentId, type: draft.type, baseVersion, content: draft.content, createdAt: Date.now(), status: 'pending' });
      savedRevision.current = Math.max(savedRevision.current, revision);
    });
    localSave.current = write;
    await write;
    if (localOnly || !mounted.current) return;
    onNotice('Dessin enregistré localement.'); if (!client || !navigator.onLine) return;
    try {
      await flushMutations(client, accountId, spaceId, () => mounted.current);
      if (!mounted.current) return;
      const saved = (await listDrafts(accountId, spaceId)).find(item => item.type === 'whiteboard' && item.documentId === draft.documentId);
      if (saved) {setBaseVersion(saved.baseVersion);setConflicted(saved.syncState==='conflict');}
      if (saved?.syncState === 'synced' && editRevision.current === revision) savedRevision.current = revision;
      onNotice(saved?.syncState === 'synced' ? 'Dessin synchronisé' : 'Conflit dessin : votre copie locale est conservée.');
    }
    catch (error) { if (mounted.current) onNotice(error instanceof ApiError && error.status === 409 ? 'Conflit dessin : le serveur et la copie locale sont conservés.' : 'Dessin en attente : aucun envoi serveur confirmé.'); }
  }
  useEffect(() => {
    if (loading || board.active || editRevision.current === savedRevision.current) return;
    void saveDrawing(true).catch(error => { if (mounted.current) onNotice(`Dessin non enregistré : ${String(error)}`); });
    const timer = setTimeout(() => { void saveDrawing().catch(error => { if (mounted.current) onNotice(`Dessin non enregistré : ${String(error)}`); }); }, 500);
    return () => clearTimeout(timer);
  }, [board, photos]);
  async function resolve(choice:'local'|'server') {
    if(!client || resolving)return;setResolving(true);
    try {
      const original=(await listDrafts(accountId,spaceId)).find(item=>item.type==='whiteboard' && item.documentId===documentId);
      if(!original || original.syncState!=='conflict')return;
      let cursor:string|undefined, remote:import('./api').DocumentChange|undefined;
      const seen=new Set<string>();
      do {
        const page=await client.changes(spaceId,cursor);if(!mounted.current)return;
        for(const item of page.items)if(item.document_type==='whiteboard' && item.document_id===documentId && (!remote || item.version>remote.version))remote=item;
        cursor=page.has_more?page.next_cursor:undefined;
        if(cursor && seen.has(cursor))throw Error('Pagination incohérente');if(cursor)seen.add(cursor);
      }while(cursor);
      if(!remote)throw Error('Version distante absente');
      const server=remote.deleted?null:{...original,content:remote.content,baseVersion:remote.version,syncState:'synced' as const,conflict:undefined};
      await resolveConflictedDocument(original,server,remote.version,choice,uid());
      await flushMutations(client,accountId,spaceId,()=>mounted.current);
      if(mounted.current){editRevision.current=0;savedRevision.current=0;setLoading(true);setReloadKey(key=>key+1);onNotice('Version choisie enregistrée. Les deux versions sont conservées dans l’historique local.');}
    }catch{if(mounted.current)onNotice('La résolution n’a pas pu être confirmée. Les deux versions sont conservées.');}
    finally{if(mounted.current)setResolving(false);}
  }
  return <section className={`drawing-panel note-media ${pageMode?'note-page-ink':''} ${editing?'is-editing':'is-preview'}`} aria-label="Dessins et images de la note">
    {loading && <p role="status">Chargement des pièces jointes…</p>}{loadFailed && <p role="alert">Les pièces jointes n’ont pas pu être chargées. <button type="button" onClick={()=>{setLoading(true);setReloadKey(key=>key+1);}}>Réessayer</button></p>}
    {conflicted && <div className="notice conflict" role="alert"><p>Ce dessin a été modifié sur deux appareils. Les deux copies sont conservées.</p><button type="button" disabled={!client || resolving} onClick={()=>void resolve('local')}>Garder mon dessin</button><button type="button" disabled={!client || resolving} onClick={()=>void resolve('server')}>Utiliser le dessin synchronisé</button></div>}
    {(pageMode || editing || board.strokes.length>0) && <div className="note-sketch">
    {!pageMode && <div className="note-sketch-heading"><strong>Dessin</strong>{!editing && !readOnly && <button type="button" onClick={onEdit}>Modifier le dessin</button>}</div>}
    {editing && !pageMode && <div className="toolbar" role="group" aria-label="Outils de dessin">
    <label className="drawing-pen-control">Couleur<select value={penColor} onChange={event=>setPenColor(event.target.value)}><option value="#20343b">Encre</option><option value="#176b62">Vert</option><option value="#315db2">Bleu</option><option value="#b54b42">Rouge</option></select></label>
    <label className="drawing-pen-control">Trait<select value={penWidth} onChange={event=>setPenWidth(Number(event.target.value))}><option value={2}>Fin</option><option value={3}>Normal</option><option value={6}>Épais</option></select></label>
    <button type="button" aria-label="Annuler le trait" disabled={conflicted || !board.strokes.length} onClick={()=>editBoard(undo)}>↶</button><button type="button" aria-label="Rétablir le trait" disabled={conflicted || !board.undone.length} onClick={()=>editBoard(redo)}>↷</button>
    <button type="button" disabled={board.zoom>=3} onClick={()=>editBoard(old=>({...old,zoom:Math.min(3,old.zoom+.25)}))}>Zoom +</button><button type="button" disabled={board.zoom<=.5} onClick={()=>editBoard(old=>({...old,zoom:Math.max(.5,old.zoom-.25)}))}>Zoom −</button>
    <span aria-live="polite">{board.strokes.length} trait{board.strokes.length>1?'s':''} · sauvegarde automatique</span></div>}
    <canvas ref={canvasRef} aria-label="Dessin de la note, utilisez le doigt, le stylet ou la souris" onPointerDown={e=>{if(!editing || loading || loadFailed || conflicted || readOnly)return;const point=sample(e);e.currentTarget.setPointerCapture(e.pointerId);if(pageMode){inkUndo.current.push(board);if(inkUndo.current.length>100)inkUndo.current.shift();inkRedo.current=[];}if(pageMode&&inkTool==='eraser'){editBoard(old=>({...old,strokes:old.strokes.filter(s=>!s.points.some(p=>Math.hypot(p.x-point.x,p.y-point.y)<18)),active:null}));return;}editBoard(old=>{const next=addPoint(old,point);return !old.active && next.active?{...next,active:{...next.active,color:pageMode?(inkTool==='highlighter'?inkColor+'55':inkColor):penColor,width:pageMode?(inkTool==='highlighter'?inkWidth*5:inkWidth):penWidth}}:next;});}} onPointerMove={e=>{if(!editing || conflicted)return;const point=sample(e);if(pageMode&&inkTool==='eraser'&&e.buttons){editBoard(old=>({...old,strokes:old.strokes.filter(s=>!s.points.some(p=>Math.hypot(p.x-point.x,p.y-point.y)<18)),active:null}));return;}board.active && editBoard(old=>old.active?addPoint(old,point):old);}} onPointerUp={()=>{if(editing && !conflicted)editBoard(finishStroke);}} onPointerCancel={()=>{if(editing && !conflicted)editBoard(finishStroke);}} />
    </div>}
    <input id={photoInputId} hidden={pageMode||!!photoInputId} aria-label="Ajouter une image à la note" disabled={loading || loadFailed || conflicted || readOnly} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];e.target.value='';void addPhoto(file).catch(()=>setPhotoMessage('L’image n’a pas pu être enregistrée. Réessayez.'));}} />
    {!pageMode && photoMessage && <p className="muted" role="status">{photoMessage}</p>}
    {!pageMode && !!photos.length && <ul className="photo-list">{photos.map(photo=><li key={photo.id}>{photo.blob.size?<PhotoPreview photo={photo}/>:<p role="status">Image disponible après connexion</p>}<div className="note-image-caption"><span>{photo.name}</span><button type="button" disabled={conflicted || readOnly} aria-label={`Retirer l’image ${photo.name} de cette note`} onClick={()=>{void putLocalBlob({...photo,removedFromNote:true}).then(()=>{if(!mounted.current)return;editRevision.current++;setPhotos(old=>old.filter(item=>item.id!==photo.id));}).catch(()=>setPhotoMessage('L’image n’a pas pu être retirée. Réessayez.'));}}>Retirer</button></div></li>)}</ul>}
  </section>;
}

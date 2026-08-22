import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Music2, Play, Pause, Square, Plus, Trash2, Download, Upload, Search, Repeat, Volume2, AudioLines, WandSparkles, FileAudio, RotateCcw } from 'lucide-react';
import './styles.css';

type Note = { string: number; fret: number; beats: number; time?: number };
type Song = { id: string; title: string; artist: string; bpm: number; key: string; tuning: string; notes: Note[]; audioName?: string };

const STORAGE_KEY = 'tablab-songs-v02';
const STRINGS = [4, 3, 2, 1];
const STRING_NAMES = ['E', 'A', 'D', 'G'];
const demo: Song = { id: 'demo', title: 'Estudo de Baixo — Exemplo', artist: 'TabLab Studio', bpm: 82, key: 'G', tuning: 'E A D G', notes: [
  { string: 4, fret: 3, beats: 1 }, { string: 4, fret: 5, beats: 1 }, { string: 3, fret: 2, beats: 1 }, { string: 3, fret: 4, beats: 1 }, { string: 2, fret: 2, beats: 1 }, { string: 2, fret: 4, beats: 1 }, { string: 1, fret: 2, beats: 1 }, { string: 1, fret: 4, beats: 1 }
] };

function loadSongs(): Song[] { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || [demo]; } catch { return [demo]; } }
function midiToNote(midi: number) { const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']; return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`; }
function midiToBassPosition(midi: number): { string: number; fret: number } {
  const open = { 4: 40, 3: 45, 2: 50, 1: 55 } as Record<number, number>;
  const candidates = STRINGS.map(string => ({ string, fret: midi - open[string] })).filter(x => x.fret >= 0 && x.fret <= 20);
  return candidates.sort((a,b) => a.fret - b.fret)[0] || { string: 4, fret: Math.max(0, Math.min(20, midi - 40)) };
}
function autocorrelationPitch(data: Float32Array, sampleRate: number): number | null {
  let rms = 0; for (let i=0;i<data.length;i++) rms += data[i]*data[i]; rms = Math.sqrt(rms/data.length);
  if (rms < 0.008) return null;
  const minLag = Math.floor(sampleRate / 300), maxLag = Math.min(Math.floor(sampleRate / 35), data.length - 2);
  let bestLag = -1, best = 0;
  for (let lag=minLag; lag<=maxLag; lag++) { let sum=0; for (let i=0;i<data.length-lag;i+=2) sum += data[i]*data[i+lag]; if (sum>best) { best=sum; bestLag=lag; } }
  if (bestLag<0 || best < rms*rms*data.length*0.04) return null;
  return sampleRate / bestLag;
}
function freqToMidi(freq: number) { return Math.round(69 + 12 * Math.log2(freq / 440)); }

function App() {
  const [songs, setSongs] = useState<Song[]>(loadSongs);
  const [id, setId] = useState('demo'); const [query, setQuery] = useState('');
  const [playing, setPlaying] = useState(false); const [tempo, setTempo] = useState(100); const [loop, setLoop] = useState(false); const [metro, setMetro] = useState(false); const [pos, setPos] = useState(0);
  const [audioFile, setAudioFile] = useState<File | null>(null); const [audioUrl, setAudioUrl] = useState(''); const [analysis, setAnalysis] = useState<{status:string; notes:number; bpm:number; confidence:string}>({status:'idle',notes:0,bpm:0,confidence:''});
  const [audioCurrent, setAudioCurrent] = useState(0); const [audioDuration, setAudioDuration] = useState(0);
  const synth = useRef<AudioContext | null>(null); const timer = useRef<number | null>(null); const audioRef = useRef<HTMLAudioElement | null>(null); const fileRef = useRef<HTMLInputElement | null>(null); const metroTimer = useRef<number | null>(null);
  const song = songs.find(s=>s.id===id) || songs[0];

  useEffect(()=>localStorage.setItem(STORAGE_KEY, JSON.stringify(songs)),[songs]);
  useEffect(()=>()=>{ if(audioUrl) URL.revokeObjectURL(audioUrl); if(timer.current) clearInterval(timer.current); if(metroTimer.current) clearInterval(metroTimer.current); },[]);
  useEffect(()=>{ if(!playing || !song) { if(timer.current) clearInterval(timer.current); return; } const ms=60000/song.bpm*(100/tempo); timer.current=window.setInterval(()=>{ setPos(p=>{ const n=p+1; if(n>=song.notes.length){ if(loop){ void playCurrentNote(0); return 0; } setPlaying(false); return p; } void playCurrentNote(n); return n; }); },ms); return ()=>{if(timer.current) clearInterval(timer.current)}; },[playing,song,tempo,loop]);
  useEffect(()=>{ if(!metro){ if(metroTimer.current) clearInterval(metroTimer.current); return; } const tick=()=>beep(880,.045); metroTimer.current=window.setInterval(tick,60000/(song?.bpm||80)*1000); return ()=>{if(metroTimer.current) clearInterval(metroTimer.current)}; },[metro,song?.bpm]);

  const filtered=useMemo(()=>songs.filter(s=>(s.title+' '+s.artist).toLowerCase().includes(query.toLowerCase())),[songs,query]);
  async function ensureAudio(){ const C=window.AudioContext || (window as any).webkitAudioContext; if(!C) throw new Error('Web Audio API indisponível neste navegador'); if(!synth.current) synth.current=new C(); if(synth.current.state==='suspended') await synth.current.resume(); return synth.current; }
  async function beep(freq:number,dur=.18){ const ctx=await ensureAudio(); const o=ctx.createOscillator(), g=ctx.createGain(); o.type='triangle'; o.frequency.setValueAtTime(Math.max(30,Math.min(1000,freq)),ctx.currentTime); g.gain.setValueAtTime(.0001,ctx.currentTime); g.gain.exponentialRampToValueAtTime(.12,ctx.currentTime+.012); g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+dur); o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime+dur+.02); }
  function noteFrequency(n:Note){ const open={4:40,3:45,2:50,1:55} as Record<number,number>; return 440*Math.pow(2,(open[n.string]+n.fret-69)/12); }
  async function playCurrentNote(index:number){ const n=song?.notes[index]; if(n) await beep(noteFrequency(n),Math.max(.12,60/(song?.bpm||80)*.85)); }
  async function togglePlay(){ if(!song) return; if(!playing){ await ensureAudio(); setPlaying(true); await playCurrentNote(pos); } else setPlaying(false); }
  function update(p:Partial<Song>){ setSongs(ss=>ss.map(s=>s.id===song.id?{...s,...p}:s)); }
  function addSong(){ const s:Song={id:crypto.randomUUID(),title:'Nova música',artist:'',bpm:80,key:'C',tuning:'E A D G',notes:[]}; setSongs(x=>[s,...x]); setId(s.id); setPos(0); }
  function delSong(){ if(song.id==='demo' && songs.length===1) return; if(confirm('Excluir esta música?')) { const r=songs.filter(s=>s.id!==song.id); setSongs(r.length?r:[demo]); setId((r[0]||demo).id); } }
  function addNote(){ update({notes:[...song.notes,{string:4,fret:3,beats:1}]}); }
  function removeNote(){ update({notes:song.notes.slice(0,-1)}); setPos(Math.max(0,Math.min(pos,song.notes.length-2))); }
  function exportData(){ const blob=new Blob([JSON.stringify(songs,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='tablab-backup.json'; a.click(); URL.revokeObjectURL(a.href); }
  function importData(e:React.ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{try{const x=JSON.parse(String(r.result));if(Array.isArray(x)){setSongs(x);setId(x[0]?.id||'')}}catch{alert('Backup inválido.')}};r.readAsText(f);e.target.value='';}
  function selectAudio(e:React.ChangeEvent<HTMLInputElement>){ const f=e.target.files?.[0]; if(!f)return; if(audioUrl)URL.revokeObjectURL(audioUrl); const u=URL.createObjectURL(f); setAudioFile(f);setAudioUrl(u);setAnalysis({status:'ready',notes:0,bpm:0,confidence:''}); setTimeout(()=>audioRef.current?.load(),0); }
  async function analyzeAudio(){ if(!audioFile){alert('Selecione primeiro um MP3, WAV ou M4A.');return;} setAnalysis({status:'analyzing',notes:0,bpm:0,confidence:''}); try{
      const ctx=new AudioContext(); const buffer=await ctx.decodeAudioData(await audioFile.arrayBuffer()); const data=buffer.getChannelData(0); const frame=4096, hop=2048; const detected:{time:number;midi:number}[]=[];
      for(let start=0;start+frame<data.length;start+=hop){ const slice=data.slice(start,start+frame); const freq=autocorrelationPitch(slice,buffer.sampleRate); if(freq){ const midi=freqToMidi(freq); if(midi>=28&&midi<=67) detected.push({time:start/buffer.sampleRate,midi}); } }
      const unique: {time:number;midi:number}[]=[]; for(const n of detected){ const last=unique[unique.length-1]; if(!last || n.midi!==last.midi || n.time-last.time>.18) unique.push(n); }
      const bpm=Math.round(60000/(Math.max(.25,unique.slice(1).reduce((a,n,i)=>a+(n.time-unique[i].time),0)/Math.max(1,unique.length-1))*1000));
      const notes=unique.map(n=>{const p=midiToBassPosition(n.midi);return {...p,beats:1,time:n.time};});
      update({notes:notes.map(n=>({string:n.string,fret:n.fret,beats:n.beats,time:n.time})),bpm:Math.max(50,Math.min(180,bpm||song.bpm)),audioName:audioFile.name}); setPos(0); setAnalysis({status:'done',notes:notes.length,bpm:Math.max(50,Math.min(180,bpm||song.bpm)),confidence:notes.length>12?'estimativa útil':'baixa — revise a TAB'}); await ctx.close();
    }catch(err){console.error(err);setAnalysis({status:'error',notes:0,bpm:0,confidence:'não foi possível decodificar o arquivo'});} }
  function resetAnalysis(){setAnalysis({status:'idle',notes:0,bpm:0,confidence:''}); setAudioFile(null); if(audioUrl)URL.revokeObjectURL(audioUrl);setAudioUrl('');}

  return <div className="app"><header><div className="brand"><Music2/><span>TabLab Studio</span><small>Estudo pessoal</small></div><div className="actions"><button onClick={addSong}><Plus/>Nova</button><button onClick={exportData}><Download/>Backup</button><label className="btn"><Upload/>Restaurar<input hidden type="file" accept="application/json" onChange={importData}/></label></div></header>
  <main><aside><div className="search"><Search/><input placeholder="Pesquisar músicas..." value={query} onChange={e=>setQuery(e.target.value)}/></div>{filtered.map(s=><button className={'song '+(s.id===song.id?'active':'')} key={s.id} onClick={()=>{setId(s.id);setPos(0);setPlaying(false)}}><b>{s.title}</b><span>{s.artist||'Sem artista'} · {s.bpm} BPM</span></button>)}</aside>
  <section className="workspace"><div className="meta"><div><input className="title" value={song.title} onChange={e=>update({title:e.target.value})}/><input className="artist" placeholder="Artista / compositor" value={song.artist} onChange={e=>update({artist:e.target.value})}/></div><button className="danger" onClick={delSong}><Trash2/></button></div>
  <div className="fields"><label>BPM<input type="number" min="30" max="240" value={song.bpm} onChange={e=>update({bpm:Math.max(30,+e.target.value)})}/></label><label>Tom<input value={song.key} onChange={e=>update({key:e.target.value})}/></label><label>Afinação<input value={song.tuning} onChange={e=>update({tuning:e.target.value})}/></label></div>
  <div className="tab"><div className="tabhead"><span>BAIXO · 4 CORDAS</span><span>{song.key} · {song.bpm} BPM</span></div>{STRINGS.map(st=><div className="line" key={st}><strong>{STRING_NAMES[4-st]}</strong>{song.notes.map((n,i)=><button key={i} className={i===pos?'current':''} onClick={()=>setPos(i)}>{n.string===st?n.fret:'·'}</button>)}</div>)}{!song.notes.length&&<div className="empty">Adicione notas para começar.</div>}</div>
  <div className="controls"><button onClick={()=>setPlaying(false)}><Square/></button><button className="play" onClick={togglePlay}>{playing?<Pause/>:<Play/>}</button><button onClick={()=>{setPos(0);setPlaying(false)}}><RotateCcw/></button><div className="tempo"><button onClick={()=>setTempo(Math.max(50,tempo-5))}>−</button><b>{tempo}%</b><button onClick={()=>setTempo(Math.min(150,tempo+5))}>+</button></div><button className={loop?'on':''} onClick={()=>setLoop(!loop)}><Repeat/>Loop</button><button className={metro?'on':''} onClick={()=>setMetro(!metro)}><AudioLines/>Metrônomo</button></div>
  <div className="editor"><button onClick={addNote}><Plus/>Nota</button><button onClick={removeNote} disabled={!song.notes.length}><Trash2/>Remover</button><span><Volume2/> Player sintetizado local</span></div>
  <div className="audio-panel"><div className="panel-title"><span><FileAudio/> Áudio local → TAB</span><span className="hint">Nada é enviado para servidor.</span></div><div className="audio-actions"><label className="btn primary"><Upload/>Selecionar áudio<input ref={fileRef} hidden type="file" accept="audio/*" onChange={selectAudio}/></label><button className="analyze" onClick={analyzeAudio} disabled={!audioFile||analysis.status==='analyzing'}><WandSparkles/>{analysis.status==='analyzing'?'Analisando...':'Gerar TAB de baixo'}</button><button onClick={resetAnalysis}><RotateCcw/>Limpar</button></div>{audioFile&&<div className="file-name">{audioFile.name} {analysis.status==='done'&&<>· {analysis.notes} notas · {analysis.bpm} BPM · <b>{analysis.confidence}</b></>}</div>}{audioUrl&&<audio ref={audioRef} controls src={audioUrl} onTimeUpdate={e=>setAudioCurrent(e.currentTarget.currentTime)} onLoadedMetadata={e=>setAudioDuration(e.currentTarget.duration)}/>}<div className="analysis-note"><WandSparkles/><div><b>Transcrição experimental</b><p>A análise é feita no seu navegador por detecção de pitch. Ela funciona melhor quando o baixo está relativamente destacado. A TAB gerada é uma estimativa e deve ser revisada antes de ser considerada definitiva.</p></div></div></div>
  <p className="notice">Os dados das músicas ficam neste navegador. O TabLab Studio não inclui catálogo protegido de terceiros e não baixa áudio do YouTube.</p></section></main></div>
}
createRoot(document.getElementById('root')!).render(<App/>);

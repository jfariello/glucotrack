import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import {
  Plus, Search, Filter, BarChart2, Table2,
  ArrowUpDown, ArrowUp, ArrowDown, X, RefreshCw,
  Share2, FileText, FileSpreadsheet, Image, Droplets,
  TrendingUp, TrendingDown, Activity, Clock
} from 'lucide-react';
import { format, parseISO, getHours, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';

// ─── Supabase SQL (run once in Supabase SQL editor) ──────────────────────────
// CREATE TABLE mediciones (
//   id BIGSERIAL PRIMARY KEY,
//   created_at TIMESTAMPTZ DEFAULT NOW(),
//   momento TEXT NOT NULL,
//   glucosa INTEGER NOT NULL,
//   observaciones TEXT
// );

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MOMENTOS = [
  { value: 'antes', label: '🍎 Antes de comer', icon: '🍎' },
  { value: 'despues', label: '🍎🍴 Después de comer', icon: '🍎🍴' },
];




function getGlucosaColor(v) {
  if (v < 70) return '#7c3aed';
  if (v <= 140) return '#16a34a';
  if (v <= 200) return '#ea580c';
  return '#dc2626';
}
function getGlucosaLabel(v) {
  if (v < 70) return 'Bajo';
  if (v <= 140) return 'Normal';
  if (v <= 200) return 'Alto';
  return 'Muy alto';
}

export default function App() {
  const [view, setView] = useState('tabla'); // 'tabla' | 'graficos'
  const [mediciones, setMediciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ momento: 'antes', glucosa: '', observaciones: '' });
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('id');
  const [sortDir, setSortDir] = useState('desc');
  const [filterMomento, setFilterMomento] = useState('');
  const [filterRango, setFilterRango] = useState('');
  const [saving, setSaving] = useState(false);
  const chartsRef = useRef(null);
  const tableRef = useRef(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchMediciones = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('mediciones')
      .select('*')
      .order('id', { ascending: false });
    if (!error) setMediciones(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchMediciones(); }, [fetchMediciones]);

  // ── Guardar ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setFormError('');
    const g = parseInt(form.glucosa);
    if (!form.glucosa || isNaN(g) || g < 10 || g > 999) {
      setFormError('Ingresá un valor de glucosa válido (10–999).');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('mediciones').insert([{
      momento: form.momento,
      glucosa: g,
      observaciones: form.observaciones.trim() || null,
    }]);
    setSaving(false);
    if (error) { setFormError('Error al guardar: ' + error.message); return; }
    setForm({ momento: 'antes', glucosa: '', observaciones: '' });
    setShowForm(false);
    fetchMediciones();
  };

  // ── Eliminar ───────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminás esta medición?')) return;
    await supabase.from('mediciones').delete().eq('id', id);
    fetchMediciones();
  };

  // ── Sort / Filter / Search ─────────────────────────────────────────────────
  const filtered = mediciones
    .filter(m => {
      if (filterMomento && m.momento !== filterMomento) return false;
      if (filterRango) {
        const r = filterRango;
        if (r === 'bajo' && m.glucosa >= 70) return false;
        if (r === 'normal' && (m.glucosa < 70 || m.glucosa > 140)) return false;
        if (r === 'alto' && (m.glucosa < 140 || m.glucosa > 200)) return false;
        if (r === 'muyAlto' && m.glucosa <= 200) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        return (
          String(m.id).includes(q) ||
          (m.observaciones || '').toLowerCase().includes(q) ||
          format(parseISO(m.created_at), 'dd/MM/yyyy HH:mm').includes(q) ||
          (m.momento === 'antes' ? 'antes' : 'después').includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (sortCol === 'created_at') { va = new Date(va); vb = new Date(vb); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const statsTotal = mediciones.length;
  const statsAvg = statsTotal
    ? Math.round(mediciones.reduce((s, m) => s + m.glucosa, 0) / statsTotal)
    : 0;
  const statsMax = statsTotal ? Math.max(...mediciones.map(m => m.glucosa)) : 0;
  const statsMin = statsTotal ? Math.min(...mediciones.map(m => m.glucosa)) : 0;

  // ── Chart data ─────────────────────────────────────────────────────────────
  const last30 = [...mediciones]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(-30)
    .map(m => ({
      fecha: format(parseISO(m.created_at), 'dd/MM'),
      glucosa: m.glucosa,
      color: getGlucosaColor(m.glucosa),
    }));

  const byHour = Array.from({ length: 24 }, (_, h) => {
    const ms = mediciones.filter(m => getHours(parseISO(m.created_at)) === h);
    return {
      hora: `${String(h).padStart(2, '0')}h`,
      promedio: ms.length ? Math.round(ms.reduce((s, m) => s + m.glucosa, 0) / ms.length) : null,
      cantidad: ms.length,
    };
  }).filter(d => d.cantidad > 0);

  const byDay = DIAS.map((dia, i) => {
    const ms = mediciones.filter(m => getDay(parseISO(m.created_at)) === i);
    return {
      dia,
      promedio: ms.length ? Math.round(ms.reduce((s, m) => s + m.glucosa, 0) / ms.length) : null,
      cantidad: ms.length,
    };
  }).filter(d => d.cantidad > 0);

  // ── Export ─────────────────────────────────────────────────────────────────
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setTextColor(14, 165, 233);
    doc.text('GlucoTrack — Mis Mediciones', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Exportado: ${format(new Date(), "dd/MM/yyyy HH:mm")}  |  Total: ${filtered.length} registros`, 14, 28);
    autoTable(doc, {
      startY: 35,
      head: [['#', 'Fecha y Hora', 'Momento', 'Glucosa (mg/dL)', 'Estado', 'Observaciones']],
      body: filtered.map(m => [
        m.id,
        format(parseISO(m.created_at), 'dd/MM/yyyy HH:mm'),
        m.momento === 'antes' ? '🍎 Antes' : '🍎🍴 Después',
        m.glucosa,
        getGlucosaLabel(m.glucosa),
        m.observaciones || '',
      ]),
      headStyles: { fillColor: [14, 165, 233], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 249, 255] },
      styles: { fontSize: 9, font: 'helvetica' },
    });
    doc.save('glucotrack-mediciones.pdf');
  };

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(m => ({
      '#': m.id,
      'Fecha y Hora': format(parseISO(m.created_at), 'dd/MM/yyyy HH:mm'),
      'Momento': m.momento === 'antes' ? 'Antes de comer' : 'Después de comer',
      'Glucosa (mg/dL)': m.glucosa,
      'Estado': getGlucosaLabel(m.glucosa),
      'Observaciones': m.observaciones || '',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mediciones');
    XLSX.writeFile(wb, 'glucotrack-mediciones.xlsx');
  };

  const exportPNG = async () => {
    const el = view === 'graficos' ? chartsRef.current : tableRef.current;
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#f8fafc' });
    const link = document.createElement('a');
    link.download = 'glucotrack.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'GlucoTrack', text: `Mis últimas mediciones de glucosa. Promedio: ${statsAvg} mg/dL`, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('URL copiada al portapapeles');
    }
  };

  // ── SortIcon ───────────────────────────────────────────────────────────────
  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <ArrowUpDown size={13} style={{ opacity: 0.4 }} />;
    return sortDir === 'asc' ? <ArrowUp size={13} style={{ color: 'var(--sky)' }} /> : <ArrowDown size={13} style={{ color: 'var(--sky)' }} />;
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--neutral-50)' }}>
      {/* ── Header ── */}
      <header style={{
        background: 'linear-gradient(135deg, #0284c7 0%, #0ea5e9 50%, #38bdf8 100%)',
        padding: '0 24px',
        boxShadow: '0 2px 20px rgba(14,165,233,0.3)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
            }}>🩸</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: '-0.3px' }}>GlucoTrack</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Control de glucosa en sangre</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <TabBtn active={view === 'tabla'} onClick={() => setView('tabla')} icon={<Table2 size={15} />} label="Tabla" />
            <TabBtn active={view === 'graficos'} onClick={() => setView('graficos')} icon={<BarChart2 size={15} />} label="Gráficos" />
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 48px' }}>
        {/* ── Stats cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
          <StatCard icon={<Activity size={18} color="#0ea5e9" />} label="Total mediciones" value={statsTotal} color="sky" />
          <StatCard icon={<Droplets size={18} color="#0ea5e9" />} label="Promedio" value={statsTotal ? `${statsAvg} mg/dL` : '—'} color="sky" />
          <StatCard icon={<TrendingUp size={18} color="#dc2626" />} label="Máximo" value={statsTotal ? `${statsMax} mg/dL` : '—'} color="red" />
          <StatCard icon={<TrendingDown size={18} color="#16a34a" />} label="Mínimo" value={statsTotal ? `${statsMin} mg/dL` : '—'} color="green" />
        </div>

        {/* ── Toolbar ── */}
        <div style={{
          background: '#fff', borderRadius: 'var(--radius)', padding: '14px 18px',
          boxShadow: 'var(--shadow-sm)', marginBottom: 16,
          display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
          border: '1px solid var(--neutral-200)'
        }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1', minWidth: 200 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              style={inputStyle({ paddingLeft: 32 })}
            />
            {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-400)', display: 'flex' }}><X size={14} /></button>}
          </div>

          {/* Filters */}
          <select value={filterMomento} onChange={e => setFilterMomento(e.target.value)} style={inputStyle({ minWidth: 160 })}>
            <option value="">🍎🍏 Todos los momentos</option>
            <option value="antes">🍎 Antes de comer</option>
            <option value="despues">🍎🍴 Después de comer</option>
          </select>

          <select value={filterRango} onChange={e => setFilterRango(e.target.value)} style={inputStyle({ minWidth: 140 })}>
            <option value="">Todos los rangos</option>
            <option value="bajo">🟣 Bajo (&lt;70)</option>
            <option value="normal">🟢 Normal (70–140)</option>
            <option value="alto">🟠 Alto (140–200)</option>
            <option value="muyAlto">🔴 Muy alto (&gt;200)</option>
          </select>

          {(filterMomento || filterRango || search) && (
            <button onClick={() => { setFilterMomento(''); setFilterRango(''); setSearch(''); }} style={btnStyle('ghost')}>
              <X size={14} /> Limpiar
            </button>
          )}

          <div style={{ flex: 1 }} />

          {/* Export */}
          <button onClick={exportPDF} style={btnStyle('ghost')} title="Exportar PDF"><FileText size={15} /> PDF</button>
          <button onClick={exportXLSX} style={btnStyle('ghost')} title="Exportar Excel"><FileSpreadsheet size={15} /> XLS</button>
          <button onClick={exportPNG} style={btnStyle('ghost')} title="Exportar imagen"><Image size={15} /> PNG</button>
          <button onClick={handleShare} style={btnStyle('ghost')} title="Compartir"><Share2 size={15} /></button>
          <button onClick={fetchMediciones} style={btnStyle('ghost')} title="Actualizar"><RefreshCw size={14} /></button>

          {/* Nueva medición */}
          <button onClick={() => setShowForm(true)} style={btnStyle('primary')}>
            <Plus size={16} /> Nueva medición
          </button>
        </div>

        {/* ── Form modal ── */}
        {showForm && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20, backdropFilter: 'blur(4px)'
          }}>
            <div style={{
              background: '#fff', borderRadius: 'var(--radius-lg)', padding: 28,
              width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-lg)',
              animation: 'slideUp 0.2s ease'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--neutral-800)' }}>Nueva medición</h2>
                <button onClick={() => { setShowForm(false); setFormError(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-400)', display: 'flex' }}><X size={20} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <label style={labelStyleObj}>
                  <span>Momento</span>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {MOMENTOS.map(m => (
                      <button
                        key={m.value}
                        onClick={() => setForm(f => ({ ...f, momento: m.value }))}
                        style={{
                          flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                          border: `2px solid ${form.momento === m.value ? 'var(--sky)' : 'var(--neutral-200)'}`,
                          background: form.momento === m.value ? 'var(--sky-pale)' : '#fff',
                          cursor: 'pointer', fontSize: 13, fontWeight: 500,
                          color: form.momento === m.value ? 'var(--sky-dark)' : 'var(--neutral-600)',
                          transition: 'all 0.15s', fontFamily: 'DM Sans, sans-serif',
                        }}
                      >{m.label}</button>
                    ))}
                  </div>
                </label>

                <label style={labelStyleObj}>
                  <span>Glucosa (mg/dL)</span>
                  <input
                    type="number"
                    min="10" max="999"
                    value={form.glucosa}
                    onChange={e => setForm(f => ({ ...f, glucosa: e.target.value }))}
                    placeholder="ej: 95"
                    style={{ ...inputStyle(), fontSize: 20, fontFamily: 'DM Mono, monospace', fontWeight: 500, textAlign: 'center' }}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                  />
                  {form.glucosa && !isNaN(parseInt(form.glucosa)) && (
                    <div style={{ textAlign: 'center', marginTop: 6 }}>
                      <span style={{
                        display: 'inline-block', padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                        background: getGlucosaColor(parseInt(form.glucosa)) + '20',
                        color: getGlucosaColor(parseInt(form.glucosa))
                      }}>{getGlucosaLabel(parseInt(form.glucosa))}</span>
                    </div>
                  )}
                </label>

                <label style={labelStyleObj}>
                  <span>Observaciones <span style={{ color: 'var(--neutral-400)', fontWeight: 400 }}>(opcional)</span></span>
                  <textarea
                    value={form.observaciones}
                    onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
                    placeholder="Anotá lo que quieras..."
                    rows={3}
                    style={{ ...inputStyle(), resize: 'vertical', lineHeight: 1.5 }}
                  />
                </label>

                {formError && (
                  <div style={{ padding: '10px 14px', background: 'var(--apple-red-light)', borderRadius: 'var(--radius-sm)', color: 'var(--apple-red)', fontSize: 13 }}>
                    {formError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button onClick={() => { setShowForm(false); setFormError(''); }} style={{ ...btnStyle('ghost'), flex: 1, justifyContent: 'center' }}>Cancelar</button>
                  <button onClick={handleSave} disabled={saving} style={{ ...btnStyle('primary'), flex: 2, justifyContent: 'center' }}>
                    {saving ? 'Guardando…' : '💾 Guardar medición'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════ TABLA ═══════════════ */}
        {view === 'tabla' && (
          <div ref={tableRef} style={{ background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--neutral-200)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--neutral-100)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Filter size={14} color="var(--sky)" />
              <span style={{ fontSize: 13, color: 'var(--neutral-600)' }}>
                Mostrando <strong>{filtered.length}</strong> de <strong>{mediciones.length}</strong> mediciones
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--sky-pale)' }}>
                    {[
                      { col: 'id', label: '#' },
                      { col: 'created_at', label: 'Fecha y hora' },
                      { col: 'momento', label: 'Momento' },
                      { col: 'glucosa', label: 'Glucosa (mg/dL)' },
                      { col: 'obs', label: 'Observaciones' },
                    ].map(({ col, label }) => (
                      <th
                        key={col}
                        onClick={() => col !== 'obs' && handleSort(col)}
                        style={{
                          padding: '11px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600,
                          color: 'var(--sky-dark)', letterSpacing: '0.03em', textTransform: 'uppercase',
                          cursor: col !== 'obs' ? 'pointer' : 'default', whiteSpace: 'nowrap',
                          userSelect: 'none', borderBottom: '2px solid var(--sky-light)',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {label} {col !== 'obs' && <SortIcon col={col} />}
                        </span>
                      </th>
                    ))}
                    <th style={{ padding: '11px 16px', fontSize: 12, fontWeight: 600, color: 'var(--sky-dark)', letterSpacing: '0.03em', textTransform: 'uppercase', borderBottom: '2px solid var(--sky-light)' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-400)' }}>
                      <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
                    </td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-400)' }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🩸</div>
                      <div style={{ fontWeight: 500 }}>Sin mediciones</div>
                      <div style={{ fontSize: 13, marginTop: 4 }}>Agregá tu primera medición con el botón de arriba.</div>
                    </td></tr>
                  ) : filtered.map((m, i) => {
                    const gc = getGlucosaColor(m.glucosa);
                    return (
                      <tr key={m.id} style={{ background: i % 2 === 0 ? '#fff' : 'var(--sky-pale)', borderBottom: '1px solid var(--neutral-100)', transition: 'background 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--sky-light)'}
                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : 'var(--sky-pale)'}
                      >
                        <td style={{ padding: '10px 16px', fontSize: 13 }}>
                          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--neutral-400)', fontWeight: 500 }}>#{m.id}</span>
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 13, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Clock size={13} color="var(--neutral-400)" />
                            <span>{format(parseISO(m.created_at), "dd/MM/yyyy HH:mm", { locale: es })}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 13 }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                            background: m.momento === 'antes' ? '#fee2e2' : '#fef3c7',
                            color: m.momento === 'antes' ? '#b91c1c' : '#92400e',
                          }}>
                            {m.momento === 'antes' ? '🍎 Antes' : '🍎🍴 Después'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, fontSize: 16, color: gc }}>{m.glucosa}</span>
                            <span style={{
                              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                              background: gc + '18', color: gc
                            }}>{getGlucosaLabel(m.glucosa)}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--neutral-600)', maxWidth: 200 }}>
                          <span title={m.observaciones || ''} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.observaciones || <span style={{ color: 'var(--neutral-300)' }}>—</span>}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <button onClick={() => handleDelete(m.id)} style={{
                            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-400)',
                            display: 'flex', alignItems: 'center', padding: 4, borderRadius: 6,
                            transition: 'all 0.15s',
                          }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--apple-red)'; e.currentTarget.style.background = 'var(--apple-red-light)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--neutral-400)'; e.currentTarget.style.background = 'none'; }}
                          ><X size={15} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══════════════ GRÁFICOS ═══════════════ */}
        {view === 'graficos' && (
          <div ref={chartsRef} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Línea temporal */}
            <ChartCard title="📈 Evolución de glucosa (últimas 30 mediciones)" subtitle="mg/dL en el tiempo">
              {last30.length < 2 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={last30} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }} formatter={(v) => [`${v} mg/dL`, 'Glucosa']} />
                    <ReferenceLine y={70} stroke="#7c3aed" strokeDasharray="4 4" label={{ value: 'Mín', position: 'insideLeft', fontSize: 10, fill: '#7c3aed' }} />
                    <ReferenceLine y={140} stroke="#ea580c" strokeDasharray="4 4" label={{ value: 'Límite', position: 'insideLeft', fontSize: 10, fill: '#ea580c' }} />
                    <Line type="monotone" dataKey="glucosa" stroke="#0ea5e9" strokeWidth={2.5} dot={{ r: 4, fill: '#0ea5e9', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
              {/* Por hora */}
              <ChartCard title="🕐 Promedio por hora del día" subtitle="¿A qué hora tenés mayor glucosa?">
                {byHour.length === 0 ? <EmptyChart /> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={byHour} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="hora" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} formatter={(v) => [`${v} mg/dL`, 'Promedio']} />
                      <ReferenceLine y={140} stroke="#ea580c" strokeDasharray="4 4" />
                      <Bar dataKey="promedio" radius={[4, 4, 0, 0]} fill="#0ea5e9" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              {/* Por día de semana */}
              <ChartCard title="📅 Promedio por día de la semana" subtitle="¿Qué días estás más alto?">
                {byDay.length === 0 ? <EmptyChart /> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={byDay} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} formatter={(v) => [`${v} mg/dL`, 'Promedio']} />
                      <ReferenceLine y={140} stroke="#ea580c" strokeDasharray="4 4" />
                      <Bar dataKey="promedio" radius={[4, 4, 0, 0]} fill="#dc2626" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            {/* Distribución por rangos */}
            <ChartCard title="🎯 Distribución por rangos" subtitle="¿Cuántas mediciones caen en cada zona?">
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '8px 0' }}>
                {[
                  { key: 'bajo', label: 'Bajo (<70)', color: '#7c3aed', filter: m => m.glucosa < 70 },
                  { key: 'normal', label: 'Normal (70–140)', color: '#16a34a', filter: m => m.glucosa >= 70 && m.glucosa <= 140 },
                  { key: 'alto', label: 'Alto (140–200)', color: '#ea580c', filter: m => m.glucosa > 140 && m.glucosa <= 200 },
                  { key: 'muyAlto', label: 'Muy alto (>200)', color: '#dc2626', filter: m => m.glucosa > 200 },
                ].map(r => {
                  const count = mediciones.filter(r.filter).length;
                  const pct = statsTotal ? Math.round((count / statsTotal) * 100) : 0;
                  return (
                    <div key={r.key} style={{ flex: '1', minWidth: 150, padding: '16px', background: r.color + '10', borderRadius: 'var(--radius-sm)', border: `1.5px solid ${r.color}30` }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: r.color, fontFamily: 'DM Mono, monospace' }}>{pct}%</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: r.color, marginTop: 2 }}>{r.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--neutral-400)', marginTop: 2 }}>{count} medición{count !== 1 ? 'es' : ''}</div>
                      <div style={{ height: 4, background: 'var(--neutral-200)', borderRadius: 2, marginTop: 8 }}>
                        <div style={{ height: 4, background: r.color, borderRadius: 2, width: `${pct}%`, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </ChartCard>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus, textarea:focus, select:focus { outline: none; border-color: var(--sky) !important; box-shadow: 0 0 0 3px rgba(14,165,233,0.12); }
      `}</style>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
      borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
      background: active ? 'rgba(255,255,255,0.25)' : 'transparent',
      color: active ? '#fff' : 'rgba(255,255,255,0.7)',
      transition: 'all 0.15s', fontFamily: 'DM Sans, sans-serif',
    }}>
      {icon} {label}
    </button>
  );
}

function StatCard({ icon, label, value, color }) {
  const bg = color === 'sky' ? 'var(--sky-pale)' : color === 'red' ? 'var(--apple-red-light)' : '#f0fdf4';
  const border = color === 'sky' ? 'var(--sky-light)' : color === 'red' ? '#fecaca' : '#bbf7d0';
  return (
    <div style={{ background: bg, borderRadius: 'var(--radius)', padding: '16px 18px', border: `1px solid ${border}`, boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>{icon}<span style={{ fontSize: 12, color: 'var(--neutral-500)', fontWeight: 500 }}>{label}</span></div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--neutral-800)', fontFamily: 'DM Mono, monospace' }}>{value}</div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '20px 20px 16px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--neutral-200)' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--neutral-800)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--neutral-400)', marginTop: 2 }}>{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function EmptyChart() {
  return (
    <div style={{ height: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--neutral-400)' }}>
      <div style={{ fontSize: 32 }}>📊</div>
      <div style={{ marginTop: 8, fontSize: 13 }}>Agregá más mediciones para ver el gráfico</div>
    </div>
  );
}

const labelStyleObj = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--neutral-700)' };

function inputStyle(extra = {}) {
  return {
    width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-sm)',
    border: '1.5px solid var(--neutral-200)', fontSize: 13, fontFamily: 'DM Sans, sans-serif',
    color: 'var(--neutral-800)', background: '#fff', transition: 'border-color 0.15s',
    ...extra
  };
}




function btnStyle(variant) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
    borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
    fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s', whiteSpace: 'nowrap',
  };
  if (variant === 'primary') return { ...base, background: 'var(--sky)', color: '#fff', border: 'none', boxShadow: '0 2px 8px rgba(14,165,233,0.3)' };
  if (variant === 'danger') return { ...base, background: 'var(--apple-red-light)', color: 'var(--apple-red)', border: '1.5px solid #fecaca' };
  return { ...base, background: '#fff', color: 'var(--neutral-600)', border: '1.5px solid var(--neutral-200)' };
}

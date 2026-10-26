import React, { useMemo, useState } from 'react';
import { TravelRequest } from '../types/domain';
import { exportToExcelCSV } from '../utils/exporters';
import {
  Lock,
  ShieldCheck,
  Search,
  FileSpreadsheet,
  Clock,
  User,
  DollarSign,
  GitCommit,
  MessageSquareText,
  ArrowRight,
  ListFilter,
  LayoutList,
  Table2,
  PlusCircle,
  TrendingUp,
  CheckCircle2,
  FileText,
  Sparkles,
  X,
} from 'lucide-react';

export type TimelineActionType = 'precio' | 'estado' | 'notas';

interface ImmutableActivityLogPanelProps {
  request: TravelRequest;
  compact?: boolean;
  onAddAuditNote?: (
    actionTitle: string,
    noteDetails: string,
    categoryHint: TimelineActionType
  ) => void;
}

interface ParsedChangeMetadata {
  beforeValue?: string;
  afterValue?: string;
  fromStatus?: string;
  toStatus?: string;
  detectedAmounts: string[];
}

interface UnifiedImmutableLogItem {
  id: string;
  sealCode: string;
  timestamp: string;
  formattedDate: string;
  formattedDateLong: string;
  formattedTime: string;
  actorName: string;
  actorRole: string;
  actorUid: string;
  category: 'Modificación de Cotización' | 'Cambio de Estado' | 'Aprobación / Envío';
  actionType: TimelineActionType;
  actionTypeLabel: 'Cambio de Precio / Costos' | 'Cambio de Estado / Flujo' | 'Nota / Especificación';
  module: string;
  action: string;
  details: string;
  changeMeta: ParsedChangeMetadata;
}

function formatExactDateAndTime(isoString: string): {
  date: string;
  dateLong: string;
  time: string;
} {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) {
    return { date: isoString, dateLong: isoString, time: '--:--:--' };
  }
  const date = d.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const dateLong = d.toLocaleDateString('es-MX', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return { date, dateLong, time };
}

function computeSealHash(id: string, timestamp: string, actorUid: string, action: string): string {
  const raw = `${id}|${timestamp}|${actorUid}|${action}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `SEAL-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

/**
 * Classifies an audit log entry into one of the 3 visual timeline action types:
 * - 'precio': Cambios de precio, costos, rubros, divisas, tipo de cambio, comisiones, free places, planes de pago
 * - 'estado': Cambios de estado, transiciones de etapa, aprobaciones de comité, envíos formales y aceptación/rechazo
 * - 'notas': Notas, comentarios, itinerario día por día, especificaciones, creación o clonación documental
 */
function classifyActionType(
  moduleName: string,
  action: string,
  details: string,
  isStatusRecord = false
): TimelineActionType {
  if (isStatusRecord) return 'estado';

  const actionLower = action.toLowerCase();
  if (actionLower.startsWith('[precio')) return 'precio';
  if (actionLower.startsWith('[estado')) return 'estado';
  if (actionLower.startsWith('[nota')) return 'notas';

  const combined = `${moduleName} ${action} ${details}`.toLowerCase();

  // Explicit Note / Comment / Specification / Itinerary indicators checked first if they are pure notes
  const isExplicitNote =
    actionLower.includes('nota') ||
    actionLower.includes('comentario') ||
    actionLower.includes('itinerario') ||
    actionLower.includes('especificaci') ||
    details.toLowerCase().startsWith('nota:') ||
    details.toLowerCase().includes('actualizó nota');

  if (
    isExplicitNote &&
    !combined.includes('cambió costo') &&
    !combined.includes('precio final') &&
    !combined.includes('acuerdo de precio')
  ) {
    return 'notas';
  }

  // Status / Approval / Committee / Dispatch / Outcome transitions
  const isStatusOrGovernance =
    combined.includes('cambio de estado') ||
    combined.includes('cambio de etapa') ||
    combined.includes('transición de estado') ||
    combined.includes('estado anterior') ||
    combined.includes('comité') ||
    combined.includes('aprobación') ||
    combined.includes('aprobada') ||
    combined.includes('rechazada') ||
    combined.includes('dictamen') ||
    combined.includes('envío de propuesta') ||
    combined.includes('aceptación de propuesta') ||
    combined.includes('aceptada por') ||
    moduleName.toLowerCase().includes('estado') ||
    moduleName.toLowerCase().includes('aprob');

  if (isStatusOrGovernance) {
    return 'estado';
  }

  // Price / Cost / Financial / FX / Margin / Free Places / Payment Plan changes
  const isPriceOrFinancial =
    combined.includes('precio') ||
    combined.includes('costo') ||
    combined.includes('rubro') ||
    combined.includes('importe') ||
    combined.includes('comisión') ||
    combined.includes('margen') ||
    combined.includes('tipo de cambio') ||
    combined.includes('divisa') ||
    combined.includes('moneda') ||
    combined.includes('chaper') ||
    combined.includes('free place') ||
    combined.includes('liberado') ||
    combined.includes('tarifario') ||
    combined.includes('plan de pago') ||
    combined.includes('escalonad') ||
    combined.includes('fórmula') ||
    /\$[\d,]+/.test(combined) ||
    /\b(usd|mxn|cad|eur|gbp)\b/i.test(combined);

  if (isPriceOrFinancial) {
    return 'precio';
  }

  return 'notas';
}

function getActionTypeLabel(
  actionType: TimelineActionType
): 'Cambio de Precio / Costos' | 'Cambio de Estado / Flujo' | 'Nota / Especificación' {
  if (actionType === 'precio') return 'Cambio de Precio / Costos';
  if (actionType === 'estado') return 'Cambio de Estado / Flujo';
  return 'Nota / Especificación';
}

/**
 * Extracts structured Before -> After values, Status transitions, and Monetary figures
 * from human-readable audit log strings to display graphical comparison pills in the timeline.
 */
function parseChangeMetadata(action: string, details: string): ParsedChangeMetadata {
  const fullText = `${action} — ${details}`;
  const meta: ParsedChangeMetadata = {
    detectedAmounts: [],
  };

  // 1. Detect Status Transition patterns like "Recibida → En cotización" or "Estado anterior: X → Nuevo: Y"
  const arrowMatch =
    details.match(/Estado anterior:\s*([^→\n]+?)\s*→\s*Nuevo:\s*([^\n.]+)/i) ||
    action.match(/Transición de estado:\s*([^→\n]+?)\s*→\s*([^\n.]+)/i) ||
    details.match(/flujo:\s*([^→\n]+?)\s*→\s*([^\n.]+)/i);

  if (arrowMatch) {
    meta.fromStatus = arrowMatch[1].trim();
    meta.toStatus = arrowMatch[2].trim();
  }

  // 2. Detect "de X a Y" value changes (e.g. "de $1,250.00 a $1,390.00" or "de 15% a 18%" or "de 18.50 a 19.20")
  const deAMatch =
    details.match(/\bde\s+(\$?[\d,]+(?:\.\d+)?%?|\w+)\s+a\s+(\$?[\d,]+(?:\.\d+)?%?|\w+)/i) ||
    action.match(/\bde\s+(\$?[\d,]+(?:\.\d+)?%?)\s+a\s+(\$?[\d,]+(?:\.\d+)?%?)/i);

  if (deAMatch) {
    meta.beforeValue = deAMatch[1].trim();
    meta.afterValue = deAMatch[2].trim();
  }

  // 3. Detect monetary amounts (e.g. $1,450.00, $45,800 MXN, 1,250 USD)
  const moneyRegex = /\$[\d,]+(?:\.\d{1,2})?(?:\s*(?:USD|MXN|CAD|EUR|GBP))?/gi;
  const matches = fullText.match(moneyRegex);
  if (matches) {
    meta.detectedAmounts = Array.from(new Set(matches.map((m) => m.trim()))).slice(0, 4);
  }

  return meta;
}

export const ImmutableActivityLogPanel: React.FC<ImmutableActivityLogPanelProps> = ({
  request,
  compact = false,
  onAddAuditNote,
}) => {
  const [viewMode, setViewMode] = useState<'timeline' | 'table'>('timeline');
  const [actionTypeFilter, setActionTypeFilter] = useState<'all' | TimelineActionType>('all');
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  // Quick Note Form state
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteDetails, setNewNoteDetails] = useState('');
  const [newNoteCategory, setNewNoteCategory] = useState<TimelineActionType>('notas');

  // Combine auditTrail and statusHistory into a single chronological, frozen list with rich timeline metadata
  const unifiedLogs = useMemo<readonly UnifiedImmutableLogItem[]>(() => {
    const items: UnifiedImmutableLogItem[] = [];

    // 1. Audit trail entries
    for (const aud of request.auditTrail || []) {
      const { date, dateLong, time } = formatExactDateAndTime(aud.timestamp);
      const isApprovalOrDispatch =
        aud.module.toLowerCase().includes('aprob') ||
        aud.action.toLowerCase().includes('aprob') ||
        aud.action.toLowerCase().includes('envío') ||
        aud.action.toLowerCase().includes('propuesta');

      const actionType = classifyActionType(aud.module || 'Cotizador', aud.action, aud.details, false);
      const changeMeta = parseChangeMetadata(aud.action, aud.details);

      items.push(
        Object.freeze({
          id: aud.id,
          sealCode: computeSealHash(aud.id, aud.timestamp, aud.actorUid, aud.action),
          timestamp: aud.timestamp,
          formattedDate: date,
          formattedDateLong: dateLong,
          formattedTime: time,
          actorName: aud.actorName,
          actorRole: aud.actorRole,
          actorUid: aud.actorUid,
          category: isApprovalOrDispatch ? 'Aprobación / Envío' : 'Modificación de Cotización',
          actionType,
          actionTypeLabel: getActionTypeLabel(actionType),
          module: aud.module || 'Cotizador',
          action: aud.action,
          details: aud.details,
          changeMeta,
        })
      );
    }

    // 2. Status history entries (avoid exact-second duplicates if already logged as status transition in auditTrail)
    for (const sh of request.statusHistory || []) {
      const alreadyInAudit = (request.auditTrail || []).some(
        (a) =>
          Math.abs(new Date(a.timestamp).getTime() - new Date(sh.changedAt).getTime()) < 1500 &&
          a.details.includes(sh.newStatus)
      );
      if (alreadyInAudit) continue;

      const { date, dateLong, time } = formatExactDateAndTime(sh.changedAt);
      const actionStr = `Transición de estado: ${sh.previousStatus} → ${sh.newStatus}`;
      const detailsStr = sh.note || `Cambio de estado formal a ${sh.newStatus}`;

      items.push(
        Object.freeze({
          id: sh.id,
          sealCode: computeSealHash(
            sh.id,
            sh.changedAt,
            sh.changedByUid,
            `${sh.previousStatus}->${sh.newStatus}`
          ),
          timestamp: sh.changedAt,
          formattedDate: date,
          formattedDateLong: dateLong,
          formattedTime: time,
          actorName: sh.changedByName,
          actorRole: 'Operación / Comercial',
          actorUid: sh.changedByUid,
          category: 'Cambio de Estado',
          actionType: 'estado',
          actionTypeLabel: 'Cambio de Estado / Flujo',
          module: 'Estado del Expediente',
          action: actionStr,
          details: detailsStr,
          changeMeta: {
            fromStatus: sh.previousStatus,
            toStatus: sh.newStatus,
            detectedAmounts: [],
          },
        })
      );
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return Object.freeze(items);
  }, [request.auditTrail, request.statusHistory]);

  // Counts per action type for filter pills
  const countsByType = useMemo(() => {
    let precio = 0;
    let estado = 0;
    let notas = 0;
    for (const item of unifiedLogs) {
      if (item.actionType === 'precio') precio++;
      else if (item.actionType === 'estado') estado++;
      else notas++;
    }
    return {
      all: unifiedLogs.length,
      precio,
      estado,
      notas,
    };
  }, [unifiedLogs]);

  // Unique actors for dropdown filter
  const uniqueActors = useMemo(() => {
    const set = new Set<string>();
    for (const item of unifiedLogs) {
      if (item.actorName) set.add(item.actorName);
    }
    return Array.from(set);
  }, [unifiedLogs]);

  // Filtered and sorted items
  const filteredLogs = useMemo(() => {
    const list = unifiedLogs.filter((item) => {
      if (actionTypeFilter !== 'all' && item.actionType !== actionTypeFilter) {
        return false;
      }
      if (actorFilter !== 'all' && item.actorName !== actorFilter) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.actorName.toLowerCase().includes(q) ||
        item.actorRole.toLowerCase().includes(q) ||
        item.action.toLowerCase().includes(q) ||
        item.details.toLowerCase().includes(q) ||
        item.module.toLowerCase().includes(q) ||
        item.formattedDate.includes(q) ||
        item.sealCode.toLowerCase().includes(q) ||
        item.actionTypeLabel.toLowerCase().includes(q)
      );
    });

    if (sortOrder === 'asc') {
      return [...list].reverse();
    }
    return list;
  }, [unifiedLogs, actionTypeFilter, actorFilter, searchQuery, sortOrder]);

  // Group filtered logs by date for the visual timeline view
  const groupedTimelineByDate = useMemo(() => {
    const groups: {
      dateKey: string;
      dateLongLabel: string;
      items: UnifiedImmutableLogItem[];
    }[] = [];

    for (const item of filteredLogs) {
      const existing = groups.find((g) => g.dateKey === item.formattedDate);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.push({
          dateKey: item.formattedDate,
          dateLongLabel: item.formattedDateLong,
          items: [item],
        });
      }
    }
    return groups;
  }, [filteredLogs]);

  const handleExportImmutableCSV = () => {
    const headers = [
      'Sello Inmutable',
      'Folio Cotización',
      'Día (DD/MM/AAAA)',
      'Hora Exacta (HH:MM:SS)',
      'Tipo de Acción',
      'Quién lo hizo (Usuario)',
      'Rol del Usuario',
      'Módulo / Escenario',
      'Qué hizo (Acción)',
      'Detalle Exacto de la Actividad',
    ];
    const rows = filteredLogs.map((log) => [
      log.sealCode,
      request.folio,
      log.formattedDate,
      log.formattedTime,
      log.actionTypeLabel,
      log.actorName,
      log.actorRole,
      log.module,
      log.action,
      log.details,
    ]);
    exportToExcelCSV(`Linea_Tiempo_Bitacora_${request.folio}.csv`, headers, rows);
  };

  const handleSubmitQuickNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddAuditNote || !newNoteDetails.trim()) return;
    const defaultTitle =
      newNoteCategory === 'precio'
        ? 'Nota de Ajuste / Acuerdo de Precio'
        : newNoteCategory === 'estado'
          ? 'Seguimiento de Estado / Comité'
          : 'Nota de Bitácora / Seguimiento Comercial';

    onAddAuditNote(newNoteTitle.trim() || defaultTitle, newNoteDetails.trim(), newNoteCategory);
    setNewNoteTitle('');
    setNewNoteDetails('');
    setShowAddNoteModal(false);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-slate-800 border border-slate-700 rounded-xl shrink-0 mt-0.5">
            <Lock className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight text-white">
                Línea de Tiempo Gráfica y Bitácora de Auditoría ({request.folio})
              </h3>
              <span className="text-[11px] font-mono text-emerald-300 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded">
                RASTREO INMUTABLE · SELLADO
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Visualización cronológica de cambios de precio, transiciones de estado y notas operativas. Filtra por tipo de acción para auditar el historial del expediente.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* View Mode Toggle: Timeline vs Table */}
          <div className="inline-flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-colors ${
                viewMode === 'timeline'
                  ? 'bg-[#0B3B70] text-white shadow-2xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              Línea de Tiempo
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-colors ${
                viewMode === 'table'
                  ? 'bg-[#0B3B70] text-white shadow-2xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              Tabla Forense
            </button>
          </div>

          {onAddAuditNote && (
            <button
              type="button"
              onClick={() => setShowAddNoteModal((prev) => !prev)}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Registrar Nota
            </button>
          )}

          <button
            type="button"
            onClick={handleExportImmutableCSV}
            className="px-3.5 py-2 text-xs font-semibold text-slate-900 bg-white rounded-lg hover:bg-slate-100 flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Collapsible Quick Note Form */}
      {showAddNoteModal && onAddAuditNote && (
        <form
          onSubmit={handleSubmitQuickNote}
          className="p-4 bg-blue-50/70 border-b border-blue-200 space-y-3 text-xs"
        >
          <div className="flex items-center justify-between">
            <div className="font-bold text-[#0B3B70] flex items-center gap-1.5">
              <MessageSquareText className="w-4 h-4" />
              <span>Registrar Nueva Nota o Hito en la Línea de Tiempo ({request.folio})</span>
            </div>
            <button
              type="button"
              onClick={() => setShowAddNoteModal(false)}
              className="p-1 text-slate-500 hover:text-slate-800 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Clasificación en Línea de Tiempo
              </label>
              <select
                value={newNoteCategory}
                onChange={(e) => setNewNoteCategory(e.target.value as TimelineActionType)}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-900"
              >
                <option value="notas">Nota Comercial / Especificación / Itinerario</option>
                <option value="precio">Acuerdo o Observación de Precio / Costos</option>
                <option value="estado">Seguimiento de Estado / Comité</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Título breve de la acción (opcional)
              </label>
              <input
                type="text"
                value={newNoteTitle}
                onChange={(e) => setNewNoteTitle(e.target.value)}
                placeholder="Ej. Negociación de tarifa grupal con colegio / Ajuste solicitado por dirección..."
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Detalle de la nota o cambio acordado *
            </label>
            <textarea
              rows={2}
              required
              value={newNoteDetails}
              onChange={(e) => setNewNoteDetails(e.target.value)}
              placeholder="Escribe el detalle que quedará sellado en la línea de tiempo (ej. Se acordó mantener tarifa de $2,450 USD si confirman antes del viernes)..."
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddNoteModal(false)}
              className="px-3 py-1.5 text-slate-600 hover:text-slate-900 font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-[#0B3B70] text-white font-semibold rounded-lg hover:bg-blue-900"
            >
              Guardar y Sellar en Línea de Tiempo
            </button>
          </div>
        </form>
      )}

      {/* Action-Type Visual Filter Cards (Precio, Estado, Notas) */}
      <div className="px-5 pt-4 pb-3 bg-slate-50/80 border-b border-slate-200 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <ListFilter className="w-3.5 h-3.5 text-[#0B3B70]" />
            Filtrar Línea de Tiempo por Tipo de Acción:
          </span>
          <span className="text-xs text-slate-500 font-mono">
            Mostrando <strong className="text-slate-900">{filteredLogs.length}</strong> de{' '}
            {unifiedLogs.length} registros sellados
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Todos */}
          <button
            type="button"
            onClick={() => setActionTypeFilter('all')}
            className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
              actionTypeFilter === 'all'
                ? 'bg-[#0B3B70] border-[#0B3B70] text-white shadow-xs'
                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div>
              <div className="text-xs font-bold">Todas las Acciones</div>
              <div
                className={`text-[11px] mt-0.5 ${
                  actionTypeFilter === 'all' ? 'text-sky-200' : 'text-slate-500'
                }`}
              >
                Historial completo del folio
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-lg font-mono text-sm font-bold tabular-nums ${
                actionTypeFilter === 'all'
                  ? 'bg-blue-950/60 text-white'
                  : 'bg-slate-100 text-slate-800'
              }`}
            >
              {countsByType.all}
            </span>
          </button>

          {/* Cambios de Precio y Costos */}
          <button
            type="button"
            onClick={() =>
              setActionTypeFilter(actionTypeFilter === 'precio' ? 'all' : 'precio')
            }
            className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
              actionTypeFilter === 'precio'
                ? 'bg-emerald-700 border-emerald-700 text-white shadow-xs'
                : 'bg-white border-emerald-200/90 text-slate-800 hover:border-emerald-400 hover:bg-emerald-50/40'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <div
                className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                  actionTypeFilter === 'precio'
                    ? 'bg-emerald-800 text-emerald-200'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                <DollarSign className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">Cambios de Precio</div>
                <div
                  className={`text-[11px] truncate mt-0.5 ${
                    actionTypeFilter === 'precio' ? 'text-emerald-100' : 'text-slate-500'
                  }`}
                >
                  Costos, rubros, FX, margen
                </div>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-lg font-mono text-sm font-bold tabular-nums shrink-0 ml-2 ${
                actionTypeFilter === 'precio'
                  ? 'bg-emerald-900/60 text-white'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {countsByType.precio}
            </span>
          </button>

          {/* Cambios de Estado y Flujo */}
          <button
            type="button"
            onClick={() =>
              setActionTypeFilter(actionTypeFilter === 'estado' ? 'all' : 'estado')
            }
            className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
              actionTypeFilter === 'estado'
                ? 'bg-indigo-700 border-indigo-700 text-white shadow-xs'
                : 'bg-white border-indigo-200/90 text-slate-800 hover:border-indigo-400 hover:bg-indigo-50/40'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <div
                className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                  actionTypeFilter === 'estado'
                    ? 'bg-indigo-800 text-indigo-200'
                    : 'bg-indigo-100 text-indigo-700'
                }`}
              >
                <GitCommit className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">Cambios de Estado</div>
                <div
                  className={`text-[11px] truncate mt-0.5 ${
                    actionTypeFilter === 'estado' ? 'text-indigo-100' : 'text-slate-500'
                  }`}
                >
                  Flujo, comité, envíos y cierre
                </div>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-lg font-mono text-sm font-bold tabular-nums shrink-0 ml-2 ${
                actionTypeFilter === 'estado'
                  ? 'bg-indigo-900/60 text-white'
                  : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
              }`}
            >
              {countsByType.estado}
            </span>
          </button>

          {/* Notas, Itinerario y Especificaciones */}
          <button
            type="button"
            onClick={() =>
              setActionTypeFilter(actionTypeFilter === 'notas' ? 'all' : 'notas')
            }
            className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
              actionTypeFilter === 'notas'
                ? 'bg-amber-700 border-amber-700 text-white shadow-xs'
                : 'bg-white border-amber-200/90 text-slate-800 hover:border-amber-400 hover:bg-amber-50/40'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <div
                className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                  actionTypeFilter === 'notas'
                    ? 'bg-amber-800 text-amber-200'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                <MessageSquareText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">Notas y Ajustes</div>
                <div
                  className={`text-[11px] truncate mt-0.5 ${
                    actionTypeFilter === 'notas' ? 'text-amber-100' : 'text-slate-500'
                  }`}
                >
                  Comentarios, itinerario, ficha
                </div>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-lg font-mono text-sm font-bold tabular-nums shrink-0 ml-2 ${
                actionTypeFilter === 'notas'
                  ? 'bg-amber-900/60 text-white'
                  : 'bg-amber-50 text-amber-900 border border-amber-200'
              }`}
            >
              {countsByType.notas}
            </span>
          </button>
        </div>

        {/* Search, Actor Filter, and Sort Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 text-xs">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por rubro, monto ($), estado, nota, usuario o código SEAL..."
              className="w-full pl-8 pr-8 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Usuario:</span>
              <select
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-800"
              >
                <option value="all">Todos ({uniqueActors.length})</option>
                {uniqueActors.map((actor) => (
                  <option key={actor} value={actor}>
                    {actor}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Orden:</span>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-800"
              >
                <option value="desc">Más recientes primero</option>
                <option value="asc">Cronológico (Antiguos primero)</option>
              </select>
            </div>

            {(actionTypeFilter !== 'all' || actorFilter !== 'all' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setActionTypeFilter('all');
                  setActorFilter('all');
                  setSearchQuery('');
                }}
                className="px-2.5 py-1.5 text-xs font-semibold text-[#0B3B70] bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* VIEW 1: GRAPHICAL TIMELINE VIEW */}
      {viewMode === 'timeline' ? (
        <div
          className={`p-5 bg-slate-50/40 ${
            compact ? 'max-h-[460px]' : 'max-h-[720px]'
          } overflow-y-auto space-y-6`}
        >
          {groupedTimelineByDate.length === 0 ? (
            <div className="py-12 text-center bg-white border border-dashed border-slate-300 rounded-xl p-6">
              <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-semibold text-slate-700">
                No se encontraron eventos en la línea de tiempo con este filtro
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Prueba seleccionando &ldquo;Todas las Acciones&rdquo; o limpiando el término de búsqueda.
              </p>
            </div>
          ) : (
            groupedTimelineByDate.map((dateGroup) => (
              <div key={dateGroup.dateKey} className="space-y-3">
                {/* Date Sticky Milestone Header */}
                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-slate-900 text-white text-xs font-semibold shadow-2xs">
                    <Clock className="w-3.5 h-3.5 text-sky-300" />
                    <span className="capitalize">{dateGroup.dateLongLabel}</span>
                    <span className="font-mono text-[11px] text-slate-300">
                      ({dateGroup.dateKey})
                    </span>
                  </div>
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[11px] font-mono text-slate-500">
                    {dateGroup.items.length}{' '}
                    {dateGroup.items.length === 1 ? 'evento' : 'eventos'}
                  </span>
                </div>

                {/* Vertical Timeline Nodes */}
                <div className="relative pl-6 sm:pl-8 space-y-3.5 before:content-[''] before:absolute before:left-2.5 sm:before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {dateGroup.items.map((log) => {
                    const isPrice = log.actionType === 'precio';
                    const isStatus = log.actionType === 'estado';

                    const nodeBg = isPrice
                      ? 'bg-emerald-600 text-white ring-4 ring-emerald-100'
                      : isStatus
                        ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                        : 'bg-amber-600 text-white ring-4 ring-amber-100';

                    const cardBorder = isPrice
                      ? 'border-l-4 border-l-emerald-600 border-slate-200'
                      : isStatus
                        ? 'border-l-4 border-l-indigo-600 border-slate-200'
                        : 'border-l-4 border-l-amber-500 border-slate-200';

                    const badgeStyle = isPrice
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : isStatus
                        ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                        : 'bg-amber-50 text-amber-900 border-amber-200';

                    return (
                      <div key={log.id} className="relative group">
                        {/* Timeline Circular Icon Node */}
                        <div
                          className={`absolute -left-6 sm:-left-8 top-3.5 w-6 h-6 rounded-full flex items-center justify-center shadow-2xs transition-transform group-hover:scale-105 ${nodeBg}`}
                        >
                          {isPrice ? (
                            <DollarSign className="w-3.5 h-3.5" />
                          ) : isStatus ? (
                            <GitCommit className="w-3.5 h-3.5" />
                          ) : (
                            <MessageSquareText className="w-3.5 h-3.5" />
                          )}
                        </div>

                        {/* Event Card */}
                        <div
                          className={`bg-white border ${cardBorder} rounded-xl p-4 shadow-2xs hover:shadow-sm transition-all space-y-2.5`}
                        >
                          {/* Top Row: Badges + Time + Seal */}
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold ${badgeStyle}`}
                              >
                                {isPrice ? (
                                  <TrendingUp className="w-3 h-3" />
                                ) : isStatus ? (
                                  <CheckCircle2 className="w-3 h-3" />
                                ) : (
                                  <FileText className="w-3 h-3" />
                                )}
                                {log.actionTypeLabel}
                              </span>

                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                                {log.module}
                              </span>

                              <span className="font-mono text-slate-500 text-[11px]">
                                {log.formattedTime} hrs
                              </span>
                            </div>

                            <div className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-700 bg-emerald-50/70 border border-emerald-200/80 px-2 py-0.5 rounded">
                              <ShieldCheck className="w-3 h-3 shrink-0" />
                              <span>{log.sealCode}</span>
                            </div>
                          </div>

                          {/* Main Action & Details */}
                          <div>
                            <div className="text-sm font-bold text-slate-900">{log.action}</div>
                            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                              {log.details}
                            </p>
                          </div>

                          {/* Visual Delta / Status Transition / Price Highlight Box */}
                          {(log.changeMeta.beforeValue && log.changeMeta.afterValue) ||
                          (log.changeMeta.fromStatus && log.changeMeta.toStatus) ||
                          log.changeMeta.detectedAmounts.length > 0 ? (
                            <div className="pt-1 flex flex-wrap items-center gap-2">
                              {/* Before -> After Value Pill */}
                              {log.changeMeta.beforeValue && log.changeMeta.afterValue && (
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50/90 border border-emerald-200 text-xs">
                                  <span className="text-slate-500 font-medium">Cambio:</span>
                                  <span className="font-mono line-through text-slate-500 tabular-nums">
                                    {log.changeMeta.beforeValue}
                                  </span>
                                  <ArrowRight className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                  <span className="font-mono font-bold text-emerald-900 tabular-nums">
                                    {log.changeMeta.afterValue}
                                  </span>
                                </div>
                              )}

                              {/* Status Transition Pill */}
                              {log.changeMeta.fromStatus && log.changeMeta.toStatus && (
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50/90 border border-indigo-200 text-xs">
                                  <span className="text-indigo-700 font-medium">Transición:</span>
                                  <span className="px-2 py-0.5 rounded bg-white border border-indigo-200 text-slate-700 font-medium">
                                    {log.changeMeta.fromStatus}
                                  </span>
                                  <ArrowRight className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                                  <span className="px-2 py-0.5 rounded bg-indigo-700 text-white font-semibold">
                                    {log.changeMeta.toStatus}
                                  </span>
                                </div>
                              )}

                              {/* Detected Monetary Chips (if no before/after already shown) */}
                              {!log.changeMeta.beforeValue &&
                                log.changeMeta.detectedAmounts.map((amt, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 font-mono text-xs font-bold text-slate-800 tabular-nums"
                                  >
                                    <Sparkles className="w-3 h-3 text-emerald-600" />
                                    {amt}
                                  </span>
                                ))}
                            </div>
                          ) : null}

                          {/* Actor Footer */}
                          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[10px]">
                                {log.actorName
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </span>
                              <span className="font-semibold text-slate-800">{log.actorName}</span>
                              <span>·</span>
                              <span>Rol: {log.actorRole}</span>
                            </div>
                            <span className="font-mono text-[10px] text-slate-400">
                              ID Evento: {log.id}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* VIEW 2: FORENSIC TABLE VIEW */
        <div className={`overflow-x-auto ${compact ? 'max-h-96' : 'max-h-[600px]'} overflow-y-auto`}>
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold">
              <tr>
                <th className="py-2.5 px-4 whitespace-nowrap">Día y Hora Exacta</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Tipo de Acción</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Quién lo hizo (Usuario y Rol)</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Módulo / Escenario</th>
                <th className="py-2.5 px-4">Qué hizo (Actividad y Detalle Exacto)</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Sello Inmutable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No se encontraron registros que coincidan con el filtro actual.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Día y Hora Exacta */}
                    <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap align-top">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#0B3B70] shrink-0" />
                        <span>{log.formattedDate}</span>
                      </div>
                      <div className="text-slate-500 pl-5">{log.formattedTime} hrs</div>
                    </td>

                    {/* Tipo de Acción */}
                    <td className="py-3 px-4 align-top whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold ${
                          log.actionType === 'precio'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : log.actionType === 'estado'
                              ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                              : 'bg-amber-50 text-amber-900 border-amber-200'
                        }`}
                      >
                        {log.actionTypeLabel}
                      </span>
                    </td>

                    {/* Quién lo hizo */}
                    <td className="py-3 px-4 align-top whitespace-nowrap">
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{log.actorName}</span>
                      </div>
                      <div className="text-slate-500 pl-5">Rol: {log.actorRole}</div>
                    </td>

                    {/* Módulo / Categoría */}
                    <td className="py-3 px-4 align-top whitespace-nowrap">
                      <div className="font-semibold text-[#0B3B70]">{log.module}</div>
                      <div className="text-[11px] text-slate-500">{log.category}</div>
                    </td>

                    {/* Qué hizo */}
                    <td className="py-3 px-4 align-top">
                      <div className="font-semibold text-slate-900">{log.action}</div>
                      <div className="text-slate-600 mt-0.5 leading-relaxed">{log.details}</div>
                    </td>

                    {/* Sello Inmutable */}
                    <td className="py-3 px-4 text-right font-mono text-[11px] text-slate-500 align-top whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{log.sealCode}</span>
                      </div>
                      <div className="text-[10px] text-slate-400">Bloqueado</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

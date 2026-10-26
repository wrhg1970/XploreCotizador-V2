import React, { useMemo, useState } from 'react';
import {
  Office,
  ProgramType,
  RequestStatus,
  TravelRequest,
  UserProfile,
} from '../types/domain';
import { formatMoney } from '../utils/exporters';
import { calculateScenarioFinancials } from '../engine/financialEngine';
import {
  CORE_PROCESS_STAGES,
  CoreProcessStageId,
  resolveCoreProcessStage,
} from '../utils/processStages';
import {
  Search,
  Plus,
  Copy,
  ArrowUpDown,
  FolderOpen,
  Filter,
  RotateCcw,
  TrendingUp,
  Trash2,
  Columns3,
  List,
  Target,
  Clock,
  LayoutGrid,
  Rows3,
  Check,
  ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { ActivityDashboard } from './ActivityDashboard';
import { DossierTab } from './RequestDetailDossier';

type QuickTabTarget = DossierTab;
type QuickViewBucket = 'all' | 'cotizacion' | 'por_aprobar' | 'enviadas' | 'aceptadas';

interface DashboardProps {
  requests: TravelRequest[];
  offices: Office[];
  users: UserProfile[];
  onSelectRequest: (req: TravelRequest, targetTab?: QuickTabTarget) => void;
  onOpenNewModal: (duplicateFrom?: TravelRequest | null) => void;
}

const ALL_STATUSES: RequestStatus[] = [
  'Borrador',
  'Recibida',
  'En análisis',
  'En cotización',
  'Pendiente de aprobación',
  'Aprobada',
  'Enviada',
  'En negociación',
  'Aceptada',
  'Rechazada',
  'Cancelada',
  'Vencida',
];

const ALL_PROGRAMS: ProgramType[] = [
  'Inmersión Académica',
  'Campamento de Verano',
  'Curso de Idiomas',
  'Tour Cultural y Universitario',
  'STEM & Robótica',
  'Liderazgo Internacional',
];

export const DashboardModule: React.FC<DashboardProps> = ({
  requests,
  offices,
  users,
  onSelectRequest,
  onOpenNewModal,
}) => {
  const [officeFilter, setOfficeFilter] = useState('all');
  const [execFilter, setExecFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [programFilter, setProgramFilter] = useState('all');
  const [quickSearch, setQuickSearch] = useState('');
  const [quickView, setQuickView] = useState<QuickViewBucket>('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [dossiersLayout, setDossiersLayout] = useState<'filas' | 'tarjetas'>('filas');

  const activeFiltersCount = [
    officeFilter !== 'all',
    execFilter !== 'all',
    countryFilter !== 'all',
    cityFilter !== 'all',
    periodFilter !== 'all',
    statusFilter !== 'all',
    programFilter !== 'all',
    quickSearch.trim() !== '',
    quickView !== 'all',
  ].filter(Boolean).length;

  const countries = useMemo(
    () => Array.from(new Set(requests.map((r) => r.country))).sort(),
    [requests]
  );
  const cities = useMemo(
    () => Array.from(new Set(requests.map((r) => r.city))).sort(),
    [requests]
  );

  const filteredRequests = useMemo(() => {
    const q = quickSearch.trim().toLowerCase();
    return requests.filter((r) => {
      if (officeFilter !== 'all' && r.officeId !== officeFilter) return false;
      if (execFilter !== 'all' && r.commercialExecutiveUid !== execFilter) return false;
      if (countryFilter !== 'all' && r.country !== countryFilter) return false;
      if (cityFilter !== 'all' && r.city !== cityFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (programFilter !== 'all' && r.programType !== programFilter) return false;
      if (periodFilter !== 'all') {
        const depYear = r.departureDate.slice(0, 4);
        if (depYear !== periodFilter) return false;
      }
      if (quickView === 'cotizacion') {
        if (
          r.status !== 'Borrador' &&
          r.status !== 'Recibida' &&
          r.status !== 'En análisis' &&
          r.status !== 'En cotización'
        )
          return false;
      } else if (quickView === 'por_aprobar') {
        if (
          r.status !== 'Pendiente de aprobación' &&
          r.status !== 'Aprobada' &&
          !r.scenarios.some((s) => s.approvalStatus === 'Pendiente')
        )
          return false;
      } else if (quickView === 'enviadas') {
        if (r.status !== 'Enviada' && r.status !== 'En negociación') return false;
      } else if (quickView === 'aceptadas') {
        if (r.status !== 'Aceptada') return false;
      }
      if (q) {
        const matches =
          r.folio.toLowerCase().includes(q) ||
          r.groupName.toLowerCase().includes(q) ||
          `${r.city} ${r.country}`.toLowerCase().includes(q) ||
          r.requesterName.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [
    requests,
    officeFilter,
    execFilter,
    countryFilter,
    cityFilter,
    statusFilter,
    programFilter,
    periodFilter,
    quickSearch,
    quickView,
  ]);

  // Calculate all 10 required Dashboard KPIs from real database records
  const kpis = useMemo(() => {
    const totalReceived = filteredRequests.length;
    const newRequests = filteredRequests.filter(
      (r) => r.status === 'Recibida' || r.status === 'Borrador'
    ).length;
    const inQuotation = filteredRequests.filter(
      (r) => r.status === 'En análisis' || r.status === 'En cotización'
    ).length;
    const pendingApproval = filteredRequests.filter(
      (r) =>
        r.status === 'Pendiente de aprobación' ||
        r.scenarios.some((s) => s.approvalStatus === 'Pendiente')
    ).length;
    const proposalsSent = filteredRequests.filter(
      (r) =>
        r.status === 'Enviada' ||
        r.status === 'En negociación' ||
        r.status === 'Aceptada' ||
        r.status === 'Rechazada' ||
        r.dispatches.length > 0
    ).length;
    const proposalsAccepted = filteredRequests.filter(
      (r) => r.status === 'Aceptada' || r.outcomes.some((o) => o.decision === 'Aceptada')
    ).length;
    const proposalsRejected = filteredRequests.filter(
      (r) => r.status === 'Rechazada' || r.outcomes.some((o) => o.decision === 'Rechazada')
    ).length;

    const nowMs = new Date('2026-10-23T12:00:00Z').getTime();
    const dueSoonOrOverdue = filteredRequests.filter((r) => {
      if (['Aceptada', 'Rechazada', 'Cancelada', 'Enviada'].includes(r.status)) return false;
      const dueMs = new Date(r.proposalDueDate).getTime();
      const diffDays = (dueMs - nowMs) / (1000 * 60 * 60 * 24);
      return diffDays <= 5 || r.status === 'Vencida';
    }).length;

    // Average turnaround time from request createdAt to first dispatch sentAt (in days)
    const turnaroundDaysList: number[] = [];
    for (const r of filteredRequests) {
      if (r.dispatches.length > 0) {
        const createdMs = new Date(r.createdAt).getTime();
        const sentMs = new Date(r.dispatches[0].sentAt).getTime();
        if (sentMs >= createdMs) {
          turnaroundDaysList.push((sentMs - createdMs) / (1000 * 60 * 60 * 24));
        }
      }
    }
    const avgTurnaroundDays =
      turnaroundDaysList.length > 0
        ? turnaroundDaysList.reduce((a, b) => a + b, 0) / turnaroundDaysList.length
        : 2.8;

    const acceptanceRate =
      proposalsSent > 0 ? (proposalsAccepted / proposalsSent) * 100 : 0;

    // Executive Summary Aggregate Metrics
    const activeRequestsCount = filteredRequests.filter(
      (r) => !['Cancelada', 'Rechazada', 'Vencida'].includes(r.status)
    ).length;

    const totalParticipants = filteredRequests.reduce(
      (sum, r) => sum + (Number(r.participants) || 0),
      0
    );
    const totalChaperones = filteredRequests.reduce(
      (sum, r) => sum + (Number(r.chaperones) || 0),
      0
    );
    const totalStaff = filteredRequests.reduce(
      (sum, r) => sum + (Number(r.additionalStaff) || 0),
      0
    );

    const fxToMXN: Record<string, number> = {
      MXN: 1,
      USD: 19.85,
      CAD: 14.35,
      EUR: 21.4,
      GBP: 25.1,
    };

    const totalEstimatedBudgetMXN = filteredRequests.reduce((sum, r) => {
      const rate = fxToMXN[r.budgetCurrency] || 1;
      const groupBudget =
        (Number(r.estimatedBudgetPerPerson) || 0) * (Number(r.participants) || 0) * rate;
      return sum + groupBudget;
    }, 0);

    const avgBudgetPerParticipantMXN =
      totalParticipants > 0 ? totalEstimatedBudgetMXN / totalParticipants : 0;

    // Breakdown by program type for visual bar distribution
    const programMap = new Map<
      string,
      { count: number; participants: number; budgetMXN: number }
    >();
    for (const r of filteredRequests) {
      const rate = fxToMXN[r.budgetCurrency] || 1;
      const groupBudget =
        (Number(r.estimatedBudgetPerPerson) || 0) * (Number(r.participants) || 0) * rate;
      const prev = programMap.get(r.programType) || {
        count: 0,
        participants: 0,
        budgetMXN: 0,
      };
      programMap.set(r.programType, {
        count: prev.count + 1,
        participants: prev.participants + (Number(r.participants) || 0),
        budgetMXN: prev.budgetMXN + groupBudget,
      });
    }

    const programBreakdown = Array.from(programMap.entries())
      .map(([program, data]) => ({
        program,
        ...data,
        sharePct:
          totalEstimatedBudgetMXN > 0
            ? (data.budgetMXN / totalEstimatedBudgetMXN) * 100
            : 0,
      }))
      .sort((a, b) => b.budgetMXN - a.budgetMXN);

    // Weekly trend calculation of created requests (last 6 weeks up to Oct 23, 2026)
    const weekBuckets = [
      { key: '2026-W38', label: 'Sem 14 Sep', start: '2026-09-14', end: '2026-09-20', solicitudes: 0, participantes: 0 },
      { key: '2026-W39', label: 'Sem 21 Sep', start: '2026-09-21', end: '2026-09-27', solicitudes: 0, participantes: 0 },
      { key: '2026-W40', label: 'Sem 28 Sep', start: '2026-09-28', end: '2026-10-04', solicitudes: 0, participantes: 0 },
      { key: '2026-W41', label: 'Sem 05 Oct', start: '2026-10-05', end: '2026-10-11', solicitudes: 0, participantes: 0 },
      { key: '2026-W42', label: 'Sem 12 Oct', start: '2026-10-12', end: '2026-10-18', solicitudes: 0, participantes: 0 },
      { key: '2026-W43', label: 'Sem 19 Oct', start: '2026-10-19', end: '2026-10-26', solicitudes: 0, participantes: 0 },
    ];

    for (const r of filteredRequests) {
      const dateStr = (r.createdAt || '').slice(0, 10);
      const matchedBucket = weekBuckets.find(
        (b) => dateStr >= b.start && dateStr <= b.end
      );
      if (matchedBucket) {
        matchedBucket.solicitudes += 1;
        matchedBucket.participantes += Number(r.participants) || 0;
      } else {
        // Place newer dynamic requests in the current latest week bucket
        weekBuckets[weekBuckets.length - 1].solicitudes += 1;
        weekBuckets[weekBuckets.length - 1].participantes += Number(r.participants) || 0;
      }
    }

    const peakWeek = weekBuckets.reduce(
      (max, b) => (b.solicitudes >= max.solicitudes ? b : max),
      weekBuckets[0]
    );

    return {
      totalReceived,
      newRequests,
      inQuotation,
      pendingApproval,
      proposalsSent,
      proposalsAccepted,
      proposalsRejected,
      dueSoonOrOverdue,
      avgTurnaroundDays,
      acceptanceRate,
      activeRequestsCount,
      totalParticipants,
      totalChaperones,
      totalStaff,
      totalEstimatedBudgetMXN,
      avgBudgetPerParticipantMXN,
      programBreakdown,
      weekBuckets,
      peakWeek,
    };
  }, [filteredRequests]);

  const resetFilters = () => {
    setOfficeFilter('all');
    setExecFilter('all');
    setCountryFilter('all');
    setCityFilter('all');
    setPeriodFilter('all');
    setStatusFilter('all');
    setProgramFilter('all');
    setQuickSearch('');
    setQuickView('all');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Panel de Control Comercial y Financiero
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Estudiantes Embajadores · Métricas en tiempo real desde expedientes activos
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onOpenNewModal(null)}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0B3B70] rounded-lg hover:bg-[#082d56] transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Nueva Solicitud de Viaje
          </button>
        </div>
      </div>

      {/* Executive Visual Summary Section */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* Metric 1: Total Active Requests & Funnel */}
          <div className="p-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="text-xs font-medium text-slate-500">
                Solicitudes Activas en Ciclo
              </div>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-3xl font-bold text-[#0B3B70] font-mono tabular-nums">
                  {kpis.activeRequestsCount}
                </span>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  de {kpis.totalReceived} registradas
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {kpis.inQuotation} en cotización · {kpis.pendingApproval} por aprobar ·{' '}
                {kpis.proposalsSent} enviadas
              </p>
            </div>

            {/* Proportional Funnel Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-slate-500 font-mono tabular-nums">
                <span>Avance del embudo comercial</span>
                <span>Tasa cierre: {kpis.acceptanceRate.toFixed(1)}%</span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                <div
                  style={{
                    width: `${
                      kpis.totalReceived > 0
                        ? (kpis.proposalsAccepted / kpis.totalReceived) * 100
                        : 0
                    }%`,
                  }}
                  className="bg-emerald-600 h-full"
                  title="Aceptadas"
                />
                <div
                  style={{
                    width: `${
                      kpis.totalReceived > 0
                        ? (Math.max(0, kpis.proposalsSent - kpis.proposalsAccepted) /
                            kpis.totalReceived) *
                          100
                        : 0
                    }%`,
                  }}
                  className="bg-[#0B3B70] h-full"
                  title="Enviadas / En negociación"
                />
                <div
                  style={{
                    width: `${
                      kpis.totalReceived > 0
                        ? (kpis.pendingApproval / kpis.totalReceived) * 100
                        : 0
                    }%`,
                  }}
                  className="bg-amber-500 h-full"
                  title="Pendientes de aprobación"
                />
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span>Aceptadas ({kpis.proposalsAccepted})</span>
                <span>·</span>
                <span>Enviadas ({kpis.proposalsSent})</span>
                <span>·</span>
                <span>Por aprobar ({kpis.pendingApproval})</span>
              </div>
            </div>
          </div>

          {/* Metric 2: Total Travel Participants & Group Aforo */}
          <div className="p-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="text-xs font-medium text-slate-500">
                Total de Participantes Proyectados
              </div>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-3xl font-bold text-slate-900 font-mono tabular-nums">
                  {kpis.totalParticipants.toLocaleString('es-MX')}
                </span>
                <span className="text-xs text-slate-500">estudiantes pagantes</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                +{kpis.totalChaperones} chaperones · +{kpis.totalStaff} staff EE (
                {kpis.totalParticipants + kpis.totalChaperones + kpis.totalStaff} viajeros
                totales)
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Prom. Grupo</span>
                <strong className="font-mono tabular-nums text-slate-800">
                  {kpis.totalReceived > 0
                    ? Math.round(kpis.totalParticipants / kpis.totalReceived)
                    : 0}{' '}
                  alum.
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Ratio Chap.</span>
                <strong className="font-mono tabular-nums text-slate-800">
                  1 :{' '}
                  {kpis.totalChaperones > 0
                    ? Math.round(kpis.totalParticipants / kpis.totalChaperones)
                    : kpis.totalParticipants}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Escenarios</span>
                <strong className="font-mono tabular-nums text-slate-800">
                  {filteredRequests.reduce((acc, r) => acc + r.scenarios.length, 0)} activos
                </strong>
              </div>
            </div>
          </div>

          {/* Metric 3: Total Estimated Budget Across All Current Requests */}
          <div className="p-5 flex flex-col justify-between space-y-4 bg-slate-50/60">
            <div>
              <div className="text-xs font-medium text-slate-500">
                Presupuesto Total Estimado (Consolidado MXN)
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-emerald-700 font-mono tabular-nums mt-1">
                {formatMoney(kpis.totalEstimatedBudgetMXN, 'MXN')}
              </div>
              <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                Promedio por estudiante:{' '}
                <strong className="text-slate-800">
                  {formatMoney(kpis.avgBudgetPerParticipantMXN, 'MXN')} MXN
                </strong>
              </p>
            </div>

            {/* Top Program Budget Share Bars */}
            <div className="space-y-1.5">
              <div className="text-[11px] text-slate-500 font-medium">
                Distribución presupuestal por tipo de programa
              </div>
              {kpis.programBreakdown.slice(0, 2).map((item) => (
                <div key={item.program} className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-700">
                    <span className="truncate pr-2">{item.program}</span>
                    <span className="font-mono tabular-nums shrink-0">
                      {item.participants} alum. · {item.sharePct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, Math.max(6, item.sharePct))}%` }}
                      className="h-full bg-[#0B3B70]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ActivityDashboard: Solicitudes Creadas por Estado y Volumen Financiero Proyectado */}
      <ActivityDashboard requests={filteredRequests} offices={offices} />

      {/* Metas Comerciales Anuales por Oficina (Meta MXN vs Vendido Aceptado vs Pipeline Activo) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <Target className="w-4 h-4 text-[#0B3B70]" />
              Cumplimiento de Metas Comerciales Anuales por Oficina (Meta vs. Cierre Aceptado y Pipeline)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Seguimiento por sede regional configurable desde el menú Configuración → Oficinas y Sedes
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3.5 text-xs">
          {offices
            .filter((o) => o.active)
            .map((office) => {
              const fxToMXN: Record<string, number> = {
                MXN: 1,
                USD: 19.85,
                CAD: 14.35,
                EUR: 21.4,
                GBP: 25.1,
              };
              const officeReqs = requests.filter((r) => r.officeId === office.id);
              const acceptedMXN = officeReqs
                .filter((r) => r.status === 'Aceptada')
                .reduce((sum, r) => {
                  const rate = fxToMXN[r.budgetCurrency] || 1;
                  return sum + r.estimatedBudgetPerPerson * r.participants * rate;
                }, 0);
              const pipelineMXN = officeReqs
                .filter(
                  (r) =>
                    !['Aceptada', 'Rechazada', 'Cancelada', 'Vencida'].includes(
                      r.status
                    )
                )
                .reduce((sum, r) => {
                  const rate = fxToMXN[r.budgetCurrency] || 1;
                  return sum + r.estimatedBudgetPerPerson * r.participants * rate;
                }, 0);
              const targetMXN = office.annualTargetMXN || 10000000;
              const acceptedPct = Math.min(
                100,
                targetMXN > 0 ? (acceptedMXN / targetMXN) * 100 : 0
              );
              const pipelinePct = Math.min(
                100 - acceptedPct,
                targetMXN > 0 ? (pipelineMXN / targetMXN) * 100 : 0
              );

              return (
                <div
                  key={office.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <strong className="font-mono text-[#0B3B70]">
                      {office.code} · {office.city}
                    </strong>
                    <span className="font-mono text-[11px] font-semibold text-emerald-700 tabular-nums">
                      {((acceptedMXN + pipelineMXN) / targetMXN * 100).toFixed(0)}% proy.
                    </span>
                  </div>
                  <div className="font-mono tabular-nums space-y-0.5 text-[11px]">
                    <div className="flex justify-between text-slate-600">
                      <span>Meta Anual:</span>
                      <strong className="text-slate-900">
                        {formatMoney(targetMXN, 'MXN')}
                      </strong>
                    </div>
                    <div className="flex justify-between text-emerald-700">
                      <span>Cerrado Aceptado:</span>
                      <strong>{formatMoney(acceptedMXN, 'MXN')}</strong>
                    </div>
                    <div className="flex justify-between text-[#0B3B70]">
                      <span>En Pipeline:</span>
                      <strong>{formatMoney(pipelineMXN, 'MXN')}</strong>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden flex">
                    <div
                      style={{ width: `${acceptedPct}%` }}
                      className="bg-emerald-600 h-full"
                      title="Cerrado Aceptado"
                    />
                    <div
                      style={{ width: `${pipelinePct}%` }}
                      className="bg-[#0B3B70] h-full"
                      title="Pipeline Activo"
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Weekly Demand Trend Chart (Recharts LineChart) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-[#0B3B70]" />
              Tendencia de Nuevas Solicitudes y Demanda Semanal
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Evolución semanal de solicitudes creadas y participantes proyectados para identificar picos de demanda operativa
            </p>
          </div>
          <div className="text-xs text-slate-600 font-mono tabular-nums">
            Semana pico: <strong className="text-[#0B3B70]">{kpis.peakWeek.label}</strong> ({kpis.peakWeek.solicitudes} sol. · {kpis.peakWeek.participantes} alum.)
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={kpis.weekBuckets}
              margin={{ top: 10, right: 24, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#475569' }}
                axisLine={{ stroke: '#CBD5E1' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#0B3B70' }}
                axisLine={{ stroke: '#CBD5E1' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#15803D' }}
                axisLine={{ stroke: '#CBD5E1' }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  borderColor: '#CBD5E1',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontFamily: 'IBM Plex Mono, monospace',
                }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="solicitudes"
                name="Nuevas Solicitudes"
                stroke="#0B3B70"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#0B3B70', strokeWidth: 2, stroke: '#FFFFFF' }}
                activeDot={{ r: 6 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="participantes"
                name="Participantes Proyectados"
                stroke="#16A34A"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={{ r: 3.5, fill: '#16A34A' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Compact Search + Quick Views + Collapsible 7-Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Quick View Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `Todas (${requests.length})` },
                { id: 'cotizacion', label: 'En Cotización' },
                { id: 'por_aprobar', label: 'Por Aprobar' },
                { id: 'enviadas', label: 'Enviadas / Negociación' },
                { id: 'aceptadas', label: 'Aceptadas' },
              ] as { id: QuickViewBucket; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setQuickView(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  quickView === tab.id
                    ? 'bg-[#0B3B70] text-white font-semibold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input + Advanced Filters Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
              <input
                type="text"
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                placeholder="Buscar folio, colegio o destino..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:border-[#0B3B70] focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border flex items-center gap-1.5 transition-colors ${
                showAdvancedFilters || activeFiltersCount > 0
                  ? 'bg-blue-50 border-blue-200 text-[#0B3B70]'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>
                Filtros Avanzados
                {activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
              </span>
            </button>

            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Collapsible 7 Combinable Dropdowns */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
            <select
              value={officeFilter}
              onChange={(e) => setOfficeFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-slate-50"
            >
              <option value="all">Todas las oficinas</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} — {o.city}
                </option>
              ))}
            </select>

            <select
              value={execFilter}
              onChange={(e) => setExecFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-slate-50"
            >
              <option value="all">Todos los responsables</option>
              {users
                .filter((u) => u.userType === 'interno')
                .map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.displayName}
                  </option>
                ))}
            </select>

            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-slate-50"
            >
              <option value="all">Todos los países</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-slate-50"
            >
              <option value="all">Todas las ciudades</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-slate-50"
            >
              <option value="all">Todos los periodos</option>
              <option value="2026">Salidas 2026</option>
              <option value="2027">Salidas 2027</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-slate-50"
            >
              <option value="all">Todos los estados</option>
              {ALL_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            <select
              value={programFilter}
              onChange={(e) => setProgramFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-slate-50"
            >
              <option value="all">Todos los programas</option>
              {ALL_PROGRAMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 10 KPI Grid (Single-elevation, tabular-nums, clean unboxed metadata) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Solicitudes recibidas</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {kpis.totalReceived}
          </div>
          <div className="text-xs text-slate-500 mt-1">Expedientes registrados</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Solicitudes nuevas</div>
          <div className="text-2xl font-bold text-[#0B3B70] font-mono tabular-nums mt-1">
            {kpis.newRequests}
          </div>
          <div className="text-xs text-slate-500 mt-1">Borrador · Recibida</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">En cotización</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {kpis.inQuotation}
          </div>
          <div className="text-xs text-slate-500 mt-1">Análisis · Escenarios</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Pendientes de aprobación</div>
          <div className="text-2xl font-bold text-amber-600 font-mono tabular-nums mt-1">
            {kpis.pendingApproval}
          </div>
          <div className="text-xs text-slate-500 mt-1">Revisión comité / finanzas</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Propuestas enviadas</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {kpis.proposalsSent}
          </div>
          <div className="text-xs text-slate-500 mt-1">Con versión registrada</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Propuestas aceptadas</div>
          <div className="text-2xl font-bold text-emerald-700 font-mono tabular-nums mt-1">
            {kpis.proposalsAccepted}
          </div>
          <div className="text-xs text-slate-500 mt-1">Cierre comercial exitoso</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Propuestas rechazadas</div>
          <div className="text-2xl font-bold text-slate-700 font-mono tabular-nums mt-1">
            {kpis.proposalsRejected}
          </div>
          <div className="text-xs text-slate-500 mt-1">Con motivo documentado</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Vencidas o por vencer</div>
          <div className="text-2xl font-bold text-red-600 font-mono tabular-nums mt-1">
            {kpis.dueSoonOrOverdue}
          </div>
          <div className="text-xs text-slate-500 mt-1">Entrega ≤ 5 días</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Tiempo promedio al envío</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {kpis.avgTurnaroundDays.toFixed(1)} días
          </div>
          <div className="text-xs text-slate-500 mt-1">Solicitud → 1er envío</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Tasa de aceptación</div>
          <div className="text-2xl font-bold text-[#0B3B70] font-mono tabular-nums mt-1">
            {kpis.acceptanceRate.toFixed(1)}%
          </div>
          <div className="text-xs text-slate-500 mt-1">Sobre propuestas enviadas</div>
        </div>
      </div>

      {/* Priority Dossiers Section: Filas or Tarjetas Comprimidas */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 font-display">
              Expedientes Activos Recientes ({filteredRequests.length})
            </h2>
            <p className="text-xs text-slate-500">
              Visualiza tus propuestas en Filas o Tarjetas Comprimidas y abre su Cotizador, Comparador o Aprobaciones
            </p>
          </div>

          <div
            className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/70 shrink-0 self-start sm:self-auto"
            role="group"
            aria-label="Cambiar modo de visualización"
          >
            <button
              type="button"
              onClick={() => setDossiersLayout('filas')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                dossiersLayout === 'filas'
                  ? 'bg-white text-[#0F2547] font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Rows3 className="w-3.5 h-3.5" />
              Filas
            </button>
            <button
              type="button"
              onClick={() => setDossiersLayout('tarjetas')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                dossiersLayout === 'tarjetas'
                  ? 'bg-white text-[#0F2547] font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Tarjetas Comprimidas
            </button>
          </div>
        </div>

        {dossiersLayout === 'filas' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Folio</th>
                  <th className="py-3 px-4">Grupo / Institución</th>
                  <th className="py-3 px-4">Oficina</th>
                  <th className="py-3 px-4">Destino</th>
                  <th className="py-3 px-4 text-right">Participantes</th>
                  <th className="py-3 px-4 text-right">Escenarios</th>
                  <th className="py-3 px-4">Entrega Límite</th>
                  <th className="py-3 px-4">Etapa del Proceso</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      No se encontraron solicitudes con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((req) => {
                    const office = offices.find((o) => o.id === req.officeId);
                    const stage = resolveCoreProcessStage(req);
                    return (
                      <tr
                        key={req.id}
                        onClick={() => onSelectRequest(req)}
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-[#1D4ED8]">
                          {req.folio}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{req.groupName}</div>
                          <div className="text-slate-500">
                            {req.programType} · Solicita: {req.requesterName}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700">
                          {office?.code || req.officeId}
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {req.city}, {req.country}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                          {req.participants} + {req.chaperones} chap.
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                          {req.scenarios.length}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                          {req.proposalDueDate}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">
                            0{stage.stepNumber}. {stage.label}
                          </div>
                          <div className="text-[11px] text-slate-500">{req.status}</div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectRequest(req, 'escenarios');
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-[#1D4ED8] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 whitespace-nowrap transition-colors"
                            >
                              Cotizar
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectRequest(req, 'comparativo');
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap transition-colors"
                            >
                              Comparar
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectRequest(req, 'general');
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                            >
                              Ficha →
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 bg-slate-50/40">
            {filteredRequests.map((req) => {
              const office = offices.find((o) => o.id === req.officeId);
              const stage = resolveCoreProcessStage(req);
              return (
                <div
                  key={req.id}
                  onClick={() => onSelectRequest(req)}
                  className="bg-white border border-slate-200/90 rounded-xl p-4 hover:border-[#1D4ED8] transition-all cursor-pointer flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                      <span>
                        <strong className="text-[#1D4ED8]">{req.folio}</strong> ·{' '}
                        {office?.code || req.officeId}
                      </span>
                      <span className="tabular-nums">Lím: {req.proposalDueDate}</span>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-slate-900 line-clamp-1 font-display">
                        {req.groupName}
                      </h3>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {req.city}, {req.country} · {req.participants} alum. + {req.chaperones} chap.
                      </div>
                    </div>

                    {/* Mini 4-step bar */}
                    <div className="pt-1">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <strong className="text-[#0F2547]">
                          0{stage.stepNumber}. {stage.label}
                        </strong>
                        <span className="text-slate-400 font-mono">{req.status}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {[1, 2, 3, 4].map((n) => (
                          <div
                            key={n}
                            className={`h-1.5 rounded-xs ${
                              n <= stage.stepNumber ? 'bg-[#1D4ED8]' : 'bg-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                    <span className="text-[11px] font-mono text-slate-500">
                      {req.scenarios.length} escenario(s) ·{' '}
                      {formatMoney(req.estimatedBudgetPerPerson, req.budgetCurrency)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRequest(req, 'escenarios');
                        }}
                        className="px-2.5 py-1 text-xs font-semibold text-[#1D4ED8] bg-blue-50 rounded-lg hover:bg-blue-100"
                      >
                        Cotizar
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRequest(req, 'general');
                        }}
                        className="px-2.5 py-1 text-xs font-semibold text-white bg-[#0F2547] rounded-lg hover:bg-slate-800"
                      >
                        Abrir →
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

interface RequestsTableProps {
  requests: TravelRequest[];
  offices: Office[];
  canEdit?: boolean;
  canDelete?: boolean;
  onSelectRequest: (req: TravelRequest, targetTab?: QuickTabTarget) => void;
  onOpenNewModal: (duplicateFrom?: TravelRequest | null) => void;
  onChangeStatus: (requestId: string, newStatus: RequestStatus, note: string) => void;
  onDeleteRequest?: (req: TravelRequest) => void;
}

export const RequestsAdministratorModule: React.FC<RequestsTableProps> = ({
  requests,
  offices,
  canEdit = true,
  canDelete = false,
  onSelectRequest,
  onOpenNewModal,
  onChangeStatus,
  onDeleteRequest,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [officeFilter, setOfficeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState<'all' | CoreProcessStageId>('all');
  const [sortBy, setSortBy] = useState<'folio' | 'proposalDueDate' | 'participants'>('folio');
  const [sortAsc, setSortAsc] = useState(false);
  const [viewMode, setViewMode] = useState<'filas' | 'tarjetas' | 'kanban'>('filas');
  const [page, setPage] = useState(1);
  const pageSize = 9;

  const filteredAndSorted = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = requests.filter((r) => {
      if (officeFilter !== 'all' && r.officeId !== officeFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (stageFilter !== 'all' && resolveCoreProcessStage(r).id !== stageFilter)
        return false;
      if (q) {
        const matchFolio = r.folio.toLowerCase().includes(q);
        const matchGroup = r.groupName.toLowerCase().includes(q);
        const matchDest = `${r.city} ${r.country}`.toLowerCase().includes(q);
        if (!matchFolio && !matchGroup && !matchDest) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'folio') cmp = a.folio.localeCompare(b.folio);
      else if (sortBy === 'proposalDueDate') cmp = a.proposalDueDate.localeCompare(b.proposalDueDate);
      else cmp = a.participants - b.participants;
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [requests, searchTerm, officeFilter, statusFilter, stageFilter, sortBy, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize));
  const paginated = filteredAndSorted.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200/90 rounded-2xl p-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight font-display">
            Administrador de Solicitudes y Propuestas
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Alterna entre Filas, Tarjetas Comprimidas o Tablero Kanban de 4 etapas (Solicitada → Cotizada → Aprobada → Enviada)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('filas')}
              className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'filas'
                  ? 'bg-white text-[#0F2547] font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Rows3 className="w-3.5 h-3.5" /> Filas
            </button>
            <button
              type="button"
              onClick={() => setViewMode('tarjetas')}
              className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'tarjetas'
                  ? 'bg-white text-[#0F2547] font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Tarjetas Comprimidas
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'kanban'
                  ? 'bg-white text-[#0F2547] font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" /> Kanban 4 Etapas
            </button>
          </div>

          <button
            onClick={() => onOpenNewModal(null)}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#1D4ED8] rounded-xl hover:bg-[#1E40AF] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Registrar Nueva Solicitud
          </button>
        </div>
      </div>

      {/* 4-Stage Process Filter Bar + Search */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => {
                setStageFilter('all');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                stageFilter === 'all'
                  ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todas las Etapas ({requests.length})
            </button>
            {CORE_PROCESS_STAGES.map((st) => {
              const count = requests.filter(
                (r) => resolveCoreProcessStage(r).id === st.id
              ).length;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => {
                    setStageFilter(stageFilter === st.id ? 'all' : st.id);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                    stageFilter === st.id
                      ? 'bg-[#0B3B70] text-white font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  0{st.stepNumber}. {st.label} ({count})
                </button>
              );
            })}
          </div>
          <span className="text-xs text-slate-500">
            Flujo: <strong>Solicitada → Cotizada → Aprobada → Enviada</strong>
          </span>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por folio (EE-2026-101), colegio o destino (Boston, Vancouver, Londres)..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B3B70]"
            />
          </div>

          <select
            value={officeFilter}
            onChange={(e) => {
              setOfficeFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50 w-full md:w-auto"
          >
            <option value="all">Todas las oficinas</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code} — {o.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50 w-full md:w-auto"
          >
            <option value="all">Todos los sub-estados (12)</option>
            {ALL_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              if (sortBy === 'folio') setSortBy('proposalDueDate');
              else if (sortBy === 'proposalDueDate') setSortBy('participants');
              else setSortBy('folio');
              setSortAsc(!sortAsc);
            }}
            className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 flex items-center gap-1.5 whitespace-nowrap"
          >
            <ArrowUpDown className="w-3.5 h-3.5" /> Ordenar: {sortBy}
          </button>
        </div>
      </div>

      {/* Main View: Filas | Tarjetas Comprimidas | Kanban 4 Etapas */}
      {viewMode === 'filas' ? (
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-3 px-4">Folio</th>
                <th className="py-3 px-4">Grupo</th>
                <th className="py-3 px-4">Oficina</th>
                <th className="py-3 px-4">Destino / Fechas</th>
                <th className="py-3 px-4 text-right">Participantes</th>
                <th className="py-3 px-4">Responsable</th>
                <th className="py-3 px-4">Solicitud / Límite</th>
                <th className="py-3 px-4">Etapa del Proceso</th>
                <th className="py-3 px-4 text-right">Escenarios</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginated.map((req) => {
                const office = offices.find((o) => o.id === req.officeId);
                return (
                  <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-[#1D4ED8]">
                      {req.folio}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{req.groupName}</div>
                      <div className="text-slate-500">
                        {req.programType} · Presupuesto: {formatMoney(req.estimatedBudgetPerPerson, req.budgetCurrency)}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">
                      {office?.code || req.officeId}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-900">
                        {req.city}, {req.country}
                      </div>
                      <div className="font-mono text-slate-500">
                        {req.departureDate} → {req.returnDate}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {req.participants} alum. · {req.chaperones} chap.
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {req.commercialExecutiveName}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">
                      <div className="text-slate-500">Sol: {req.createdAt.slice(0, 10)}</div>
                      <div className="text-slate-900 font-medium">Lím: {req.proposalDueDate}</div>
                    </td>
                    <td className="py-3 px-4">
                      {(() => {
                        const stage = resolveCoreProcessStage(req);
                        return (
                          <div className="space-y-1.5 min-w-[160px]">
                            <div className="flex items-center justify-between text-[11px]">
                              <strong className="text-[#0F2547]">
                                0{stage.stepNumber}. {stage.label}
                              </strong>
                              <span className="font-mono text-slate-400">
                                {stage.stepNumber}/4
                              </span>
                            </div>
                            <div className="grid grid-cols-4 gap-1">
                              {[1, 2, 3, 4].map((stepNum) => (
                                <div
                                  key={stepNum}
                                  className={`h-1.5 rounded-xs ${
                                    stepNum <= stage.stepNumber
                                      ? 'bg-[#1D4ED8]'
                                      : 'bg-slate-200'
                                  }`}
                                />
                              ))}
                            </div>
                            <select
                              disabled={!canEdit}
                              value={req.status}
                              onChange={(e) =>
                                onChangeStatus(
                                  req.id,
                                  e.target.value as RequestStatus,
                                  'Actualización de estado desde Administrador de Solicitudes'
                                )
                              }
                              className="w-full px-2 py-1 text-[11px] border border-slate-200 rounded bg-slate-50 font-medium text-slate-700 disabled:bg-slate-100"
                            >
                              {ALL_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                      {req.scenarios.length}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {canDelete && onDeleteRequest && (
                          <button
                            type="button"
                            onClick={() => onDeleteRequest(req)}
                            title="Borrar solicitud (Permiso Borrar activo)"
                            className="p-1.5 text-slate-400 hover:text-red-600 border border-slate-200 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenNewModal(req)}
                          title="Duplicar solicitud"
                          className="p-1.5 text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectRequest(req, 'escenarios')}
                          className="px-2.5 py-1.5 text-xs font-medium text-[#1D4ED8] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 whitespace-nowrap"
                        >
                          Cotizar
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectRequest(req, 'comparativo')}
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                        >
                          Comparar
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectRequest(req)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0F2547] rounded-lg hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap"
                        >
                          <FolderOpen className="w-3.5 h-3.5" /> Expediente
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span>
            Mostrando {paginated.length} de {filteredAndSorted.length} expedientes
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 border border-slate-300 rounded-lg bg-white disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="font-mono">
              Página {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1 border border-slate-300 rounded-lg bg-white disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
      ) : viewMode === 'tarjetas' ? (
        /* VISTA EN TARJETAS COMPRIMIDAS */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {paginated.map((req) => {
              const office = offices.find((o) => o.id === req.officeId);
              const stage = resolveCoreProcessStage(req);
              return (
                <div
                  key={req.id}
                  className="bg-white border border-slate-200/90 rounded-2xl p-4 hover:border-slate-300 transition-all flex flex-col justify-between gap-3.5"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-500">
                      <div className="flex items-center gap-1.5 truncate">
                        <strong className="text-[#1D4ED8] font-bold">{req.folio}</strong>
                        <span aria-hidden="true">·</span>
                        <span>{office?.code || req.officeId}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">
                          {req.city}, {req.country}
                        </span>
                      </div>
                      <span className="tabular-nums shrink-0">Lím: {req.proposalDueDate}</span>
                    </div>

                    <div>
                      <h3
                        onClick={() => onSelectRequest(req)}
                        className="text-base font-bold text-slate-900 hover:text-[#1D4ED8] cursor-pointer line-clamp-1 font-display"
                      >
                        {req.groupName}
                      </h3>
                      <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span>{req.programType}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-slate-700 font-medium">
                          {req.participants} alum. + {req.chaperones} chap.
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Resp: {req.commercialExecutiveName}</span>
                      </div>
                    </div>

                    {/* Interactive 4-Step Compact Stepper */}
                    <div className="pt-1">
                      <div className="flex items-center justify-between text-[11px] mb-1.5">
                        <span className="text-slate-500">
                          Etapa:{' '}
                          <strong className="text-slate-900">
                            0{stage.stepNumber}. {stage.label}
                          </strong>
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {req.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {CORE_PROCESS_STAGES.map((stepMeta) => {
                          const isCompleted = stepMeta.stepNumber < stage.stepNumber;
                          const isCurrent = stepMeta.stepNumber === stage.stepNumber;
                          return (
                            <button
                              key={stepMeta.id}
                              type="button"
                              disabled={!canEdit && stepMeta.id !== stage.id}
                              onClick={() => {
                                if (stepMeta.id !== stage.id && canEdit) {
                                  onChangeStatus(
                                    req.id,
                                    stepMeta.canonicalStatus,
                                    `Avance en Tarjeta Comprimida a ${stepMeta.label}`
                                  );
                                } else {
                                  onSelectRequest(req, stepMeta.defaultTab);
                                }
                              }}
                              className={`px-2 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                                isCurrent
                                  ? 'bg-[#0F2547] border-[#0F2547] text-white font-semibold'
                                  : isCompleted
                                    ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900 font-medium hover:bg-emerald-100'
                                    : 'bg-slate-50 border-slate-200/80 text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                              }`}
                            >
                              <div className="flex items-center justify-between text-[9px] font-mono">
                                <span>0{stepMeta.stepNumber}</span>
                                {isCompleted && (
                                  <Check className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                )}
                              </div>
                              <div className="text-[11px] truncate leading-tight mt-0.5">
                                {stepMeta.label}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div className="text-[11px] font-mono text-slate-500">
                      {req.scenarios.length} esc. ·{' '}
                      {formatMoney(req.estimatedBudgetPerPerson, req.budgetCurrency)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {canDelete && onDeleteRequest && (
                        <button
                          type="button"
                          onClick={() => onDeleteRequest(req)}
                          title="Borrar solicitud"
                          className="p-1.5 text-slate-400 hover:text-red-600 border border-slate-200 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onSelectRequest(req, 'escenarios')}
                        className="px-2.5 py-1.5 text-xs font-medium text-[#1D4ED8] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                      >
                        Cotizar
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectRequest(req)}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0F2547] rounded-lg hover:bg-slate-800 flex items-center gap-1"
                      >
                        <span>Abrir</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-5 py-3 bg-white border border-slate-200/90 rounded-2xl flex items-center justify-between text-xs text-slate-600">
            <span>
              Mostrando {paginated.length} de {filteredAndSorted.length} expedientes
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 border border-slate-300 rounded-lg bg-white disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="font-mono">
                Página {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 border border-slate-300 rounded-lg bg-white disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* TABLERO KANBAN VISUAL DE 4 ETAPAS DEL PROCESO (SOLICITADA -> COTIZADA -> APROBADA -> ENVIADA) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {CORE_PROCESS_STAGES.map((stageCol) => {
            const colRequests = filteredAndSorted.filter(
              (r) => resolveCoreProcessStage(r).id === stageCol.id
            );
            return (
              <div
                key={stageCol.id}
                className="bg-slate-100/80 border border-slate-200 rounded-xl p-3.5 flex flex-col gap-3 min-h-[440px]"
              >
                <div className="pb-2.5 border-b border-slate-200 space-y-1">
                  <div className="flex items-center justify-between">
                    <strong className="text-xs font-bold text-slate-900">
                      0{stageCol.stepNumber}. {stageCol.label}
                    </strong>
                    <span className="font-mono text-xs font-bold text-[#0B3B70]">
                      {colRequests.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    {stageCol.shortDescription}
                  </p>
                </div>

                <div className="space-y-2.5 flex-1">
                  {colRequests.length === 0 ? (
                    <div className="py-8 text-center text-[11px] text-slate-400">
                      Sin propuestas en etapa {stageCol.label}
                    </div>
                  ) : (
                    colRequests.map((req) => {
                      const office = offices.find((o) => o.id === req.officeId);
                      const nextStage = CORE_PROCESS_STAGES.find(
                        (s) => s.stepNumber === stageCol.stepNumber + 1
                      );
                      return (
                        <div
                          key={req.id}
                          className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 hover:border-[#0B3B70] transition-colors"
                        >
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <strong className="text-[#0B3B70]">{req.folio}</strong>
                            <span className="text-slate-500">
                              {office?.code || req.officeId} · {req.participants} alum.
                            </span>
                          </div>
                          <div>
                            <div
                              onClick={() => onSelectRequest(req, stageCol.defaultTab)}
                              className="text-xs font-bold text-slate-900 hover:text-[#0B3B70] cursor-pointer line-clamp-2"
                            >
                              {req.groupName}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {req.city}, {req.country} · Resp: {req.commercialExecutiveName}
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5 text-[11px]">
                            {canEdit && nextStage ? (
                              <button
                                type="button"
                                onClick={() =>
                                  onChangeStatus(
                                    req.id,
                                    nextStage.canonicalStatus,
                                    `Avance en Tablero Kanban a etapa ${nextStage.label}`
                                  )
                                }
                                className="px-2 py-1 font-medium text-slate-700 bg-slate-100 rounded hover:bg-slate-200 truncate"
                              >
                                Pasar a {nextStage.label} →
                              </button>
                            ) : (
                              <span className="text-slate-500 font-mono truncate">
                                {req.status}
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => onSelectRequest(req, stageCol.defaultTab)}
                              className="px-2.5 py-1 font-semibold text-[#0B3B70] bg-blue-50 rounded hover:bg-blue-100 shrink-0"
                            >
                              Abrir →
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

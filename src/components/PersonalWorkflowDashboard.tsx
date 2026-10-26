import React, { useMemo, useState } from 'react';
import {
  Office,
  RequestStatus,
  RoleDefinition,
  TravelRequest,
  UserProfile,
} from '../types/domain';
import {
  CORE_PROCESS_STAGES,
  CoreProcessStageId,
  resolveCoreProcessStage,
  resolveUserResponsibilityInRequest,
} from '../utils/processStages';
import { DossierTab } from './RequestDetailDossier';
import { formatMoney } from '../utils/exporters';
import {
  ArrowRight,
  Check,
  Search,
  Plus,
  FileSpreadsheet,
  SlidersHorizontal,
  UserCheck,
  LayoutGrid,
  Rows3,
  Clock,
} from 'lucide-react';

interface PersonalWorkflowDashboardProps {
  requests: TravelRequest[];
  offices: Office[];
  currentUser: UserProfile;
  roleDefinitions?: RoleDefinition[];
  onSelectRequest: (req: TravelRequest, targetTab?: DossierTab) => void;
  onChangeStatus: (requestId: string, newStatus: RequestStatus, note: string) => void;
  onOpenNewModal: () => void;
  onOpenAIImporter: () => void;
}

type ResponsibilityFilterMode =
  | 'all'
  | 'my_turn'
  | 'owner_only'
  | 'approver_or_quoter';

type ProposalDisplayLayout = 'filas' | 'tarjetas';

const STAGE_ACCENT_STYLES: Record<
  CoreProcessStageId,
  {
    activeCard: string;
    inactiveBadge: string;
    stepActive: string;
    textAccent: string;
  }
> = {
  solicitada: {
    activeCard: 'bg-[#0F2547] border-[#0F2547] text-white shadow-sm',
    inactiveBadge: 'text-sky-800 bg-sky-50/90 border-sky-200',
    stepActive: 'bg-sky-700 border-sky-700 text-white',
    textAccent: 'text-sky-700',
  },
  cotizada: {
    activeCard: 'bg-[#0F2547] border-[#0F2547] text-white shadow-sm',
    inactiveBadge: 'text-indigo-800 bg-indigo-50/90 border-indigo-200',
    stepActive: 'bg-indigo-700 border-indigo-700 text-white',
    textAccent: 'text-indigo-700',
  },
  aprobada: {
    activeCard: 'bg-[#0F2547] border-[#0F2547] text-white shadow-sm',
    inactiveBadge: 'text-emerald-800 bg-emerald-50/90 border-emerald-200',
    stepActive: 'bg-emerald-700 border-emerald-700 text-white',
    textAccent: 'text-emerald-700',
  },
  enviada: {
    activeCard: 'bg-[#0F2547] border-[#0F2547] text-white shadow-sm',
    inactiveBadge: 'text-blue-900 bg-blue-50/90 border-blue-200',
    stepActive: 'bg-[#0F2547] border-[#0F2547] text-white',
    textAccent: 'text-[#0F2547]',
  },
};

export const PersonalWorkflowDashboard: React.FC<PersonalWorkflowDashboardProps> = ({
  requests,
  offices,
  currentUser,
  roleDefinitions,
  onSelectRequest,
  onChangeStatus,
  onOpenNewModal,
  onOpenAIImporter,
}) => {
  const [selectedStage, setSelectedStage] = useState<'all' | CoreProcessStageId>('all');
  const [responsibilityFilter, setResponsibilityFilter] =
    useState<ResponsibilityFilterMode>('all');
  const [displayLayout, setDisplayLayout] = useState<ProposalDisplayLayout>('tarjetas');
  const [searchQuery, setSearchQuery] = useState('');

  // Enrich each accessible request with its 4-stage process metadata and the current user's specific responsibility
  const enrichedProposals = useMemo(() => {
    return requests.map((req) => {
      const stage = resolveCoreProcessStage(req);
      const responsibility = resolveUserResponsibilityInRequest(
        currentUser,
        req,
        roleDefinitions
      );
      const office = offices.find((o) => o.id === req.officeId);
      const isOwner =
        req.commercialExecutiveUid === currentUser.uid ||
        req.ownerUid === currentUser.uid ||
        req.commercialExecutiveName.toLowerCase() ===
          currentUser.displayName.toLowerCase();

      return {
        request: req,
        stage,
        responsibility,
        officeCode: office?.code || req.officeId,
        isOwner,
      };
    });
  }, [requests, currentUser, roleDefinitions, offices]);

  // Stage counts across all user-involved proposals
  const stageCounts = useMemo(() => {
    const counts: Record<'all' | CoreProcessStageId, number> = {
      all: enrichedProposals.length,
      solicitada: 0,
      cotizada: 0,
      aprobada: 0,
      enviada: 0,
    };
    for (const item of enrichedProposals) {
      counts[item.stage.id] += 1;
    }
    return counts;
  }, [enrichedProposals]);

  const myTurnCount = useMemo(
    () =>
      enrichedProposals.filter((i) => i.responsibility.requiresImmediateActionByUser)
        .length,
    [enrichedProposals]
  );

  const ownerCount = useMemo(
    () => enrichedProposals.filter((i) => i.isOwner).length,
    [enrichedProposals]
  );

  // Filtered proposals list
  const filteredProposals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedProposals
      .filter((item) => {
        if (selectedStage !== 'all' && item.stage.id !== selectedStage) {
          return false;
        }
        if (
          responsibilityFilter === 'my_turn' &&
          !item.responsibility.requiresImmediateActionByUser
        ) {
          return false;
        }
        if (responsibilityFilter === 'owner_only' && !item.isOwner) {
          return false;
        }
        if (responsibilityFilter === 'approver_or_quoter' && item.isOwner) {
          return false;
        }
        if (q) {
          const matches =
            item.request.folio.toLowerCase().includes(q) ||
            item.request.groupName.toLowerCase().includes(q) ||
            `${item.request.city} ${item.request.country}`.toLowerCase().includes(q) ||
            item.responsibility.involvementRelation.toLowerCase().includes(q) ||
            item.responsibility.responsibilitySummary.toLowerCase().includes(q);
          if (!matches) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (
          a.responsibility.requiresImmediateActionByUser !==
          b.responsibility.requiresImmediateActionByUser
        ) {
          return a.responsibility.requiresImmediateActionByUser ? -1 : 1;
        }
        return a.request.proposalDueDate.localeCompare(b.request.proposalDueDate);
      });
  }, [enrichedProposals, selectedStage, responsibilityFilter, searchQuery]);

  const userOffice = offices.find((o) => o.id === currentUser.officeId);

  return (
    <div className="space-y-5">
      {/* Personal Workspace Header */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <UserCheck className="w-4 h-4 text-[#1D4ED8]" />
            <span className="font-semibold text-slate-900">
              {currentUser.displayName}
            </span>
            <span aria-hidden="true">·</span>
            <span>{currentUser.role}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-600">
              Oficina {userOffice?.code || currentUser.officeId} ({userOffice?.city || 'Nacional'})
            </span>
          </div>
          <h1 className="text-2xl sm:text-[26px] font-bold text-slate-900 tracking-tight font-display">
            Mis propuestas
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
            Elige una etapa para filtrar y abre la propuesta donde te toca actuar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenAIImporter}
            className="px-4 py-2.5 text-xs font-semibold text-emerald-950 bg-emerald-50 border border-emerald-300 rounded-xl hover:bg-emerald-100 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            Importar Excel / Sheets con IA
          </button>
          <button
            type="button"
            onClick={onOpenNewModal}
            className="px-4 py-2.5 text-xs font-semibold text-white bg-[#1D4ED8] rounded-xl hover:bg-[#1E40AF] transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-2xs"
          >
            <Plus className="w-4 h-4" />
            Nueva Solicitud
          </button>
        </div>
      </div>

      {/* Interactive 4-Stage Process Pipeline (Solicitada -> Cotizada -> Aprobada -> Enviada) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {CORE_PROCESS_STAGES.map((st, idx) => {
          const isSelected = selectedStage === st.id;
          const count = stageCounts[st.id];
          const myTurnInStage = enrichedProposals.filter(
            (p) =>
              p.stage.id === st.id &&
              p.responsibility.requiresImmediateActionByUser
          ).length;
          const accent = STAGE_ACCENT_STYLES[st.id];

          return (
            <button
              key={st.id}
              type="button"
              onClick={() =>
                setSelectedStage(selectedStage === st.id ? 'all' : st.id)
              }
              className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 cursor-pointer ${
                isSelected
                  ? accent.activeCard
                  : 'bg-white border-slate-200/90 text-slate-900 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2 w-full">
                <div>
                  <div
                    className={`text-[11px] font-mono font-medium ${
                      isSelected ? 'text-sky-200' : 'text-slate-400'
                    }`}
                  >
                    ETAPA 0{st.stepNumber} DE 04
                  </div>
                  <div className="text-lg font-bold font-display mt-0.5 flex items-center gap-1.5">
                    <span>{st.label}</span>
                    {idx < 3 && (
                      <ArrowRight
                        className={`w-3.5 h-3.5 ${
                          isSelected ? 'text-sky-300' : 'text-slate-300'
                        }`}
                      />
                    )}
                  </div>
                </div>
                <span
                  className={`text-2xl font-bold font-mono tabular-nums ${
                    isSelected ? 'text-white' : accent.textAccent
                  }`}
                >
                  {count}
                </span>
              </div>

              <div className="space-y-2 w-full">
                <p
                  className={`hidden sm:block text-xs leading-snug ${
                    isSelected ? 'text-slate-200' : 'text-slate-500'
                  }`}
                >
                  {st.shortDescription}
                </p>
                <div
                  className={`text-[11px] font-mono pt-2 border-t flex items-center justify-between ${
                    isSelected
                      ? 'border-white/15 text-amber-300'
                      : myTurnInStage > 0
                        ? 'border-slate-100 text-amber-700 font-semibold'
                        : 'border-slate-100 text-slate-400'
                  }`}
                >
                  <span>
                    {myTurnInStage > 0
                      ? `${myTurnInStage} requiere(n) tu acción`
                      : 'Al día en esta etapa'}
                  </span>
                  {isSelected && <span className="underline">Quitar filtro</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Unified Control Bar: Responsibility Filters + Search + View Switcher (Filas vs Tarjetas Comprimidas) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100/90 rounded-xl">
          <button
            type="button"
            onClick={() => setResponsibilityFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              responsibilityFilter === 'all'
                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todas ({enrichedProposals.length})
          </button>
          <button
            type="button"
            onClick={() => setResponsibilityFilter('my_turn')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              responsibilityFilter === 'my_turn'
                ? 'bg-[#0F2547] text-white font-semibold shadow-2xs'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            Mi turno hoy ({myTurnCount})
          </button>
          <button
            type="button"
            onClick={() => setResponsibilityFilter('owner_only')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              responsibilityFilter === 'owner_only'
                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Soy Titular ({ownerCount})
          </button>
          <button
            type="button"
            onClick={() => setResponsibilityFilter('approver_or_quoter')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              responsibilityFilter === 'approver_or_quoter'
                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Comité / Apoyo ({enrichedProposals.length - ownerCount})
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar folio, colegio, destino o tarea..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:border-[#1D4ED8] focus:outline-none transition-colors"
            />
          </div>

          {/* Toggle: Vista en Filas vs Tarjetas Comprimidas */}
          <div
            className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/70 shrink-0"
            role="group"
            aria-label="Cambiar modo de visualización de propuestas"
          >
            <button
              type="button"
              onClick={() => setDisplayLayout('filas')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                displayLayout === 'filas'
                  ? 'bg-white text-[#0F2547] font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Rows3 className="w-3.5 h-3.5" />
              Filas
            </button>
            <button
              type="button"
              onClick={() => setDisplayLayout('tarjetas')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                displayLayout === 'tarjetas'
                  ? 'bg-white text-[#0F2547] font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Tarjetas Comprimidas
            </button>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredProposals.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-10 text-center space-y-2">
          <SlidersHorizontal className="w-7 h-7 text-slate-300 mx-auto" />
          <div className="text-sm font-semibold text-slate-800 font-display">
            No hay propuestas que coincidan con el filtro actual
          </div>
          <p className="text-xs text-slate-500">
            Restablece el filtro de etapa o selecciona &ldquo;Todas&rdquo; para visualizar el portafolio completo.
          </p>
        </div>
      ) : displayLayout === 'filas' ? (
        /* =====================================================================
           MODO 1: VISTA EN FILAS (ALTA DENSIDAD, ESCANEO ULTRA RÁPIDO)
           ===================================================================== */
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200/90 text-slate-500 font-semibold">
                  <th className="py-3 px-4 whitespace-nowrap">Folio · Oficina</th>
                  <th className="py-3 px-4">Colegio / Grupo y Destino</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Pax / Presupuesto</th>
                  <th className="py-3 px-4 min-w-[270px]">
                    Etapa del Proceso (1-4)
                  </th>
                  <th className="py-3 px-4 min-w-[240px]">
                    Tu Rol y Responsabilidad Actual
                  </th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/75">
                {filteredProposals.map(
                  ({ request: req, stage, responsibility, officeCode }) => {
                    return (
                      <tr
                        key={req.id}
                        className={`transition-colors ${
                          responsibility.requiresImmediateActionByUser
                            ? 'bg-amber-50/20 hover:bg-amber-50/45'
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        {/* Folio & Office */}
                        <td className="py-3 px-4 align-middle whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onSelectRequest(req, responsibility.targetTab)}
                            className="font-mono font-bold text-[#1D4ED8] hover:underline block cursor-pointer"
                          >
                            {req.folio}
                          </button>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {officeCode} · Lím: {req.proposalDueDate}
                          </div>
                        </td>

                        {/* School / Destination */}
                        <td className="py-3 px-4 align-middle">
                          <div
                            onClick={() => onSelectRequest(req, responsibility.targetTab)}
                            className="font-bold text-slate-900 hover:text-[#1D4ED8] cursor-pointer text-[13px] leading-snug"
                          >
                            {req.groupName}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {req.city}, {req.country} · {req.programType}
                          </div>
                        </td>

                        {/* Pax & Budget */}
                        <td className="py-3 px-4 align-middle text-right font-mono tabular-nums whitespace-nowrap">
                          <div className="text-slate-900 font-semibold">
                            {req.participants} alum. + {req.chaperones} chap.
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {formatMoney(req.estimatedBudgetPerPerson, req.budgetCurrency)} ·{' '}
                            {req.scenarios.length} esc.
                          </div>
                        </td>

                        {/* Interactive 4-Step Compact Stepper in Row */}
                        <td className="py-3 px-4 align-middle">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-slate-900">
                                0{stage.stepNumber}. {stage.label}
                              </span>
                              <span className="text-slate-400 font-mono">
                                {req.status}
                              </span>
                            </div>
                            <div className="grid grid-cols-4 gap-1">
                              {CORE_PROCESS_STAGES.map((stMeta) => {
                                const isCompleted = stMeta.stepNumber < stage.stepNumber;
                                const isCurrent = stMeta.stepNumber === stage.stepNumber;
                                return (
                                  <button
                                    key={stMeta.id}
                                    type="button"
                                    onClick={() => {
                                      if (stMeta.id !== stage.id) {
                                        onChangeStatus(
                                          req.id,
                                          stMeta.canonicalStatus,
                                          `Cambio rápido en fila a etapa ${stMeta.label}`
                                        );
                                      } else {
                                        onSelectRequest(req, stMeta.defaultTab);
                                      }
                                    }}
                                    title={`Pasar a 0${stMeta.stepNumber}. ${stMeta.label}`}
                                    className={`py-1 px-1.5 rounded text-[10px] font-mono text-center truncate transition-colors cursor-pointer border ${
                                      isCurrent
                                        ? 'bg-[#0F2547] border-[#0F2547] text-white font-semibold'
                                        : isCompleted
                                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-medium hover:bg-emerald-100'
                                          : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                                    }`}
                                  >
                                    {stMeta.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </td>

                        {/* User Responsibility */}
                        <td className="py-3 px-4 align-middle">
                          <div className="text-[11px] text-slate-500">
                            Rol:{' '}
                            <strong className="text-slate-800">
                              {responsibility.involvementRelation}
                            </strong>
                            {responsibility.requiresImmediateActionByUser && (
                              <span className="ml-1.5 text-amber-700 font-semibold">
                                · Tu turno hoy
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-700 line-clamp-2 mt-0.5 leading-snug">
                            {responsibility.responsibilitySummary}
                          </div>
                        </td>

                        {/* Direct Actions */}
                        <td className="py-3 px-4 align-middle text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {responsibility.nextStageToAdvance && (
                              <button
                                type="button"
                                onClick={() =>
                                  onChangeStatus(
                                    req.id,
                                    responsibility.nextStageToAdvance!.canonicalStatus,
                                    `Avance rápido a etapa ${responsibility.nextStageToAdvance!.label}`
                                  )
                                }
                                className="px-2.5 py-1.5 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                                title={`Avanzar a etapa ${responsibility.nextStageToAdvance.label}`}
                              >
                                → {responsibility.nextStageToAdvance.label}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onSelectRequest(req, responsibility.targetTab)}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
                                responsibility.requiresImmediateActionByUser
                                  ? 'bg-[#1D4ED8] text-white hover:bg-[#1E40AF]'
                                  : 'bg-[#0F2547] text-white hover:bg-slate-800'
                              }`}
                            >
                              <span>{responsibility.nextActionLabel}</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* =====================================================================
           MODO 2: VISTA EN TARJETAS COMPRIMIDAS (GRID ÁGIL Y VISUAL)
           ===================================================================== */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredProposals.map(
            ({ request: req, stage, responsibility, officeCode }) => {
              return (
                <div
                  key={req.id}
                  className={`bg-white border rounded-2xl p-4 flex flex-col justify-between gap-3.5 transition-all hover:border-slate-300 ${
                    responsibility.requiresImmediateActionByUser
                      ? 'border-amber-300/90'
                      : 'border-slate-200/90'
                  }`}
                >
                  {/* Top Section: Header Metadata + Group Title + 4-Step Compact Stepper */}
                  <div className="space-y-2.5">
                    {/* Unboxed Metadata Line */}
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 font-mono">
                      <div className="flex items-center gap-1.5 truncate">
                        <strong className="text-[#1D4ED8] font-bold">
                          {req.folio}
                        </strong>
                        <span aria-hidden="true">·</span>
                        <span>{officeCode}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">
                          {req.city}, {req.country}
                        </span>
                      </div>
                      <span className="shrink-0 tabular-nums text-slate-600 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {req.proposalDueDate}
                      </span>
                    </div>

                    {/* Title & Subtitle */}
                    <div>
                      <h3
                        onClick={() => onSelectRequest(req, responsibility.targetTab)}
                        className="text-base font-bold text-slate-900 hover:text-[#1D4ED8] cursor-pointer leading-snug line-clamp-1 font-display"
                        title={req.groupName}
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
                        <span className="font-mono tabular-nums">
                          {formatMoney(req.estimatedBudgetPerPerson, req.budgetCurrency)}
                        </span>
                      </div>
                    </div>

                    {/* Compact 4-Stage Interactive Bar (Solicitada -> Cotizada -> Aprobada -> Enviada) */}
                    <div className="pt-1">
                      <div className="flex items-center justify-between text-[11px] mb-1.5">
                        <span className="text-slate-500">
                          Etapa actual:{' '}
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
                              onClick={() => {
                                if (stepMeta.id !== stage.id) {
                                  onChangeStatus(
                                    req.id,
                                    stepMeta.canonicalStatus,
                                    `Avance desde Tarjeta Comprimida a ${stepMeta.label}`
                                  );
                                } else {
                                  onSelectRequest(req, stepMeta.defaultTab);
                                }
                              }}
                              title={`Etapa 0${stepMeta.stepNumber}: ${stepMeta.label}`}
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

                  {/* Bottom Section: User Responsibility & 1-Click Action */}
                  <div className="pt-3 border-t border-slate-100 space-y-2.5">
                    <div className="text-xs bg-slate-50/90 rounded-xl p-2.5 border border-slate-200/60 space-y-1">
                      <div className="flex items-center justify-between gap-1 text-[11px] text-slate-500">
                        <span className="truncate">
                          Rol:{' '}
                          <strong className="text-slate-800">
                            {responsibility.involvementRelation}
                          </strong>
                        </span>
                        {responsibility.requiresImmediateActionByUser && (
                          <span className="text-amber-700 font-semibold shrink-0">
                            Requiere tu acción
                          </span>
                        )}
                      </div>
                      <p className="text-slate-700 text-[11px] leading-snug line-clamp-2">
                        {responsibility.responsibilitySummary}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      {responsibility.nextStageToAdvance ? (
                        <button
                          type="button"
                          onClick={() =>
                            onChangeStatus(
                              req.id,
                              responsibility.nextStageToAdvance!.canonicalStatus,
                              `Avance directo a etapa ${responsibility.nextStageToAdvance!.label}`
                            )
                          }
                          className="px-2.5 py-1.5 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors truncate cursor-pointer"
                        >
                          Pasar a {responsibility.nextStageToAdvance.label} →
                        </button>
                      ) : (
                        <span className="text-[11px] font-mono text-slate-400">
                          {req.scenarios.length} escenario(s)
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => onSelectRequest(req, responsibility.targetTab)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 shrink-0 cursor-pointer ${
                          responsibility.requiresImmediateActionByUser
                            ? 'bg-[#1D4ED8] text-white hover:bg-[#1E40AF]'
                            : 'bg-[#0F2547] text-white hover:bg-slate-800'
                        }`}
                      >
                        <span>{responsibility.nextActionLabel}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}
    </div>
  );
};

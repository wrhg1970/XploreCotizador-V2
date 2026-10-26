import React, { useState, useMemo } from 'react';
import {
  CurrencyCode,
  LineItemBasis,
  LineItemCategory,
  SystemSettings,
  TravelRequest,
  UserProfile,
  UserRole,
} from '../types/domain';
import { calculateScenarioFinancials } from '../engine/financialEngine';
import { canUserManageFinancialConfig } from '../security/rbac';
import { executeAdapterSync } from '../integrations/adapters';
import { exportToExcelCSV, formatMoney } from '../utils/exporters';
import {
  FileSpreadsheet,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Plus,
  ShieldCheck,
  FolderOpen,
  LayoutGrid,
  Rows3,
} from 'lucide-react';
import { RolesAndUsersConfigModule } from './RolesAndUsersConfigModule';

interface GlobalApprovalsProps {
  requests: TravelRequest[];
  onOpenDossierTab: (req: TravelRequest, tab: 'aprobaciones' | 'escenarios' | 'envios') => void;
}

export const GlobalApprovalsView: React.FC<GlobalApprovalsProps> = ({
  requests,
  onOpenDossierTab,
}) => {
  const [layoutMode, setLayoutMode] = useState<'filas' | 'tarjetas'>('filas');

  const rows = useMemo(() => {
    const list: {
      request: TravelRequest;
      scenarioId: string;
      scenarioName: string;
      version: number;
      participants: number;
      pricePerPerson: number;
      totalGroup: number;
      margin: number;
      currency: string;
      status: string;
      createdBy: string;
    }[] = [];

    for (const req of requests) {
      for (const sc of req.scenarios) {
        const calc = calculateScenarioFinancials(
          sc,
          req.estimatedBudgetPerPerson,
          req.budgetCurrency
        );
        list.push({
          request: req,
          scenarioId: sc.id,
          scenarioName: sc.name,
          version: sc.currentVersion,
          participants: sc.participants,
          pricePerPerson: calc.sellingPricePerParticipant,
          totalGroup: calc.totalGroupSellingPrice,
          margin: calc.estimatedMarginPercent,
          currency: sc.saleCurrency,
          status: sc.approvalStatus,
          createdBy: sc.createdByName,
        });
      }
    }
    return list;
  }, [requests]);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight font-display">
            Bandeja Central de Aprobaciones Financieras y Comerciales
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Revisión por versión de escenario · Validación de margen objetivo · Segregación de funciones activa
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 text-xs shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setLayoutMode('filas')}
            className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              layoutMode === 'filas'
                ? 'bg-white text-[#0F2547] font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Rows3 className="w-3.5 h-3.5" /> Filas
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode('tarjetas')}
            className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              layoutMode === 'tarjetas'
                ? 'bg-white text-[#0F2547] font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Tarjetas Comprimidas
          </button>
        </div>
      </div>

      {layoutMode === 'filas' ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Folio / Grupo</th>
                  <th className="py-3 px-4">Escenario (Versión)</th>
                  <th className="py-3 px-4">Elaborado por</th>
                  <th className="py-3 px-4 text-right">Precio / Alumno</th>
                  <th className="py-3 px-4 text-right">Total Grupo</th>
                  <th className="py-3 px-4 text-right">Margen Est.</th>
                  <th className="py-3 px-4">Estado Aprobación</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((r) => (
                  <tr key={`${r.request.id}_${r.scenarioId}`} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <span className="font-mono font-bold text-[#1D4ED8] block">
                        {r.request.folio}
                      </span>
                      <span className="text-slate-700 font-medium">{r.request.groupName}</span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {r.scenarioName} (v{r.version})
                    </td>
                    <td className="py-3 px-4 text-slate-600">{r.createdBy}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatMoney(r.pricePerPerson, r.currency)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                      {formatMoney(r.totalGroup, r.currency)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                      {r.margin.toFixed(2)}%
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{r.status}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => onOpenDossierTab(r.request, 'aprobaciones')}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1D4ED8] rounded-lg hover:bg-[#1E40AF] whitespace-nowrap cursor-pointer"
                      >
                        Dictaminar →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((r) => (
            <div
              key={`${r.request.id}_${r.scenarioId}`}
              className="bg-white border border-slate-200/90 rounded-2xl p-4 flex flex-col justify-between gap-3 hover:border-slate-300 transition-all"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                  <strong className="text-[#1D4ED8]">{r.request.folio}</strong>
                  <span>v{r.version} · {r.participants} alum.</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 line-clamp-1 font-display">
                    {r.request.groupName}
                  </h3>
                  <div className="text-xs text-slate-600 mt-0.5">
                    {r.scenarioName} · Por: {r.createdBy}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs font-mono tabular-nums">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Precio/Alum</span>
                    <strong className="text-slate-900">
                      {formatMoney(r.pricePerPerson, r.currency)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Total Grupo</span>
                    <strong className="text-slate-900">
                      {formatMoney(r.totalGroup, r.currency)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Margen Est.</span>
                    <strong className="text-emerald-700">{r.margin.toFixed(2)}%</strong>
                  </div>
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-600 font-medium truncate">{r.status}</span>
                <button
                  onClick={() => onOpenDossierTab(r.request, 'aprobaciones')}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1D4ED8] rounded-lg hover:bg-[#1E40AF] whitespace-nowrap cursor-pointer"
                >
                  Dictaminar →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const GlobalDispatchesView: React.FC<GlobalApprovalsProps> = ({
  requests,
  onOpenDossierTab,
}) => {
  const [layoutMode, setLayoutMode] = useState<'filas' | 'tarjetas'>('filas');

  const allDispatches = useMemo(() => {
    return requests.flatMap((req) =>
      req.dispatches.map((d) => ({
        request: req,
        dispatch: d,
        outcome: req.outcomes[0] || null,
      }))
    );
  }, [requests]);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight font-display">
            Control de Propuestas Enviadas y Aceptaciones
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Trazabilidad de versiones enviadas, destinatarios, canales de entrega y evidencia de cierre comercial
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 text-xs shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setLayoutMode('filas')}
            className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              layoutMode === 'filas'
                ? 'bg-white text-[#0F2547] font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Rows3 className="w-3.5 h-3.5" /> Filas
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode('tarjetas')}
            className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              layoutMode === 'tarjetas'
                ? 'bg-white text-[#0F2547] font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Tarjetas Comprimidas
          </button>
        </div>
      </div>

      {layoutMode === 'filas' ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Folio / Grupo</th>
                  <th className="py-3 px-4">Versión Enviada</th>
                  <th className="py-3 px-4">Destinatario</th>
                  <th className="py-3 px-4">Canal</th>
                  <th className="py-3 px-4">Fecha de Envío</th>
                  <th className="py-3 px-4">Seguimiento / Resultado</th>
                  <th className="py-3 px-4 text-right">Expediente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {allDispatches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No hay envíos registrados todavía.
                    </td>
                  </tr>
                ) : (
                  allDispatches.map(({ request, dispatch, outcome }) => (
                    <tr key={dispatch.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-[#1D4ED8] block">
                          {request.folio}
                        </span>
                        <span className="text-slate-700 font-medium">{request.groupName}</span>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold">
                        v{dispatch.versionSent} ({dispatch.scenarioIds.length} esc.)
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{dispatch.recipientName}</div>
                        <div className="text-slate-500 font-mono">{dispatch.recipientEmail}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">{dispatch.channel}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {new Date(dispatch.sentAt).toLocaleString('es-MX')}
                      </td>
                      <td className="py-3 px-4">
                        {outcome ? (
                          <span className="font-semibold text-emerald-700">
                            {outcome.decision} · Evidencia: {outcome.evidenceReference}
                          </span>
                        ) : (
                          <span className="text-slate-700">{dispatch.followUpStatus}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => onOpenDossierTab(request, 'envios')}
                          className="px-3 py-1.5 text-xs font-medium text-[#1D4ED8] hover:underline flex items-center justify-end gap-1 ml-auto cursor-pointer"
                        >
                          <FolderOpen className="w-3.5 h-3.5" /> Ver Detalle
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {allDispatches.map(({ request, dispatch, outcome }) => (
            <div
              key={dispatch.id}
              className="bg-white border border-slate-200/90 rounded-2xl p-4 flex flex-col justify-between gap-3 hover:border-slate-300 transition-all"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                  <strong className="text-[#1D4ED8]">{request.folio}</strong>
                  <span>v{dispatch.versionSent} · {dispatch.channel}</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 line-clamp-1 font-display">
                    {request.groupName}
                  </h3>
                  <div className="text-xs text-slate-600 mt-0.5">
                    Para: {dispatch.recipientName} ({dispatch.recipientEmail})
                  </div>
                </div>
                <div className="text-xs pt-2 border-t border-slate-100">
                  {outcome ? (
                    <span className="font-semibold text-emerald-700">
                      {outcome.decision} · Evidencia: {outcome.evidenceReference}
                    </span>
                  ) : (
                    <span className="text-slate-600">
                      Seguimiento: <strong>{dispatch.followUpStatus}</strong>
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                <span className="font-mono text-[11px] text-slate-400">
                  {new Date(dispatch.sentAt).toLocaleDateString('es-MX')}
                </span>
                <button
                  onClick={() => onOpenDossierTab(request, 'envios')}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0F2547] rounded-lg hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" /> Ver Envío
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface ReportsModuleProps {
  requests: TravelRequest[];
  settings: SystemSettings;
}

export const ReportsModule: React.FC<ReportsModuleProps> = ({ requests, settings }) => {
  const [officeFilter, setOfficeFilter] = useState('all');

  const filtered = useMemo(
    () =>
      requests.filter(
        (r) => officeFilter === 'all' || r.officeId === officeFilter
      ),
    [requests, officeFilter]
  );

  const reportMetrics = useMemo(() => {
    const byOffice = settings.offices.map((o) => {
      const officeReqs = filtered.filter((r) => r.officeId === o.id);
      const accepted = officeReqs.filter((r) => r.status === 'Aceptada').length;
      const scenariosCount = officeReqs.reduce((acc, r) => acc + r.scenarios.length, 0);
      return {
        officeName: `${o.code} — ${o.name}`,
        totalRequests: officeReqs.length, // Dato Real
        scenariosCount, // Dato Real
        acceptedCount: accepted, // Dato Real
      };
    });

    const scenarioFinancialRows = filtered.flatMap((req) =>
      req.scenarios.map((sc) => {
        const calc = calculateScenarioFinancials(
          sc,
          req.estimatedBudgetPerPerson,
          req.budgetCurrency
        );
        return {
          folio: req.folio,
          groupName: req.groupName,
          destination: `${req.city}, ${req.country}`,
          scenarioName: sc.name,
          participants: sc.participants,
          budgetPerPerson: calc.budgetTargetPerParticipant, // Estimación del cliente
          sellingPricePerPerson: calc.sellingPricePerParticipant, // Métrica Calculada
          variancePerPerson: calc.budgetVariancePerParticipant, // Métrica Calculada
          estimatedProfit: calc.estimatedProfit, // Estimación Financiera
          estimatedMargin: calc.estimatedMarginPercent, // Métrica Calculada
          currency: sc.saleCurrency,
        };
      })
    );

    return { byOffice, scenarioFinancialRows };
  }, [filtered, settings.offices]);

  const handleExportFullReport = () => {
    const headers = [
      'Folio (Dato Real)',
      'Grupo (Dato Real)',
      'Destino (Dato Real)',
      'Escenario',
      'Participantes (Dato Real)',
      'Presupuesto Cliente (Estimación)',
      'Precio Venta Alumno (Métrica Calculada)',
      'Diferencia vs Presupuesto (Métrica Calculada)',
      'Utilidad Estimada (Estimación)',
      'Margen % (Métrica Calculada)',
      'Moneda',
    ];
    const rows = reportMetrics.scenarioFinancialRows.map((r) => [
      r.folio,
      r.groupName,
      r.destination,
      r.scenarioName,
      r.participants,
      r.budgetPerPerson,
      r.sellingPricePerPerson,
      r.variancePerPerson,
      r.estimatedProfit,
      `${r.estimatedMargin.toFixed(2)}%`,
      r.currency,
    ]);
    exportToExcelCSV('Reporte_Rentabilidad_y_Precios_EE.csv', headers, rows);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Módulo 10. Reportes Ejecutivos y Rentabilidad
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Distinción explícita entre <strong>Datos Reales</strong> (registros firmes),{' '}
            <strong>Estimaciones</strong> (presupuesto/utilidad proyectada) y{' '}
            <strong>Métricas Calculadas</strong> (fórmulas del motor).
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <select
            value={officeFilter}
            onChange={(e) => setOfficeFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50"
          >
            <option value="all">Todas las Oficinas EE</option>
            {settings.offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code} — {o.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleExportFullReport}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0B3B70] rounded-lg hover:bg-[#082d56] flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4" /> Exportar Reporte CSV / Excel
          </button>
        </div>
      </div>

      {/* Solicitudes por Oficina */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">
            Solicitudes, Escenarios y Cierres por Oficina (Datos Reales)
          </h2>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="py-2.5 px-4">Oficina EE</th>
              <th className="py-2.5 px-4 text-right">Solicitudes Registradas (Dato Real)</th>
              <th className="py-2.5 px-4 text-right">Escenarios Elaborados (Dato Real)</th>
              <th className="py-2.5 px-4 text-right">Propuestas Aceptadas (Dato Real)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {reportMetrics.byOffice.map((row) => (
              <tr key={row.officeName}>
                <td className="py-2.5 px-4 font-medium text-slate-900">{row.officeName}</td>
                <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                  {row.totalRequests}
                </td>
                <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                  {row.scenariosCount}
                </td>
                <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                  {row.acceptedCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Diferencias entre Presupuesto y Precio Final + Rentabilidad Estimada */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">
            Comparativa de Presupuesto vs Precio Final y Rentabilidad Estimada
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2.5 px-4">Folio / Destino (Dato Real)</th>
                <th className="py-2.5 px-4">Escenario</th>
                <th className="py-2.5 px-4 text-right">Presupuesto Alumno (Estimación)</th>
                <th className="py-2.5 px-4 text-right">Precio Final Alumno (Calculado)</th>
                <th className="py-2.5 px-4 text-right">Diferencia (Calculado)</th>
                <th className="py-2.5 px-4 text-right">Utilidad Grupo (Estimación)</th>
                <th className="py-2.5 px-4 text-right">Margen % (Calculado)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {reportMetrics.scenarioFinancialRows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4">
                    <span className="font-mono font-bold text-[#0B3B70]">{r.folio}</span> ·{' '}
                    {r.destination}
                  </td>
                  <td className="py-2.5 px-4 text-slate-800">{r.scenarioName}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                    {formatMoney(r.budgetPerPerson, r.currency)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                    {formatMoney(r.sellingPricePerPerson, r.currency)}
                  </td>
                  <td
                    className={`py-2.5 px-4 text-right font-mono tabular-nums ${
                      r.variancePerPerson <= 0 ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {r.variancePerPerson > 0 ? '+' : ''}
                    {formatMoney(r.variancePerPerson, r.currency)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                    {formatMoney(r.estimatedProfit, r.currency)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                    {r.estimatedMargin.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

interface IntegrationsModuleProps {
  settings: SystemSettings;
  requests: TravelRequest[];
  onUpdateSettings: (next: SystemSettings, auditAction: string, details: string) => void;
}

export const IntegrationsModule: React.FC<IntegrationsModuleProps> = ({
  settings,
  requests,
  onUpdateSettings,
}) => {
  const [selectedRequestId, setSelectedRequestId] = useState(
    requests[0]?.id || ''
  );
  const [banner, setBanner] = useState<string | null>(null);

  const handleManualSync = (integrationId: string, simulateError: boolean = false) => {
    const targetReq = requests.find((r) => r.id === selectedRequestId) || requests[0];
    if (!targetReq) return;

    const updatedIntegrations = settings.integrations.map((conn) => {
      if (conn.id !== integrationId) return conn;
      const { updatedConnection, syncLog } = executeAdapterSync(
        conn,
        targetReq,
        'Sincronización manual de expediente y escenarios aprobados',
        simulateError
      );
      setBanner(syncLog.message);
      return updatedConnection;
    });

    onUpdateSettings(
      {
        ...settings,
        integrations: updatedIntegrations,
      },
      `Sincronización con conector ${integrationId}`,
      `Expediente ${targetReq.folio} procesado con llave de idempotencia.`
    );
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Módulo K. Capa de Adaptadores e Integraciones Externas
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Conectores preparados para <strong>XploreTogether</strong>, <strong>WeTravel</strong> y{' '}
            <strong>Wissify</strong> con llaves de idempotencia (evita duplicados), reintentos controlados y aislamiento de fallos.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-600">Expediente a sincronizar:</span>
          <select
            value={selectedRequestId}
            onChange={(e) => setSelectedRequestId(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 font-mono"
          >
            {requests.map((r) => (
              <option key={r.id} value={r.id}>
                {r.folio} — {r.groupName.slice(0, 32)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {banner && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-[#0B3B70] flex items-center justify-between">
          <span>{banner}</span>
          <button onClick={() => setBanner(null)} className="underline ml-4">
            Cerrar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {settings.integrations.map((conn) => (
          <div
            key={conn.id}
            className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4"
          >
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">{conn.name}</h2>
                  <p className="text-xs text-slate-500">
                    {conn.provider} ·{' '}
                    {conn.isSimulationMode
                      ? 'MODO SIMULACIÓN DE DESARROLLO (Etiquetado explícito)'
                      : 'CONEXIÓN ACTIVA'}
                  </p>
                </div>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded border ${
                    conn.status === 'conectada'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : conn.status === 'error'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                >
                  Estado: {conn.status}
                </span>
              </div>

              <p className="text-xs text-slate-600 mt-3">{conn.description}</p>

              <div className="mt-3 space-y-1 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono">
                <div>Endpoint / Credenciales: {conn.endpointReference}</div>
                <div>Política de reintentos: {conn.retryPolicy}</div>
                <div>Límite de tasa: {conn.rateLimitInfo}</div>
                <div>
                  Última sincronización:{' '}
                  {conn.lastSyncAt
                    ? new Date(conn.lastSyncAt).toLocaleString('es-MX')
                    : 'Sin sincronizaciones'}
                </div>
              </div>

              {conn.syncLogs.length > 0 && (
                <div className="mt-3 space-y-1.5 text-xs">
                  <strong className="text-slate-700 block">
                    Bitácora reciente ({conn.syncLogs.length}):
                  </strong>
                  {conn.syncLogs.slice(0, 3).map((log) => (
                    <div
                      key={log.id}
                      className="p-2 bg-slate-50 border border-slate-200 rounded text-slate-700"
                    >
                      <div className="flex justify-between font-mono text-[11px] text-slate-500">
                        <span>
                          {log.targetFolio} · Estado: <strong>{log.status}</strong>
                        </span>
                        <span>{new Date(log.timestamp).toLocaleTimeString('es-MX')}</span>
                      </div>
                      <div className="mt-0.5">{log.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleManualSync(conn.id, false)}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0B3B70] rounded-lg hover:bg-[#082d56] flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Sincronizar Expediente (Idempotente)
              </button>
              <button
                type="button"
                onClick={() => handleManualSync(conn.id, true)}
                className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Probar Fallo sin Duplicar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface AdminModuleProps {
  settings: SystemSettings;
  users: UserProfile[];
  currentUser: UserProfile;
  onUpdateSettings: (next: SystemSettings, auditAction: string, details: string) => void;
  onUpdateUsers: (nextUsers: UserProfile[], auditAction: string, details: string) => void;
}

export const AdministrationModule: React.FC<AdminModuleProps> = ({
  settings,
  users,
  currentUser,
  onUpdateSettings,
  onUpdateUsers,
}) => {
  const canEditFinancials = canUserManageFinancialConfig(currentUser);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('Ejecutivo Comercial');
  const [inviteOfficeId, setInviteOfficeId] = useState(
    settings.offices[0]?.id || 'of_cdmx'
  );

  const [newConceptName, setNewConceptName] = useState('');
  const [newConceptCost, setNewConceptCost] = useState(250);
  const [newConceptCurrency, setNewConceptCurrency] = useState<CurrencyCode>('USD');

  const [newAdminRubroLabel, setNewAdminRubroLabel] = useState('');
  const [newAdminRubroBlock, setNewAdminRubroBlock] = useState<'concepto' | 'chaperon'>('concepto');
  const [newAdminRubroAmount, setNewAdminRubroAmount] = useState(0);
  const [newAdminRubroNote, setNewAdminRubroNote] = useState('');

  const handleInviteUser = () => {
    if (!inviteEmail.trim() || !inviteName.trim()) return;
    const newUser: UserProfile = {
      uid: `usr_inv_${Date.now()}`,
      email: inviteEmail.trim().toLowerCase(),
      displayName: inviteName.trim(),
      role: inviteRole,
      userType: inviteRole === 'Usuario Externo' ? 'externo' : 'interno',
      officeId: inviteOfficeId,
      allowedOffices: [inviteOfficeId],
      status: 'activo',
      lastActiveAt: new Date().toISOString(),
    };
    onUpdateUsers(
      [...users, newUser],
      'Invitación y alta de usuario autorizado',
      `Usuario ${newUser.email} registrado con rol ${newUser.role} en oficina ${newUser.officeId}.`
    );
    setInviteEmail('');
    setInviteName('');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Módulo L. Administración, Usuarios, Tipos de Cambio y Reglas Financieras
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Los cambios financieros quedan registrados en la bitácora de auditoría y no alteran cotizaciones históricas ya enviadas.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-600 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-[#0B3B70]" />
          Versión activa: <strong>{settings.formulaVersion}</strong>
        </div>
      </div>

      {/* 1. Tipos de Cambio y Versión de Fórmulas */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Tipos de Cambio Oficiales EE y Versión del Motor Financiero
            </h2>
            <p className="text-xs text-slate-500">
              Restringido a Finanzas y Administración ({canEditFinancials ? 'Edición habilitada' : 'Modo lectura'})
            </p>
          </div>
          {canEditFinancials && (
            <div className="flex items-center gap-2 text-xs">
              <span>Etiqueta de versión de fórmulas:</span>
              <input
                type="text"
                value={settings.formulaVersion}
                onChange={(e) =>
                  onUpdateSettings(
                    { ...settings, formulaVersion: e.target.value },
                    'Actualización de versión de fórmula global',
                    `Nueva etiqueta de versión: ${e.target.value}`
                  )
                }
                className="px-2.5 py-1 border border-slate-300 rounded font-mono"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {settings.exchangeRates.map((fx) => (
            <div
              key={fx.id}
              className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2"
            >
              <div className="flex justify-between font-mono font-bold text-slate-900">
                <span>
                  1 {fx.fromCurrency} → {fx.toCurrency}
                </span>
                <span className="text-[#0B3B70]">${fx.rate.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.05"
                  disabled={!canEditFinancials}
                  value={fx.rate}
                  onChange={(e) => {
                    const nextRate = Number(e.target.value);
                    onUpdateSettings(
                      {
                        ...settings,
                        exchangeRates: settings.exchangeRates.map((item) =>
                          item.id === fx.id
                            ? {
                                ...item,
                                rate: nextRate,
                                updatedAt: new Date().toISOString(),
                                updatedBy: currentUser.displayName,
                              }
                            : item
                        ),
                      },
                      `Actualización tipo de cambio ${fx.fromCurrency}/${fx.toCurrency}`,
                      `Nuevo TC: ${nextRate} actualizado por ${currentUser.displayName}`
                    );
                  }}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono disabled:bg-slate-100"
                />
              </div>
              <div className="text-[11px] text-slate-500">
                Vigencia: {fx.validUntil} · Por: {fx.updatedBy}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Menú Completo de Configuración de Roles, Permisos Granulares y Usuarios */}
      <RolesAndUsersConfigModule
        settings={settings}
        users={users}
        currentUser={currentUser}
        onUpdateSettings={onUpdateSettings}
        onUpdateUsers={onUpdateUsers}
      />

      {/* 2B. Rubros de la Hoja Oficial EE (Integrados por el Administrador) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Rubros Integrables en la Hoja Oficial de Cotización EE
            </h2>
            <p className="text-xs text-slate-500">
              Además de los 11 rubros oficiales de Concepto y 7 de Chaperones, el Administrador puede integrar más rubros que aparecerán automáticamente en el cotizador y en el comparador en columnas.
            </p>
          </div>
          <span className="text-xs font-mono text-[#0B3B70] font-semibold">
            {(settings.adminCustomRubros || []).length} rubros adicionales activos
          </span>
        </div>

        {canEditFinancials && (
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <select
              value={newAdminRubroBlock}
              onChange={(e) => setNewAdminRubroBlock(e.target.value as 'concepto' | 'chaperon')}
              className="px-2.5 py-1.5 border border-slate-300 rounded bg-white font-medium"
            >
              <option value="concepto">Bloque Izquierdo: Concepto Alumno</option>
              <option value="chaperon">Bloque Derecho: Gastos de Chaperones</option>
            </select>
            <input
              type="text"
              value={newAdminRubroLabel}
              onChange={(e) => setNewAdminRubroLabel(e.target.value)}
              placeholder="Nombre del nuevo rubro (ej. Visa / ETA UK)..."
              className="sm:col-span-2 px-2.5 py-1.5 border border-slate-300 rounded bg-white"
            />
            <input
              type="number"
              step="0.01"
              value={newAdminRubroAmount}
              onChange={(e) => setNewAdminRubroAmount(Number(e.target.value))}
              placeholder="Importe default..."
              className="px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono"
            />
            <button
              type="button"
              onClick={() => {
                if (!newAdminRubroLabel.trim()) return;
                const nextRubros = [
                  ...(settings.adminCustomRubros || []),
                  {
                    id: `adm_rubro_${Date.now()}`,
                    label: newAdminRubroLabel.trim(),
                    section: (newAdminRubroBlock === 'concepto' ? 'conceptos' : 'chaperones') as
                      | 'conceptos'
                      | 'chaperones',
                    defaultAmount: Number(newAdminRubroAmount) || 0,
                    defaultNote: newAdminRubroNote.trim() || undefined,
                    isInternalOnly: false,
                    createdAt: new Date().toISOString(),
                    createdBy: currentUser.displayName,
                  },
                ];
                onUpdateSettings(
                  {
                    ...settings,
                    adminCustomRubros: nextRubros,
                  },
                  'Integración de nuevo rubro oficial EE por Administrador',
                  `Rubro "${newAdminRubroLabel.trim()}" (${newAdminRubroBlock}) integrado con importe base $${newAdminRubroAmount}`
                );
                setNewAdminRubroLabel('');
                setNewAdminRubroAmount(0);
                setNewAdminRubroNote('');
              }}
              className="px-3 py-1.5 bg-[#0B3B70] text-white font-semibold rounded hover:bg-[#082d56] flex items-center justify-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Integrar Rubro EE
            </button>
          </div>
        )}

        {(settings.adminCustomRubros || []).length === 0 ? (
          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
            Los escenarios operan actualmente con la estructura oficial base EE (Precio Neto, Transfer, Comidas, Kit EE, Seguro MSI, Promoción, Costo envíos Kits, Operación, Otros gastos, Comisión Escuela, Comisión Coordinadora + bloque Chaperones). Usa el formulario superior para integrar nuevos rubros globales.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
            {(settings.adminCustomRubros || []).map((rubro) => (
              <div
                key={rubro.id}
                className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between"
              >
                <div>
                  <strong className="text-slate-900">{rubro.label}</strong>
                  <div className="text-slate-500">
                    Bloque: {rubro.section === 'conceptos' ? 'Concepto por Participante' : 'Gastos de Chaperones'} · Por: {rubro.createdBy}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-[#0B3B70]">
                    ${rubro.defaultAmount.toFixed(2)}
                  </span>
                  {canEditFinancials && (
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateSettings(
                          {
                            ...settings,
                            adminCustomRubros: (settings.adminCustomRubros || []).filter(
                              (r) => r.id !== rubro.id
                            ),
                          },
                          'Eliminación de rubro personalizado EE',
                          `Se removió el rubro "${rubro.label}" de la plantilla global.`
                        );
                      }}
                      className="text-xs text-red-600 underline"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Catálogo Maestro de Conceptos y Bitácora Global de Auditoría */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Catálogo Maestro de Conceptos ({settings.catalogConcepts.length})
          </h2>
          {canEditFinancials && (
            <div className="flex gap-2 text-xs">
              <input
                type="text"
                value={newConceptName}
                onChange={(e) => setNewConceptName(e.target.value)}
                placeholder="Nuevo concepto para el catálogo..."
                className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded"
              />
              <input
                type="number"
                value={newConceptCost}
                onChange={(e) => setNewConceptCost(Number(e.target.value))}
                className="w-24 px-2.5 py-1.5 border border-slate-300 rounded font-mono"
              />
              <select
                value={newConceptCurrency}
                onChange={(e) => setNewConceptCurrency(e.target.value as CurrencyCode)}
                className="px-2 py-1.5 border border-slate-300 rounded font-mono"
              >
                <option value="USD">USD</option>
                <option value="MXN">MXN</option>
                <option value="CAD">CAD</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  if (!newConceptName.trim()) return;
                  onUpdateSettings(
                    {
                      ...settings,
                      catalogConcepts: [
                        ...settings.catalogConcepts,
                        {
                          id: `cat_${Date.now()}`,
                          name: newConceptName.trim(),
                          category: 'Servicios adicionales' as LineItemCategory,
                          defaultUnit: 'alumno',
                          defaultCost: Number(newConceptCost) || 0,
                          defaultCurrency: newConceptCurrency,
                          defaultBasis: 'por_participante' as LineItemBasis,
                          isInternalCostOnly: false,
                          isMandatory: false,
                          isTaxable: false,
                        },
                      ],
                    },
                    'Alta de concepto en catálogo maestro',
                    `Concepto: ${newConceptName.trim()} ($${newConceptCost} ${newConceptCurrency})`
                  );
                  setNewConceptName('');
                }}
                className="px-3 py-1.5 bg-slate-900 text-white rounded font-medium"
              >
                Añadir
              </button>
            </div>
          )}
          <div className="space-y-1.5 max-h-64 overflow-y-auto text-xs">
            {settings.catalogConcepts.map((c) => (
              <div
                key={c.id}
                className="p-2.5 bg-slate-50 border border-slate-200 rounded flex justify-between"
              >
                <div>
                  <strong className="text-slate-900">{c.name}</strong>
                  <div className="text-slate-500">
                    {c.category} · {c.defaultBasis} ·{' '}
                    {c.isInternalCostOnly ? 'Costo Interno' : 'Visible Cliente'}
                  </div>
                </div>
                <span className="font-mono font-semibold text-slate-900">
                  ${c.defaultCost} {c.defaultCurrency}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Bitácora Global de Auditoría ({settings.globalAuditLog.length})
          </h2>
          <div className="space-y-2 max-h-72 overflow-y-auto text-xs">
            {settings.globalAuditLog.map((log) => (
              <div
                key={log.id}
                className="p-2.5 bg-slate-50 border border-slate-200 rounded"
              >
                <div className="flex justify-between font-medium text-slate-900">
                  <span>
                    [{log.module}] {log.action}
                  </span>
                  <span className="font-mono text-slate-500">
                    {new Date(log.timestamp).toLocaleString('es-MX')}
                  </span>
                </div>
                <div className="text-slate-600 mt-0.5">
                  {log.actorName} ({log.actorRole}) · {log.details}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

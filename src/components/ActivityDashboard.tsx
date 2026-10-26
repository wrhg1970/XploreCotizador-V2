import React, { useMemo } from 'react';
import { Office, TravelRequest } from '../types/domain';
import { calculateScenarioFinancials } from '../engine/financialEngine';
import { calculateEESheet, ensureScenarioHasEESheet } from '../engine/eeSheetEngine';
import { formatMoney } from '../utils/exporters';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  Legend,
} from 'recharts';
import { BarChart3, DollarSign } from 'lucide-react';

interface ActivityDashboardProps {
  requests: TravelRequest[];
  offices?: Office[];
}

const FX_TO_MXN: Record<string, number> = {
  MXN: 1,
  USD: 19.85,
  CAD: 14.35,
  EUR: 21.4,
  GBP: 26.5,
};

const STATUS_COLORS: Record<string, string> = {
  'En cotización / Recibida': '#0284C7',
  'Pendiente de aprobación': '#D97706',
  'Enviada / En negociación': '#0B3B70',
  Aceptada: '#15803D',
  'Rechazada / Cerrada': '#64748B',
};

export const ActivityDashboard: React.FC<ActivityDashboardProps> = ({ requests }) => {
  const analytics = useMemo(() => {
    const statusMap = new Map<
      string,
      {
        statusGroup: string;
        solicitudes: number;
        participantes: number;
        volumenProyectadoMXN: number;
        comisionProyectadaMXN: number;
      }
    >([
      [
        'En cotización / Recibida',
        {
          statusGroup: 'En cotización / Recibida',
          solicitudes: 0,
          participantes: 0,
          volumenProyectadoMXN: 0,
          comisionProyectadaMXN: 0,
        },
      ],
      [
        'Pendiente de aprobación',
        {
          statusGroup: 'Pendiente de aprobación',
          solicitudes: 0,
          participantes: 0,
          volumenProyectadoMXN: 0,
          comisionProyectadaMXN: 0,
        },
      ],
      [
        'Enviada / En negociación',
        {
          statusGroup: 'Enviada / En negociación',
          solicitudes: 0,
          participantes: 0,
          volumenProyectadoMXN: 0,
          comisionProyectadaMXN: 0,
        },
      ],
      [
        'Aceptada',
        {
          statusGroup: 'Aceptada',
          solicitudes: 0,
          participantes: 0,
          volumenProyectadoMXN: 0,
          comisionProyectadaMXN: 0,
        },
      ],
    ]);

    const financialByRequest: {
      folio: string;
      grupo: string;
      estado: string;
      presupuestoEstimadoMXN: number;
      volumenCotizadoMXN: number;
      utilidadComisionMXN: number;
    }[] = [];

    let totalProjectedVolumeMXN = 0;
    let totalProjectedCommissionMXN = 0;

    for (const req of requests) {
      let bucketKey = 'En cotización / Recibida';
      if (req.status === 'Pendiente de aprobación') {
        bucketKey = 'Pendiente de aprobación';
      } else if (
        req.status === 'Enviada' ||
        req.status === 'Aprobada' ||
        req.status === 'En negociación'
      ) {
        bucketKey = 'Enviada / En negociación';
      } else if (req.status === 'Aceptada') {
        bucketKey = 'Aceptada';
      } else if (
        req.status === 'Rechazada' ||
        req.status === 'Cancelada' ||
        req.status === 'Vencida'
      ) {
        bucketKey = 'Rechazada / Cerrada';
        if (!statusMap.has(bucketKey)) {
          statusMap.set(bucketKey, {
            statusGroup: bucketKey,
            solicitudes: 0,
            participantes: 0,
            volumenProyectadoMXN: 0,
            comisionProyectadaMXN: 0,
          });
        }
      }

      // Pick primary or accepted scenario to compute projected financial volume in MXN
      const primaryScenario =
        req.scenarios.find((s) => s.commercialStatus === 'Seleccionada / Aceptada') ||
        req.scenarios[0];

      let reqVolumeMXN = 0;
      let reqCommissionMXN = 0;

      if (primaryScenario) {
        if (primaryScenario.eeSheet) {
          const sheetCalc = calculateEESheet(
            ensureScenarioHasEESheet(primaryScenario, 0, req.programType, req.city)
          );
          reqVolumeMXN = sheetCalc.totalGrupoEnPesos;
          reqCommissionMXN = sheetCalc.comisionGroupTotalInPesos;
        } else {
          const calc = calculateScenarioFinancials(
            primaryScenario,
            req.estimatedBudgetPerPerson,
            req.budgetCurrency
          );
          const fx = FX_TO_MXN[primaryScenario.saleCurrency] || 1;
          reqVolumeMXN = calc.totalGroupSellingPrice * fx;
          reqCommissionMXN = calc.estimatedProfit * fx;
        }
      } else {
        const fx = FX_TO_MXN[req.budgetCurrency] || 1;
        reqVolumeMXN = req.estimatedBudgetPerPerson * req.participants * fx;
        reqCommissionMXN = reqVolumeMXN * 0.186;
      }

      const budgetFx = FX_TO_MXN[req.budgetCurrency] || 1;
      const reqBudgetMXN = req.estimatedBudgetPerPerson * req.participants * budgetFx;

      totalProjectedVolumeMXN += reqVolumeMXN;
      totalProjectedCommissionMXN += reqCommissionMXN;

      const currentBucket = statusMap.get(bucketKey)!;
      currentBucket.solicitudes += 1;
      currentBucket.participantes += Number(req.participants) || 0;
      currentBucket.volumenProyectadoMXN += Math.round(reqVolumeMXN);
      currentBucket.comisionProyectadaMXN += Math.round(reqCommissionMXN);

      financialByRequest.push({
        folio: req.folio,
        grupo: req.groupName.split('—')[0].trim(),
        estado: req.status,
        presupuestoEstimadoMXN: Math.round(reqBudgetMXN),
        volumenCotizadoMXN: Math.round(reqVolumeMXN),
        utilidadComisionMXN: Math.round(reqCommissionMXN),
      });
    }

    const byStatusData = Array.from(statusMap.values());

    return {
      byStatusData,
      financialByRequest,
      totalProjectedVolumeMXN,
      totalProjectedCommissionMXN,
    };
  }, [requests]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Chart 1: Solicitudes Creadas por Estado y Participantes */}
      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
        <div className="flex items-start justify-between border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-[#0B3B70]" />
              Solicitudes por Estado Operativo
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Distribución de expedientes activos y volumen por etapa del ciclo comercial
            </p>
          </div>
          <span className="text-xs font-mono font-semibold text-[#0B3B70]">
            {requests.length} expedientes
          </span>
        </div>

        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={analytics.byStatusData}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#475569' }}
                axisLine={{ stroke: '#CBD5E1' }}
              />
              <YAxis
                type="category"
                dataKey="statusGroup"
                width={135}
                tick={{ fontSize: 11, fill: '#0F172A' }}
                axisLine={{ stroke: '#CBD5E1' }}
                tickLine={false}
              />
              <Tooltip
                formatter={(value, name) => [
                  String(name) === 'solicitudes'
                    ? `${Number(value || 0)} solicitud(es)`
                    : `${Number(value || 0)} alumnos`,
                  String(name) === 'solicitudes' ? 'Solicitudes' : 'Participantes',
                ]}
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  borderColor: '#CBD5E1',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontFamily: 'IBM Plex Mono, monospace',
                }}
              />
              <Bar dataKey="solicitudes" name="solicitudes" radius={[0, 6, 6, 0]} barSize={22}>
                {analytics.byStatusData.map((entry) => (
                  <Cell
                    key={entry.statusGroup}
                    fill={STATUS_COLORS[entry.statusGroup] || '#0B3B70'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
          {analytics.byStatusData.slice(0, 4).map((s) => (
            <div
              key={s.statusGroup}
              className="flex items-center justify-between bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200/70"
            >
              <span className="text-slate-600 truncate pr-2">{s.statusGroup}</span>
              <strong className="font-mono tabular-nums text-slate-900">
                {s.solicitudes} ({s.participantes} al.)
              </strong>
            </div>
          ))}
        </div>
      </div>

      {/* Chart 2: Volumen Financiero Proyectado vs Presupuesto y Comisión (MXN) */}
      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-700" />
              Volumen Financiero Proyectado y Comisión por Solicitud (MXN)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Comparativa entre presupuesto estimado del grupo, volumen comercial cotizado y comisión/utilidad proyectada
            </p>
          </div>
          <div className="text-right font-mono text-xs shrink-0">
            <div className="text-slate-500">Volumen Proyectado Total:</div>
            <div className="font-bold text-[#0B3B70]">
              {formatMoney(analytics.totalProjectedVolumeMXN, 'MXN')}
            </div>
          </div>
        </div>

        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={analytics.financialByRequest}
              margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis
                dataKey="folio"
                tick={{ fontSize: 11, fill: '#0F172A' }}
                axisLine={{ stroke: '#CBD5E1' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(val: number) => `$${(val / 1000000).toFixed(1)}M`}
                tick={{ fontSize: 11, fill: '#475569' }}
                axisLine={{ stroke: '#CBD5E1' }}
                tickLine={false}
              />
              <Tooltip
                formatter={(value) => [formatMoney(Number(value || 0), 'MXN'), '']}
                labelFormatter={(label) => {
                  const strLabel = String(label ?? '');
                  const found = analytics.financialByRequest.find(
                    (item) => item.folio === strLabel
                  );
                  return found
                    ? `${found.folio} — ${found.grupo} (${found.estado})`
                    : strLabel;
                }}
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  borderColor: '#CBD5E1',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontFamily: 'IBM Plex Mono, monospace',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar
                dataKey="presupuestoEstimadoMXN"
                name="Presupuesto Cliente (MXN)"
                fill="#94A3B8"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="volumenCotizadoMXN"
                name="Volumen Proyectado Cotizado (MXN)"
                fill="#0B3B70"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="utilidadComisionMXN"
                name="Comisión / Margen Proyectado (MXN)"
                fill="#16A34A"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 font-mono tabular-nums">
          <span>
            Volumen Comercial Proyectado:{' '}
            <strong className="text-[#0B3B70]">
              {formatMoney(analytics.totalProjectedVolumeMXN, 'MXN')} MXN
            </strong>
          </span>
          <span>
            Comisión / Margen Consolidado:{' '}
            <strong className="text-emerald-700">
              {formatMoney(analytics.totalProjectedCommissionMXN, 'MXN')} MXN
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
};

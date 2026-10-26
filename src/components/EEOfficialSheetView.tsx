import React, { useMemo, useState } from 'react';
import {
  AdminCustomRubroTemplate,
  CurrencyCode,
  EERubroRow,
  EESheetModel,
  FreePlacesRuleConfig,
  PaymentPlanConfig,
  QuoteScenario,
  SavedSheetTemplate,
  SupplierRateItem,
  TravelRequest,
  UserProfile,
} from '../types/domain';
import {
  BUILT_IN_SHEET_TEMPLATES,
  buildPaymentScheduleForSheet,
  buildVolumePricingTiersForSheet,
  calculateEESheet,
  calculateFreePlacesSummary,
  ensureFreePlacesRule,
  ensurePaymentPlanConfig,
  ensureScenarioHasEESheet,
  getCurrencyDisplayName,
} from '../engine/eeSheetEngine';
import { exportToExcelCSV, formatMoney } from '../utils/exporters';
import {
  Plus,
  Trash2,
  FileSpreadsheet,
  Copy,
  RotateCcw,
  Columns3,
  Eye,
  EyeOff,
  Calendar,
  Sliders,
  BookmarkPlus,
  CheckCircle2,
  Gift,
  Building2,
  Layers,
} from 'lucide-react';

interface EEOfficialSheetEditorProps {
  scenario: QuoteScenario;
  scenarioIndex: number;
  request: TravelRequest;
  adminCustomRubros: AdminCustomRubroTemplate[];
  savedTemplates?: SavedSheetTemplate[];
  supplierRates?: SupplierRateItem[];
  currentUser: UserProfile;
  onUpdateScenarioSheet: (updatedSheet: EESheetModel, auditNote: string) => void;
  onAddGlobalAdminRubro: (newRubro: AdminCustomRubroTemplate) => void;
  onSaveSheetTemplate?: (template: SavedSheetTemplate) => void;
}

const QUICK_RUBRO_PRESETS: {
  label: string;
  amount: number;
  note: string;
  section: 'conceptos' | 'chaperones';
}[] = [
  { label: 'Visa / Autorización ETA', amount: 85, note: 'Trámite consular', section: 'conceptos' },
  { label: 'Seguro Cancelación Plus', amount: 110, note: 'Cobertura ampliada', section: 'conceptos' },
  { label: 'Excursión Cultural Extra', amount: 145, note: 'Entrada + transporte', section: 'conceptos' },
  { label: 'Traslado Privado Aeropuerto', amount: 65, note: 'Coach ejecutivo', section: 'conceptos' },
  { label: 'Bono Extraordinario Chaperón', amount: 250, note: 'Apoyo líder escolar', section: 'chaperones' },
];

export const EEOfficialSheetEditor: React.FC<EEOfficialSheetEditorProps> = ({
  scenario,
  scenarioIndex = 0,
  request,
  adminCustomRubros = [],
  savedTemplates = [],
  supplierRates = [],
  currentUser,
  onUpdateScenarioSheet,
  onAddGlobalAdminRubro,
  onSaveSheetTemplate,
}) => {
  const sheet = ensureScenarioHasEESheet(
    scenario,
    scenarioIndex,
    request?.programType || 'Programa Internacional EE',
    request ? `${request.city}, ${request.country}` : 'Destino Internacional',
    adminCustomRubros
  );

  const calc = calculateEESheet(sheet);
  const paymentPlan = ensurePaymentPlanConfig(sheet.paymentPlan);
  const freePlacesRule = ensureFreePlacesRule(sheet.freePlacesRule);
  const freePlacesSummary = useMemo(
    () => calculateFreePlacesSummary(sheet),
    [sheet]
  );
  const volumeTiers = useMemo(
    () => buildVolumePricingTiersForSheet(sheet, [15, 20, 25, 30, 35]),
    [sheet]
  );
  const paymentSchedule = useMemo(
    () => buildPaymentScheduleForSheet(sheet),
    [sheet]
  );

  const allTemplates = useMemo(
    () => [...BUILT_IN_SHEET_TEMPLATES, ...savedTemplates],
    [savedTemplates]
  );

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('tpl_uk_oxford');
  const [newTemplateName, setNewTemplateName] = useState('');
  const [showSaveTemplateInput, setShowSaveTemplateInput] = useState(false);
  const [selectedSupplierRateId, setSelectedSupplierRateId] = useState<string>(
    supplierRates[0]?.id || ''
  );

  // Stress Test / Sensitivity Simulator State
  const [fxDeltaSim, setFxDeltaSim] = useState<number>(0);
  const [participantsSim, setParticipantsSim] = useState<number | null>(null);

  const effectiveSimParticipants =
    participantsSim !== null ? participantsSim : sheet.participants;
  const effectiveSimFx = Math.max(
    1,
    Math.round((sheet.exchangeRate + fxDeltaSim) * 100) / 100
  );

  const simulatedMetrics = useMemo(() => {
    const simSheet: EESheetModel = {
      ...sheet,
      participants: effectiveSimParticipants,
      exchangeRate: effectiveSimFx,
    };
    const simCalc = calculateEESheet(simSheet);
    // Also evaluate what happens if selling price in currency is kept locked at current calc.precioFinalInCurrency
    const lockedPriceProfitPerStudent =
      calc.precioFinalInCurrency - simCalc.subTotal2ConLider;
    const lockedPriceMarginPct =
      simCalc.subTotal2ConLider > 0
        ? (lockedPriceProfitPerStudent / simCalc.subTotal2ConLider) * 100
        : 0;
    const lockedPriceGroupProfitMXN =
      lockedPriceProfitPerStudent * effectiveSimParticipants * effectiveSimFx;

    return {
      simCalc,
      lockedPriceProfitPerStudent,
      lockedPriceMarginPct,
      lockedPriceGroupProfitMXN,
      leaderDeltaPerStudent: simCalc.gastosDelLider - calc.gastosDelLider,
      pesosDeltaPerStudent:
        simCalc.estimadoEnPesosPerParticipant - calc.estimadoEnPesosPerParticipant,
    };
  }, [sheet, calc, effectiveSimParticipants, effectiveSimFx]);

  const [newRubroLabel, setNewRubroLabel] = useState('');
  const [newRubroAmount, setNewRubroAmount] = useState(0);
  const [newRubroNote, setNewRubroNote] = useState('');
  const [newRubroSection, setNewRubroSection] = useState<'conceptos' | 'chaperones'>(
    'conceptos'
  );
  const [saveGloballyForAll, setSaveGloballyForAll] = useState(true);

  const canIntegrateAdminRubros =
    currentUser?.role === 'Administrador' ||
    currentUser?.role === 'Finanzas' ||
    currentUser?.role === 'Operaciones';

  // Profitability semaphore based on effectiveCommissionPercent
  const commPct = calc.effectiveCommissionPercent;
  const marginSemaphore =
    commPct >= 18
      ? {
          label: 'Rentabilidad Óptima (≥18%)',
          textColor: 'text-emerald-700',
          dotColor: 'bg-emerald-600',
        }
      : commPct >= 14
        ? {
            label: 'Margen Estándar (14%–18%)',
            textColor: 'text-amber-700',
            dotColor: 'bg-amber-500',
          }
        : {
            label: 'Requiere Comité (<14%)',
            textColor: 'text-red-700',
            dotColor: 'bg-red-600',
          };

  const updatePaymentPlan = (
    patch: Partial<PaymentPlanConfig>,
    auditMsg: string
  ) => {
    const nextPlan: PaymentPlanConfig = {
      ...paymentPlan,
      ...patch,
    };
    onUpdateScenarioSheet(
      {
        ...sheet,
        paymentPlan: nextPlan,
      },
      auditMsg
    );
  };

  const updateConceptoAmount = (id: string, amount: number) => {
    const prevRow = sheet.conceptos.find((c) => c.id === id);
    const next: EESheetModel = {
      ...sheet,
      conceptos: sheet.conceptos.map((c) =>
        c.id === id ? { ...c, amount } : c
      ),
    };
    onUpdateScenarioSheet(
      next,
      `Modificó rubro "${prevRow?.label || id}" de $${(prevRow?.amount ?? 0).toFixed(2)} a $${amount.toFixed(2)} ${sheet.currencyCode} en ${sheet.optionTitle}`
    );
  };

  const updateConceptoNote = (id: string, note: string) => {
    const prevRow = sheet.conceptos.find((c) => c.id === id);
    const next: EESheetModel = {
      ...sheet,
      conceptos: sheet.conceptos.map((c) =>
        c.id === id ? { ...c, note } : c
      ),
    };
    onUpdateScenarioSheet(
      next,
      `Actualizó nota en rubro "${prevRow?.label || id}" a "${note}" en ${sheet.optionTitle}`
    );
  };

  const updateChaperoneRubroAmount = (id: string, amount: number) => {
    const prevRow = sheet.chaperoneRubros.find((c) => c.id === id);
    const next: EESheetModel = {
      ...sheet,
      chaperoneRubros: sheet.chaperoneRubros.map((c) =>
        c.id === id ? { ...c, amount } : c
      ),
    };
    onUpdateScenarioSheet(
      next,
      `Modificó gasto de chaperón "${prevRow?.label || id}" de $${(prevRow?.amount ?? 0).toFixed(2)} a $${amount.toFixed(2)} ${sheet.currencyCode} en ${sheet.optionTitle}`
    );
  };

  const insertRubroDirectly = (
    label: string,
    amount: number,
    note: string | undefined,
    section: 'conceptos' | 'chaperones',
    persistGlobal: boolean
  ) => {
    if (!label.trim()) return;
    const newId = `rub_custom_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const newRow: EERubroRow = {
      id: newId,
      label: label.trim(),
      amount: Number(amount) || 0,
      note: note?.trim() || undefined,
      isCustomAdminRubro: true,
      isInternalOnly: false,
    };

    if (persistGlobal) {
      onAddGlobalAdminRubro({
        id: newId,
        label: newRow.label,
        section,
        defaultAmount: newRow.amount,
        defaultNote: newRow.note,
        isInternalOnly: false,
        createdAt: new Date().toISOString(),
        createdBy: currentUser.displayName,
      });
    }

    const nextSheet: EESheetModel =
      section === 'conceptos'
        ? { ...sheet, conceptos: [...sheet.conceptos, newRow] }
        : { ...sheet, chaperoneRubros: [...sheet.chaperoneRubros, newRow] };

    onUpdateScenarioSheet(
      nextSheet,
      `Nuevo rubro integrado: ${newRow.label} (${section}) por $${newRow.amount.toFixed(2)} ${sheet.currencyCode}`
    );
  };

  const handleAddRubro = () => {
    if (!newRubroLabel.trim()) return;
    insertRubroDirectly(
      newRubroLabel,
      newRubroAmount,
      newRubroNote,
      newRubroSection,
      saveGloballyForAll
    );
    setNewRubroLabel('');
    setNewRubroAmount(0);
    setNewRubroNote('');
  };

  const handleLoadSelectedTemplate = () => {
    const tpl = allTemplates.find((t) => t.id === selectedTemplateId);
    if (!tpl) return;
    const clonedSheet: EESheetModel = {
      ...structuredClone(tpl.sheet),
      optionTitle: sheet.optionTitle,
    };
    onUpdateScenarioSheet(
      clonedSheet,
      `Cargó plantilla maestra "${tpl.name}" en ${sheet.optionTitle}`
    );
  };

  const handleSaveCurrentAsTemplate = () => {
    if (!newTemplateName.trim() || !onSaveSheetTemplate) return;
    const tpl: SavedSheetTemplate = {
      id: `tpl_custom_${Date.now()}`,
      name: newTemplateName.trim(),
      destination: sheet.destinationSubtitle || `${request.city}, ${request.country}`,
      programType: request.programType,
      sheet: structuredClone(sheet),
      createdAt: new Date().toISOString(),
      createdBy: currentUser.displayName,
    };
    onSaveSheetTemplate(tpl);
    setSelectedTemplateId(tpl.id);
    setNewTemplateName('');
    setShowSaveTemplateInput(false);
  };

  const handleExportPaymentPlanCSV = () => {
    const headers = [
      'No.',
      'Concepto / Parcialidad',
      'Fecha Límite de Pago',
      '% del Total',
      `Monto (${sheet.currencyCode})`,
      'Monto Estimado (MXN)',
    ];
    const rows = paymentSchedule.map((p) => [
      p.number === 0 ? 'Inscripción' : `Pago ${p.number}`,
      p.label,
      p.dueDate,
      `${p.percentOfTotal.toFixed(2)}%`,
      p.amountInCurrency.toFixed(2),
      p.amountInMXN.toFixed(2),
    ]);
    exportToExcelCSV(
      `Plan_Pagos_${request.folio}_${sheet.optionTitle.replace(/\s+/g, '_')}.csv`,
      headers,
      rows
    );
  };

  const handleExportVolumeTiersCSV = () => {
    const headers = [
      'Rango de Aforo',
      'Alumnos Base',
      'Chaperones / Gratuidades (Free Places)',
      `Gasto Líder / Alumno (${sheet.currencyCode})`,
      `Precio Final Alumno (${sheet.currencyCode})`,
      'Estimado en Pesos / Alumno (MXN)',
      'Total Grupo Estimado (MXN)',
    ];
    const rows = volumeTiers.map((t) => [
      t.tierLabel,
      t.participants,
      `${t.chaperones} chap. (${t.earnedFreePlaces} Free Places)`,
      t.leaderCostPerStudentInCurrency.toFixed(2),
      t.sellingPriceInCurrency.toFixed(2),
      t.sellingPriceInMXN.toFixed(2),
      t.totalGroupInMXN.toFixed(2),
    ]);
    exportToExcelCSV(
      `Precios_Por_Volumen_${request.folio}_${sheet.optionTitle.replace(/\s+/g, '_')}.csv`,
      headers,
      rows
    );
  };

  const handleApplySupplierRate = () => {
    const chosenRate =
      supplierRates.find((r) => r.id === selectedSupplierRateId) ||
      supplierRates[0];
    if (!chosenRate) return;

    const updatedConceptos = sheet.conceptos.map((c) => {
      if (c.label.toLowerCase().includes('precio neto')) {
        return {
          ...c,
          amount: chosenRate.netCostPerStudent,
          note: `${chosenRate.providerName} (${chosenRate.season})`,
        };
      }
      return c;
    });

    const updatedChaperoneRubros = sheet.chaperoneRubros.map((c) => {
      if (c.label.toLowerCase().includes('costo chaperon')) {
        return {
          ...c,
          amount: chosenRate.chaperoneNetCost,
          note: `Tarifa neta ${chosenRate.providerName}`,
        };
      }
      return c;
    });

    const nextFreePlacesRule: FreePlacesRuleConfig = {
      ...freePlacesRule,
      enabled: true,
      studentsPerFreePlace: chosenRate.freePlaceRatio || 10,
    };

    const earnedFreeChaperones = Math.max(
      1,
      Math.floor(sheet.participants / (chosenRate.freePlaceRatio || 10))
    );

    const nextSheet: EESheetModel = {
      ...sheet,
      currencyCode: chosenRate.currency,
      currencyLabel: getCurrencyDisplayName(chosenRate.currency),
      programTitle: `${chosenRate.category} · ${chosenRate.providerName}`,
      destinationSubtitle: `${chosenRate.destination} (${chosenRate.season})`,
      conceptos: updatedConceptos,
      chaperoneRubros: updatedChaperoneRubros,
      chaperonesEscuela: earnedFreeChaperones,
      freePlacesRule: nextFreePlacesRule,
    };

    onUpdateScenarioSheet(
      nextSheet,
      `Aplicó Tarifario Maestro DMC "${chosenRate.providerName} — ${chosenRate.destination}" (${chosenRate.season}): Precio Neto ${chosenRate.netCostPerStudent} ${chosenRate.currency}, Ratio Free Place 1:${chosenRate.freePlaceRatio}`
    );
  };

  const updateFreePlacesRule = (
    patch: Partial<FreePlacesRuleConfig>,
    auditMsg: string
  ) => {
    const nextRule: FreePlacesRuleConfig = {
      ...freePlacesRule,
      ...patch,
    };
    onUpdateScenarioSheet(
      {
        ...sheet,
        freePlacesRule: nextRule,
      },
      auditMsg
    );
  };

  const handleApplyFreePlacesToSheet = () => {
    const earned = Math.floor(
      sheet.participants / Math.max(1, freePlacesRule.studentsPerFreePlace)
    );
    if (freePlacesRule.benefitTarget === 'chaperon_gratis') {
      const nextChaperonesEscuela = Math.max(1, earned);
      onUpdateScenarioSheet(
        {
          ...sheet,
          chaperonesEscuela: nextChaperonesEscuela,
        },
        `Aplicó Regla Free Places (1:${freePlacesRule.studentsPerFreePlace}) para ${sheet.participants} alumnos → ${nextChaperonesEscuela} Chaperón(es) Escuela liberados`
      );
    } else {
      // Apply equivalent scholarship discount per student in "Promoción" row
      const netRow = sheet.conceptos.find((c) =>
        c.label.toLowerCase().includes('precio neto')
      );
      const baseNet = netRow ? netRow.amount : calc.subTotal1Conceptos;
      const totalScholarshipValue = earned * baseNet;
      const discountPerStudent =
        sheet.participants > 0
          ? -Math.round((totalScholarshipValue / sheet.participants) * 100) / 100
          : 0;

      const hasPromoRow = sheet.conceptos.some((c) =>
        c.label.toLowerCase().includes('promoci')
      );
      const nextConceptos = hasPromoRow
        ? sheet.conceptos.map((c) =>
            c.label.toLowerCase().includes('promoci')
              ? {
                  ...c,
                  amount: discountPerStudent,
                  note: `${earned} Beca(s) Free Place 1:${freePlacesRule.studentsPerFreePlace}`,
                }
              : c
          )
        : [
            ...sheet.conceptos,
            {
              id: `rub_fp_${Date.now()}`,
              label: 'Promoción',
              amount: discountPerStudent,
              note: `${earned} Beca(s) Free Place 1:${freePlacesRule.studentsPerFreePlace}`,
            },
          ];

      onUpdateScenarioSheet(
        {
          ...sheet,
          conceptos: nextConceptos,
        },
        `Aplicó ${earned} Beca(s) Free Place (Ratio 1:${freePlacesRule.studentsPerFreePlace}) como descuento prorrateado de ${discountPerStudent} ${sheet.currencyCode} por alumno`
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        {/* Top Sheet Header Band */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="text"
                value={sheet.optionTitle}
                onChange={(e) =>
                  onUpdateScenarioSheet(
                    { ...sheet, optionTitle: e.target.value },
                    `Cambió título de opción a "${e.target.value}"`
                  )
                }
                className="text-lg font-bold text-slate-900 bg-white border border-slate-300 focus:border-[#0B3B70] focus:ring-2 focus:ring-[#0B3B70]/15 focus:outline-none rounded-lg px-2.5 py-0.5 w-44 transition-shadow"
              />
              <span className="text-xs text-slate-500 font-mono">
                Formato Oficial de Rubros Xplore Together ·
              </span>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-semibold ${marginSemaphore.textColor}`}
              >
                <span className={`w-2 h-2 rounded-full ${marginSemaphore.dotColor}`} />
                {marginSemaphore.label}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={sheet.programTitle}
                onChange={(e) =>
                  onUpdateScenarioSheet(
                    { ...sheet, programTitle: e.target.value },
                    'Cambio de subtítulo de programa'
                  )
                }
                className="text-xs font-medium text-slate-800 bg-white border border-slate-300 focus:border-[#0B3B70] focus:outline-none rounded-lg px-2.5 py-1 w-60"
              />
              <input
                type="text"
                value={sheet.destinationSubtitle}
                onChange={(e) =>
                  onUpdateScenarioSheet(
                    { ...sheet, destinationSubtitle: e.target.value },
                    'Cambio de subtítulo de destino'
                  )
                }
                className="text-xs font-medium text-slate-800 bg-white border border-slate-300 focus:border-[#0B3B70] focus:outline-none rounded-lg px-2.5 py-1 w-72"
              />
            </div>
          </div>

          {/* Divisa, Tipo de Cambio, Participantes, Días + Quick Start Templates */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden shadow-2xs">
              <span className="px-2.5 py-1.5 bg-[#0B3B70] text-white font-semibold">
                Divisa
              </span>
              <select
                value={sheet.currencyCode}
                onChange={(e) => {
                  const code = e.target.value as CurrencyCode;
                  onUpdateScenarioSheet(
                    {
                      ...sheet,
                      currencyCode: code,
                      currencyLabel: getCurrencyDisplayName(code),
                    },
                    `Cambio de divisa a ${code}`
                  );
                }}
                className="px-2.5 py-1.5 bg-white font-semibold text-slate-900 border-r border-slate-300 focus:outline-none"
              >
                <option value="GBP">Libras (GBP)</option>
                <option value="USD">Dólares (USD)</option>
                <option value="CAD">Dólares (CAD)</option>
                <option value="EUR">Euros (EUR)</option>
                <option value="MXN">Pesos (MXN)</option>
              </select>
              <input
                type="number"
                step="0.1"
                min="0.01"
                value={sheet.exchangeRate}
                onChange={(e) =>
                  onUpdateScenarioSheet(
                    { ...sheet, exchangeRate: Number(e.target.value) },
                    `Actualizó tipo de cambio a ${e.target.value} MXN`
                  )
                }
                className="w-20 px-2.5 py-1.5 bg-sky-50 focus:bg-white font-mono font-bold text-[#0B3B70] text-right focus:outline-none"
                title="Tipo de cambio a MXN"
              />
            </div>

            <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden shadow-2xs">
              <span className="px-2.5 py-1.5 bg-slate-100 text-slate-700 font-medium">
                Participantes
              </span>
              <input
                type="number"
                min={1}
                value={sheet.participants}
                onChange={(e) =>
                  onUpdateScenarioSheet(
                    { ...sheet, participants: Math.max(1, Number(e.target.value)) },
                    `Actualizó participantes a ${e.target.value} alumnos`
                  )
                }
                className="w-16 px-2.5 py-1.5 bg-white font-mono font-bold text-slate-900 text-right focus:outline-none focus:bg-sky-50/40"
              />
            </div>

            <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden shadow-2xs">
              <span className="px-2.5 py-1.5 bg-slate-100 text-slate-700 font-medium">
                Días
              </span>
              <input
                type="number"
                min={1}
                value={sheet.days}
                onChange={(e) => {
                  const days = Math.max(1, Number(e.target.value));
                  onUpdateScenarioSheet(
                    {
                      ...sheet,
                      days,
                      dailyExpenseCalculatedTotal: sheet.dailyExpenseRate * days,
                    },
                    `Actualizó duración a ${days} días`
                  );
                }}
                className="w-16 px-2.5 py-1.5 bg-white font-mono font-bold text-slate-900 text-right focus:outline-none focus:bg-sky-50/40"
              />
            </div>
          </div>
        </div>

        {/* Quick Start Destination Templates Bar */}
        <div className="px-6 py-2.5 bg-blue-50/50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[#0B3B70]">
              Plantillas Rápidas de Destinos:
            </span>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="px-2.5 py-1 border border-slate-300 rounded-lg bg-white font-medium text-slate-800"
            >
              {allTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleLoadSelectedTemplate}
              className="px-3 py-1 bg-[#0B3B70] text-white font-semibold rounded-lg hover:bg-[#082d56] flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Cargar Plantilla en {sheet.optionTitle}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {showSaveTemplateInput ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="Nombre de plantilla (ej. Japón STEM 10d)..."
                  className="px-2.5 py-1 border border-slate-300 rounded-lg bg-white text-xs w-56"
                />
                <button
                  type="button"
                  onClick={handleSaveCurrentAsTemplate}
                  className="px-2.5 py-1 bg-emerald-700 text-white font-semibold rounded-lg hover:bg-emerald-800"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setShowSaveTemplateInput(false)}
                  className="text-slate-500 hover:text-slate-800 px-1"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              onSaveSheetTemplate && (
                <button
                  type="button"
                  onClick={() => setShowSaveTemplateInput(true)}
                  className="px-3 py-1 text-xs font-medium text-[#0B3B70] bg-white border border-blue-200 rounded-lg hover:bg-blue-50 flex items-center gap-1"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" /> + Guardar Cotización Actual como Plantilla
                </button>
              )
            )}
          </div>
        </div>

        {/* Supplier / DMC Master Rate Selector Bar (Mejora #4) */}
        {supplierRates.length > 0 && (
          <div className="px-6 py-2.5 bg-emerald-50/50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-emerald-900 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-700" />
                Tarifario Maestro de Proveedores / Escuelas / DMC:
              </span>
              <select
                value={selectedSupplierRateId}
                onChange={(e) => setSelectedSupplierRateId(e.target.value)}
                className="px-2.5 py-1 border border-emerald-300 rounded-lg bg-white font-medium text-slate-800 max-w-md"
              >
                {supplierRates.map((rate) => (
                  <option key={rate.id} value={rate.id}>
                    [{rate.season}] {rate.providerName} ({rate.destination}) · Neto:{' '}
                    {formatMoney(rate.netCostPerStudent, rate.currency)} {rate.currency} · Free Place 1:
                    {rate.freePlaceRatio}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleApplySupplierRate}
                className="px-3 py-1 bg-emerald-700 text-white font-semibold rounded-lg hover:bg-emerald-800 flex items-center gap-1 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Inyectar Costo Neto y Free Place en {sheet.optionTitle}
              </button>
            </div>
            <span className="text-[11px] text-emerald-800 font-mono">
              Sincroniza Precio Neto + Costo Chaperón + Divisa + Ratio Free Place
            </span>
          </div>
        )}

        {/* Subtle Visual Legend for Editable vs Calculated Cells */}
        <div className="px-6 py-2 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-white border border-slate-300 inline-block" />
              Celda editable (clic para capturar monto o nota)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-slate-200 border border-slate-300 inline-block" />
              Fórmula automática (calculada en tiempo real)
            </span>
          </div>
          <div className="font-mono text-slate-700">
            Modo de precio activo:{' '}
            <strong className="text-[#0B3B70]">
              {sheet.pricingInputMode === 'percent'
                ? 'Por % de Comisión → Calcula Precio Final'
                : 'Por Precio Final Fijo → Calcula % Comisión'}
            </strong>
          </div>
        </div>

        {/* Main Two-Column Spreadsheet Body (Left: Conceptos | Right: Gastos de Chaperones) */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT BLOCK: CONCEPTO | CANTIDAD */}
          <div className="lg:col-span-6 space-y-4">
            <div className="border border-slate-300 rounded-lg overflow-hidden shadow-2xs">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#134E6F] text-white font-semibold">
                    <th className="py-2.5 px-3 text-right w-5/12">Concepto</th>
                    <th className="py-2.5 px-3 text-right w-4/12">
                      Cantidad ({sheet.currencyCode})
                    </th>
                    <th className="py-2.5 px-2 text-left w-3/12">Nota / Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                  {sheet.conceptos.map((row) => (
                    <tr key={row.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="py-1.5 px-3 text-right font-sans italic text-slate-800">
                        <div className="flex items-center justify-end gap-1.5">
                          {row.isCustomAdminRubro && (
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateScenarioSheet(
                                  {
                                    ...sheet,
                                    conceptos: sheet.conceptos.filter(
                                      (c) => c.id !== row.id
                                    ),
                                  },
                                  `Eliminó rubro personalizado "${row.label}"`
                                )
                              }
                              className="text-slate-400 hover:text-red-600 transition-colors"
                              title="Quitar rubro personalizado"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                          <span>{row.label}</span>
                        </div>
                      </td>
                      <td className="py-1 px-2 bg-slate-50/80 text-right">
                        <input
                          type="number"
                          step="0.5"
                          value={row.amount}
                          onChange={(e) =>
                            updateConceptoAmount(row.id, Number(e.target.value))
                          }
                          className="w-full text-right bg-white border border-slate-200 focus:border-[#0B3B70] focus:ring-2 focus:ring-[#0B3B70]/15 focus:outline-none rounded px-2 py-0.5 font-mono text-slate-900 transition-all"
                        />
                      </td>
                      <td className="py-1 px-2 font-sans text-slate-600">
                        <input
                          type="text"
                          value={row.note || ''}
                          onChange={(e) => updateConceptoNote(row.id, e.target.value)}
                          placeholder="+ nota..."
                          className="w-full bg-transparent hover:bg-slate-50 focus:bg-white focus:outline-none border-b border-transparent focus:border-[#0B3B70] px-1 py-0.5 text-xs placeholder:text-slate-300"
                        />
                      </td>
                    </tr>
                  ))}

                  {/* SubTotal 1 */}
                  <tr className="bg-slate-200/90 font-bold text-slate-900">
                    <td className="py-2 px-3 text-right font-sans italic">SubTotal</td>
                    <td className="py-2 px-3 text-right">
                      {formatMoney(calc.subTotal1Conceptos, sheet.currencyCode)}
                    </td>
                    <td className="py-2 px-2 font-sans text-[10px] text-slate-500 font-normal">
                      Suma conceptos
                    </td>
                  </tr>

                  {/* Gastos del líder (auto = Total Chaperones / Participantes) */}
                  <tr className="bg-slate-50/70">
                    <td className="py-1.5 px-3 text-right font-sans italic text-slate-800">
                      Gastos del lider
                    </td>
                    <td className="py-1.5 px-3 text-right font-semibold text-slate-900">
                      {formatMoney(calc.gastosDelLider, sheet.currencyCode)}
                    </td>
                    <td className="py-1 px-2 font-sans text-[11px] text-slate-500">
                      Auto: Total Chap. ÷ {sheet.participants}
                    </td>
                  </tr>

                  {/* Compensación del líder */}
                  <tr className="hover:bg-blue-50/30 transition-colors">
                    <td className="py-1.5 px-3 text-right font-sans italic text-slate-800">
                      Compensación del lider
                    </td>
                    <td className="py-1 px-2 bg-slate-50/80 text-right">
                      <input
                        type="number"
                        step="0.5"
                        value={sheet.leaderCompensation}
                        onChange={(e) =>
                          onUpdateScenarioSheet(
                            {
                              ...sheet,
                              leaderCompensation: Number(e.target.value),
                            },
                            `Actualizó compensación del líder a $${e.target.value}`
                          )
                        }
                        className="w-full text-right bg-white border border-slate-200 focus:border-[#0B3B70] focus:ring-2 focus:ring-[#0B3B70]/15 focus:outline-none rounded px-2 py-0.5 font-mono"
                      />
                    </td>
                    <td className="py-1 px-2 font-sans text-[11px] text-slate-400">
                      Editable
                    </td>
                  </tr>

                  {/* SubTotal 2 */}
                  <tr className="bg-slate-200/90 font-bold text-slate-900">
                    <td className="py-2 px-3 text-right font-sans italic">SubTotal</td>
                    <td className="py-2 px-3 text-right">
                      {formatMoney(calc.subTotal2ConLider, sheet.currencyCode)}
                    </td>
                    <td className="py-2 px-2 font-sans text-[10px] text-slate-500 font-normal">
                      Costo base alumno
                    </td>
                  </tr>

                  {/* % Comisión (Editable Bidirectionally) */}
                  <tr className="bg-amber-50/40 hover:bg-amber-50/70 transition-colors">
                    <td className="py-1.5 px-3 text-right font-sans italic font-medium text-slate-900">
                      % Comisión
                    </td>
                    <td className="py-1 px-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          step="0.05"
                          value={
                            sheet.pricingInputMode === 'percent'
                              ? sheet.commissionPercent
                              : Number(calc.effectiveCommissionPercent.toFixed(2))
                          }
                          onChange={(e) =>
                            onUpdateScenarioSheet(
                              {
                                ...sheet,
                                pricingInputMode: 'percent',
                                commissionPercent: Number(e.target.value),
                              },
                              `Ajustó % Comisión a ${e.target.value}%`
                            )
                          }
                          className="w-24 text-right bg-white border border-amber-400 focus:border-[#0B3B70] focus:ring-2 focus:ring-[#0B3B70]/20 focus:outline-none rounded px-2 py-0.5 font-mono italic font-bold text-slate-900"
                        />
                        <span className="font-bold text-slate-700">%</span>
                      </div>
                    </td>
                    <td
                      className={`py-1 px-2 font-sans text-[11px] font-medium ${marginSemaphore.textColor}`}
                    >
                      {commPct >= 18 ? 'Óptimo' : commPct >= 14 ? 'Estándar' : 'Bajo (<14%)'}
                    </td>
                  </tr>

                  {/* Comision ($ unitario | $ grupal) */}
                  <tr className="bg-slate-50/70">
                    <td className="py-1.5 px-3 text-right font-sans italic text-slate-800">
                      Comision
                    </td>
                    <td className="py-1.5 px-3 text-right font-semibold text-slate-900">
                      {formatMoney(calc.comisionPerParticipant, sheet.currencyCode)}
                    </td>
                    <td
                      className="py-1.5 px-2 text-right font-mono font-semibold text-slate-700"
                      title="Comisión total del grupo en divisa"
                    >
                      {formatMoney(calc.comisionGroupTotalInCurrency, sheet.currencyCode)}
                    </td>
                  </tr>

                  {/* PRECIO FINAL (Editable Bidirectionally) */}
                  <tr className="bg-sky-200/80 font-bold text-slate-900">
                    <td className="py-2.5 px-3 text-right font-sans italic">
                      PRECIO FINAL
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <input
                        type="number"
                        step="1"
                        value={
                          sheet.pricingInputMode === 'final_price'
                            ? sheet.manualFinalPrice
                            : Number(calc.precioFinalInCurrency.toFixed(2))
                        }
                        onChange={(e) =>
                          onUpdateScenarioSheet(
                            {
                              ...sheet,
                              pricingInputMode: 'final_price',
                              manualFinalPrice: Number(e.target.value),
                            },
                            `Fijó PRECIO FINAL en $${e.target.value} ${sheet.currencyCode}`
                          )
                        }
                        className="w-full text-right bg-white border border-sky-500 focus:border-[#0B3B70] focus:ring-2 focus:ring-[#0B3B70]/20 focus:outline-none rounded px-2 py-1 font-mono font-bold text-[#0B3B70] text-sm"
                      />
                    </td>
                    <td className="py-1.5 px-2 font-sans text-[11px] text-[#0B3B70]">
                      Por participante
                    </td>
                  </tr>

                  {/* Estimado en pesos ($136,475.00 | $427,975.00) */}
                  <tr className="bg-[#134E6F] text-white font-bold">
                    <td className="py-2.5 px-3 text-right font-sans">
                      Estimado en pesos
                    </td>
                    <td className="py-2.5 px-3 text-right text-sm">
                      {formatMoney(calc.estimadoEnPesosPerParticipant, 'MXN')}
                    </td>
                    <td
                      className="py-2.5 px-2 text-right font-mono text-sky-200"
                      title="Comisión total del grupo en pesos (Comisión grupal × TC)"
                    >
                      {formatMoney(calc.comisionGroupTotalInPesos, 'MXN')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT BLOCK: GASTOS DE CHAPERONES (ESCUELA | EE) */}
          <div className="lg:col-span-6 space-y-5">
            <div className="border border-slate-300 rounded-lg overflow-hidden shadow-2xs">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#134E6F] text-white font-semibold">
                    <th className="py-2.5 px-3 text-left w-1/2">Gastos de Chaperones</th>
                    <th className="py-2.5 px-3 text-center w-1/4">Escuela</th>
                    <th className="py-2.5 px-3 text-center w-1/4">EE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                  {/* Número de Chaperones Escuela vs EE */}
                  <tr className="bg-blue-100/70 font-semibold">
                    <td className="py-1.5 px-3 font-sans text-slate-900">
                      Número de Chaperones ({calc.totalChaperonCount} total)
                    </td>
                    <td className="py-1 px-2 text-center">
                      <input
                        type="number"
                        min={0}
                        value={sheet.chaperonesEscuela}
                        onChange={(e) =>
                          onUpdateScenarioSheet(
                            {
                              ...sheet,
                              chaperonesEscuela: Math.max(0, Number(e.target.value)),
                            },
                            `Cambió chaperones Escuela a ${e.target.value}`
                          )
                        }
                        className="w-16 text-center bg-white border border-blue-300 focus:border-[#0B3B70] focus:outline-none rounded py-0.5 font-bold text-slate-900"
                      />
                    </td>
                    <td className="py-1 px-2 text-center">
                      <input
                        type="number"
                        min={0}
                        value={sheet.chaperonesEE}
                        onChange={(e) =>
                          onUpdateScenarioSheet(
                            {
                              ...sheet,
                              chaperonesEE: Math.max(0, Number(e.target.value)),
                            },
                            `Cambió chaperones EE a ${e.target.value}`
                          )
                        }
                        className="w-16 text-center bg-white border border-blue-300 focus:border-[#0B3B70] focus:outline-none rounded py-0.5 font-bold text-slate-900"
                      />
                    </td>
                  </tr>

                  {/* Fondo de Emergencia */}
                  <tr className="hover:bg-blue-50/30 transition-colors">
                    <td className="py-1.5 px-3 font-sans text-slate-800">
                      Fondo de Emergencia
                    </td>
                    <td className="py-1 px-2 bg-slate-50/80 text-right">
                      <input
                        type="number"
                        step="10"
                        value={sheet.emergencyFund}
                        onChange={(e) =>
                          onUpdateScenarioSheet(
                            { ...sheet, emergencyFund: Number(e.target.value) },
                            `Actualizó Fondo de Emergencia a $${e.target.value}`
                          )
                        }
                        className="w-full text-right bg-white border border-slate-200 focus:border-[#0B3B70] focus:outline-none rounded px-2 py-0.5"
                      />
                    </td>
                    <td className="py-1 px-2 font-sans text-[11px] text-slate-400 text-center">
                      Monto grupal
                    </td>
                  </tr>

                  {/* Gastos por día */}
                  <tr className="hover:bg-blue-50/30 transition-colors">
                    <td className="py-1.5 px-3 font-sans text-slate-800">
                      Gastos por día (Tarifa × {sheet.days}d)
                    </td>
                    <td className="py-1 px-2 bg-slate-50/80 text-right">
                      <input
                        type="number"
                        step="5"
                        value={sheet.dailyExpenseRate}
                        onChange={(e) => {
                          const rate = Number(e.target.value);
                          onUpdateScenarioSheet(
                            {
                              ...sheet,
                              dailyExpenseRate: rate,
                              dailyExpenseCalculatedTotal: rate * sheet.days,
                            },
                            `Actualizó tarifa diaria de chaperón a $${rate}`
                          );
                        }}
                        className="w-full text-right bg-white border border-slate-200 focus:border-[#0B3B70] focus:outline-none rounded px-2 py-0.5"
                      />
                    </td>
                    <td className="py-1 px-2 text-right bg-slate-100/70">
                      <input
                        type="number"
                        value={sheet.dailyExpenseCalculatedTotal}
                        onChange={(e) =>
                          onUpdateScenarioSheet(
                            {
                              ...sheet,
                              dailyExpenseCalculatedTotal: Number(e.target.value),
                            },
                            'Ajuste total gastos por día'
                          )
                        }
                        className="w-full text-right bg-white border border-slate-200 focus:border-[#0B3B70] focus:outline-none rounded px-2 py-0.5 font-semibold"
                      />
                    </td>
                  </tr>

                  {/* Rubros de Chaperón */}
                  {sheet.chaperoneRubros.map((row) => (
                    <tr key={row.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="py-1.5 px-3 font-sans text-slate-800">
                        <div className="flex items-center justify-between">
                          <span>{row.label}</span>
                          {row.isCustomAdminRubro && (
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateScenarioSheet(
                                  {
                                    ...sheet,
                                    chaperoneRubros: sheet.chaperoneRubros.filter(
                                      (c) => c.id !== row.id
                                    ),
                                  },
                                  `Eliminó rubro de chaperón "${row.label}"`
                                )
                              }
                              className="text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-1 px-2 bg-blue-50/50 text-right">
                        <input
                          type="number"
                          step="10"
                          value={row.amount}
                          onChange={(e) =>
                            updateChaperoneRubroAmount(row.id, Number(e.target.value))
                          }
                          className="w-full text-right bg-white border border-slate-200 focus:border-[#0B3B70] focus:outline-none rounded px-2 py-0.5"
                        />
                      </td>
                      <td className="py-1 px-2 font-sans text-[11px] text-slate-400 text-center">
                        Por chap.
                      </td>
                    </tr>
                  ))}

                  {/* SubTotal / Chaperon */}
                  <tr className="bg-slate-600 text-white font-bold">
                    <td className="py-2 px-3 font-sans">SubTotal / Chaperon</td>
                    <td className="py-2 px-3 text-right">
                      {formatMoney(calc.subTotalPerChaperon, sheet.currencyCode)}
                    </td>
                    <td className="py-2 px-2 font-sans text-[10px] text-slate-300 font-normal text-center">
                      1 Chaperón
                    </td>
                  </tr>

                  {/* SubTotal Chaperones */}
                  <tr className="bg-slate-600 text-white font-bold border-t border-slate-500">
                    <td className="py-2 px-3 font-sans">
                      SubTotal Chaperones (×{calc.totalChaperonCount})
                    </td>
                    <td className="py-2 px-3 text-right">
                      {formatMoney(calc.subTotalChaperones, sheet.currencyCode)}
                    </td>
                    <td />
                  </tr>

                  {/* Fondo Emergencia */}
                  <tr className="bg-slate-500 text-white font-semibold">
                    <td className="py-1.5 px-3 font-sans">Fondo Emergencia</td>
                    <td className="py-1.5 px-3 text-right">
                      {formatMoney(calc.emergencyFund, sheet.currencyCode)}
                    </td>
                    <td />
                  </tr>

                  {/* Total Chaperones */}
                  <tr className="bg-slate-900 text-white font-bold text-sm">
                    <td className="py-2.5 px-3 font-sans">Total Chaperones</td>
                    <td className="py-2.5 px-3 text-right">
                      {formatMoney(calc.totalChaperones, sheet.currencyCode)}
                    </td>
                    <td className="py-2 px-2 font-sans text-[10px] text-slate-300 font-normal text-center">
                      Pasa a Líder
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Automatic Free Places / Gratuidades por Ratio Panel (Mejora #3) */}
            <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-bold text-[#0B3B70]">
                  <Gift className="w-4 h-4 text-[#0B3B70]" />
                  <span>
                    Regla Automática de "Free Places" (Gratuidades / Becas por Ratio)
                  </span>
                </div>
                <label className="inline-flex items-center gap-1.5 text-slate-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={freePlacesRule.enabled}
                    onChange={(e) =>
                      updateFreePlacesRule(
                        { enabled: e.target.checked },
                        `${e.target.checked ? 'Activó' : 'Desactivó'} regla automática de Free Places`
                      )
                    }
                    className="accent-[#0B3B70]"
                  />
                  <span>Regla Activa</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Ratio de Gratuidad (Alumnos : 1 Free Place)
                  </label>
                  <select
                    value={freePlacesRule.studentsPerFreePlace}
                    onChange={(e) =>
                      updateFreePlacesRule(
                        { studentsPerFreePlace: Number(e.target.value) },
                        `Cambió ratio de Free Places a 1:${e.target.value}`
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-blue-300 rounded-lg bg-white font-mono font-semibold text-slate-900"
                  >
                    <option value={8}>Ratio 1 : 8 alumnos</option>
                    <option value={10}>Ratio 1 : 10 alumnos (Estándar UK/USA)</option>
                    <option value={12}>Ratio 1 : 12 alumnos</option>
                    <option value={15}>Ratio 1 : 15 alumnos</option>
                    <option value={20}>Ratio 1 : 20 alumnos</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Destino del Beneficio
                  </label>
                  <select
                    value={freePlacesRule.benefitTarget}
                    onChange={(e) =>
                      updateFreePlacesRule(
                        {
                          benefitTarget: e.target.value as
                            | 'chaperon_gratis'
                            | 'beca_alumno',
                        },
                        `Cambió aplicación de Free Place a ${e.target.value}`
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-blue-300 rounded-lg bg-white font-medium text-slate-900"
                  >
                    <option value="chaperon_gratis">
                      Liberar Chaperón Escuela
                    </option>
                    <option value="beca_alumno">
                      Beca / Descuento en Rubro Promoción
                    </option>
                  </select>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={handleApplyFreePlacesToSheet}
                    className="w-full px-3 py-1.5 bg-[#0B3B70] text-white font-semibold rounded-lg hover:bg-[#082d56] flex items-center justify-center gap-1 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Aplicar{' '}
                    {freePlacesSummary.earnedFreePlaces} Free Place(s)
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-blue-200/70 text-[11px] text-slate-700">
                <span>
                  Con <strong className="font-mono">{sheet.participants} alumnos</strong> y ratio{' '}
                  <strong className="font-mono">1:{freePlacesRule.studentsPerFreePlace}</strong>:{' '}
                  <strong className="text-emerald-800 font-mono">
                    {freePlacesSummary.earnedFreePlaces} lugar(es) libre(s) ganado(s)
                  </strong>{' '}
                  (Equivalente a{' '}
                  <strong className="font-mono">
                    {formatMoney(freePlacesSummary.totalFreePlaceBenefitInCurrency, sheet.currencyCode)}{' '}
                    {sheet.currencyCode}
                  </strong>
                  ).
                </span>
                <span className="font-mono text-[#0B3B70]">
                  Faltan{' '}
                  <strong>
                    {freePlacesSummary.studentsUntilNextFreePlace} alumno(s)
                  </strong>{' '}
                  para el siguiente Free Place (
                  {sheet.participants + freePlacesSummary.studentsUntilNextFreePlace} alum.)
                </span>
              </div>
            </div>

            {/* Administrator Rubro Integrator Box + Quick Rubro Presets */}
            {canIntegrateAdminRubros && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-slate-900">
                    + Integrar Nuevo Rubro a la Cotización (Administrador)
                  </strong>
                  <label className="inline-flex items-center gap-1.5 text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveGloballyForAll}
                      onChange={(e) => setSaveGloballyForAll(e.target.checked)}
                    />
                    <span>Guardar en catálogo global</span>
                  </label>
                </div>

                {/* Quick 1-Click Common Rubro Templates */}
                <div className="space-y-1.5">
                  <span className="text-[11px] text-slate-500 block">
                    Inserción rápida de rubros frecuentes (1 clic):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_RUBRO_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() =>
                          insertRubroDirectly(
                            preset.label,
                            preset.amount,
                            preset.note,
                            preset.section,
                            false
                          )
                        }
                        className="px-2.5 py-1 text-[11px] font-medium text-[#0B3B70] bg-white border border-slate-300 rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors"
                      >
                        + {preset.label} (${preset.amount})
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
                  <input
                    type="text"
                    value={newRubroLabel}
                    onChange={(e) => setNewRubroLabel(e.target.value)}
                    placeholder="Nombre del rubro personalizado..."
                    className="sm:col-span-2 px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:border-[#0B3B70] focus:outline-none"
                  />
                  <input
                    type="number"
                    value={newRubroAmount}
                    onChange={(e) => setNewRubroAmount(Number(e.target.value))}
                    placeholder="Monto"
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-mono focus:border-[#0B3B70] focus:outline-none"
                  />
                  <select
                    value={newRubroSection}
                    onChange={(e) =>
                      setNewRubroSection(
                        e.target.value as 'conceptos' | 'chaperones'
                      )
                    }
                    className="px-2 py-1.5 border border-slate-300 rounded-lg bg-white focus:border-[#0B3B70] focus:outline-none"
                  >
                    <option value="conceptos">Tabla Conceptos</option>
                    <option value="chaperones">Tabla Chaperones</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newRubroNote}
                    onChange={(e) => setNewRubroNote(e.target.value)}
                    placeholder="Nota opcional al lado del rubro (ej. avión, tren, entrada)..."
                    className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:border-[#0B3B70] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddRubro}
                    className="px-4 py-1.5 bg-[#0B3B70] text-white font-semibold rounded-lg hover:bg-[#082d56] flex items-center gap-1 whitespace-nowrap transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Integrar Rubro
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          PLAN DE PAGOS CONFIGURABLE: INSCRIPCIÓN + HASTA 15 PAGOS
         ===================================================================== */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#0B3B70]">
              <Calendar className="w-4 h-4" />
              <span>CALENDARIO COMERCIAL Y PLAN DE COBRANZA POR PARTICIPANTE</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">
              Plan de Pagos: Selección de Inscripción y de 1 hasta 15 Pagos
            </h3>
            <p className="text-xs text-slate-500">
              Configura el anticipo de inscripción y selecciona entre <strong>1 y 15 pagos parciales</strong>. Este calendario se integra automáticamente en el PDF comercial del colegio.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportPaymentPlanCSV}
              className="px-3.5 py-2 text-xs font-semibold text-[#0B3B70] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Exportar Plan de Pagos (Excel / CSV)
            </button>
          </div>
        </div>

        {/* Quick Selector Bar for Number of Installments (1 to 15) + Registration Toggle */}
        <div className="space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 font-semibold text-slate-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={paymentPlan.includeRegistrationFee}
                  onChange={(e) =>
                    updatePaymentPlan(
                      { includeRegistrationFee: e.target.checked },
                      `${e.target.checked ? 'Activó' : 'Desactivó'} cobro de Inscripción en plan de pagos`
                    )
                  }
                  className="w-4 h-4 accent-[#0B3B70] rounded"
                />
                <span>Incluir Pago de Inscripción / Apartado Inicial</span>
              </label>

              {paymentPlan.includeRegistrationFee && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={paymentPlan.registrationFeeMode}
                    onChange={(e) =>
                      updatePaymentPlan(
                        {
                          registrationFeeMode: e.target.value as 'percent' | 'fixed',
                          registrationFeeValue:
                            e.target.value === 'percent' ? 15 : 500,
                        },
                        `Cambió modalidad de inscripción a ${e.target.value}`
                      )
                    }
                    className="px-2.5 py-1 border border-slate-300 rounded-lg bg-white font-medium"
                  >
                    <option value="percent">% de Inscripción</option>
                    <option value="fixed">Monto Fijo ({sheet.currencyCode})</option>
                  </select>

                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      step={paymentPlan.registrationFeeMode === 'percent' ? 1 : 50}
                      value={paymentPlan.registrationFeeValue}
                      onChange={(e) =>
                        updatePaymentPlan(
                          { registrationFeeValue: Number(e.target.value) },
                          `Ajustó valor de inscripción a ${e.target.value}`
                        )
                      }
                      className="w-20 px-2.5 py-1 border border-slate-300 rounded-lg bg-white font-mono font-bold text-[#0B3B70] text-right"
                    />
                    <span className="font-mono font-semibold text-slate-700">
                      {paymentPlan.registrationFeeMode === 'percent'
                        ? '%'
                        : sheet.currencyCode}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">Fecha Inscripción:</span>
                    <input
                      type="date"
                      value={paymentPlan.registrationDueDate}
                      onChange={(e) =>
                        updatePaymentPlan(
                          { registrationDueDate: e.target.value },
                          `Cambió fecha límite de inscripción a ${e.target.value}`
                        )
                      }
                      className="px-2 py-1 border border-slate-300 rounded-lg bg-white font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-600 font-medium">Frecuencia:</span>
              <select
                value={paymentPlan.frequency}
                onChange={(e) =>
                  updatePaymentPlan(
                    {
                      frequency: e.target.value as
                        | 'mensual'
                        | 'quincenal'
                        | 'semanal',
                    },
                    `Cambió frecuencia de pagos a ${e.target.value}`
                  )
                }
                className="px-2.5 py-1 border border-slate-300 rounded-lg bg-white font-medium"
              >
                <option value="mensual">Mensual</option>
                <option value="quincenal">Quincenal (cada 15 días)</option>
                <option value="semanal">Semanal (cada 7 días)</option>
              </select>

              <span className="text-slate-600 font-medium">1er Pago:</span>
              <input
                type="date"
                value={paymentPlan.firstInstallmentDate}
                onChange={(e) =>
                  updatePaymentPlan(
                    { firstInstallmentDate: e.target.value },
                    `Cambió fecha del primer pago a ${e.target.value}`
                  )
                }
                className="px-2 py-1 border border-slate-300 rounded-lg bg-white font-mono"
              />
            </div>
          </div>

          {/* 1 to 15 Installments Interactive Selector */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">
                Selecciona el Número de Pagos Parciales (de 1 hasta 15 pagos):
              </span>
              <span className="font-mono text-xs text-[#0B3B70] font-semibold">
                 Esquema activo:{' '}
                {paymentPlan.includeRegistrationFee
                  ? `Inscripción + ${paymentPlan.installmentsCount} ${
                      paymentPlan.installmentsCount === 1 ? 'pago' : 'pagos'
                    }`
                  : `${paymentPlan.installmentsCount} ${
                      paymentPlan.installmentsCount === 1 ? 'pago directo' : 'pagos'
                    }`}
              </span>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-15 gap-1.5">
              {Array.from({ length: 15 }, (_, i) => i + 1).map((num) => {
                const isSelected = paymentPlan.installmentsCount === num;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() =>
                      updatePaymentPlan(
                        { installmentsCount: num },
                        `Configuró plan de pagos a ${
                          paymentPlan.includeRegistrationFee ? 'Inscripción + ' : ''
                        }${num} pago(s)`
                      )
                    }
                    className={`py-2 px-1 rounded-lg border font-mono text-xs transition-all flex flex-col items-center justify-center ${
                      isSelected
                        ? 'bg-[#0B3B70] border-[#0B3B70] text-white font-bold shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <span>{num}</span>
                    <span className="text-[9px] font-sans font-normal opacity-80">
                      {num === 1 ? 'pago' : 'pagos'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Payment Schedule Breakdown Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#0B3B70] text-white font-semibold">
                  <th className="py-2.5 px-4">No.</th>
                  <th className="py-2.5 px-4">Concepto / Parcialidad</th>
                  <th className="py-2.5 px-4">Fecha Límite de Pago</th>
                  <th className="py-2.5 px-4 text-right">% del Total</th>
                  <th className="py-2.5 px-4 text-right">
                    Monto por Alumno ({sheet.currencyCode})
                  </th>
                  <th className="py-2.5 px-4 text-right">
                    Estimado por Alumno (MXN)
                  </th>
                  <th className="py-2.5 px-4 text-right">
                    Recaudación Grupal ({sheet.participants} alum. MXN)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                {paymentSchedule.map((inst) => (
                  <tr
                    key={inst.number}
                    className={
                      inst.number === 0
                        ? 'bg-blue-50/70 font-semibold text-[#0B3B70]'
                        : 'hover:bg-slate-50'
                    }
                  >
                    <td className="py-2 px-4">
                      {inst.number === 0 ? 'INSCRIPCIÓN' : `#${inst.number}`}
                    </td>
                    <td className="py-2 px-4 font-sans font-medium text-slate-900">
                      {inst.label}
                    </td>
                    <td className="py-1.5 px-4">
                      <input
                        type="date"
                        value={inst.dueDate}
                        onChange={(e) => {
                          if (inst.number === 0) {
                            updatePaymentPlan(
                              { registrationDueDate: e.target.value },
                              `Actualizó fecha de inscripción a ${e.target.value}`
                            );
                          } else {
                            updatePaymentPlan(
                              {
                                customInstallmentDates: {
                                  ...(paymentPlan.customInstallmentDates || {}),
                                  [inst.number]: e.target.value,
                                },
                              },
                              `Actualizó fecha del Pago ${inst.number} a ${e.target.value}`
                            );
                          }
                        }}
                        className="px-2 py-0.5 border border-slate-300 rounded bg-white text-xs font-mono"
                      />
                    </td>
                    <td className="py-2 px-4 text-right text-slate-600">
                      {inst.percentOfTotal.toFixed(2)}%
                    </td>
                    <td className="py-2 px-4 text-right font-semibold text-slate-900">
                      {formatMoney(inst.amountInCurrency, sheet.currencyCode)}
                    </td>
                    <td className="py-2 px-4 text-right font-semibold text-emerald-800">
                      {formatMoney(inst.amountInMXN, 'MXN')}
                    </td>
                    <td className="py-2 px-4 text-right text-slate-600">
                      {formatMoney(inst.amountInMXN * sheet.participants, 'MXN')}
                    </td>
                  </tr>
                ))}

                {/* Totals Row */}
                <tr className="bg-slate-900 text-white font-bold">
                  <td colSpan={3} className="py-2.5 px-4 font-sans">
                    TOTAL ACUMULADO DEL PLAN ({paymentSchedule.length} exhibiciones)
                  </td>
                  <td className="py-2.5 px-4 text-right">100.00%</td>
                  <td className="py-2.5 px-4 text-right">
                    {formatMoney(calc.precioFinalInCurrency, sheet.currencyCode)}
                  </td>
                  <td className="py-2.5 px-4 text-right text-emerald-300">
                    {formatMoney(calc.estimadoEnPesosPerParticipant, 'MXN')}
                  </td>
                  <td className="py-2.5 px-4 text-right text-sky-200">
                    {formatMoney(calc.totalGrupoEnPesos, 'MXN')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* =====================================================================
          COTIZACIÓN ESCALONADA POR RANGOS DE AFORO ("TABLA DE PRECIOS POR VOLUMEN" - MEJORA #7)
         ===================================================================== */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#0B3B70]">
              <Layers className="w-4 h-4" />
              <span>MATRIZ AUTOMÁTICA DE PRECIOS POR VOLUMEN DE ALUMNOS (ESCALAS DE AFORO)</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">
              Cotización Escalonada por Rangos de Aforo (15, 20, 25, 30 y 35+ Alumnos)
            </h3>
            <p className="text-xs text-slate-500">
              Recalcula automáticamente el prorrateo de chaperones/líderes y las gratuidades (Free Places 1:{freePlacesRule.studentsPerFreePlace}) para cada escalón de inscripción. Se incluye automáticamente en el Portal del Colegio y en el PDF Comercial.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportVolumeTiersCSV}
              className="px-3.5 py-2 text-xs font-semibold text-[#0B3B70] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Exportar Tabla por Volumen (Excel / CSV)
            </button>
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#0B3B70] text-white font-semibold">
                <th className="py-2.5 px-4">Rango de Aforo</th>
                <th className="py-2.5 px-4 text-center">Alumnos Base</th>
                <th className="py-2.5 px-4 text-center">
                  Chaperones / Free Places (1:{freePlacesRule.studentsPerFreePlace})
                </th>
                <th className="py-2.5 px-4 text-right">
                  Gasto Líder Prorrateado ({sheet.currencyCode})
                </th>
                <th className="py-2.5 px-4 text-right">
                  PRECIO FINAL ({sheet.currencyCode})
                </th>
                <th className="py-2.5 px-4 text-right">
                  Estimado / Alumno (MXN)
                </th>
                <th className="py-2.5 px-4 text-right">
                  Total Grupo (MXN)
                </th>
                <th className="py-2.5 px-4 text-right">Acción Rápida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
              {volumeTiers.map((tier) => {
                const isCurrentBracket = tier.participants === sheet.participants;
                return (
                  <tr
                    key={tier.participants}
                    className={
                      isCurrentBracket
                        ? 'bg-blue-50/80 font-semibold text-[#0B3B70]'
                        : 'hover:bg-slate-50'
                    }
                  >
                    <td className="py-2.5 px-4 font-sans font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>{tier.tierLabel}</span>
                        {isCurrentBracket && (
                          <span className="px-2 py-0.5 text-[10px] font-mono bg-[#0B3B70] text-white rounded">
                            Aforo Activo
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-center font-bold text-slate-900">
                      {tier.participants} alum.
                    </td>
                    <td className="py-2.5 px-4 text-center text-slate-700">
                      {tier.chaperones} chap. ({tier.earnedFreePlaces} Free Places)
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-700">
                      {formatMoney(tier.leaderCostPerStudentInCurrency, sheet.currencyCode)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-[#0B3B70]">
                      {formatMoney(tier.sellingPriceInCurrency, sheet.currencyCode)}{' '}
                      {sheet.currencyCode}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-800">
                      {formatMoney(tier.sellingPriceInMXN, 'MXN')}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-700">
                      {formatMoney(tier.totalGroupInMXN, 'MXN')}
                    </td>
                    <td className="py-2 px-4 text-right font-sans">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateScenarioSheet(
                            {
                              ...sheet,
                              participants: tier.participants,
                              chaperonesEscuela: tier.chaperones,
                              pricingInputMode: 'percent',
                            },
                            `Seleccionó escalón de volumen "${tier.tierLabel}" (${tier.participants} alumnos, ${tier.chaperones} chaperones)`
                          )
                        }
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                          isCurrentBracket
                            ? 'bg-[#0B3B70] text-white border-[#0B3B70]'
                            : 'bg-white text-[#0B3B70] border-blue-200 hover:bg-blue-50'
                        }`}
                      >
                        {isCurrentBracket ? 'Activo' : 'Fijar Aforo'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================================================
          SIMULADOR DE SENSIBILIDAD CAMBIARIA Y CAÍDA DE AFORO (STRESS TEST)
         ===================================================================== */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#0B3B70]">
              <Sliders className="w-4 h-4" />
              <span>SIMULADOR FINANCIERO DE RIESGO Y SENSIBILIDAD (STRESS TEST)</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">
              Análisis de Sensibilidad Cambiaria (FX) y Variación de Aforo
            </h3>
            <p className="text-xs text-slate-500">
              Simula qué ocurre con los gastos fijos de chaperones/líder y la utilidad si se inscriben menos alumnos o fluctúa el tipo de cambio antes de liquidar a proveedores.
            </p>
          </div>

          {(fxDeltaSim !== 0 ||
            (participantsSim !== null && participantsSim !== sheet.participants)) && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setFxDeltaSim(0);
                  setParticipantsSim(null);
                }}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg"
              >
                Restablecer Simulador
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateScenarioSheet(
                    {
                      ...sheet,
                      participants: effectiveSimParticipants,
                      exchangeRate: effectiveSimFx,
                    },
                    `Aplicó parámetros del simulador de sensibilidad: ${effectiveSimParticipants} alumnos y TC ${effectiveSimFx}`
                  );
                  setFxDeltaSim(0);
                  setParticipantsSim(null);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0B3B70] rounded-lg hover:bg-[#082d56] flex items-center gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Aplicar Simulación a la Cotización
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center text-xs">
          {/* Sliders */}
          <div className="lg:col-span-5 space-y-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="space-y-1.5">
              <div className="flex justify-between font-medium">
                <span className="text-slate-700">
                  1. Simular Aforo Real de Alumnos Pagantes:
                </span>
                <span className="font-mono font-bold text-[#0B3B70]">
                  {effectiveSimParticipants} alumnos (Base: {sheet.participants})
                </span>
              </div>
              <input
                type="range"
                min={Math.max(5, sheet.participants - 15)}
                max={sheet.participants + 20}
                value={effectiveSimParticipants}
                onChange={(e) => setParticipantsSim(Number(e.target.value))}
                className="w-full accent-[#0B3B70] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>Mín: {Math.max(5, sheet.participants - 15)} alum.</span>
                <span>Actual: {sheet.participants} alum.</span>
                <span>Máx: {sheet.participants + 20} alum.</span>
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-slate-200">
              <div className="flex justify-between font-medium">
                <span className="text-slate-700">
                  2. Variación Tipo de Cambio ({sheet.currencyCode}/MXN):
                </span>
                <span className="font-mono font-bold text-[#0B3B70]">
                  {effectiveSimFx.toFixed(2)} MXN ({fxDeltaSim >= 0 ? '+' : ''}
                  {fxDeltaSim.toFixed(2)})
                </span>
              </div>
              <input
                type="range"
                min={-2.5}
                max={3.5}
                step={0.25}
                value={fxDeltaSim}
                onChange={(e) => setFxDeltaSim(Number(e.target.value))}
                className="w-full accent-[#0B3B70] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>-$2.50 MXN</span>
                <span>TC Base: ${sheet.exchangeRate}</span>
                <span>+$3.50 MXN</span>
              </div>
            </div>
          </div>

          {/* Simulated Impact Cards */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-1">
              <span className="text-[11px] text-slate-500">
                Gastos del Líder / Alumno
              </span>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {formatMoney(
                  simulatedMetrics.simCalc.gastosDelLider,
                  sheet.currencyCode
                )}
              </div>
              <div
                className={`text-[11px] font-mono ${
                  simulatedMetrics.leaderDeltaPerStudent > 0.01
                    ? 'text-red-600'
                    : simulatedMetrics.leaderDeltaPerStudent < -0.01
                      ? 'text-emerald-700'
                      : 'text-slate-400'
                }`}
              >
                {simulatedMetrics.leaderDeltaPerStudent > 0 ? '+' : ''}
                {formatMoney(
                  simulatedMetrics.leaderDeltaPerStudent,
                  sheet.currencyCode
                )}{' '}
                por alumno
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-1">
              <span className="text-[11px] text-slate-500">
                Margen Real (Precio Fijo {formatMoney(calc.precioFinalInCurrency, sheet.currencyCode)})
              </span>
              <div
                className={`text-lg font-bold font-mono tabular-nums ${
                  simulatedMetrics.lockedPriceMarginPct >= 18
                    ? 'text-emerald-700'
                    : simulatedMetrics.lockedPriceMarginPct >= 14
                      ? 'text-amber-700'
                      : 'text-red-600'
                }`}
              >
                {simulatedMetrics.lockedPriceMarginPct.toFixed(2)}%
              </div>
              <div className="text-[11px] font-mono text-slate-600">
                Utilidad/alum:{' '}
                {formatMoney(
                  simulatedMetrics.lockedPriceProfitPerStudent,
                  sheet.currencyCode
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
              <span className="text-[11px] text-slate-500">
                Precio Alumno en Pesos (TC {effectiveSimFx.toFixed(2)})
              </span>
              <div className="text-lg font-bold font-mono tabular-nums text-[#0B3B70]">
                {formatMoney(
                  simulatedMetrics.simCalc.estimadoEnPesosPerParticipant,
                  'MXN'
                )}
              </div>
              <div className="text-[11px] font-mono text-slate-600">
                Utilidad Grupo:{' '}
                {formatMoney(simulatedMetrics.lockedPriceGroupProfitMXN, 'MXN')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface EEColumnComparatorProps {
  request: TravelRequest;
  adminCustomRubros: AdminCustomRubroTemplate[];
  onSelectScenarioToEdit: (scenarioId: string) => void;
  onDuplicateScenario: () => void;
}

/**
 * Multi-Column Vertical Scenario Comparator (OPCIÓN 1 | OPCIÓN 2 | OPCIÓN 3 ...)
 * Displays all rubros of Conceptos + totals + Gastos de Chaperones aligned in parallel columns,
 * with automatic Lowest-Cost / Best-Margin delta indicators and Client Presentation Mode.
 */
export const EEColumnComparator: React.FC<EEColumnComparatorProps> = ({
  request,
  adminCustomRubros,
  onSelectScenarioToEdit,
  onDuplicateScenario,
}) => {
  const [clientPresentationMode, setClientPresentationMode] = useState(false);

  const sheetsWithCalcs = request.scenarios.map((sc, idx) => {
    const sheet = ensureScenarioHasEESheet(
      sc,
      idx,
      request.programType,
      `${request.city}, ${request.country}`,
      adminCustomRubros
    );
    return {
      scenario: sc,
      sheet,
      calc: calculateEESheet(sheet),
      schedule: buildPaymentScheduleForSheet(sheet),
    };
  });

  // Identify lowest final price in MXN across columns for delta comparison
  const minPesosPerParticipant =
    sheetsWithCalcs.length > 0
      ? Math.min(...sheetsWithCalcs.map((s) => s.calc.estimadoEnPesosPerParticipant))
      : 0;

  const maxCommissionInPesos =
    sheetsWithCalcs.length > 0
      ? Math.max(...sheetsWithCalcs.map((s) => s.calc.comisionGroupTotalInPesos))
      : 0;

  // Collect union of all Concepto labels across all scenarios to align rows horizontally
  const allConceptoLabels = Array.from(
    new Set(
      sheetsWithCalcs.flatMap((item) => item.sheet.conceptos.map((c) => c.label))
    )
  );

  // Collect union of all Chaperone rubro labels across all scenarios
  const allChaperoneLabels = Array.from(
    new Set(
      sheetsWithCalcs.flatMap((item) =>
        item.sheet.chaperoneRubros.map((c) => c.label)
      )
    )
  );

  const handleExportColumnsCSV = () => {
    const headers = [
      'Rubro / Concepto',
      ...sheetsWithCalcs.map(
        (s) => `${s.sheet.optionTitle} (${s.sheet.participants} part.)`
      ),
    ];

    const rows: (string | number)[][] = [
      ['Programa', ...sheetsWithCalcs.map((s) => s.sheet.programTitle)],
      ['Destino', ...sheetsWithCalcs.map((s) => s.sheet.destinationSubtitle)],
      [
        'Divisa y Tipo de Cambio',
        ...sheetsWithCalcs.map(
          (s) => `${s.sheet.currencyLabel} (${s.sheet.exchangeRate})`
        ),
      ],
      ['Participantes', ...sheetsWithCalcs.map((s) => s.sheet.participants)],
      ['Días', ...sheetsWithCalcs.map((s) => s.sheet.days)],
      ...allConceptoLabels.map((label) => [
        label,
        ...sheetsWithCalcs.map((s) => {
          const found = s.sheet.conceptos.find((c) => c.label === label);
          return found ? found.amount : 0;
        }),
      ]),
      ['SubTotal 1', ...sheetsWithCalcs.map((s) => s.calc.subTotal1Conceptos)],
      ['Gastos del líder', ...sheetsWithCalcs.map((s) => s.calc.gastosDelLider)],
      [
        'Compensación del líder',
        ...sheetsWithCalcs.map((s) => s.calc.compensacionDelLider),
      ],
      ['SubTotal 2', ...sheetsWithCalcs.map((s) => s.calc.subTotal2ConLider)],
      [
        '% Comisión',
        ...sheetsWithCalcs.map(
          (s) => `${s.calc.effectiveCommissionPercent.toFixed(2)}%`
        ),
      ],
      [
        'Comisión por participante',
        ...sheetsWithCalcs.map((s) => s.calc.comisionPerParticipant),
      ],
      [
        'Comisión total grupo (Divisa)',
        ...sheetsWithCalcs.map((s) => s.calc.comisionGroupTotalInCurrency),
      ],
      ['PRECIO FINAL (Divisa)', ...sheetsWithCalcs.map((s) => s.calc.precioFinalInCurrency)],
      [
        'Estimado en pesos (Por alumno)',
        ...sheetsWithCalcs.map((s) => s.calc.estimadoEnPesosPerParticipant),
      ],
      [
        'Comisión total en pesos',
        ...sheetsWithCalcs.map((s) => s.calc.comisionGroupTotalInPesos),
      ],
      [
        'Chaperones (Escuela / EE)',
        ...sheetsWithCalcs.map(
          (s) => `${s.sheet.chaperonesEscuela} / ${s.sheet.chaperonesEE}`
        ),
      ],
      ...allChaperoneLabels.map((label) => [
        `Chaperón: ${label}`,
        ...sheetsWithCalcs.map((s) => {
          const found = s.sheet.chaperoneRubros.find((c) => c.label === label);
          return found ? found.amount : 0;
        }),
      ]),
      [
        'SubTotal Chaperones',
        ...sheetsWithCalcs.map((s) => s.calc.subTotalChaperones),
      ],
      ['Fondo Emergencia', ...sheetsWithCalcs.map((s) => s.calc.emergencyFund)],
      ['Total Chaperones', ...sheetsWithCalcs.map((s) => s.calc.totalChaperones)],
    ];

    exportToExcelCSV(`Comparativo_Columnas_${request.folio}.csv`, headers, rows);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
      <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Columns3 className="w-4 h-4 text-[#0B3B70]" />
            Comparativo de Escenarios en Columnas Verticales ({sheetsWithCalcs.length} opciones)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {clientPresentationMode
              ? 'Modo Presentación Cliente activo: se ocultan comisiones y márgenes internos para proyección directa con la institución.'
              : 'Visualización comparativa lado a lado con indicadores automáticos de diferencia financiera (Δ), rentabilidad y plan de pagos.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setClientPresentationMode((prev) => !prev)}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg border flex items-center gap-1.5 transition-colors ${
              clientPresentationMode
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold'
                : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
            title="Ocultar comisiones y márgenes internos al proyectar pantalla al cliente"
          >
            {clientPresentationMode ? (
              <>
                <EyeOff className="w-3.5 h-3.5" /> Vista Cliente Activa (Mostrar Costos Internos)
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" /> Modo Presentación Cliente
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onDuplicateScenario}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5"
          >
            <Copy className="w-3.5 h-3.5" /> + Añadir Otra Opción / Columna
          </button>
          <button
            type="button"
            onClick={handleExportColumnsCSV}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0B3B70] rounded-lg hover:bg-[#082d56] flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4" /> Exportar Columnas a Excel
          </button>
        </div>
      </div>

      {/* Multi-Column Comparison Matrix */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[#0B3B70] text-white">
              <th className="py-3 px-4 text-left min-w-[240px] sticky left-0 bg-[#0B3B70] z-10 border-r border-blue-800">
                Rubro / Concepto Oficial
              </th>
              {sheetsWithCalcs.map(({ scenario, sheet, calc }) => {
                const isLowestPrice =
                  sheetsWithCalcs.length > 1 &&
                  Math.abs(calc.estimadoEnPesosPerParticipant - minPesosPerParticipant) < 1;
                const isHighestCommission =
                  !clientPresentationMode &&
                  sheetsWithCalcs.length > 1 &&
                  Math.abs(calc.comisionGroupTotalInPesos - maxCommissionInPesos) < 1;

                return (
                  <th
                    key={scenario.id}
                    className="py-3 px-4 text-right min-w-[235px] border-r border-blue-800 align-top"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono text-sky-200">
                        v{scenario.currentVersion} · {scenario.approvalStatus}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectScenarioToEdit(scenario.id)}
                        className="text-[11px] underline text-white hover:text-sky-200 font-normal"
                      >
                        Editar columna
                      </button>
                    </div>
                    <div className="text-sm font-bold mt-1">{sheet.optionTitle}</div>
                    <div className="text-[11px] font-normal text-blue-100 truncate">
                      {sheet.programTitle} · {sheet.destinationSubtitle}
                    </div>
                    <div className="mt-1.5 flex flex-wrap justify-end gap-2 text-[10px] font-sans font-medium">
                      {isLowestPrice && (
                        <span className="text-emerald-300">
                          ★ Menor precio por alumno
                        </span>
                      )}
                      {isHighestCommission && (
                        <span className="text-amber-300">
                          ◆ Mayor utilidad grupal
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
            {/* Parámetros Superiores */}
            <tr className="bg-slate-100 font-semibold text-slate-800">
              <td className="py-2 px-4 font-sans sticky left-0 bg-slate-100 border-r border-slate-200">
                Divisa y Tipo de Cambio
              </td>
              {sheetsWithCalcs.map(({ scenario, sheet }) => (
                <td
                  key={scenario.id}
                  className="py-2 px-4 text-right border-r border-slate-200"
                >
                  {sheet.currencyLabel} ({sheet.currencyCode}) · TC {sheet.exchangeRate}
                </td>
              ))}
            </tr>

            <tr className="bg-slate-50">
              <td className="py-2 px-4 font-sans font-medium text-slate-700 sticky left-0 bg-slate-50 border-r border-slate-200">
                Participantes / Días de Viaje
              </td>
              {sheetsWithCalcs.map(({ scenario, sheet }) => (
                <td
                  key={scenario.id}
                  className="py-2 px-4 text-right font-bold text-slate-900 border-r border-slate-200"
                >
                  {sheet.participants} participantes · {sheet.days} días
                </td>
              ))}
            </tr>

            {/* Plan de Pagos Resumido por Columna */}
            <tr className="bg-blue-50/50">
              <td className="py-2 px-4 font-sans font-semibold text-[#0B3B70] sticky left-0 bg-blue-50 border-r border-slate-200">
                Esquema de Plan de Pagos
              </td>
              {sheetsWithCalcs.map(({ scenario, sheet, schedule }) => {
                const reg = schedule.find((p) => p.number === 0);
                const firstInst = schedule.find((p) => p.number === 1);
                const instCount = schedule.filter((p) => p.number > 0).length;
                return (
                  <td
                    key={scenario.id}
                    className="py-2 px-4 text-right border-r border-slate-200 text-[11px]"
                  >
                    <div className="font-semibold text-[#0B3B70]">
                      {reg ? `Inscripción + ${instCount} pagos` : `${instCount} pagos`}
                    </div>
                    {reg && (
                      <div className="text-slate-600">
                        Insc.: {formatMoney(reg.amountInCurrency, sheet.currencyCode)}
                      </div>
                    )}
                    {firstInst && (
                      <div className="text-slate-500">
                        {instCount}× {formatMoney(firstInst.amountInCurrency, sheet.currencyCode)}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>

            {/* Encabezado Bloque 1: Conceptos */}
            <tr className="bg-[#134E6F] text-white font-semibold">
              <td
                colSpan={sheetsWithCalcs.length + 1}
                className="py-1.5 px-4 font-sans text-xs tracking-wide"
              >
                BLOQUE 1 — CONCEPTOS POR PARTICIPANTE
              </td>
            </tr>

            {allConceptoLabels.map((label) => {
              const rowValues = sheetsWithCalcs.map((s) => {
                const found = s.sheet.conceptos.find((c) => c.label === label);
                return found ? found.amount : 0;
              });
              const minRowVal = Math.min(...rowValues);
              const maxRowVal = Math.max(...rowValues);
              const hasVariance = maxRowVal !== minRowVal;

              return (
                <tr key={label} className="hover:bg-slate-50">
                  <td className="py-1.5 px-4 font-sans italic text-slate-800 sticky left-0 bg-white border-r border-slate-200">
                    <div className="flex items-center justify-between gap-2">
                      <span>{label}</span>
                      {hasVariance && sheetsWithCalcs.length > 1 && (
                        <span className="text-[10px] not-italic text-blue-700 font-mono">
                          Δ {formatMoney(maxRowVal - minRowVal, sheetsWithCalcs[0]?.sheet.currencyCode || 'USD')}
                        </span>
                      )}
                    </div>
                  </td>
                  {sheetsWithCalcs.map(({ scenario, sheet }) => {
                    const item = sheet.conceptos.find((c) => c.label === label);
                    const isMinInRow =
                      hasVariance &&
                      sheetsWithCalcs.length > 1 &&
                      item &&
                      item.amount === minRowVal;
                    return (
                      <td
                        key={scenario.id}
                        className={`py-1.5 px-4 text-right border-r border-slate-200 ${
                          isMinInRow ? 'bg-emerald-50/40 font-semibold text-emerald-900' : ''
                        }`}
                      >
                        {item ? (
                          <div>
                            <span>{formatMoney(item.amount, sheet.currencyCode)}</span>
                            {item.note && (
                              <span className="ml-1.5 text-[11px] font-sans text-slate-500">
                                ({item.note})
                              </span>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* SubTotal 1 */}
            <tr className="bg-slate-200 font-bold text-slate-900">
              <td className="py-2 px-4 font-sans italic sticky left-0 bg-slate-200 border-r border-slate-300">
                SubTotal
              </td>
              {sheetsWithCalcs.map(({ scenario, sheet, calc }) => (
                <td
                  key={scenario.id}
                  className="py-2 px-4 text-right border-r border-slate-300"
                >
                  {formatMoney(calc.subTotal1Conceptos, sheet.currencyCode)}
                </td>
              ))}
            </tr>

            {/* Gastos del líder */}
            <tr className="hover:bg-slate-50">
              <td className="py-1.5 px-4 font-sans italic text-slate-800 sticky left-0 bg-white border-r border-slate-200">
                Gastos del lider
              </td>
              {sheetsWithCalcs.map(({ scenario, sheet, calc }) => (
                <td
                  key={scenario.id}
                  className="py-1.5 px-4 text-right border-r border-slate-200"
                >
                  {formatMoney(calc.gastosDelLider, sheet.currencyCode)}
                </td>
              ))}
            </tr>

            {/* Compensación del líder */}
            <tr className="hover:bg-slate-50">
              <td className="py-1.5 px-4 font-sans italic text-slate-800 sticky left-0 bg-white border-r border-slate-200">
                Compensación del lider
              </td>
              {sheetsWithCalcs.map(({ scenario, sheet, calc }) => (
                <td
                  key={scenario.id}
                  className="py-1.5 px-4 text-right border-r border-slate-200"
                >
                  {formatMoney(calc.compensacionDelLider, sheet.currencyCode)}
                </td>
              ))}
            </tr>

            {/* SubTotal 2 */}
            {!clientPresentationMode && (
              <tr className="bg-slate-200 font-bold text-slate-900">
                <td className="py-2 px-4 font-sans italic sticky left-0 bg-slate-200 border-r border-slate-300">
                  SubTotal (Con Líder)
                </td>
                {sheetsWithCalcs.map(({ scenario, sheet, calc }) => (
                  <td
                    key={scenario.id}
                    className="py-2 px-4 text-right border-r border-slate-300"
                  >
                    {formatMoney(calc.subTotal2ConLider, sheet.currencyCode)}
                  </td>
                ))}
              </tr>
            )}

            {/* % Comisión (Hidden in Client Presentation Mode) */}
            {!clientPresentationMode && (
              <tr className="hover:bg-slate-50">
                <td className="py-1.5 px-4 font-sans italic text-slate-800 sticky left-0 bg-white border-r border-slate-200">
                  % Comisión
                </td>
                {sheetsWithCalcs.map(({ scenario, calc }) => {
                  const pct = calc.effectiveCommissionPercent;
                  const color =
                    pct >= 18
                      ? 'text-emerald-700'
                      : pct >= 14
                        ? 'text-amber-700'
                        : 'text-red-700';
                  return (
                    <td
                      key={scenario.id}
                      className={`py-1.5 px-4 text-right italic font-semibold border-r border-slate-200 ${color}`}
                    >
                      {pct.toFixed(2)}%
                    </td>
                  );
                })}
              </tr>
            )}

            {/* Comision (Unitaria y Total Grupo) (Hidden in Client Presentation Mode) */}
            {!clientPresentationMode && (
              <tr className="hover:bg-slate-50">
                <td className="py-1.5 px-4 font-sans italic text-slate-800 sticky left-0 bg-white border-r border-slate-200">
                  Comision (Por Alumno / Total Grupo)
                </td>
                {sheetsWithCalcs.map(({ scenario, sheet, calc }) => (
                  <td
                    key={scenario.id}
                    className="py-1.5 px-4 text-right border-r border-slate-200"
                  >
                    <span className="font-semibold text-slate-900">
                      {formatMoney(calc.comisionPerParticipant, sheet.currencyCode)}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      Grupo: {formatMoney(calc.comisionGroupTotalInCurrency, sheet.currencyCode)}
                    </span>
                  </td>
                ))}
              </tr>
            )}

            {/* PRECIO FINAL */}
            <tr className="bg-sky-200/80 font-bold text-[#0B3B70] text-sm">
              <td className="py-2.5 px-4 font-sans italic sticky left-0 bg-sky-200 border-r border-sky-300">
                PRECIO FINAL POR PARTICIPANTE
              </td>
              {sheetsWithCalcs.map(({ scenario, sheet, calc }) => (
                <td
                  key={scenario.id}
                  className="py-2.5 px-4 text-right border-r border-sky-300"
                >
                  {formatMoney(calc.precioFinalInCurrency, sheet.currencyCode)}{' '}
                  {sheet.currencyCode}
                </td>
              ))}
            </tr>

            {/* Estimado en pesos + Automatic Delta vs Best Option */}
            <tr className="bg-[#134E6F] text-white font-bold">
              <td className="py-2.5 px-4 font-sans sticky left-0 bg-[#134E6F] border-r border-blue-900">
                {clientPresentationMode
                  ? 'Estimado en pesos por Alumno (MXN)'
                  : 'Estimado en pesos (Alumno / Comisión MXN)'}
              </td>
              {sheetsWithCalcs.map(({ scenario, calc }) => {
                const deltaVsMin =
                  calc.estimadoEnPesosPerParticipant - minPesosPerParticipant;
                return (
                  <td
                    key={scenario.id}
                    className="py-2.5 px-4 text-right border-r border-blue-900"
                  >
                    <div className="text-sm">
                      {formatMoney(calc.estimadoEnPesosPerParticipant, 'MXN')}
                    </div>
                    {sheetsWithCalcs.length > 1 && (
                      <div className="text-[11px] font-normal text-emerald-300">
                        {deltaVsMin < 1
                          ? '★ Opción más económica'
                          : `Δ +${formatMoney(deltaVsMin, 'MXN')} vs mín.`}
                      </div>
                    )}
                    {!clientPresentationMode && (
                      <div className="text-[11px] text-sky-200 font-normal mt-0.5">
                        Comisión MXN: {formatMoney(calc.comisionGroupTotalInPesos, 'MXN')}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>

            {/* Encabezado Bloque 2: Gastos de Chaperones */}
            <tr className="bg-slate-700 text-white font-semibold">
              <td
                colSpan={sheetsWithCalcs.length + 1}
                className="py-1.5 px-4 font-sans text-xs tracking-wide"
              >
                BLOQUE 2 — GASTOS DE CHAPERONES (ESCUELA VS EE)
              </td>
            </tr>

            <tr className="bg-blue-50/70">
              <td className="py-1.5 px-4 font-sans font-medium text-slate-800 sticky left-0 bg-blue-50 border-r border-slate-200">
                Chaperones (Escuela | EE)
              </td>
              {sheetsWithCalcs.map(({ scenario, sheet }) => (
                <td
                  key={scenario.id}
                  className="py-1.5 px-4 text-right font-semibold border-r border-slate-200"
                >
                  Escuela: {sheet.chaperonesEscuela} · EE: {sheet.chaperonesEE}
                </td>
              ))}
            </tr>

            <tr className="hover:bg-slate-50">
              <td className="py-1.5 px-4 font-sans text-slate-700 sticky left-0 bg-white border-r border-slate-200">
                Gastos por día (Tarifa / Total)
              </td>
              {sheetsWithCalcs.map(({ scenario, sheet }) => (
                <td
                  key={scenario.id}
                  className="py-1.5 px-4 text-right border-r border-slate-200"
                >
                  {formatMoney(sheet.dailyExpenseRate, sheet.currencyCode)} /{' '}
                  <strong>
                    {formatMoney(sheet.dailyExpenseCalculatedTotal, sheet.currencyCode)}
                  </strong>
                </td>
              ))}
            </tr>

            {allChaperoneLabels.map((label) => (
              <tr key={label} className="hover:bg-slate-50">
                <td className="py-1.5 px-4 font-sans text-slate-700 sticky left-0 bg-white border-r border-slate-200">
                  {label}
                </td>
                {sheetsWithCalcs.map(({ scenario, sheet }) => {
                  const found = sheet.chaperoneRubros.find((c) => c.label === label);
                  return (
                    <td
                      key={scenario.id}
                      className="py-1.5 px-4 text-right border-r border-slate-200"
                    >
                      {found ? formatMoney(found.amount, sheet.currencyCode) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}

            <tr className="bg-slate-600 text-white font-semibold">
              <td className="py-2 px-4 font-sans sticky left-0 bg-slate-600 border-r border-slate-500">
                SubTotal Chaperones
              </td>
              {sheetsWithCalcs.map(({ scenario, sheet, calc }) => (
                <td
                  key={scenario.id}
                  className="py-2 px-4 text-right border-r border-slate-500"
                >
                  {formatMoney(calc.subTotalChaperones, sheet.currencyCode)}
                </td>
              ))}
            </tr>

            <tr className="bg-slate-500 text-white">
              <td className="py-1.5 px-4 font-sans sticky left-0 bg-slate-500 border-r border-slate-400">
                Fondo Emergencia
              </td>
              {sheetsWithCalcs.map(({ scenario, sheet, calc }) => (
                <td
                  key={scenario.id}
                  className="py-1.5 px-4 text-right border-r border-slate-400"
                >
                  {formatMoney(calc.emergencyFund, sheet.currencyCode)}
                </td>
              ))}
            </tr>

            <tr className="bg-slate-900 text-white font-bold">
              <td className="py-2.5 px-4 font-sans sticky left-0 bg-slate-900 border-r border-slate-800">
                Total Chaperones
              </td>
              {sheetsWithCalcs.map(({ scenario, sheet, calc }) => (
                <td
                  key={scenario.id}
                  className="py-2.5 px-4 text-right border-r border-slate-800"
                >
                  {formatMoney(calc.totalChaperones, sheet.currencyCode)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

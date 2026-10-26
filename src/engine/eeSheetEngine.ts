import {
  AdminCustomRubroTemplate,
  CurrencyCode,
  EERubroRow,
  EESheetModel,
  FreePlacesRuleConfig,
  ItineraryDayEntry,
  PaymentPlanConfig,
  PaymentPlanInstallment,
  QuoteScenario,
  SavedSheetTemplate,
  VolumePricingTier,
} from '../types/domain';

export interface EESheetCalculationOutput {
  // Right block: Chaperones
  totalChaperonCount: number;
  subTotalPerChaperon: number;
  subTotalChaperones: number;
  emergencyFund: number;
  totalChaperones: number;
  // Left block: Conceptos
  subTotal1Conceptos: number;
  gastosDelLider: number;
  compensacionDelLider: number;
  subTotal2ConLider: number;
  effectiveCommissionPercent: number;
  comisionPerParticipant: number;
  comisionGroupTotalInCurrency: number;
  precioFinalInCurrency: number;
  estimadoEnPesosPerParticipant: number;
  comisionGroupTotalInPesos: number;
  totalGrupoEnPesos: number;
}

const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  GBP: 'Libras',
  USD: 'Dólares USD',
  CAD: 'Dólares CAD',
  EUR: 'Euros',
  MXN: 'Pesos MXN',
};

export function getCurrencyDisplayName(code: CurrencyCode): string {
  return CURRENCY_LABELS[code] || code;
}

export const DEFAULT_PAYMENT_PLAN_CONFIG: PaymentPlanConfig = {
  includeRegistrationFee: true,
  registrationFeeMode: 'percent',
  registrationFeeValue: 15,
  registrationDueDate: '2026-11-15',
  installmentsCount: 6,
  frequency: 'mensual',
  firstInstallmentDate: '2026-12-15',
  customInstallmentDates: {},
};

export function ensurePaymentPlanConfig(
  plan?: PaymentPlanConfig
): PaymentPlanConfig {
  if (!plan) return { ...DEFAULT_PAYMENT_PLAN_CONFIG, customInstallmentDates: {} };
  return {
    includeRegistrationFee:
      typeof plan.includeRegistrationFee === 'boolean'
        ? plan.includeRegistrationFee
        : true,
    registrationFeeMode: plan.registrationFeeMode || 'percent',
    registrationFeeValue:
      typeof plan.registrationFeeValue === 'number' && plan.registrationFeeValue >= 0
        ? plan.registrationFeeValue
        : 15,
    registrationDueDate: plan.registrationDueDate || '2026-11-15',
    installmentsCount: Math.min(
      15,
      Math.max(1, Math.round(Number(plan.installmentsCount) || 6))
    ),
    frequency: plan.frequency || 'mensual',
    firstInstallmentDate: plan.firstInstallmentDate || '2026-12-15',
    customInstallmentDates: plan.customInstallmentDates || {},
  };
}

export const DEFAULT_FREE_PLACES_RULE: FreePlacesRuleConfig = {
  enabled: true,
  studentsPerFreePlace: 10,
  benefitTarget: 'chaperon_gratis',
  scholarshipUnitValueInCurrency: 0,
};

export function ensureFreePlacesRule(
  rule?: FreePlacesRuleConfig
): FreePlacesRuleConfig {
  if (!rule) return { ...DEFAULT_FREE_PLACES_RULE };
  return {
    enabled: typeof rule.enabled === 'boolean' ? rule.enabled : true,
    studentsPerFreePlace: Math.max(
      1,
      Math.round(Number(rule.studentsPerFreePlace) || 10)
    ),
    benefitTarget: rule.benefitTarget || 'chaperon_gratis',
    scholarshipUnitValueInCurrency: Number(rule.scholarshipUnitValueInCurrency) || 0,
  };
}

export function calculateFreePlacesSummary(sheet: EESheetModel): {
  rule: FreePlacesRuleConfig;
  earnedFreePlaces: number;
  studentsUntilNextFreePlace: number;
  unitNetPriceInCurrency: number;
  totalFreePlaceBenefitInCurrency: number;
  perStudentScholarshipInCurrency: number;
} {
  const rule = ensureFreePlacesRule(sheet.freePlacesRule);
  const safePart = Math.max(1, Number(sheet.participants) || 1);
  const ratio = Math.max(1, rule.studentsPerFreePlace);
  const earnedFreePlaces = rule.enabled ? Math.floor(safePart / ratio) : 0;
  const remainder = safePart % ratio;
  const studentsUntilNextFreePlace = ratio - remainder;

  const netRow = sheet.conceptos.find(
    (c) => c.id === 'rub_precio_neto' || c.label.toLowerCase().includes('precio neto')
  );
  const unitNetPriceInCurrency =
    rule.scholarshipUnitValueInCurrency && rule.scholarshipUnitValueInCurrency > 0
      ? rule.scholarshipUnitValueInCurrency
      : netRow
        ? Number(netRow.amount) || 0
        : 1500;

  const totalFreePlaceBenefitInCurrency =
    earnedFreePlaces * unitNetPriceInCurrency;
  const perStudentScholarshipInCurrency =
    safePart > 0
      ? Math.round((totalFreePlaceBenefitInCurrency / safePart) * 100) / 100
      : 0;

  return {
    rule,
    earnedFreePlaces,
    studentsUntilNextFreePlace,
    unitNetPriceInCurrency,
    totalFreePlaceBenefitInCurrency,
    perStudentScholarshipInCurrency,
  };
}

/**
 * Generates a Tiered Volume Pricing Matrix (e.g., 15-19, 20-24, 25-29, 30-34, 35+ alumnos)
 * recalculating prorated chaperone/leader expenses and free places per bracket.
 */
export function buildVolumePricingTiersForSheet(
  sheet: EESheetModel,
  brackets: number[] = [15, 20, 25, 30, 35]
): VolumePricingTier[] {
  const baseCalc = calculateEESheet(sheet);
  const fx = Math.max(0.0001, Number(sheet.exchangeRate) || 1);
  const rule = ensureFreePlacesRule(sheet.freePlacesRule);
  const targetMarginPct = baseCalc.effectiveCommissionPercent;

  return brackets.map((pax, idx) => {
    const nextBracket = brackets[idx + 1];
    const tierLabel = nextBracket
      ? `${pax} a ${nextBracket - 1} alumnos`
      : `${pax}+ alumnos`;

    const earnedFree = rule.enabled
      ? Math.floor(pax / Math.max(1, rule.studentsPerFreePlace))
      : 0;
    const totalChaperonesCount = Math.max(
      1,
      earnedFree > 0 ? earnedFree : baseCalc.totalChaperonCount
    );

    const leaderCostPerStudent =
      Math.round((baseCalc.totalChaperones / Math.max(1, pax)) * 100) / 100;
    const subTotal2ForTier =
      baseCalc.subTotal1Conceptos +
      leaderCostPerStudent +
      baseCalc.compensacionDelLider;

    // Maintain the scenario's effective commission percentage across volume brackets so economies of scale benefit the student price
    const comisionPerStudent = subTotal2ForTier * (targetMarginPct / 100);
    const sellingPriceInCurrency =
      Math.round((subTotal2ForTier + comisionPerStudent) * 100) / 100;
    const sellingPriceInMXN =
      Math.round(sellingPriceInCurrency * fx * 100) / 100;
    const totalGroupInMXN = Math.round(sellingPriceInMXN * pax * 100) / 100;

    return {
      tierLabel,
      participants: pax,
      chaperones: totalChaperonesCount,
      earnedFreePlaces: earnedFree,
      leaderCostPerStudentInCurrency: leaderCostPerStudent,
      sellingPriceInCurrency,
      sellingPriceInMXN,
      totalGroupInMXN,
      marginPercent: Math.round(targetMarginPct * 100) / 100,
    };
  });
}

/**
 * Builds a suggested Day-by-Day Academic & Cultural Itinerary tailored to destination & duration.
 */
export function buildSuggestedItineraryDays(
  destinationText: string,
  totalDays: number = 7
): ItineraryDayEntry[] {
  const dLower = (destinationText || '').toLowerCase();
  const count = Math.min(21, Math.max(3, Number(totalDays) || 7));

  if (dLower.includes('londres') || dLower.includes('oxford') || dLower.includes('uk') || dLower.includes('reino unido')) {
    const ukBase: Omit<ItineraryDayEntry, 'dayNumber'>[] = [
      {
        title: 'Salida Internacional y Llegada a Londres Heathrow',
        location: 'Londres, Reino Unido',
        morningActivity: 'Recepción en aeropuerto LHR y traslado privado en coach ejecutivo hacia residencia estudiantil.',
        afternoonActivity: 'Check-in en campus, recorrido de orientación y entrega de Welcome Pack & Oyster Card.',
        eveningActivity: 'Cena de bienvenida en comedor histórico e integración grupal.',
        mealsIncluded: 'Cena',
        accommodation: 'Residencia Universitaria Londres',
      },
      {
        title: 'Placement Test Académico & Westminster Walking Tour',
        location: 'Londres, Reino Unido',
        morningActivity: 'Examen diagnóstico y primer bloque de sesiones académicas de inglés y liderazgo.',
        afternoonActivity: 'Recorrido guiado por Houses of Parliament, Big Ben, Westminster Abbey y Buckingham Palace.',
        eveningActivity: 'Taller interactivo de cultura británica en campus.',
        mealsIncluded: 'Desayuno, Comida y Cena',
        accommodation: 'Residencia Universitaria Londres',
      },
      {
        title: 'British Museum, Covent Garden & Thames River Cruise',
        location: 'Londres, Reino Unido',
        morningActivity: 'Seminario de comunicación internacional y proyectos colaborativos en aula.',
        afternoonActivity: 'Visita académica al British Museum (Piedra Rosetta y Parthenon Galleries).',
        eveningActivity: 'Crucero privado al atardecer por el Río Támesis desde Westminster hasta Tower Bridge.',
        mealsIncluded: 'Desayuno, Comida y Cena',
        accommodation: 'Residencia Universitaria Londres',
      },
      {
        title: 'Inmersión Universitaria en Oxford & Christ Church College',
        location: 'Oxford, Reino Unido',
        morningActivity: 'Traslado a la ciudad universitaria de Oxford y sesión sobre admisiones internacionales.',
        afternoonActivity: 'Visita guiada a Bodleian Library, Radcliffe Camera y Christ Church College.',
        eveningActivity: 'Debate estudiantil estilo Oxford Union y cena formal.',
        mealsIncluded: 'Desayuno, Comida y Cena',
        accommodation: 'Colegio Mayor Oxford',
      },
      {
        title: 'Science Museum, South Kensington & West End Musical',
        location: 'Londres, Reino Unido',
        morningActivity: 'Taller de innovación STEM y sustentabilidad global.',
        afternoonActivity: 'Exploración guiada en Science Museum y Natural History Museum.',
        eveningActivity: 'Función de teatro musical en el West End de Londres.',
        mealsIncluded: 'Desayuno, Comida y Cena',
        accommodation: 'Residencia Universitaria Londres',
      },
      {
        title: 'Windsor Castle & Presentación de Proyectos Finales',
        location: 'Windsor & Londres',
        morningActivity: 'Presentación de proyectos finales por equipos y ceremonia de entrega de certificados.',
        afternoonActivity: 'Excursión cultural al Castillo de Windsor (State Apartments y St George’s Chapel).',
        eveningActivity: 'Cena de gala y clausura del programa Sol Camps UK.',
        mealsIncluded: 'Desayuno, Comida y Cena',
        accommodation: 'Residencia Universitaria Londres',
      },
      {
        title: 'Cierre de Experiencia y Vuelo de Regreso a México',
        location: 'Londres - Ciudad de México',
        morningActivity: 'Check-out de residencia y tiempo supervisado para compras de recuerdos en Regent Street.',
        afternoonActivity: 'Traslado privado a aeropuerto Londres Heathrow (LHR) y documentación de grupo.',
        eveningActivity: 'Vuelo transatlántico de regreso a casa.',
        mealsIncluded: 'Desayuno y Alimentos a bordo',
        accommodation: 'Vuelo Internacional',
      },
    ];
    return Array.from({ length: count }, (_, idx) => ({
      dayNumber: idx + 1,
      ...ukBase[idx % ukBase.length],
    }));
  }

  if (dLower.includes('boston') || dLower.includes('mit') || dLower.includes('orlando') || dLower.includes('nasa')) {
    const stemBase: Omit<ItineraryDayEntry, 'dayNumber'>[] = [
      {
        title: 'Arribo a Boston y Bienvenida en Campus Universitario',
        location: 'Boston, MA',
        morningActivity: 'Vuelo directo a Boston Logan (BOS) y recepción por staff académico.',
        afternoonActivity: 'Registro en residencia estudiantil y recorrido de seguridad por el campus.',
        eveningActivity: 'Cena de bienvenida y presentación de retos de robótica y liderazgo.',
        mealsIncluded: 'Cena',
        accommodation: 'Residencia Universitaria Boston',
      },
      {
        title: 'MIT Media Lab & Taller de Robótica Aplicada',
        location: 'Cambridge, MA',
        morningActivity: 'Workshop práctico de programación y diseño mecatrónico en laboratorio.',
        afternoonActivity: 'Recorrido académico oficial por el campus de MIT y visita al MIT Museum.',
        eveningActivity: 'Sesión de mentoría con estudiantes de ingeniería.',
        mealsIncluded: 'Desayuno, Comida y Cena',
        accommodation: 'Residencia Universitaria Boston',
      },
      {
        title: 'Harvard University & Freedom Trail Histórico',
        location: 'Cambridge & Boston, MA',
        morningActivity: 'Seminario de innovación, emprendimiento y preparación universitaria.',
        afternoonActivity: 'Tour guiado por Harvard Yard, Widener Library y caminata histórica por el Freedom Trail.',
        eveningActivity: 'Cena grupal en Quincy Market / Faneuil Hall.',
        mealsIncluded: 'Desayuno, Comida y Cena',
        accommodation: 'Residencia Universitaria Boston',
      },
      {
        title: 'Museum of Science, Charles River & Simulación Aeroespacial',
        location: 'Boston, MA',
        morningActivity: 'Laboratorio de inteligencia artificial y prototipado rápido.',
        afternoonActivity: 'Visita técnica al Museum of Science Boston y Planetario Charles Hayden.',
        eveningActivity: 'Recorrido en Duck Tour anfibio por el río Charles.',
        mealsIncluded: 'Desayuno, Comida y Cena',
        accommodation: 'Residencia Universitaria Boston',
      },
      {
        title: 'Demostración Final de Proyectos STEM & Graduación',
        location: 'Boston, MA',
        morningActivity: 'Competencia amistosa de robótica y evaluación del jurado académico.',
        afternoonActivity: 'Ceremonia de graduación, entrega de diplomas oficiales y visita al New England Aquarium.',
        eveningActivity: 'Cena de clausura con entrega de reconocimientos.',
        mealsIncluded: 'Desayuno, Comida y Cena',
        accommodation: 'Residencia Universitaria Boston',
      },
      {
        title: 'Regreso Internacional a México',
        location: 'Boston - México',
        morningActivity: 'Check-out de habitaciones y traslado en autobús ejecutivo al aeropuerto BOS.',
        afternoonActivity: 'Vuelo de regreso y arribo al aeropuerto de origen.',
        eveningActivity: 'Entrega del grupo a padres de familia y cierre de bitácora.',
        mealsIncluded: 'Desayuno',
        accommodation: 'Fin de Servicios',
      },
    ];
    return Array.from({ length: count }, (_, idx) => ({
      dayNumber: idx + 1,
      ...stemBase[idx % stemBase.length],
    }));
  }

  // Default / Canada / Europe rich academic itinerary
  const generalBase: Omit<ItineraryDayEntry, 'dayNumber'>[] = [
    {
      title: 'Llegada al Destino Internacional y Orientación en Campus',
      location: destinationText || 'Destino Internacional',
      morningActivity: 'Arribo al aeropuerto internacional y recepción privada por el equipo receptor.',
      afternoonActivity: 'Traslado a alojamiento estudiantil, asignación de habitaciones y tour de bienvenida.',
      eveningActivity: 'Cena de integración grupal y revisión del reglamento de seguridad.',
      mealsIncluded: 'Cena',
      accommodation: 'Residencia / Alojamiento Estudiantil',
    },
    {
      title: 'Inicio de Sesiones Académicas y Recorrido del Centro Histórico',
      location: destinationText || 'Destino Internacional',
      morningActivity: 'Evaluación diagnóstica y primer módulo de clases interactivas.',
      afternoonActivity: 'Visita guiada por los monumentos históricos y puntos emblemáticos de la ciudad.',
      eveningActivity: 'Actividad recreativa nocturna supervisada por chaperones.',
      mealsIncluded: 'Desayuno, Comida y Cena',
      accommodation: 'Residencia / Alojamiento Estudiantil',
    },
    {
      title: 'Inmersión Cultural, Museos y Taller de Liderazgo',
      location: destinationText || 'Destino Internacional',
      morningActivity: 'Taller de trabajo en equipo, comunicación intercultural y liderazgo.',
      afternoonActivity: 'Entrada guiada al museo principal de ciencia e historia.',
      eveningActivity: 'Noche de talentos e intercambio con estudiantes internacionales.',
      mealsIncluded: 'Desayuno, Comida y Cena',
      accommodation: 'Residencia / Alojamiento Estudiantil',
    },
    {
      title: 'Excursión de Día Completo e Inmersión en Naturaleza / Universidad',
      location: destinationText || 'Destino Internacional',
      morningActivity: 'Salida en autobús privado hacia excursión regional académica y cultural.',
      afternoonActivity: 'Recorrido por campus universitario socio y actividades al aire libre.',
      eveningActivity: 'Regreso al alojamiento y cena grupal.',
      mealsIncluded: 'Desayuno, Comida y Cena',
      accommodation: 'Residencia / Alojamiento Estudiantil',
    },
    {
      title: 'Presentación de Proyectos, Certificación y Cena de Clausura',
      location: destinationText || 'Destino Internacional',
      morningActivity: 'Presentación final de proyectos académicos ante profesores.',
      afternoonActivity: 'Ceremonia oficial de entrega de certificados y fotografía grupal.',
      eveningActivity: 'Cena de despedida y entrega de reconocimientos.',
      mealsIncluded: 'Desayuno, Comida y Cena',
      accommodation: 'Residencia / Alojamiento Estudiantil',
    },
    {
      title: 'Traslado al Aeropuerto y Vuelo de Regreso',
      location: destinationText || 'Destino Internacional',
      morningActivity: 'Check-out y traslado privado al aeropuerto internacional.',
      afternoonActivity: 'Documentación grupal y vuelo de regreso a México.',
      eveningActivity: 'Llegada y entrega oficial de participantes.',
      mealsIncluded: 'Desayuno',
      accommodation: 'Fin de Servicios',
    },
  ];
  return Array.from({ length: count }, (_, idx) => ({
    dayNumber: idx + 1,
    ...generalBase[idx % generalBase.length],
  }));
}

function addDaysOrMonthsToDateString(
  baseDateStr: string,
  indexOffset: number,
  frequency: 'mensual' | 'quincenal' | 'semanal'
): string {
  const parts = (baseDateStr || '2026-12-15').split('-').map(Number);
  const year = parts[0] || 2026;
  const month = (parts[1] || 12) - 1;
  const day = parts[2] || 15;
  const dt = new Date(Date.UTC(year, month, day));

  if (frequency === 'mensual') {
    dt.setUTCMonth(dt.getUTCMonth() + indexOffset);
  } else if (frequency === 'quincenal') {
    dt.setUTCDate(dt.getUTCDate() + indexOffset * 15);
  } else {
    dt.setUTCDate(dt.getUTCDate() + indexOffset * 7);
  }

  return dt.toISOString().slice(0, 10);
}

/**
 * Generates the complete, reconciled Payment Plan (Inscripción + 1 to 15 payments)
 * for a given EE Sheet.
 */
export function buildPaymentScheduleForSheet(
  sheet: EESheetModel
): PaymentPlanInstallment[] {
  const calc = calculateEESheet(sheet);
  const plan = ensurePaymentPlanConfig(sheet.paymentPlan);
  const totalInCurrency = Math.max(0, calc.precioFinalInCurrency);
  const fx = Math.max(0.0001, Number(sheet.exchangeRate) || 1);
  const totalInMXN = Math.round(totalInCurrency * fx * 100) / 100;

  const schedule: PaymentPlanInstallment[] = [];

  let regAmountCurrency = 0;
  if (plan.includeRegistrationFee && totalInCurrency > 0) {
    if (plan.registrationFeeMode === 'percent') {
      const pct = Math.min(90, Math.max(0, plan.registrationFeeValue));
      regAmountCurrency = Math.round(totalInCurrency * (pct / 100) * 100) / 100;
    } else {
      regAmountCurrency = Math.min(
        totalInCurrency * 0.95,
        Math.max(0, Math.round(plan.registrationFeeValue * 100) / 100)
      );
    }

    const regPct =
      totalInCurrency > 0 ? (regAmountCurrency / totalInCurrency) * 100 : 0;
    const regMXN = Math.round(regAmountCurrency * fx * 100) / 100;

    schedule.push({
      number: 0,
      label: 'Inscripción / Apartado de Lugar',
      dueDate: plan.registrationDueDate,
      percentOfTotal: Math.round(regPct * 100) / 100,
      amountInCurrency: regAmountCurrency,
      amountInMXN: regMXN,
    });
  }

  const count = Math.min(15, Math.max(1, plan.installmentsCount));
  const remainingCurrency = Math.max(0, totalInCurrency - regAmountCurrency);
  const baseInstallmentCurrency =
    count > 0 ? Math.floor((remainingCurrency / count) * 100) / 100 : 0;

  let accumulatedCurrency = regAmountCurrency;
  let accumulatedMXN = schedule[0]?.amountInMXN || 0;

  for (let i = 1; i <= count; i++) {
    const isLast = i === count;
    const amountCurr = isLast
      ? Math.max(0, Math.round((totalInCurrency - accumulatedCurrency) * 100) / 100)
      : baseInstallmentCurrency;

    accumulatedCurrency += amountCurr;

    const amountMXN = isLast
      ? Math.max(0, Math.round((totalInMXN - accumulatedMXN) * 100) / 100)
      : Math.round(amountCurr * fx * 100) / 100;

    accumulatedMXN += amountMXN;

    const pct =
      totalInCurrency > 0
        ? Math.round((amountCurr / totalInCurrency) * 10000) / 100
        : Math.round((100 / count) * 100) / 100;

    const computedDate =
      plan.customInstallmentDates?.[i] ||
      addDaysOrMonthsToDateString(plan.firstInstallmentDate, i - 1, plan.frequency);

    schedule.push({
      number: i,
      label:
        isLast && count > 1
          ? `Pago ${i} de ${count} (Liquidación Final)`
          : `Pago ${i} de ${count}`,
      dueDate: computedDate,
      percentOfTotal: pct,
      amountInCurrency: amountCurr,
      amountInMXN: amountMXN,
    });
  }

  return schedule;
}

/**
 * Creates the exact "OPCIÓN 1 — Verano Grupal UK — Sol Camps Londres y Oxford" sheet
 * from the user's official EE quotation spreadsheet image.
 */
export function createOfficialUKExampleSheet(
  optionTitle: string = 'OPCION 1',
  participants: number = 20,
  chaperonesEE: number = 2,
  days: number = 21,
  exchangeRate: number = 26.5
): EESheetModel {
  return {
    optionTitle,
    programTitle: 'Verano Grupal UK',
    destinationSubtitle: 'Sol Camps Londres y Oxford',
    currencyLabel: 'Libras',
    currencyCode: 'GBP',
    exchangeRate,
    participants,
    days,
    conceptos: [
      { id: 'rub_precio_neto', label: 'Precio Neto', amount: 3750.0 },
      { id: 'rub_transfer', label: 'Transfer', amount: 0.0 },
      { id: 'rub_comidas', label: 'Comidas', amount: 0.0 },
      { id: 'rub_kit_ee', label: 'Kit EE', amount: 60.0 },
      { id: 'rub_seguro_msi', label: 'Seguro MSI', amount: 90.0 },
      { id: 'rub_promocion', label: 'Promoción', amount: 40.0 },
      { id: 'rub_costo_envios_kits', label: 'Costo envios Kits', amount: 10.0, isInternalOnly: true },
      { id: 'rub_operacion', label: 'Operación', amount: 25.0, isInternalOnly: true },
      { id: 'rub_otros_gastos', label: 'Otros gastos', amount: 100.0, note: 'avión' },
      { id: 'rub_comision_escuela', label: 'Comisión Escuela', amount: 0.0, isInternalOnly: true },
      { id: 'rub_comision_coordinadora', label: 'Comisión Coordinadora', amount: 120.0, isInternalOnly: true },
    ],
    overrideLeaderExpense: false,
    manualLeaderExpenseAmount: 147.5,
    leaderCompensation: 0.0,
    pricingInputMode: 'final_price',
    commissionPercent: 18.595279,
    manualFinalPrice: 5150.0,
    chaperonesEscuela: 0,
    chaperonesEE,
    emergencyFund: 150.0,
    dailyExpenseRate: 25.0,
    dailyExpenseCalculatedTotal: 675.0,
    chaperoneRubros: [
      { id: 'chap_costo', label: 'Costo chaperon', amount: 0.0 },
      { id: 'chap_viaje', label: 'Gastos del Viaje', amount: 1000.0 },
      { id: 'chap_seguro', label: 'Seguro', amount: 180.0 },
      { id: 'chap_transfer', label: 'Transfer', amount: 0.0 },
      { id: 'chap_kit', label: 'Kit', amount: 120.0 },
      { id: 'chap_extra', label: 'Chaperon Extra', amount: 1500.0 },
    ],
    paymentPlan: { ...DEFAULT_PAYMENT_PLAN_CONFIG },
  };
}

export const BUILT_IN_SHEET_TEMPLATES: SavedSheetTemplate[] = [
  {
    id: 'tpl_uk_oxford',
    name: 'UK Academic — Londres y Oxford (21d · GBP)',
    destination: 'Londres y Oxford, Reino Unido',
    programType: 'Campamento de Verano',
    createdAt: '2026-10-01T10:00:00Z',
    createdBy: 'Catálogo Oficial Xplore Together',
    sheet: createOfficialUKExampleSheet('OPCION 1', 20, 2, 21, 26.5),
  },
  {
    id: 'tpl_usa_nasa',
    name: 'Orlando STEM & Kennedy Space Center (7d · USD)',
    destination: 'Orlando y Cabo Cañaveral, EE.UU.',
    programType: 'STEM & Robótica',
    createdAt: '2026-10-01T10:00:00Z',
    createdBy: 'Catálogo Oficial Xplore Together',
    sheet: {
      optionTitle: 'OPCION 1',
      programTitle: 'STEM & Robótica NASA',
      destinationSubtitle: 'Kennedy Space Center & Universal Orlando',
      currencyLabel: 'Dólares USD',
      currencyCode: 'USD',
      exchangeRate: 19.85,
      participants: 25,
      days: 7,
      conceptos: [
        { id: 'rub_precio_neto', label: 'Precio Neto', amount: 1890.0 },
        { id: 'rub_transfer', label: 'Transfer', amount: 140.0, note: 'Coach privado' },
        { id: 'rub_comidas', label: 'Comidas', amount: 210.0, note: '3 alimentos/día' },
        { id: 'rub_kit_ee', label: 'Kit EE', amount: 55.0 },
        { id: 'rub_seguro_msi', label: 'Seguro MSI', amount: 65.0 },
        { id: 'rub_promocion', label: 'Promoción', amount: 25.0 },
        { id: 'rub_costo_envios_kits', label: 'Costo envios Kits', amount: 10.0, isInternalOnly: true },
        { id: 'rub_operacion', label: 'Operación', amount: 30.0, isInternalOnly: true },
        { id: 'rub_otros_gastos', label: 'Otros gastos', amount: 480.0, note: 'vuelo redondo' },
        { id: 'rub_comision_escuela', label: 'Comisión Escuela', amount: 150.0, isInternalOnly: true },
        { id: 'rub_comision_coordinadora', label: 'Comisión Coordinadora', amount: 90.0, isInternalOnly: true },
      ],
      overrideLeaderExpense: false,
      manualLeaderExpenseAmount: 0,
      leaderCompensation: 120.0,
      pricingInputMode: 'percent',
      commissionPercent: 19.5,
      manualFinalPrice: 3890.0,
      chaperonesEscuela: 2,
      chaperonesEE: 1,
      emergencyFund: 200.0,
      dailyExpenseRate: 35.0,
      dailyExpenseCalculatedTotal: 245.0,
      chaperoneRubros: [
        { id: 'chap_costo', label: 'Costo chaperon', amount: 1150.0 },
        { id: 'chap_viaje', label: 'Gastos del Viaje', amount: 480.0 },
        { id: 'chap_seguro', label: 'Seguro', amount: 65.0 },
        { id: 'chap_transfer', label: 'Transfer', amount: 90.0 },
        { id: 'chap_kit', label: 'Kit', amount: 55.0 },
        { id: 'chap_extra', label: 'Chaperon Extra', amount: 0.0 },
      ],
      paymentPlan: {
        ...DEFAULT_PAYMENT_PLAN_CONFIG,
        registrationFeeMode: 'percent',
        registrationFeeValue: 20,
        installmentsCount: 5,
      },
    },
  },
  {
    id: 'tpl_can_vancouver',
    name: 'Vancouver & Whistler English Camp (14d · CAD)',
    destination: 'Vancouver, Canadá',
    programType: 'Curso de Idiomas',
    createdAt: '2026-10-01T10:00:00Z',
    createdBy: 'Catálogo Oficial Xplore Together',
    sheet: {
      optionTitle: 'OPCION 1',
      programTitle: 'Inmersión Académica Canadá',
      destinationSubtitle: 'UBC Vancouver Campus & Whistler Excursion',
      currencyLabel: 'Dólares CAD',
      currencyCode: 'CAD',
      exchangeRate: 14.35,
      participants: 22,
      days: 14,
      conceptos: [
        { id: 'rub_precio_neto', label: 'Precio Neto', amount: 3150.0 },
        { id: 'rub_transfer', label: 'Transfer', amount: 180.0 },
        { id: 'rub_comidas', label: 'Comidas', amount: 350.0 },
        { id: 'rub_kit_ee', label: 'Kit EE', amount: 60.0 },
        { id: 'rub_seguro_msi', label: 'Seguro MSI', amount: 95.0 },
        { id: 'rub_promocion', label: 'Promoción', amount: 40.0 },
        { id: 'rub_costo_envios_kits', label: 'Costo envios Kits', amount: 12.0, isInternalOnly: true },
        { id: 'rub_operacion', label: 'Operación', amount: 35.0, isInternalOnly: true },
        { id: 'rub_otros_gastos', label: 'Otros gastos', amount: 720.0, note: 'avión + eTA' },
        { id: 'rub_comision_escuela', label: 'Comisión Escuela', amount: 200.0, isInternalOnly: true },
        { id: 'rub_comision_coordinadora', label: 'Comisión Coordinadora', amount: 110.0, isInternalOnly: true },
      ],
      overrideLeaderExpense: false,
      manualLeaderExpenseAmount: 0,
      leaderCompensation: 150.0,
      pricingInputMode: 'percent',
      commissionPercent: 18.5,
      manualFinalPrice: 6150.0,
      chaperonesEscuela: 1,
      chaperonesEE: 1,
      emergencyFund: 250.0,
      dailyExpenseRate: 30.0,
      dailyExpenseCalculatedTotal: 420.0,
      chaperoneRubros: [
        { id: 'chap_costo', label: 'Costo chaperon', amount: 1400.0 },
        { id: 'chap_viaje', label: 'Gastos del Viaje', amount: 720.0 },
        { id: 'chap_seguro', label: 'Seguro', amount: 95.0 },
        { id: 'chap_transfer', label: 'Transfer', amount: 110.0 },
        { id: 'chap_kit', label: 'Kit', amount: 60.0 },
        { id: 'chap_extra', label: 'Chaperon Extra', amount: 0.0 },
      ],
      paymentPlan: {
        ...DEFAULT_PAYMENT_PLAN_CONFIG,
        registrationFeeMode: 'percent',
        registrationFeeValue: 15,
        installmentsCount: 8,
      },
    },
  },
  {
    id: 'tpl_eur_cultura',
    name: 'Circuito Europeo Madrid, París y Roma (15d · EUR)',
    destination: 'Madrid, París y Roma, Europa',
    programType: 'Tour Cultural y Universitario',
    createdAt: '2026-10-01T10:00:00Z',
    createdBy: 'Catálogo Oficial Xplore Together',
    sheet: {
      optionTitle: 'OPCION 1',
      programTitle: 'Tour Cultural y Universitario Europa',
      destinationSubtitle: 'Madrid · París · Florencia · Roma',
      currencyLabel: 'Euros',
      currencyCode: 'EUR',
      exchangeRate: 21.4,
      participants: 28,
      days: 15,
      conceptos: [
        { id: 'rub_precio_neto', label: 'Precio Neto', amount: 2890.0 },
        { id: 'rub_transfer', label: 'Transfer', amount: 260.0, note: 'Tren alta vel. + bus' },
        { id: 'rub_comidas', label: 'Comidas', amount: 390.0 },
        { id: 'rub_kit_ee', label: 'Kit EE', amount: 55.0 },
        { id: 'rub_seguro_msi', label: 'Seguro MSI', amount: 95.0 },
        { id: 'rub_promocion', label: 'Promoción', amount: 50.0 },
        { id: 'rub_costo_envios_kits', label: 'Costo envios Kits', amount: 10.0, isInternalOnly: true },
        { id: 'rub_operacion', label: 'Operación', amount: 40.0, isInternalOnly: true },
        { id: 'rub_otros_gastos', label: 'Otros gastos', amount: 980.0, note: 'vuelo trasatlántico' },
        { id: 'rub_comision_escuela', label: 'Comisión Escuela', amount: 180.0, isInternalOnly: true },
        { id: 'rub_comision_coordinadora', label: 'Comisión Coordinadora', amount: 120.0, isInternalOnly: true },
      ],
      overrideLeaderExpense: false,
      manualLeaderExpenseAmount: 0,
      leaderCompensation: 180.0,
      pricingInputMode: 'percent',
      commissionPercent: 18.0,
      manualFinalPrice: 6250.0,
      chaperonesEscuela: 2,
      chaperonesEE: 1,
      emergencyFund: 300.0,
      dailyExpenseRate: 35.0,
      dailyExpenseCalculatedTotal: 525.0,
      chaperoneRubros: [
        { id: 'chap_costo', label: 'Costo chaperon', amount: 1650.0 },
        { id: 'chap_viaje', label: 'Gastos del Viaje', amount: 980.0 },
        { id: 'chap_seguro', label: 'Seguro', amount: 95.0 },
        { id: 'chap_transfer', label: 'Transfer', amount: 180.0 },
        { id: 'chap_kit', label: 'Kit', amount: 55.0 },
        { id: 'chap_extra', label: 'Chaperon Extra', amount: 0.0 },
      ],
      paymentPlan: {
        ...DEFAULT_PAYMENT_PLAN_CONFIG,
        registrationFeeMode: 'percent',
        registrationFeeValue: 15,
        installmentsCount: 10,
      },
    },
  },
];

/**
 * Ensures any scenario has a valid `eeSheet` initialized with the 11 official EE Conceptos
 * and the official EE Chaperones block, plus any custom rubros added by the Administrator.
 */
export function ensureScenarioHasEESheet(
  scenario: QuoteScenario,
  optionIndex: number = 0,
  programTitle: string = 'Programa Internacional EE',
  destinationSubtitle: string = 'Destino Internacional',
  adminRubros: AdminCustomRubroTemplate[] = []
): EESheetModel {
  if (scenario.eeSheet) {
    const synced = syncAdminRubrosIntoSheet(scenario.eeSheet, adminRubros);
    return {
      ...synced,
      paymentPlan: ensurePaymentPlanConfig(synced.paymentPlan),
      freePlacesRule: ensureFreePlacesRule(synced.freePlacesRule),
    };
  }

  const basePriceItem = scenario.lineItems.find(
    (i) => i.category === 'Precio neto del programa'
  );
  const flightItem = scenario.lineItems.find((i) => i.category === 'Vuelos');
  const transferItem = scenario.lineItems.find(
    (i) => i.category === 'Transporte y traslados'
  );
  const insuranceItem = scenario.lineItems.find((i) => i.category === 'Seguro');

  const safePart = Math.max(1, scenario.participants);
  const precioNeto = basePriceItem ? basePriceItem.unitCost : 3750;
  const transfer =
    transferItem && transferItem.basis === 'por_grupo'
      ? Math.round((transferItem.unitCost / safePart) * 100) / 100
      : 0;
  const otrosGastosAvion = flightItem ? flightItem.unitCost : 100;

  const sheet: EESheetModel = {
    optionTitle: `OPCION ${optionIndex + 1}`,
    programTitle,
    destinationSubtitle,
    currencyLabel: getCurrencyDisplayName(scenario.costCurrency),
    currencyCode: scenario.costCurrency,
    exchangeRate: scenario.exchangeRate > 1 ? scenario.exchangeRate : 19.85,
    participants: scenario.participants,
    days: scenario.days,
    conceptos: [
      { id: 'rub_precio_neto', label: 'Precio Neto', amount: precioNeto },
      { id: 'rub_transfer', label: 'Transfer', amount: transfer },
      { id: 'rub_comidas', label: 'Comidas', amount: 0 },
      { id: 'rub_kit_ee', label: 'Kit EE', amount: 60 },
      {
        id: 'rub_seguro_msi',
        label: 'Seguro MSI',
        amount: insuranceItem ? insuranceItem.unitCost : 90,
      },
      { id: 'rub_promocion', label: 'Promoción', amount: 40 },
      { id: 'rub_costo_envios_kits', label: 'Costo envios Kits', amount: 10, isInternalOnly: true },
      { id: 'rub_operacion', label: 'Operación', amount: 25, isInternalOnly: true },
      { id: 'rub_otros_gastos', label: 'Otros gastos', amount: otrosGastosAvion, note: 'avión' },
      { id: 'rub_comision_escuela', label: 'Comisión Escuela', amount: 0, isInternalOnly: true },
      { id: 'rub_comision_coordinadora', label: 'Comisión Coordinadora', amount: 120, isInternalOnly: true },
    ],
    overrideLeaderExpense: false,
    manualLeaderExpenseAmount: 147.5,
    leaderCompensation: 0,
    pricingInputMode: 'percent',
    commissionPercent: 18.6,
    manualFinalPrice: 5150,
    chaperonesEscuela: 0,
    chaperonesEE: scenario.chaperones,
    emergencyFund: 150,
    dailyExpenseRate: 25,
    dailyExpenseCalculatedTotal: 25 * scenario.days,
    chaperoneRubros: [
      { id: 'chap_costo', label: 'Costo chaperon', amount: 0 },
      {
        id: 'chap_viaje',
        label: 'Gastos del Viaje',
        amount: scenario.chaperoneExpenses?.travelCostPerChaperone || 1000,
      },
      {
        id: 'chap_seguro',
        label: 'Seguro',
        amount: scenario.chaperoneExpenses?.insurancePerChaperone || 180,
      },
      { id: 'chap_transfer', label: 'Transfer', amount: 0 },
      { id: 'chap_kit', label: 'Kit', amount: 120 },
      { id: 'chap_extra', label: 'Chaperon Extra', amount: 1500 },
    ],
    paymentPlan: { ...DEFAULT_PAYMENT_PLAN_CONFIG },
    freePlacesRule: { ...DEFAULT_FREE_PLACES_RULE },
  };

  return syncAdminRubrosIntoSheet(sheet, adminRubros);
}

/**
 * Integrates any custom rubros defined by the Administrator into the sheet if not already present.
 */
export function syncAdminRubrosIntoSheet(
  sheet: EESheetModel,
  adminRubros: AdminCustomRubroTemplate[] = []
): EESheetModel {
  if (!adminRubros || adminRubros.length === 0) return sheet;

  const nextConceptos = [...sheet.conceptos];
  const nextChapRubros = [...sheet.chaperoneRubros];

  for (const tpl of adminRubros) {
    if (tpl.section === 'conceptos') {
      if (!nextConceptos.some((r) => r.id === tpl.id || r.label === tpl.label)) {
        nextConceptos.push({
          id: tpl.id,
          label: tpl.label,
          amount: tpl.defaultAmount,
          note: tpl.defaultNote,
          isCustomAdminRubro: true,
          isInternalOnly: tpl.isInternalOnly,
        });
      }
    } else {
      if (!nextChapRubros.some((r) => r.id === tpl.id || r.label === tpl.label)) {
        nextChapRubros.push({
          id: tpl.id,
          label: tpl.label,
          amount: tpl.defaultAmount,
          note: tpl.defaultNote,
          isCustomAdminRubro: true,
          isInternalOnly: tpl.isInternalOnly,
        });
      }
    }
  }

  return {
    ...sheet,
    conceptos: nextConceptos,
    chaperoneRubros: nextChapRubros,
  };
}

/**
 * Pure, deterministic calculator for the Official EE Quotation Sheet.
 * Supports bidirectional editing of % Comisión <-> PRECIO FINAL.
 */
export function calculateEESheet(sheet: EESheetModel): EESheetCalculationOutput {
  const safeParticipants = Math.max(1, Number(sheet.participants) || 1);
  const fx = Math.max(0.0001, Number(sheet.exchangeRate) || 1);

  // 1. Right Block: Gastos de Chaperones
  const totalChaperonCount =
    (Number(sheet.chaperonesEscuela) || 0) + (Number(sheet.chaperonesEE) || 0);

  const subTotalPerChaperon = sheet.chaperoneRubros.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0
  );

  // In the EE sheet, SubTotal Chaperones equals SubTotal / Chaperon (or scales when multiple chaperone packages apply)
  const subTotalChaperones = subTotalPerChaperon;
  const emergencyFund = Number(sheet.emergencyFund) || 0;
  const totalChaperones = subTotalChaperones + emergencyFund;

  // 2. Left Block: Conceptos SubTotal 1
  const subTotal1Conceptos = sheet.conceptos.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0
  );

  // 3. Gastos del líder = Total Chaperones / Participantes (unless manually overridden)
  const gastosDelLider = sheet.overrideLeaderExpense
    ? Number(sheet.manualLeaderExpenseAmount) || 0
    : totalChaperones / safeParticipants;

  const compensacionDelLider = Number(sheet.leaderCompensation) || 0;

  // 4. SubTotal 2 = SubTotal 1 + Gastos del líder + Compensación del líder
  const subTotal2ConLider =
    subTotal1Conceptos + gastosDelLider + compensacionDelLider;

  // 5. Bidirectional Commission & Final Price
  let precioFinalInCurrency = 0;
  let comisionPerParticipant = 0;
  let effectiveCommissionPercent = 0;

  if (sheet.pricingInputMode === 'final_price') {
    precioFinalInCurrency = Number(sheet.manualFinalPrice) || 0;
    comisionPerParticipant = precioFinalInCurrency - subTotal2ConLider;
    effectiveCommissionPercent =
      subTotal2ConLider > 0
        ? (comisionPerParticipant / subTotal2ConLider) * 100
        : 0;
  } else {
    effectiveCommissionPercent = Number(sheet.commissionPercent) || 0;
    comisionPerParticipant =
      subTotal2ConLider * (effectiveCommissionPercent / 100);
    precioFinalInCurrency = subTotal2ConLider + comisionPerParticipant;
  }

  const comisionGroupTotalInCurrency = comisionPerParticipant * safeParticipants;
  const estimadoEnPesosPerParticipant = precioFinalInCurrency * fx;
  const comisionGroupTotalInPesos = comisionGroupTotalInCurrency * fx;
  const totalGrupoEnPesos = estimadoEnPesosPerParticipant * safeParticipants;

  return {
    totalChaperonCount,
    subTotalPerChaperon,
    subTotalChaperones,
    emergencyFund,
    totalChaperones,
    subTotal1Conceptos,
    gastosDelLider,
    compensacionDelLider,
    subTotal2ConLider,
    effectiveCommissionPercent,
    comisionPerParticipant,
    comisionGroupTotalInCurrency,
    precioFinalInCurrency,
    estimadoEnPesosPerParticipant,
    comisionGroupTotalInPesos,
    totalGrupoEnPesos,
  };
}

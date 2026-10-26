import {
  CurrencyCode,
  ProposalDocument,
  QuoteScenario,
  ScenarioCalculationResult,
  TravelRequest,
} from '../types/domain';
import {
  buildPaymentScheduleForSheet,
  buildSuggestedItineraryDays,
  buildVolumePricingTiersForSheet,
  ensureScenarioHasEESheet,
} from './eeSheetEngine';

/**
 * Currency rounding rules applied ONLY at the final display/output step,
 * never during intermediate arithmetic operations.
 */
export function roundCurrency(value: number, currency: CurrencyCode = 'MXN'): number {
  if (!Number.isFinite(value)) return 0;
  const decimals = currency === 'MXN' || currency === 'USD' || currency === 'CAD' || currency === 'EUR' || currency === 'GBP' ? 2 : 2;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Converts an amount from sourceCurrency to targetCurrency using explicit exchange rates.
 * Does NOT round intermediate values.
 */
export function convertCurrencyAmount(
  amount: number,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  scenarioExchangeRate: number,
  scenarioCostCurrency: CurrencyCode,
  scenarioSaleCurrency: CurrencyCode,
  fallbackRatesToMXN: Record<CurrencyCode, number> = {
    MXN: 1,
    USD: 19.85,
    CAD: 14.35,
    EUR: 21.4,
    GBP: 25.1,
  }
): number {
  if (!Number.isFinite(amount) || amount === 0) return 0;
  if (fromCurrency === toCurrency) return amount;

  // Primary case: converting from scenario's costCurrency to scenario's saleCurrency using the scenario's locked exchangeRate
  if (fromCurrency === scenarioCostCurrency && toCurrency === scenarioSaleCurrency) {
    return amount * scenarioExchangeRate;
  }
  if (fromCurrency === scenarioSaleCurrency && toCurrency === scenarioCostCurrency && scenarioExchangeRate > 0) {
    return amount / scenarioExchangeRate;
  }

  // Fallback cross-rate via MXN pivot
  const fromToMXN = fallbackRatesToMXN[fromCurrency] || 1;
  const toToMXN = fallbackRatesToMXN[toCurrency] || 1;
  if (toToMXN <= 0) return amount;
  return (amount * fromToMXN) / toToMXN;
}

/**
 * Computes a deterministic signature of all material financial inputs of a scenario.
 * Used to detect when an edit invalidates existing approvals (Módulo H).
 */
export function computeMaterialSignature(scenario: QuoteScenario): string {
  const activeItems = scenario.lineItems
    .filter((i) => i.active)
    .map((i) => `${i.id}:${i.quantity}:${i.unitCost}:${i.currency}:${i.basis}:${i.isTaxable}:${i.isIncludedInPrice}`)
    .sort()
    .join('|');

  const chap = scenario.chaperoneExpenses;
  const chapSig = [
    chap.travelCostPerChaperone,
    chap.insurancePerChaperone,
    chap.transportPerChaperone,
    chap.accommodationPerChaperone,
    chap.mealsPerChaperone,
    chap.kitPerChaperone,
    chap.dailyStipendPerChaperone,
    chap.extraordinaryExpensesPerChaperone,
    chap.additionalCompensationPerChaperone,
    chap.emergencyFundPerChaperone,
    chap.leaderFixedExpense,
    chap.leaderCompensation,
    chap.staffCostPerPerson,
    chap.currency,
    chap.allocationMode,
  ].join(':');

  const fp = scenario.financialParameters;
  const fpSig = [
    fp.formulaVersion,
    fp.pricingStrategy,
    fp.targetMarginOrMarkupPercent,
    fp.schoolCommissionBasis,
    fp.schoolCommissionValue,
    fp.coordinatorCommissionBasis,
    fp.coordinatorCommissionValue,
    fp.discountPerParticipant,
    fp.taxRatePercent,
  ].join(':');

  return [
    `p=${scenario.participants}`,
    `c=${scenario.chaperones}`,
    `s=${scenario.additionalStaff}`,
    `d=${scenario.days}`,
    `n=${scenario.nights}`,
    `cc=${scenario.costCurrency}`,
    `sc=${scenario.saleCurrency}`,
    `fx=${scenario.exchangeRate}`,
    `items=${activeItems}`,
    `chap=${chapSig}`,
    `fp=${fpSig}`,
  ].join('||');
}

/**
 * Centralized, pure, auditable financial calculation engine for EE Cotizador (Módulo E & F).
 */
export function calculateScenarioFinancials(
  scenario: QuoteScenario,
  budgetTargetPerParticipantInBudgetCurrency: number = 0,
  budgetCurrency: CurrencyCode = scenario.saleCurrency
): ScenarioCalculationResult {
  const errors: string[] = [];
  const assumptions: string[] = [];

  const participants = Number(scenario.participants);
  const chaperones = Number(scenario.chaperones);
  const additionalStaff = Number(scenario.additionalStaff || 0);
  const days = Number(scenario.days);
  const nights = Number(scenario.nights);
  const fx = Number(scenario.exchangeRate);
  const fp = scenario.financialParameters;

  // 1. Mandatory validations (Division by zero & boundary guards)
  if (!Number.isFinite(participants) || participants <= 0) {
    errors.push('El número de participantes debe ser mayor a cero para evitar división entre cero.');
  }
  if (!Number.isFinite(chaperones) || chaperones < 0) {
    errors.push('El número de chaperones no puede ser negativo.');
  }
  if (!Number.isFinite(days) || days <= 0) {
    errors.push('El número de días de viaje debe ser mayor a cero.');
  }
  if (!Number.isFinite(fx) || fx <= 0) {
    errors.push('El tipo de cambio debe ser mayor a cero.');
  }

  if (fp.pricingStrategy === 'margin_on_sale') {
    if (fp.targetMarginOrMarkupPercent >= 100) {
      errors.push('El margen sobre precio de venta debe ser estrictamente inferior al 100%.');
    }
    if (fp.targetMarginOrMarkupPercent < 0) {
      errors.push('El margen objetivo no puede ser negativo.');
    }
  } else if (fp.pricingStrategy === 'markup_on_cost') {
    if (fp.targetMarginOrMarkupPercent < 0) {
      errors.push('El porcentaje de recargo sobre costo no puede ser negativo.');
    }
  }

  // Validate commission percentages when on sale
  const totalSaleCommissionPct =
    (fp.schoolCommissionBasis === 'sobre_venta' ? fp.schoolCommissionValue : 0) +
    (fp.coordinatorCommissionBasis === 'sobre_venta' ? fp.coordinatorCommissionValue : 0);

  if (
    fp.pricingStrategy === 'margin_on_sale' &&
    fp.targetMarginOrMarkupPercent + totalSaleCommissionPct >= 100
  ) {
    errors.push(
      'La suma del margen objetivo y las comisiones sobre venta supera o iguala el 100% del precio.'
    );
  }

  const safeParticipants = participants > 0 ? participants : 1;

  assumptions.push(
    `Fórmula versión: ${fp.formulaVersion}`,
    `Base de cálculo: ${participants} participantes pagantes, ${chaperones} chaperones, ${additionalStaff} staff adicional, ${days} días / ${nights} noches.`,
    `Divisa de costos: ${scenario.costCurrency} → Divisa de venta: ${scenario.saleCurrency} (TC = ${fx.toFixed(4)}).`
  );

  // 2. Evaluate configurable line items (without intermediate rounding)
  let variableParticipantCost = 0;
  let variableChaperoneAndStaffCost = 0;
  let fixedGroupCost = 0;
  let dailyOperationalCost = 0;
  let separateBilledTotal = 0;
  let taxableBaseInSaleCurrency = 0;

  const lineItemResults: ScenarioCalculationResult['lineItemResults'] = [];

  for (const item of scenario.lineItems) {
    if (!item.active) continue;

    const unitCost = Math.max(0, Number(item.unitCost) || 0);
    const qty = Math.max(0, Number(item.quantity) || 0);

    let multiplier = 1;
    switch (item.basis) {
      case 'por_participante':
        multiplier = participants > 0 ? participants : 0;
        break;
      case 'por_chaperon':
        multiplier = chaperones;
        break;
      case 'por_staff':
        multiplier = additionalStaff;
        break;
      case 'por_dia':
        multiplier = days;
        break;
      case 'por_grupo':
      case 'fijo':
      default:
        multiplier = 1;
        break;
    }

    const originalAmount = unitCost * qty * multiplier;
    const convertedAmount = convertCurrencyAmount(
      originalAmount,
      item.currency,
      scenario.saleCurrency,
      fx,
      scenario.costCurrency,
      scenario.saleCurrency
    );

    if (!item.isIncludedInPrice) {
      separateBilledTotal += convertedAmount;
    } else {
      switch (item.basis) {
        case 'por_participante':
          variableParticipantCost += convertedAmount;
          break;
        case 'por_chaperon':
        case 'por_staff':
          variableChaperoneAndStaffCost += convertedAmount;
          break;
        case 'por_dia':
          dailyOperationalCost += convertedAmount;
          break;
        case 'por_grupo':
        case 'fijo':
        default:
          fixedGroupCost += convertedAmount;
          break;
      }

      if (item.isTaxable) {
        taxableBaseInSaleCurrency += convertedAmount;
      }
    }

    lineItemResults.push({
      id: item.id,
      name: item.name,
      category: item.category,
      basis: item.basis,
      originalAmount: roundCurrency(originalAmount, item.currency),
      originalCurrency: item.currency,
      convertedAmountInSaleCurrency: roundCurrency(convertedAmount, scenario.saleCurrency),
      perParticipantImpact:
        participants > 0
          ? roundCurrency(convertedAmount / safeParticipants, scenario.saleCurrency)
          : 0,
      isInternalCostOnly: item.isInternalCostOnly,
      isIncludedInPrice: item.isIncludedInPrice,
    });
  }

  // 3. Evaluate Chaperone, Staff & Leader Expenses Submodule (Módulo F)
  const ce = scenario.chaperoneExpenses;
  const perChaperoneUnitSum =
    (Number(ce.travelCostPerChaperone) || 0) +
    (Number(ce.insurancePerChaperone) || 0) +
    (Number(ce.transportPerChaperone) || 0) +
    (Number(ce.accommodationPerChaperone) || 0) +
    (Number(ce.mealsPerChaperone) || 0) +
    (Number(ce.kitPerChaperone) || 0) +
    (Number(ce.dailyStipendPerChaperone) || 0) * Math.max(0, days) +
    (Number(ce.extraordinaryExpensesPerChaperone) || 0) +
    (Number(ce.additionalCompensationPerChaperone) || 0) +
    (Number(ce.emergencyFundPerChaperone) || 0);

  const rawChaperoneTotal =
    perChaperoneUnitSum * Math.max(0, chaperones) +
    (Number(ce.leaderFixedExpense) || 0) +
    (Number(ce.leaderCompensation) || 0) +
    (Number(ce.staffCostPerPerson) || 0) * Math.max(0, additionalStaff);

  const chaperoneTotalInSaleCurrency = convertCurrencyAmount(
    rawChaperoneTotal,
    ce.currency,
    scenario.saleCurrency,
    fx,
    scenario.costCurrency,
    scenario.saleCurrency
  );

  let chaperoneAbsorbedByAgency = 0;
  let chaperoneDistributedToParticipants = 0;
  let chaperoneBilledSeparately = 0;

  if (ce.allocationMode === 'distribuido_participantes') {
    chaperoneDistributedToParticipants = chaperoneTotalInSaleCurrency;
    assumptions.push(
      `Gastos de ${chaperones} chaperón(es) y líderes prorrateados entre los ${participants} participantes.`
    );
  } else if (ce.allocationMode === 'absorbido_ee') {
    chaperoneAbsorbedByAgency = chaperoneTotalInSaleCurrency;
    assumptions.push(
      `Gastos de chaperones absorbidos directamente por EE (impacta utilidad, no incrementa costo base transferido al alumno).`
    );
  } else {
    chaperoneBilledSeparately = chaperoneTotalInSaleCurrency;
    separateBilledTotal += chaperoneBilledSeparately;
    assumptions.push(`Gastos de chaperones cotizados y facturados por separado al colegio.`);
  }

  // 4. Taxes and Direct Base Cost
  const subtotalBaseCost =
    variableParticipantCost +
    variableChaperoneAndStaffCost +
    fixedGroupCost +
    dailyOperationalCost +
    chaperoneDistributedToParticipants;

  const taxRate = Math.max(0, Number(fp.taxRatePercent) || 0) / 100;
  const applicableTaxes = taxableBaseInSaleCurrency * taxRate;
  const totalDirectCost = subtotalBaseCost + applicableTaxes;

  const costPerParticipantBeforeCommissions =
    participants > 0 ? totalDirectCost / safeParticipants : 0;

  // 5. Commissions on Cost or Fixed (evaluated before pricing if applicable)
  let schoolCommFixedOrOnCost = 0;
  if (fp.schoolCommissionBasis === 'sobre_costo') {
    schoolCommFixedOrOnCost = totalDirectCost * (Math.max(0, fp.schoolCommissionValue) / 100);
  } else if (fp.schoolCommissionBasis === 'fijo_por_participante') {
    schoolCommFixedOrOnCost = Math.max(0, fp.schoolCommissionValue) * Math.max(0, participants);
  }

  let coordCommFixedOrOnCost = 0;
  if (fp.coordinatorCommissionBasis === 'sobre_costo') {
    coordCommFixedOrOnCost = totalDirectCost * (Math.max(0, fp.coordinatorCommissionValue) / 100);
  } else if (fp.coordinatorCommissionBasis === 'fijo_por_participante') {
    coordCommFixedOrOnCost = Math.max(0, fp.coordinatorCommissionValue) * Math.max(0, participants);
  }

  const costBaseForPricing =
    totalDirectCost + schoolCommFixedOrOnCost + coordCommFixedOrOnCost;

  // 6. Selling Price Calculation: Explicit distinction between Markup on Cost vs Margin on Sale
  let grossGroupSellingPriceBeforeDiscount = 0;
  const targetRatio = Math.max(0, Number(fp.targetMarginOrMarkupPercent) || 0) / 100;
  const saleCommissionRatio =
    ((fp.schoolCommissionBasis === 'sobre_venta' ? Math.max(0, fp.schoolCommissionValue) : 0) +
      (fp.coordinatorCommissionBasis === 'sobre_venta'
        ? Math.max(0, fp.coordinatorCommissionValue)
        : 0)) /
    100;

  if (errors.length === 0) {
    if (fp.pricingStrategy === 'markup_on_cost') {
      // Precio con recargo sobre costo: Costo base * (1 + recargo)
      // Si además hay comisión sobre venta, se protege la base o se aplica directo según fórmula:
      const priceWithMarkup = costBaseForPricing * (1 + targetRatio);
      grossGroupSellingPriceBeforeDiscount =
        saleCommissionRatio > 0 && saleCommissionRatio < 1
          ? priceWithMarkup / (1 - saleCommissionRatio)
          : priceWithMarkup;
      assumptions.push(
        `Estrategia de precio: Recargo sobre costo del ${fp.targetMarginOrMarkupPercent.toFixed(2)}% [Costo × (1 + r)].`
      );
    } else {
      // Precio con margen objetivo sobre venta: Costo / (1 - margen - comisión_sobre_venta)
      const denominator = 1 - targetRatio - saleCommissionRatio;
      if (denominator > 0) {
        grossGroupSellingPriceBeforeDiscount =
          (costBaseForPricing + chaperoneAbsorbedByAgency) / denominator;
      }
      assumptions.push(
        `Estrategia de precio: Margen sobre precio de venta del ${fp.targetMarginOrMarkupPercent.toFixed(2)}% [Costo / (1 - m)].`
      );
    }
  }

  const totalDiscounts = Math.max(0, Number(fp.discountPerParticipant) || 0) * Math.max(0, participants);
  const totalGroupSellingPrice = Math.max(0, grossGroupSellingPriceBeforeDiscount - totalDiscounts);
  const sellingPricePerParticipant =
    participants > 0 ? totalGroupSellingPrice / safeParticipants : 0;

  // 7. Final Commissions calculation (now that totalGroupSellingPrice is known)
  const schoolCommissionTotal =
    fp.schoolCommissionBasis === 'sobre_venta'
      ? totalGroupSellingPrice * (Math.max(0, fp.schoolCommissionValue) / 100)
      : schoolCommFixedOrOnCost;

  const coordinatorCommissionTotal =
    fp.coordinatorCommissionBasis === 'sobre_venta'
      ? totalGroupSellingPrice * (Math.max(0, fp.coordinatorCommissionValue) / 100)
      : coordCommFixedOrOnCost;

  const totalCommissions = schoolCommissionTotal + coordinatorCommissionTotal;

  // 8. Total Cost, Profit (Utilidad), and Margin (Margen)
  const totalScenarioCost =
    totalDirectCost + totalCommissions + chaperoneAbsorbedByAgency;
  const costPerParticipant =
    participants > 0 ? totalScenarioCost / safeParticipants : 0;

  const estimatedProfit = totalGroupSellingPrice - totalScenarioCost;
  const estimatedMarginPercent =
    totalGroupSellingPrice > 0 ? (estimatedProfit / totalGroupSellingPrice) * 100 : 0;
  const effectiveMarkupPercent =
    totalScenarioCost > 0 ? (estimatedProfit / totalScenarioCost) * 100 : 0;

  // 9. Budget Comparison
  const convertedBudgetPerParticipant = convertCurrencyAmount(
    budgetTargetPerParticipantInBudgetCurrency,
    budgetCurrency,
    scenario.saleCurrency,
    fx,
    scenario.costCurrency,
    scenario.saleCurrency
  );

  const budgetVariancePerParticipant =
    convertedBudgetPerParticipant > 0
      ? sellingPricePerParticipant - convertedBudgetPerParticipant
      : 0;
  const budgetVariancePercent =
    convertedBudgetPerParticipant > 0
      ? (budgetVariancePerParticipant / convertedBudgetPerParticipant) * 100
      : 0;

  return {
    formulaVersion: fp.formulaVersion,
    calculatedAt: new Date().toISOString(),
    valid: errors.length === 0,
    errors,
    assumptions,
    costCurrency: scenario.costCurrency,
    saleCurrency: scenario.saleCurrency,
    exchangeRateUsed: fx,
    participants: Math.max(0, participants),
    chaperones: Math.max(0, chaperones),
    additionalStaff: Math.max(0, additionalStaff),
    days: Math.max(0, days),
    nights: Math.max(0, nights),
    variableParticipantCost: roundCurrency(variableParticipantCost, scenario.saleCurrency),
    variableChaperoneAndStaffCost: roundCurrency(variableChaperoneAndStaffCost, scenario.saleCurrency),
    fixedGroupCost: roundCurrency(fixedGroupCost, scenario.saleCurrency),
    dailyOperationalCost: roundCurrency(dailyOperationalCost, scenario.saleCurrency),
    chaperoneTotalInSaleCurrency: roundCurrency(chaperoneTotalInSaleCurrency, scenario.saleCurrency),
    chaperoneAbsorbedByAgency: roundCurrency(chaperoneAbsorbedByAgency, scenario.saleCurrency),
    chaperoneDistributedToParticipants: roundCurrency(
      chaperoneDistributedToParticipants,
      scenario.saleCurrency
    ),
    chaperoneBilledSeparately: roundCurrency(chaperoneBilledSeparately, scenario.saleCurrency),
    subtotalBaseCost: roundCurrency(subtotalBaseCost, scenario.saleCurrency),
    applicableTaxes: roundCurrency(applicableTaxes, scenario.saleCurrency),
    totalDirectCost: roundCurrency(totalDirectCost, scenario.saleCurrency),
    costPerParticipantBeforeCommissions: roundCurrency(
      costPerParticipantBeforeCommissions,
      scenario.saleCurrency
    ),
    schoolCommissionTotal: roundCurrency(schoolCommissionTotal, scenario.saleCurrency),
    coordinatorCommissionTotal: roundCurrency(coordinatorCommissionTotal, scenario.saleCurrency),
    totalCommissions: roundCurrency(totalCommissions, scenario.saleCurrency),
    totalDiscounts: roundCurrency(totalDiscounts, scenario.saleCurrency),
    totalScenarioCost: roundCurrency(totalScenarioCost, scenario.saleCurrency),
    costPerParticipant: roundCurrency(costPerParticipant, scenario.saleCurrency),
    sellingPricePerParticipant: roundCurrency(sellingPricePerParticipant, scenario.saleCurrency),
    totalGroupSellingPrice: roundCurrency(totalGroupSellingPrice, scenario.saleCurrency),
    separateBilledTotal: roundCurrency(separateBilledTotal, scenario.saleCurrency),
    estimatedProfit: roundCurrency(estimatedProfit, scenario.saleCurrency),
    estimatedMarginPercent: roundCurrency(estimatedMarginPercent, scenario.saleCurrency),
    effectiveMarkupPercent: roundCurrency(effectiveMarkupPercent, scenario.saleCurrency),
    budgetTargetPerParticipant: roundCurrency(convertedBudgetPerParticipant, scenario.saleCurrency),
    budgetVariancePerParticipant: roundCurrency(budgetVariancePerParticipant, scenario.saleCurrency),
    budgetVariancePercent: roundCurrency(budgetVariancePercent, scenario.saleCurrency),
    lineItemResults,
  };
}

/**
 * Applies material change validation on a scenario:
 * If the scenario was 'Aprobado' or 'Pendiente' and its material signature changed,
 * invalidates prior approvals and forces a new review (Módulo H).
 */
export function syncScenarioMaterialChanges(scenario: QuoteScenario): {
  updatedScenario: QuoteScenario;
  wasInvalidated: boolean;
} {
  const newSignature = computeMaterialSignature(scenario);
  if (
    scenario.lastMaterialSignature &&
    scenario.lastMaterialSignature !== newSignature &&
    (scenario.approvalStatus === 'Aprobado' || scenario.approvalStatus === 'Pendiente')
  ) {
    const invalidatedApprovals = scenario.approvals.map((app) => ({
      ...app,
      invalidated: true,
      invalidatedReason: 'Modificación material en costos, margen, participantes o tipo de cambio.',
    }));
    return {
      wasInvalidated: true,
      updatedScenario: {
        ...scenario,
        approvalStatus: 'Invalidado por modificación',
        approvals: invalidatedApprovals,
        lastMaterialSignature: newSignature,
      },
    };
  }

  return {
    wasInvalidated: false,
    updatedScenario: {
      ...scenario,
      lastMaterialSignature: newSignature,
    },
  };
}

/**
 * Generates an immutable ProposalDocument.
 * CRITICAL SECURITY REQUIREMENT (Módulo I):
 * When type === 'comercial_cliente', strictly strips internal costs, commissions,
 * margins, profit figures, and internal-only items.
 */
export function generateImmutableProposalDocument(
  request: TravelRequest,
  selectedScenarios: QuoteScenario[],
  type: 'comercial_cliente' | 'interno_costos',
  generatedBy: string,
  versionNumber: number,
  paymentTerms: string,
  commercialConditions: string,
  validityDate: string,
  notes: string
): ProposalDocument {
  const scenariosSnapshot = selectedScenarios.map((sc) => {
    const calc = calculateScenarioFinancials(
      sc,
      request.estimatedBudgetPerPerson,
      request.budgetCurrency
    );

    const visibleConceptNames = sc.lineItems
      .filter((item) => item.active && !item.isInternalCostOnly && item.isIncludedInPrice)
      .map((item) => item.name);

    const includedServices = Array.from(
      new Set([...request.specifications.includedServices, ...visibleConceptNames])
    );

    const sheet = ensureScenarioHasEESheet(
      sc,
      0,
      request.programType,
      `${request.city}, ${request.country}`
    );
    const paymentSchedule = buildPaymentScheduleForSheet(sheet);
    const volumeTiers = buildVolumePricingTiersForSheet(sheet);

    const baseEntry = {
      scenarioId: sc.id,
      scenarioName: sc.name,
      versionNumber: sc.currentVersion,
      participants: sc.participants,
      chaperones: sc.chaperones,
      days: sc.days,
      nights: sc.nights,
      saleCurrency: sc.saleCurrency,
      sellingPricePerParticipant: calc.sellingPricePerParticipant,
      totalGroupSellingPrice: calc.totalGroupSellingPrice,
      includedServices,
      excludedServices: [...request.specifications.excludedServices],
      paymentSchedule,
      volumeTiers,
      currencyCode: sheet.currencyCode,
      exchangeRate: sheet.exchangeRate,
    };

    if (type === 'interno_costos') {
      return {
        ...baseEntry,
        internalBreakdown: calc,
      };
    }

    // Client commercial proposal NEVER contains internalBreakdown
    return baseEntry;
  });

  const itineraryDays =
    request.specifications.itineraryDays &&
    request.specifications.itineraryDays.length > 0
      ? request.specifications.itineraryDays
      : buildSuggestedItineraryDays(
          `${request.city}, ${request.country}`,
          selectedScenarios[0]?.days || 7
        );

  return {
    id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    requestId: request.id,
    folio: request.folio,
    type,
    versionNumber,
    scenarioIds: selectedScenarios.map((s) => s.id),
    generatedAt: new Date().toISOString(),
    generatedBy,
    paymentTerms,
    commercialConditions,
    validityDate,
    notes: type === 'comercial_cliente' ? notes : notes,
    immutableSnapshot: {
      folio: request.folio,
      groupName: request.groupName,
      destination: `${request.city}, ${request.country}`,
      dates: `${request.departureDate} al ${request.returnDate}`,
      itineraryDays,
      scenarios: scenariosSnapshot,
    },
  };
}

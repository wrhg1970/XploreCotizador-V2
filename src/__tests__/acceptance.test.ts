import { describe, expect, it } from 'vitest';
import {
  calculateScenarioFinancials,
  generateImmutableProposalDocument,
  syncScenarioMaterialChanges,
} from '../engine/financialEngine';
import {
  canUserSeeInternalCosts,
  canUserViewRequest,
  isUserAuthorizedToAccess,
  validateApprovalPermission,
  validateCanDispatchProposal,
  validateTravelRequestDatesAndFields,
} from '../security/rbac';
import { executeAdapterSync } from '../integrations/adapters';
import {
  buildInitialTravelRequests,
  INITIAL_SYSTEM_SETTINGS,
  INITIAL_USERS,
} from '../data/seedData';
import { buildProposalPrintableHTML } from '../utils/exporters';
import {
  calculateEESheet,
  createOfficialUKExampleSheet,
  syncAdminRubrosIntoSheet,
} from '../engine/eeSheetEngine';

describe('EE Cotizador — 20 Criterios de Aceptación y Motor Financiero (Sección 11)', () => {
  const adminUser = INITIAL_USERS.find((u) => u.role === 'Administrador')!;
  const cdmxSales = INITIAL_USERS.find((u) => u.uid === 'usr_comercial_cdmx')!;
  const mtySales = INITIAL_USERS.find((u) => u.uid === 'usr_comercial_mty')!;
  const externalUser = INITIAL_USERS.find((u) => u.role === 'Usuario Externo')!;
  const approverUser = INITIAL_USERS.find((u) => u.role === 'Aprobador')!;

  it('1. Un usuario autorizado inicia sesión correctamente', () => {
    const res = isUserAuthorizedToAccess(
      cdmxSales.email,
      cdmxSales,
      INITIAL_SYSTEM_SETTINGS.authorizedDomains
    );
    expect(res.allowed).toBe(true);
  });

  it('2. Un usuario no autorizado no puede acceder', () => {
    const res = isUserAuthorizedToAccess(
      'intruso@dominio-desconocido.org',
      undefined,
      ['estudiantesembajadores.com', 'ee-mexico.mx']
    );
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('no está en la lista autorizada');
  });

  it('3. Un usuario de una oficina no puede consultar datos de otra sin permiso', () => {
    const requests = buildInitialTravelRequests('usr_comercial_cdmx');
    const cdmxReq = requests.find((r) => r.officeId === 'of_cdmx')!;
    const mtyReq = requests.find((r) => r.officeId === 'of_mty')!;

    expect(canUserViewRequest(cdmxSales, cdmxReq)).toBe(true);
    expect(canUserViewRequest(cdmxSales, mtyReq)).toBe(false);
    expect(canUserViewRequest(mtySales, mtyReq)).toBe(true);
    expect(canUserViewRequest(mtySales, cdmxReq)).toBe(false);
    expect(canUserViewRequest(adminUser, mtyReq)).toBe(true);
  });

  it('4. Se crea una solicitud con folio único', () => {
    const requests = buildInitialTravelRequests('usr_admin_ee');
    const folios = requests.map((r) => r.folio);
    const uniqueFolios = new Set(folios);
    expect(uniqueFolios.size).toBe(folios.length);
  });

  it('5. Se valida que la fecha de regreso no sea anterior a la fecha de salida', () => {
    const invalidDates = validateTravelRequestDatesAndFields({
      groupName: 'Colegio Prueba',
      officeId: 'of_cdmx',
      requesterName: 'Prof. Juan Pérez',
      departureDate: '2027-05-20',
      returnDate: '2027-05-10',
      proposalDueDate: '2026-11-01',
      participants: 20,
    });
    expect(invalidDates.valid).toBe(false);
    expect(invalidDates.errors).toContain(
      'La fecha de regreso no puede ser anterior a la fecha de salida.'
    );
  });

  it('6. Se crea una solicitud con tres escenarios comparables', () => {
    const requests = buildInitialTravelRequests('usr_admin_ee');
    const req101 = requests[0];
    expect(req101.scenarios.length).toBe(3);
    expect(req101.scenarios.map((s) => s.participants)).toEqual([20, 25, 30]);
  });

  it('7. Al cambiar los participantes se recalculan los conceptos aplicables y costos prorrateados', () => {
    const requests = buildInitialTravelRequests('usr_admin_ee');
    const scenario20 = structuredClone(requests[0].scenarios[0]); // 20 participants
    const scenario30 = structuredClone(requests[0].scenarios[0]);
    scenario30.participants = 30;

    const calc20 = calculateScenarioFinancials(scenario20);
    const calc30 = calculateScenarioFinancials(scenario30);

    // Variable participant cost scales linearly with participants
    expect(calc30.variableParticipantCost).toBeGreaterThan(calc20.variableParticipantCost);
    // Fixed group cost per participant decreases when participants increase from 20 to 30
    expect(calc30.costPerParticipant).toBeLessThan(calc20.costPerParticipant);
  });

  it('8. Al cambiar los chaperones se actualizan sus gastos y el impacto por participante', () => {
    const requests = buildInitialTravelRequests('usr_admin_ee');
    const baseScenario = structuredClone(requests[0].scenarios[0]);
    baseScenario.chaperones = 1;
    const calc1Chap = calculateScenarioFinancials(baseScenario);

    baseScenario.chaperones = 3;
    const calc3Chap = calculateScenarioFinancials(baseScenario);

    expect(calc3Chap.chaperoneTotalInSaleCurrency).toBeCloseTo(
      calc1Chap.chaperoneTotalInSaleCurrency * 3 -
        // Subtract leader fixed expenses that don't multiply by chaperones
        (baseScenario.chaperoneExpenses.leaderFixedExpense +
          baseScenario.chaperoneExpenses.leaderCompensation +
          baseScenario.chaperoneExpenses.staffCostPerPerson * baseScenario.additionalStaff) *
          baseScenario.exchangeRate *
          2,
      1
    );
    expect(calc3Chap.sellingPricePerParticipant).toBeGreaterThan(
      calc1Chap.sellingPricePerParticipant
    );
  });

  it('9. Un tipo de cambio diferente modifica correctamente los importes convertidos', () => {
    const requests = buildInitialTravelRequests('usr_admin_ee');
    const scLowFx = structuredClone(requests[0].scenarios[0]);
    scLowFx.exchangeRate = 18.0;
    const scHighFx = structuredClone(requests[0].scenarios[0]);
    scHighFx.exchangeRate = 20.0;

    const calc18 = calculateScenarioFinancials(scLowFx);
    const calc20 = calculateScenarioFinancials(scHighFx);

    expect(calc20.totalDirectCost / calc18.totalDirectCost).toBeCloseTo(20 / 18, 4);
  });

  it('10. Se distingue explícitamente entre recargo sobre costo y margen sobre precio de venta', () => {
    const requests = buildInitialTravelRequests('usr_admin_ee');
    const scMargin = structuredClone(requests[0].scenarios[0]);
    scMargin.financialParameters.schoolCommissionValue = 0;
    scMargin.financialParameters.coordinatorCommissionValue = 0;
    scMargin.financialParameters.pricingStrategy = 'margin_on_sale';
    scMargin.financialParameters.targetMarginOrMarkupPercent = 25; // 25% margin => Cost / 0.75 = 1.3333 * Cost

    const scMarkup = structuredClone(scMargin);
    scMarkup.financialParameters.pricingStrategy = 'markup_on_cost';
    scMarkup.financialParameters.targetMarginOrMarkupPercent = 25; // 25% markup => Cost * 1.25

    const calcMargin = calculateScenarioFinancials(scMargin);
    const calcMarkup = calculateScenarioFinancials(scMarkup);

    expect(calcMargin.totalGroupSellingPrice).toBeGreaterThan(calcMarkup.totalGroupSellingPrice);
    expect(calcMargin.estimatedMarginPercent).toBeCloseTo(25, 2);
    expect(calcMarkup.effectiveMarkupPercent).toBeCloseTo(25, 2);
    expect(calcMarkup.estimatedMarginPercent).toBeCloseTo(20, 2); // 25% markup equals 20% margin on sale!
  });

  it('11. Una división entre cero (0 participantes) o margen >= 100% no genera NaN/Infinity y reporta error claro', () => {
    const requests = buildInitialTravelRequests('usr_admin_ee');
    const scZero = structuredClone(requests[0].scenarios[0]);
    scZero.participants = 0;
    scZero.financialParameters.targetMarginOrMarkupPercent = 100;

    const calcZero = calculateScenarioFinancials(scZero);
    expect(calcZero.valid).toBe(false);
    expect(Number.isFinite(calcZero.sellingPricePerParticipant)).toBe(true);
    expect(calcZero.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('12. Los totales coinciden con los cálculos esperados (Utilidad = Venta - Costo Total)', () => {
    const requests = buildInitialTravelRequests('usr_admin_ee');
    const calc = calculateScenarioFinancials(requests[0].scenarios[1], 92000, 'MXN');
    expect(calc.estimatedProfit).toBeCloseTo(
      calc.totalGroupSellingPrice - calc.totalScenarioCost,
      1
    );
  });

  it('13. Una cotización no puede enviarse sin las aprobaciones necesarias ni auto-aprobarse', () => {
    const requests = buildInitialTravelRequests('usr_admin_ee');
    const pendingReq = requests[1]; // EE-2026-102 is 'Pendiente'
    const dispatchCheck = validateCanDispatchProposal(
      pendingReq,
      [pendingReq.scenarios[0].id],
      INITIAL_SYSTEM_SETTINGS
    );
    expect(dispatchCheck.allowed).toBe(false);

    // Segregation of duties check: creator cannot approve own scenario
    const selfCreatorApprover = {
      ...approverUser,
      uid: pendingReq.scenarios[0].createdByUid,
    };
    const selfApproveCheck = validateApprovalPermission(
      selfCreatorApprover,
      pendingReq.scenarios[0],
      INITIAL_SYSTEM_SETTINGS.approvalPolicies[0]
    );
    expect(selfApproveCheck.allowed).toBe(false);
  });

  it('14. Un cambio material invalida automáticamente la aprobación afectada', () => {
    const requests = buildInitialTravelRequests('usr_admin_ee');
    const approvedScenario = structuredClone(requests[0].scenarios[0]);
    expect(approvedScenario.approvalStatus).toBe('Aprobado');

    // Modify exchange rate (material change)
    approvedScenario.exchangeRate = 21.5;
    const { updatedScenario, wasInvalidated } = syncScenarioMaterialChanges(approvedScenario);
    expect(wasInvalidated).toBe(true);
    expect(updatedScenario.approvalStatus).toBe('Invalidado por modificación');
    expect(updatedScenario.approvals[0].invalidated).toBe(true);
  });

  it('15. Un documento comercial para el cliente nunca revela costos internos, comisiones ni márgenes', () => {
    const requests = buildInitialTravelRequests('usr_admin_ee');
    const req101 = requests[0];
    const commercialDoc = generateImmutableProposalDocument(
      req101,
      req101.scenarios,
      'comercial_cliente',
      'Valeria Montes',
      1,
      'Anticipo $500 USD',
      'Sujeto a disponibilidad',
      '2026-11-30',
      'Nota pública para el cliente'
    );

    expect(commercialDoc.immutableSnapshot.scenarios[0].internalBreakdown).toBeUndefined();
    const html = buildProposalPrintableHTML(commercialDoc);
    expect(html).not.toContain('Desglose Financiero Interno');
    expect(html).not.toContain('Gastos de operación interna EE');
    expect(canUserSeeInternalCosts(externalUser)).toBe(false);
  });

  it('16. El envío conserva la versión exacta y los escenarios incluidos', () => {
    const requests = buildInitialTravelRequests('usr_admin_ee');
    const dispatch = requests[0].dispatches[0];
    expect(dispatch.versionSent).toBe(1);
    expect(dispatch.scenarioIds).toEqual(['sc_101_a', 'sc_101_b', 'sc_101_c']);
  });

  it('17. La aceptación conserva la evidencia y el escenario seleccionado sin borrar los demás', () => {
    const requests = buildInitialTravelRequests('usr_admin_ee');
    const req103 = requests[2];
    expect(req103.outcomes[0].decision).toBe('Aceptada');
    expect(req103.outcomes[0].evidenceReference).toContain('.pdf');
    expect(req103.scenarios.length).toBeGreaterThanOrEqual(1);
  });

  it('18. Los cambios importantes quedan registrados en auditoría e historial de estados', () => {
    const requests = buildInitialTravelRequests('usr_admin_ee');
    expect(requests[0].statusHistory.length).toBeGreaterThanOrEqual(4);
    expect(requests[0].auditTrail.length).toBeGreaterThanOrEqual(1);
  });

  it('19. Las integraciones fallidas o repetidas no duplican operaciones (Idempotencia)', () => {
    const requests = buildInitialTravelRequests('usr_admin_ee');
    const req101 = requests[0];
    const xploreConn = structuredClone(INITIAL_SYSTEM_SETTINGS.integrations[0]);

    const firstSync = executeAdapterSync(xploreConn, req101, 'Sincronizar Expediente');
    expect(firstSync.wasDuplicateSkipped).toBe(false);
    expect(firstSync.syncLog.status).toBe('éxito');

    // Second identical call must be skipped via idempotency key
    const secondSync = executeAdapterSync(
      firstSync.updatedConnection,
      req101,
      'Sincronizar Expediente'
    );
    expect(secondSync.wasDuplicateSkipped).toBe(true);
    expect(secondSync.syncLog.status).toBe('omitido_idempotente');
  });

  it('20. La aplicación funciona aunque los conectores externos estén desactivados o en error', () => {
    const requests = buildInitialTravelRequests('usr_admin_ee');
    const req101 = requests[0];
    const wetravelConn = structuredClone(INITIAL_SYSTEM_SETTINGS.integrations[1]); // 'no configurada'

    const failedSync = executeAdapterSync(wetravelConn, req101, 'Sincronizar Viaje', true);
    expect(failedSync.syncLog.status).toBe('error');
    // Request and financial calculation remain intact
    const calc = calculateScenarioFinancials(req101.scenarios[0]);
    expect(calc.valid).toBe(true);
  });

  it('21. La Hoja Oficial EE reproduce exactamente los importes de Verano Grupal UK — Sol Camps Londres y Oxford', () => {
    const ukSheet = createOfficialUKExampleSheet('OPCION 1', 20);
    const calc = calculateEESheet(ukSheet);

    expect(calc.subTotal1Conceptos).toBe(4195.0);
    expect(calc.subTotalPerChaperon).toBe(2800.0);
    expect(calc.totalChaperones).toBe(2950.0);
    expect(calc.gastosDelLider).toBe(147.5);
    expect(calc.subTotal2ConLider).toBe(4342.5);
    expect(calc.comisionPerParticipant).toBe(807.5);
    expect(calc.comisionGroupTotalInCurrency).toBe(16150.0);
    expect(calc.precioFinalInCurrency).toBe(5150.0);
    expect(calc.estimadoEnPesosPerParticipant).toBe(136475.0);
    expect(calc.comisionGroupTotalInPesos).toBe(427975.0);
    expect(Number(calc.effectiveCommissionPercent.toFixed(2))).toBe(18.6);
  });

  it('22. El Administrador puede integrar rubros dinámicos en Conceptos o Chaperones y se recalculan en todas las columnas', () => {
    const ukSheet = createOfficialUKExampleSheet('OPCION 1', 20);
    const synced = syncAdminRubrosIntoSheet(ukSheet, [
      {
        id: 'adm_1',
        label: 'Trámite ETA Reino Unido',
        section: 'conceptos',
        defaultAmount: 55,
        isInternalOnly: false,
        createdAt: '2026-10-23T12:00:00Z',
        createdBy: 'Admin EE',
      },
    ]);
    const calc = calculateEESheet(synced);
    expect(calc.subTotal1Conceptos).toBe(4250.0); // 4195 + 55
  });
});

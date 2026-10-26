export type CurrencyCode = 'MXN' | 'USD' | 'CAD' | 'GBP' | 'EUR';

export type UserRole =
  | 'Administrador'
  | 'Ejecutivo Comercial'
  | 'Operaciones'
  | 'Finanzas'
  | 'Aprobador'
  | 'Usuario Externo'
  | (string & {});

export type UserType = 'interno' | 'externo';

export type UserStatus = 'activo' | 'inactivo' | 'invitado';

export interface RolePermissions {
  canViewRequests: boolean; // Solo ver / consultar expedientes
  canCreateRequests: boolean; // Crear nuevas solicitudes y escenarios
  canEditQuotes: boolean; // Editar cotizaciones, costos, rubros y comisiones
  canDeleteRecords: boolean; // Borrar / eliminar solicitudes, escenarios o rubros
  canAuthorizeQuotes: boolean; // Autorizar / aprobar cotizaciones en comité
  canViewInternalCosts: boolean; // Ver costos internos confidenciales y utilidad
  canExportDocuments: boolean; // Exportar propuestas PDF y sábanas Excel
  canManageConfigAndUsers: boolean; // Configurar roles, usuarios y parámetros globales
  officeScope: 'propia' | 'todas'; // Alcance por oficina asignada o nacional
  maxApprovalAmountMXN?: number; // Tope financiero de autorización (MXN)
}

export interface RoleDefinition {
  id: string;
  name: UserRole;
  description: string;
  isSystemDefault: boolean;
  userType: UserType;
  permissions: RolePermissions;
  updatedAt: string;
  updatedBy: string;
}

export interface Office {
  id: string;
  code: string;
  name: string;
  city: string;
  phone?: string;
  email?: string;
  address?: string;
  active: boolean;
  annualTargetMXN?: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  userType: UserType;
  officeId: string;
  allowedOffices: string[];
  status: UserStatus;
  sharedRequestIds?: string[];
  customPermissions?: Partial<RolePermissions>;
  lastActiveAt: string;
}

export type RequestStatus =
  | 'Borrador'
  | 'Recibida'
  | 'En análisis'
  | 'En cotización'
  | 'Pendiente de aprobación'
  | 'Aprobada'
  | 'Enviada'
  | 'En negociación'
  | 'Aceptada'
  | 'Rechazada'
  | 'Cancelada'
  | 'Vencida';

export type ProgramType =
  | 'Inmersión Académica'
  | 'Campamento de Verano'
  | 'Curso de Idiomas'
  | 'Tour Cultural y Universitario'
  | 'STEM & Robótica'
  | 'Liderazgo Internacional';

export interface ItineraryDayEntry {
  dayNumber: number;
  title: string;
  location: string;
  morningActivity: string;
  afternoonActivity: string;
  eveningActivity: string;
  mealsIncluded: string;
  accommodation: string;
}

export interface TravelSpecification {
  accommodationType: string;
  schoolOrProvider: string;
  coursesOrActivities: string;
  transfers: string;
  meals: string;
  insurance: string;
  flightsIncluded: boolean;
  flightDetails: string;
  excursions: string;
  accessibilityRequirements: string;
  operationalNotes: string;
  includedServices: string[];
  excludedServices: string[];
  customFields: Record<string, string>;
  itineraryDays?: ItineraryDayEntry[];
}

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
  category: 'solicitud' | 'propuesta' | 'evidencia_aceptacion' | 'interno';
  isExternalVisible: boolean;
  referenceUrl: string;
}

export type LineItemBasis =
  | 'por_participante'
  | 'por_chaperon'
  | 'por_staff'
  | 'por_grupo'
  | 'por_dia'
  | 'fijo';

export type LineItemCategory =
  | 'Precio neto del programa'
  | 'Transporte y traslados'
  | 'Comidas'
  | 'Kit EE'
  | 'Seguro'
  | 'Promociones y descuentos'
  | 'Envío de kits'
  | 'Gastos de operación'
  | 'Otros gastos'
  | 'Comisión de escuela'
  | 'Comisión de coordinadora'
  | 'Gastos del líder o responsable'
  | 'Compensación del líder'
  | 'Gastos de chaperones'
  | 'Fondo de emergencia'
  | 'Gastos por día'
  | 'Vuelos'
  | 'Impuestos'
  | 'Servicios adicionales'
  | 'Personalizado';

export interface QuoteLineItem {
  id: string;
  name: string;
  category: LineItemCategory;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  currency: CurrencyCode;
  basis: LineItemBasis;
  isInternalCostOnly: boolean;
  isMandatory: boolean;
  isTaxable: boolean;
  isIncludedInPrice: boolean;
  active: boolean;
}

export type ChaperoneAllocationMode =
  | 'distribuido_participantes'
  | 'absorbido_ee'
  | 'cobrado_separado';

export interface ChaperoneExpenseBreakdown {
  travelCostPerChaperone: number;
  insurancePerChaperone: number;
  transportPerChaperone: number;
  accommodationPerChaperone: number;
  mealsPerChaperone: number;
  kitPerChaperone: number;
  dailyStipendPerChaperone: number;
  extraordinaryExpensesPerChaperone: number;
  additionalCompensationPerChaperone: number;
  emergencyFundPerChaperone: number;
  leaderFixedExpense: number;
  leaderCompensation: number;
  staffCostPerPerson: number;
  currency: CurrencyCode;
  allocationMode: ChaperoneAllocationMode;
}

export type PricingStrategy = 'margin_on_sale' | 'markup_on_cost';
export type CommissionBasis = 'sobre_venta' | 'sobre_costo' | 'fijo_por_participante';

export interface FinancialParameters {
  formulaVersion: string;
  pricingStrategy: PricingStrategy;
  targetMarginOrMarkupPercent: number;
  schoolCommissionBasis: CommissionBasis;
  schoolCommissionValue: number;
  coordinatorCommissionBasis: CommissionBasis;
  coordinatorCommissionValue: number;
  discountPerParticipant: number;
  taxRatePercent: number;
}

/**
 * Official EE Spreadsheet Rubro Item (Left Conceptos Table or Right Chaperones Table)
 */
export interface EERubroRow {
  id: string;
  label: string;
  amount: number;
  note?: string; // e.g., 'avión' next to Otros gastos
  isCustomAdminRubro?: boolean;
  isInternalOnly?: boolean;
}

export interface PaymentPlanInstallment {
  number: number; // 0 = Inscripción, 1..15 = Parcialidades
  label: string;
  dueDate: string;
  percentOfTotal: number;
  amountInCurrency: number;
  amountInMXN: number;
}

export interface PaymentPlanConfig {
  includeRegistrationFee: boolean;
  registrationFeeMode: 'percent' | 'fixed';
  registrationFeeValue: number;
  registrationDueDate: string;
  installmentsCount: number; // 1 to 15 pagos
  frequency: 'mensual' | 'quincenal' | 'semanal';
  firstInstallmentDate: string;
  customInstallmentDates?: Record<number, string>;
}

export interface FreePlacesRuleConfig {
  enabled: boolean;
  studentsPerFreePlace: number; // e.g. 10, 12, 15 (ratio 1:10, 1:12, 1:15)
  benefitTarget: 'chaperon_gratis' | 'beca_alumno';
  scholarshipUnitValueInCurrency?: number;
}

export interface VolumePricingTier {
  tierLabel: string;
  participants: number;
  chaperones: number;
  earnedFreePlaces: number;
  leaderCostPerStudentInCurrency: number;
  sellingPriceInCurrency: number;
  sellingPriceInMXN: number;
  totalGroupInMXN: number;
  marginPercent: number;
}

export interface SupplierRateItem {
  id: string;
  providerName: string;
  category:
    | 'Escuela / Campus'
    | 'Operador DMC'
    | 'Aerolínea'
    | 'Seguro'
    | 'Transporte';
  destination: string;
  season: 'Temporada Alta' | 'Temporada Baja' | 'Todo el Año';
  currency: CurrencyCode;
  netCostPerStudent: number;
  chaperoneNetCost: number;
  freePlaceRatio: number; // e.g. 10 means 1:10
  validUntil: string;
  notes: string;
}

/**
 * Official EE Quotation Sheet Structure matching the exact Excel layout provided by EE:
 * Left Block: Conceptos (Precio Neto .. Comisión Coordinadora + custom rubros) -> SubTotal 1 -> Gastos del líder + Compensación del líder -> SubTotal 2 -> % Comisión / Comisión -> PRECIO FINAL -> Estimado en pesos
 * Right Block: Gastos de Chaperones (Escuela vs EE, Fondo de Emergencia, Gastos por día, Costo chaperon, Gastos del Viaje, Seguro, Transfer, Kit, Chaperon Extra + custom rubros) -> SubTotal / Chaperon -> SubTotal Chaperones + Fondo Emergencia -> Total
 */
export interface EESheetModel {
  optionTitle: string; // e.g. 'OPCION 1'
  programTitle: string; // e.g. 'Verano Grupal UK'
  destinationSubtitle: string; // e.g. 'Sol Camps Londres y Oxford'
  currencyLabel: string; // e.g. 'Libras', 'USD', 'CAD', 'EUR'
  currencyCode: CurrencyCode;
  exchangeRate: number; // e.g. 26.5
  participants: number; // e.g. 20
  days: number; // e.g. 21
  // Left Block: Conceptos por participante
  conceptos: EERubroRow[];
  overrideLeaderExpense: boolean;
  manualLeaderExpenseAmount: number;
  leaderCompensation: number; // e.g. 0.00
  // Bidirectional Commission / Final Price control
  pricingInputMode: 'percent' | 'final_price';
  commissionPercent: number; // e.g. 18.595279 -> displays 18.60%
  manualFinalPrice: number; // e.g. 5150.00
  // Right Block: Gastos de Chaperones
  chaperonesEscuela: number; // e.g. 0
  chaperonesEE: number; // e.g. 2
  emergencyFund: number; // e.g. 150.00
  dailyExpenseRate: number; // e.g. 25.00
  dailyExpenseCalculatedTotal: number; // e.g. 675.00
  chaperoneRubros: EERubroRow[];
  paymentPlan?: PaymentPlanConfig;
  freePlacesRule?: FreePlacesRuleConfig;
}

export interface SavedSheetTemplate {
  id: string;
  name: string;
  destination: string;
  programType: ProgramType;
  sheet: EESheetModel;
  createdAt: string;
  createdBy: string;
}

export interface AdminCustomRubroTemplate {
  id: string;
  label: string;
  section: 'conceptos' | 'chaperones';
  defaultAmount: number;
  defaultNote?: string;
  isInternalOnly: boolean;
  createdAt: string;
  createdBy: string;
}

export interface ScenarioCalculationResult {
  formulaVersion: string;
  calculatedAt: string;
  valid: boolean;
  errors: string[];
  assumptions: string[];
  costCurrency: CurrencyCode;
  saleCurrency: CurrencyCode;
  exchangeRateUsed: number;
  participants: number;
  chaperones: number;
  additionalStaff: number;
  days: number;
  nights: number;
  variableParticipantCost: number;
  variableChaperoneAndStaffCost: number;
  fixedGroupCost: number;
  dailyOperationalCost: number;
  chaperoneTotalInSaleCurrency: number;
  chaperoneAbsorbedByAgency: number;
  chaperoneDistributedToParticipants: number;
  chaperoneBilledSeparately: number;
  subtotalBaseCost: number;
  applicableTaxes: number;
  totalDirectCost: number;
  costPerParticipantBeforeCommissions: number;
  schoolCommissionTotal: number;
  coordinatorCommissionTotal: number;
  totalCommissions: number;
  totalDiscounts: number;
  totalScenarioCost: number;
  costPerParticipant: number;
  sellingPricePerParticipant: number;
  totalGroupSellingPrice: number;
  separateBilledTotal: number;
  estimatedProfit: number;
  estimatedMarginPercent: number;
  effectiveMarkupPercent: number;
  budgetTargetPerParticipant: number;
  budgetVariancePerParticipant: number;
  budgetVariancePercent: number;
  lineItemResults: {
    id: string;
    name: string;
    category: LineItemCategory;
    basis: LineItemBasis;
    originalAmount: number;
    originalCurrency: CurrencyCode;
    convertedAmountInSaleCurrency: number;
    perParticipantImpact: number;
    isInternalCostOnly: boolean;
    isIncludedInPrice: boolean;
  }[];
}

export interface QuoteScenarioVersion {
  versionNumber: number;
  createdAt: string;
  createdBy: string;
  changeSummary: string;
  snapshotCalculation: ScenarioCalculationResult;
  materialSignature: string;
}

export type ApprovalStatus =
  | 'No solicitada'
  | 'Pendiente'
  | 'Aprobado'
  | 'Rechazado'
  | 'Cambios solicitados'
  | 'Invalidado por modificación';

export interface ApprovalDecision {
  id: string;
  scenarioId: string;
  scenarioVersion: number;
  level: number;
  roleRequired: UserRole;
  approverUid: string;
  approverName: string;
  decision: 'Aprobar' | 'Rechazar' | 'Solicitar cambios';
  comments: string;
  rejectionReason?: string;
  decidedAt: string;
  invalidated?: boolean;
  invalidatedReason?: string;
}

export interface QuoteScenario {
  id: string;
  name: string;
  participants: number;
  chaperones: number;
  additionalStaff: number;
  days: number;
  nights: number;
  costCurrency: CurrencyCode;
  saleCurrency: CurrencyCode;
  exchangeRate: number;
  exchangeRateDate: string;
  exchangeRateValidUntil: string;
  createdAt: string;
  validUntil: string;
  createdByUid: string;
  createdByName: string;
  lineItems: QuoteLineItem[];
  chaperoneExpenses: ChaperoneExpenseBreakdown;
  financialParameters: FinancialParameters;
  eeSheet?: EESheetModel;
  currentVersion: number;
  versions: QuoteScenarioVersion[];
  approvalStatus: ApprovalStatus;
  requiredApprovalLevels: number;
  approvals: ApprovalDecision[];
  commercialStatus:
    | 'En preparación'
    | 'Lista para envío'
    | 'Enviada'
    | 'Seleccionada / Aceptada'
    | 'Descartada';
  lastMaterialSignature: string;
}

export interface ProposalDocument {
  id: string;
  requestId: string;
  folio: string;
  type: 'comercial_cliente' | 'interno_costos';
  versionNumber: number;
  scenarioIds: string[];
  generatedAt: string;
  generatedBy: string;
  paymentTerms: string;
  commercialConditions: string;
  validityDate: string;
  notes: string;
  immutableSnapshot: {
    folio: string;
    groupName: string;
    destination: string;
    dates: string;
    itineraryDays?: ItineraryDayEntry[];
    scenarios: {
      scenarioId: string;
      scenarioName: string;
      versionNumber: number;
      participants: number;
      chaperones: number;
      days: number;
      nights: number;
      saleCurrency: CurrencyCode;
      sellingPricePerParticipant: number;
      totalGroupSellingPrice: number;
      includedServices: string[];
      excludedServices: string[];
      paymentSchedule?: PaymentPlanInstallment[];
      volumeTiers?: VolumePricingTier[];
      currencyCode?: CurrencyCode;
      exchangeRate?: number;
      internalBreakdown?: ScenarioCalculationResult;
    }[];
  };
}

export interface ProposalDispatch {
  id: string;
  requestId: string;
  proposalDocumentId: string;
  versionSent: number;
  scenarioIds: string[];
  sentAt: string;
  sentByUid: string;
  sentByName: string;
  recipientName: string;
  recipientEmail: string;
  channel:
    | 'Correo electrónico (registro manual)'
    | 'Enlace compartido'
    | 'WhatsApp / Entrega directa';
  attachmentIds: string[];
  comments: string;
  followUpStatus:
    | 'Pendiente de respuesta'
    | 'En revisión con escuela'
    | 'Negociación activa'
    | 'Cerrado';
}

export interface ProposalOutcome {
  id: string;
  requestId: string;
  decision: 'Aceptada' | 'Rechazada';
  acceptedScenarioId?: string;
  acceptedScenarioVersion?: number;
  acceptedAmount?: number;
  acceptedCurrency?: CurrencyCode;
  recordedAt: string;
  recordedByUid: string;
  recordedByName: string;
  clientApproverName: string;
  evidenceReference: string;
  rejectionReason?: string;
  comments: string;
}

export interface StatusHistoryEntry {
  id: string;
  previousStatus: RequestStatus | 'Nuevo';
  newStatus: RequestStatus;
  changedByUid: string;
  changedByName: string;
  changedAt: string;
  note: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorUid: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  module: string;
  entityId: string;
  details: string;
}

export interface TravelRequest {
  id: string;
  folio: string;
  groupName: string;
  officeId: string;
  requesterName: string;
  requesterEmail: string;
  commercialExecutiveUid: string;
  commercialExecutiveName: string;
  createdAt: string;
  updatedAt: string;
  proposalDueDate: string;
  departureDate: string;
  returnDate: string;
  city: string;
  country: string;
  participants: number;
  chaperones: number;
  additionalStaff: number;
  estimatedBudgetPerPerson: number;
  budgetCurrency: CurrencyCode;
  programType: ProgramType;
  additionalComments: string;
  specialRequirements: string;
  status: RequestStatus;
  ownerUid: string;
  authorizedUids: string[];
  specifications: TravelSpecification;
  attachments: Attachment[];
  scenarios: QuoteScenario[];
  documents: ProposalDocument[];
  dispatches: ProposalDispatch[];
  outcomes: ProposalOutcome[];
  statusHistory: StatusHistoryEntry[];
  auditTrail: AuditLogEntry[];
}

export interface ExchangeRateConfig {
  id: string;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  updatedAt: string;
  validUntil: string;
  updatedBy: string;
}

export interface CatalogConceptTemplate {
  id: string;
  name: string;
  category: LineItemCategory;
  defaultUnit: string;
  defaultCost: number;
  defaultCurrency: CurrencyCode;
  defaultBasis: LineItemBasis;
  isInternalCostOnly: boolean;
  isMandatory: boolean;
  isTaxable: boolean;
}

export interface ApprovalPolicyRule {
  id: string;
  name: string;
  minMarginPercent: number;
  maxGroupAmountMXN: number;
  requiredLevels: number;
  requiredRoles: UserRole[];
  enforceSegregationOfDuties: boolean;
}

export interface IntegrationConnection {
  id: 'xploretogether' | 'wetravel' | 'wissify' | 'google_workspace';
  name: string;
  provider: string;
  description: string;
  status: 'no configurada' | 'disponible' | 'conectada' | 'error';
  isSimulationMode: boolean;
  endpointReference: string;
  lastSyncAt: string | null;
  retryPolicy: string;
  idempotencyEnabled: boolean;
  rateLimitInfo: string;
  syncLogs: IntegrationSyncLog[];
}

export interface IntegrationSyncLog {
  id: string;
  integrationId: string;
  idempotencyKey: string;
  timestamp: string;
  operation: string;
  targetFolio: string;
  status: 'éxito' | 'error' | 'omitido_idempotente';
  message: string;
}

export interface SystemSettings {
  formulaVersion: string;
  authorizedDomains: string[];
  offices: Office[];
  exchangeRates: ExchangeRateConfig[];
  catalogConcepts: CatalogConceptTemplate[];
  supplierRates?: SupplierRateItem[];
  adminCustomRubros?: AdminCustomRubroTemplate[];
  savedSheetTemplates?: SavedSheetTemplate[];
  roleDefinitions?: RoleDefinition[];
  approvalPolicies: ApprovalPolicyRule[];
  commercialTermsTemplate: string;
  paymentTermsTemplate: string;
  integrations: IntegrationConnection[];
  globalAuditLog: AuditLogEntry[];
}

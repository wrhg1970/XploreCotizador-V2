import React, { useState, useMemo } from 'react';
import {
  AdminCustomRubroTemplate,
  ApprovalDecision,
  ChaperoneAllocationMode,
  CommissionBasis,
  CurrencyCode,
  EESheetModel,
  ItineraryDayEntry,
  LineItemBasis,
  LineItemCategory,
  PricingStrategy,
  ProposalDispatch,
  ProposalOutcome,
  QuoteLineItem,
  QuoteScenario,
  RequestStatus,
  SavedSheetTemplate,
  SystemSettings,
  TravelRequest,
  UserProfile,
} from '../types/domain';
import {
  calculateScenarioFinancials,
  computeMaterialSignature,
  generateImmutableProposalDocument,
  syncScenarioMaterialChanges,
} from '../engine/financialEngine';
import {
  buildPaymentScheduleForSheet,
  buildSuggestedItineraryDays,
  buildVolumePricingTiersForSheet,
  calculateEESheet,
  createOfficialUKExampleSheet,
  ensurePaymentPlanConfig,
  ensureScenarioHasEESheet,
  syncAdminRubrosIntoSheet,
} from '../engine/eeSheetEngine';
import {
  EEColumnComparator,
  EEOfficialSheetEditor,
} from './EEOfficialSheetView';
import { ImmutableActivityLogPanel } from './ImmutableActivityLogPanel';
import {
  canUserSeeInternalCosts,
  resolveApplicableApprovalPolicy,
  validateApprovalPermission,
  validateCanDispatchProposal,
} from '../security/rbac';
import {
  buildProposalPrintableHTML,
  downloadProposalHTMLAsDocument,
  exportScenarioComparisonExcel,
  formatMoney,
} from '../utils/exporters';
import {
  CORE_PROCESS_STAGES,
  resolveCoreProcessStage,
  resolveUserResponsibilityInRequest,
} from '../utils/processStages';
import {
  ArrowLeft,
  Plus,
  Copy,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  Send,
  ShieldAlert,
  Save,
  Eye,
  Columns3,
  Clock,
  RefreshCw,
  Share2,
  GitCompare,
  Calendar,
  MapPin,
  Layers,
  Sparkles,
} from 'lucide-react';

interface RequestDetailDossierProps {
  request: TravelRequest;
  settings: SystemSettings;
  currentUser: UserProfile;
  initialTab?: DossierTab;
  onBack: () => void;
  onUpdateRequest: (updated: TravelRequest, auditAction: string, auditDetails: string) => void;
  onAddAdminRubro?: (rubro: AdminCustomRubroTemplate) => void;
  onSaveSheetTemplate?: (template: SavedSheetTemplate) => void;
  onOpenAISpreadsheetImporter?: () => void;
}

export type DossierTab =
  | 'general'
  | 'especificaciones'
  | 'escenarios'
  | 'comparativo'
  | 'aprobaciones'
  | 'documentos'
  | 'envios'
  | 'seguimiento'
  | 'historial';

const LINE_ITEM_CATEGORIES: LineItemCategory[] = [
  'Precio neto del programa',
  'Transporte y traslados',
  'Comidas',
  'Kit EE',
  'Seguro',
  'Promociones y descuentos',
  'Envío de kits',
  'Gastos de operación',
  'Otros gastos',
  'Comisión de escuela',
  'Comisión de coordinadora',
  'Gastos del líder o responsable',
  'Compensación del líder',
  'Gastos de chaperones',
  'Fondo de emergencia',
  'Gastos por día',
  'Vuelos',
  'Impuestos',
  'Servicios adicionales',
  'Personalizado',
];

export const RequestDetailDossier: React.FC<RequestDetailDossierProps> = ({
  request,
  settings,
  currentUser,
  initialTab = 'escenarios',
  onBack,
  onUpdateRequest,
  onAddAdminRubro,
  onSaveSheetTemplate,
  onOpenAISpreadsheetImporter,
}) => {
  const showInternalFinancials = canUserSeeInternalCosts(
    currentUser,
    settings.roleDefinitions
  );
  const [activeTab, setActiveTab] = useState<DossierTab>(
    showInternalFinancials ? initialTab : 'documentos'
  );
  const [quoterViewMode, setQuoterViewMode] = useState<'hoja_ee' | 'parametrico'>('hoja_ee');
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    request.scenarios[0]?.id || ''
  );
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
  } | null>(null);

  // New line item state
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>('');
  const [customConceptName, setCustomConceptName] = useState('');
  const [customConceptCategory, setCustomConceptCategory] =
    useState<LineItemCategory>('Servicios adicionales');
  const [customConceptCost, setCustomConceptCost] = useState(150);
  const [customConceptBasis, setCustomConceptBasis] =
    useState<LineItemBasis>('por_participante');

  // Approval decision form state
  const [approvalComment, setApprovalComment] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  // Proposal generation state
  const [docType, setDocType] = useState<'comercial_cliente' | 'interno_costos'>(
    'comercial_cliente'
  );
  const [docScenarioIds, setDocScenarioIds] = useState<string[]>(
    request.scenarios.map((s) => s.id)
  );
  const [docPaymentTerms, setDocPaymentTerms] = useState(settings.paymentTermsTemplate);
  const [docCommercialTerms, setDocCommercialTerms] = useState(
    settings.commercialTermsTemplate
  );
  const [docValidity, setDocValidity] = useState(request.proposalDueDate || '2026-11-30');
  const [docNotes, setDocNotes] = useState('');
  const [previewDocId, setPreviewDocId] = useState<string | null>(
    request.documents[0]?.id || null
  );

  // Dispatch form state
  const [dispatchRecipientName, setDispatchRecipientName] = useState(request.requesterName);
  const [dispatchRecipientEmail, setDispatchRecipientEmail] = useState(request.requesterEmail);
  const [dispatchChannel, setDispatchChannel] = useState<ProposalDispatch['channel']>(
    'Correo electrónico (registro manual)'
  );
  const [dispatchComments, setDispatchComments] = useState('');

  // Outcome (Acceptance / Rejection) form state
  const [outcomeDecision, setOutcomeDecision] = useState<'Aceptada' | 'Rechazada'>('Aceptada');
  const [outcomeScenarioId, setOutcomeScenarioId] = useState<string>(
    request.scenarios[0]?.id || ''
  );
  const [outcomeApproverName, setOutcomeApproverName] = useState(request.requesterName);
  const [outcomeEvidence, setOutcomeEvidence] = useState('Convenio_Aceptacion_Firmado.pdf');
  const [outcomeComments, setOutcomeComments] = useState('');

  // Interactive Client Proposal Portal ("Liga Compartible") state
  const [showClientPortalView, setShowClientPortalView] = useState(false);
  const [portalSelectedScenarioId, setPortalSelectedScenarioId] = useState<string>(
    request.scenarios[0]?.id || ''
  );
  const [portalFeedbackComment, setPortalFeedbackComment] = useState('');

  // Calculate SLA days remaining to proposalDueDate
  const slaInfo = useMemo(() => {
    const dueStr = request.proposalDueDate || '2026-11-15';
    const refNow = new Date('2026-10-23T12:00:00Z').getTime();
    const dueMs = new Date(`${dueStr}T12:00:00Z`).getTime();
    const daysRemaining = Math.round((dueMs - refNow) / (1000 * 60 * 60 * 24));
    const isClosed = ['Aceptada', 'Rechazada', 'Cancelada'].includes(request.status);
    return {
      daysRemaining,
      isExpired: !isClosed && (daysRemaining < 0 || request.status === 'Vencida'),
      isUrgent: !isClosed && daysRemaining >= 0 && daysRemaining <= 5,
      isClosed,
    };
  }, [request.proposalDueDate, request.status]);

  const handleRenewQuoteValidity = () => {
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + 15);
    const nextValidDate = baseDate.toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();

    const updatedScenarios = request.scenarios.map((sc, idx) => {
      const configuredRate =
        settings.exchangeRates.find((r) => r.fromCurrency === sc.costCurrency)?.rate ||
        sc.exchangeRate;
      const sheet = ensureScenarioHasEESheet(
        sc,
        idx,
        request.programType,
        `${request.city}, ${request.country}`,
        settings.adminCustomRubros || []
      );
      const updatedSheet: EESheetModel = {
        ...sheet,
        exchangeRate: configuredRate,
      };
      return {
        ...sc,
        validUntil: nextValidDate,
        exchangeRateDate: nowIso.slice(0, 10),
        exchangeRateValidUntil: nextValidDate,
        exchangeRate: configuredRate,
        eeSheet: updatedSheet,
      };
    });

    const nextStatus: RequestStatus =
      request.status === 'Vencida' ? 'En cotización' : request.status;

    onUpdateRequest(
      {
        ...request,
        proposalDueDate: nextValidDate,
        status: nextStatus,
        updatedAt: nowIso,
        scenarios: updatedScenarios,
      },
      'Renovación de vigencia (+15 días) y actualización de Tipo de Cambio',
      `Vigencia extendida hasta ${nextValidDate} con tipos de cambio vigentes.`
    );
    setDocValidity(nextValidDate);
    setFeedbackBanner({
      type: 'success',
      message: `Vigencia renovada por +15 días (nueva fecha límite: ${nextValidDate}) y tipos de cambio sincronizados en los ${updatedScenarios.length} escenarios.`,
    });
  };

  const activeScenario = useMemo(
    () =>
      request.scenarios.find((s) => s.id === selectedScenarioId) ||
      request.scenarios[0] ||
      null,
    [request.scenarios, selectedScenarioId]
  );

  const activeCalculation = useMemo(() => {
    if (!activeScenario) return null;
    return calculateScenarioFinancials(
      activeScenario,
      request.estimatedBudgetPerPerson,
      request.budgetCurrency
    );
  }, [activeScenario, request.estimatedBudgetPerPerson, request.budgetCurrency]);

  const mutateScenario = (
    scenarioId: string,
    updater: (sc: QuoteScenario) => QuoteScenario,
    auditLabel: string
  ) => {
    let scenarioTitle = '';
    let invalidatedNotice = '';
    const updatedScenarios = request.scenarios.map((sc) => {
      if (sc.id !== scenarioId) return sc;
      const modified = updater(structuredClone(sc));
      scenarioTitle = modified.name;
      const { updatedScenario, wasInvalidated } = syncScenarioMaterialChanges(modified);
      if (wasInvalidated) {
        invalidatedNotice = ' [Aprobación previa invalidada automáticamente por cambio material]';
        setFeedbackBanner({
          type: 'warning',
          message: `Cambio financiero material detectado en "${updatedScenario.name}". Las aprobaciones previas fueron invalidadas automáticamente y requieren nueva revisión.`,
        });
      }
      return updatedScenario;
    });

    onUpdateRequest(
      {
        ...request,
        updatedAt: new Date().toISOString(),
        scenarios: updatedScenarios,
      },
      auditLabel,
      `Escenario: ${scenarioTitle || scenarioId} (${request.folio})${invalidatedNotice}`
    );
  };

  const handleAddScenario = (duplicateCurrent: boolean) => {
    const letter = String.fromCharCode(65 + request.scenarios.length);
    const now = new Date().toISOString();
    let newSc: QuoteScenario;

    if (duplicateCurrent && activeScenario) {
      newSc = {
        ...structuredClone(activeScenario),
        id: `sc_${Date.now()}`,
        name: `Escenario ${letter}: ${activeScenario.participants + 5} Participantes + ${activeScenario.chaperones} Chaperones`,
        participants: activeScenario.participants + 5,
        createdAt: now,
        createdByUid: currentUser.uid,
        createdByName: currentUser.displayName,
        currentVersion: 1,
        approvalStatus: 'No solicitada',
        approvals: [],
        commercialStatus: 'En preparación',
      };
    } else {
      newSc = {
        id: `sc_${Date.now()}`,
        name: `Escenario ${letter}: ${request.participants} Participantes + ${request.chaperones} Chaperones`,
        participants: request.participants,
        chaperones: request.chaperones,
        additionalStaff: request.additionalStaff,
        days: 14,
        nights: 13,
        costCurrency: 'USD',
        saleCurrency: request.budgetCurrency,
        exchangeRate: 19.85,
        exchangeRateDate: now.slice(0, 10),
        exchangeRateValidUntil: request.proposalDueDate,
        createdAt: now,
        validUntil: request.proposalDueDate,
        createdByUid: currentUser.uid,
        createdByName: currentUser.displayName,
        lineItems: activeScenario ? structuredClone(activeScenario.lineItems) : [],
        chaperoneExpenses: activeScenario
          ? structuredClone(activeScenario.chaperoneExpenses)
          : {
              travelCostPerChaperone: 850,
              insurancePerChaperone: 95,
              transportPerChaperone: 120,
              accommodationPerChaperone: 900,
              mealsPerChaperone: 320,
              kitPerChaperone: 45,
              dailyStipendPerChaperone: 35,
              extraordinaryExpensesPerChaperone: 80,
              additionalCompensationPerChaperone: 150,
              emergencyFundPerChaperone: 150,
              leaderFixedExpense: 250,
              leaderCompensation: 350,
              staffCostPerPerson: 500,
              currency: 'USD',
              allocationMode: 'distribuido_participantes',
            },
        financialParameters: {
          formulaVersion: settings.formulaVersion,
          pricingStrategy: 'margin_on_sale',
          targetMarginOrMarkupPercent: 21,
          schoolCommissionBasis: 'sobre_venta',
          schoolCommissionValue: 5,
          coordinatorCommissionBasis: 'fijo_por_participante',
          coordinatorCommissionValue: 1200,
          discountPerParticipant: 0,
          taxRatePercent: 16,
        },
        currentVersion: 1,
        versions: [],
        approvalStatus: 'No solicitada',
        requiredApprovalLevels: 1,
        approvals: [],
        commercialStatus: 'En preparación',
        lastMaterialSignature: '',
      };
    }

      const calc = calculateScenarioFinancials(
        newSc,
        request.estimatedBudgetPerPerson,
        request.budgetCurrency
      );
      const nextOptionNumber = request.scenarios.length + 1;
      const baseSheet = activeScenario
        ? structuredClone(ensureScenarioHasEESheet(activeScenario))
        : ensureScenarioHasEESheet(newSc);
      newSc.eeSheet = syncAdminRubrosIntoSheet(
        {
          ...baseSheet,
          optionTitle: `OPCION ${nextOptionNumber}`,
          participants: newSc.participants,
          days: newSc.days,
          exchangeRate: newSc.exchangeRate,
        },
        settings.adminCustomRubros || []
      );
      const sig = computeMaterialSignature(newSc);
      newSc.lastMaterialSignature = sig;
    newSc.versions = [
      {
        versionNumber: 1,
        createdAt: now,
        createdBy: currentUser.displayName,
        changeSummary: 'Creación de escenario',
        snapshotCalculation: calc,
        materialSignature: sig,
      },
    ];

    const nextScenarios = [...request.scenarios, newSc];
    setSelectedScenarioId(newSc.id);
    setDocScenarioIds(nextScenarios.map((s) => s.id));
    onUpdateRequest(
      {
        ...request,
        updatedAt: now,
        scenarios: nextScenarios,
      },
      'Creación de nuevo escenario de cotización',
      `Se agregó ${newSc.name} en ${request.folio}`
    );
  };

  const handleSaveScenarioVersionSnapshot = () => {
    if (!activeScenario || !activeCalculation) return;
    const nextVersion = activeScenario.currentVersion + 1;
    const sig = computeMaterialSignature(activeScenario);
    mutateScenario(
      activeScenario.id,
      (sc) => ({
        ...sc,
        currentVersion: nextVersion,
        lastMaterialSignature: sig,
        versions: [
          ...sc.versions,
          {
            versionNumber: nextVersion,
            createdAt: new Date().toISOString(),
            createdBy: currentUser.displayName,
            changeSummary: `Instantánea v${nextVersion} guardada manualmente (${sc.participants} alumnos, margen ${activeCalculation.estimatedMarginPercent}%)`,
            snapshotCalculation: activeCalculation,
            materialSignature: sig,
          },
        ],
      }),
      `Guardado de versión v${nextVersion} de escenario`
    );
    setFeedbackBanner({
      type: 'success',
      message: `Versión v${nextVersion} congelada e incorporada al historial auditable del escenario.`,
    });
  };

  const handleRequestApproval = (scenario: QuoteScenario) => {
    const policy = resolveApplicableApprovalPolicy(
      scenario,
      request,
      settings.approvalPolicies
    );
    const updatedScenarios = request.scenarios.map((s) =>
      s.id === scenario.id
        ? {
            ...s,
            approvalStatus: 'Pendiente' as const,
            requiredApprovalLevels: policy.requiredLevels,
            lastMaterialSignature: computeMaterialSignature(s),
          }
        : s
    );

    onUpdateRequest(
      {
        ...request,
        status: 'Pendiente de aprobación',
        updatedAt: new Date().toISOString(),
        scenarios: updatedScenarios,
      },
      'Solicitud de aprobación interna',
      `Escenario "${scenario.name}" (v${scenario.currentVersion}) enviado a aprobación (${policy.name}).`
    );
    setFeedbackBanner({
      type: 'success',
      message: `Aprobación solicitada para "${scenario.name}" bajo ${policy.name}.`,
    });
  };

  const handleRecordApprovalDecision = (
    scenario: QuoteScenario,
    decision: 'Aprobar' | 'Rechazar' | 'Solicitar cambios'
  ) => {
    const policy = resolveApplicableApprovalPolicy(
      scenario,
      request,
      settings.approvalPolicies
    );
    const permCheck = validateApprovalPermission(
      currentUser,
      scenario,
      policy,
      settings.roleDefinitions
    );
    if (!permCheck.allowed) {
      setFeedbackBanner({
        type: 'error',
        message: permCheck.reason || 'No autorizado para aprobar este escenario.',
      });
      return;
    }

    if (decision === 'Rechazar' && !rejectionReason.trim()) {
      setFeedbackBanner({
        type: 'error',
        message: 'Debes indicar el motivo de rechazo.',
      });
      return;
    }

    const newDecision: ApprovalDecision = {
      id: `dec_${Date.now()}`,
      scenarioId: scenario.id,
      scenarioVersion: scenario.currentVersion,
      level: 1,
      roleRequired: currentUser.role,
      approverUid: currentUser.uid,
      approverName: currentUser.displayName,
      decision,
      comments: approvalComment.trim() || `Decisión: ${decision}`,
      rejectionReason: decision === 'Rechazar' ? rejectionReason.trim() : undefined,
      decidedAt: new Date().toISOString(),
    };

    const nextStatus =
      decision === 'Aprobar'
        ? 'Aprobado'
        : decision === 'Rechazar'
          ? 'Rechazado'
          : 'Cambios solicitados';

    const updatedScenarios = request.scenarios.map((s) =>
      s.id === scenario.id
        ? {
            ...s,
            approvalStatus: nextStatus as QuoteScenario['approvalStatus'],
            commercialStatus:
              decision === 'Aprobar' ? ('Lista para envío' as const) : s.commercialStatus,
            approvals: [...s.approvals, newDecision],
            lastMaterialSignature: computeMaterialSignature(s),
          }
        : s
    );

    const allApproved = updatedScenarios.every((s) => s.approvalStatus === 'Aprobado');

    onUpdateRequest(
      {
        ...request,
        status: allApproved ? 'Aprobada' : request.status,
        updatedAt: new Date().toISOString(),
        scenarios: updatedScenarios,
      },
      `Dictamen de aprobación: ${decision}`,
      `${currentUser.displayName} registró "${decision}" en "${scenario.name}" (v${scenario.currentVersion}).`
    );

    setApprovalComment('');
    setRejectionReason('');
    setFeedbackBanner({
      type: 'success',
      message: `Decisión "${decision}" registrada exitosamente para "${scenario.name}" (v${scenario.currentVersion}).`,
    });
  };

  const handleGenerateDocument = () => {
    const chosenScenarios = request.scenarios.filter((s) =>
      docScenarioIds.includes(s.id)
    );
    if (chosenScenarios.length === 0) {
      setFeedbackBanner({
        type: 'error',
        message: 'Selecciona al menos un escenario para generar el documento.',
      });
      return;
    }

    const nextVer = request.documents.length + 1;
    const newDoc = generateImmutableProposalDocument(
      request,
      chosenScenarios,
      docType,
      currentUser.displayName,
      nextVer,
      docPaymentTerms,
      docCommercialTerms,
      docValidity,
      docNotes
    );

    const nextDocs = [newDoc, ...request.documents];
    setPreviewDocId(newDoc.id);
    onUpdateRequest(
      {
        ...request,
        updatedAt: new Date().toISOString(),
        documents: nextDocs,
      },
      `Generación de documento (${docType === 'comercial_cliente' ? 'Propuesta Comercial' : 'Costeo Interno'})`,
      `Documento v${nextVer} generado con ${chosenScenarios.length} escenario(s).`
    );
    setFeedbackBanner({
      type: 'success',
      message: `Documento inmutable v${nextVer} generado correctamente. Recuerda registrar el envío en la pestaña Envíos cuando sea entregado al cliente.`,
    });
  };

  const handleRegisterDispatch = () => {
    const check = validateCanDispatchProposal(request, docScenarioIds, settings);
    if (!check.allowed) {
      setFeedbackBanner({
        type: 'error',
        message: check.reason || 'No se puede registrar el envío sin aprobaciones vigentes.',
      });
      return;
    }

    const latestCommercialDoc =
      request.documents.find((d) => d.type === 'comercial_cliente') ||
      generateImmutableProposalDocument(
        request,
        request.scenarios.filter((s) => docScenarioIds.includes(s.id)),
        'comercial_cliente',
        currentUser.displayName,
        request.documents.length + 1,
        docPaymentTerms,
        docCommercialTerms,
        docValidity,
        docNotes
      );

    const newDispatch: ProposalDispatch = {
      id: `disp_${Date.now()}`,
      requestId: request.id,
      proposalDocumentId: latestCommercialDoc.id,
      versionSent: latestCommercialDoc.versionNumber,
      scenarioIds: docScenarioIds,
      sentAt: new Date().toISOString(),
      sentByUid: currentUser.uid,
      sentByName: currentUser.displayName,
      recipientName: dispatchRecipientName.trim() || request.requesterName,
      recipientEmail: dispatchRecipientEmail.trim() || request.requesterEmail,
      channel: dispatchChannel,
      attachmentIds: request.attachments.map((a) => a.id),
      comments: dispatchComments.trim() || 'Propuesta enviada formalmente al cliente.',
      followUpStatus: 'En revisión con escuela',
    };

    const updatedScenarios = request.scenarios.map((s) =>
      docScenarioIds.includes(s.id)
        ? { ...s, commercialStatus: 'Enviada' as const }
        : s
    );

    const nextDocuments = request.documents.some((d) => d.id === latestCommercialDoc.id)
      ? request.documents
      : [latestCommercialDoc, ...request.documents];

    onUpdateRequest(
      {
        ...request,
        status: 'Enviada',
        updatedAt: new Date().toISOString(),
        scenarios: updatedScenarios,
        documents: nextDocuments,
        dispatches: [newDispatch, ...request.dispatches],
      },
      'Registro de envío de propuesta comercial',
      `Enviada v${newDispatch.versionSent} a ${newDispatch.recipientName} (${newDispatch.recipientEmail}) vía ${newDispatch.channel}.`
    );

    setDispatchComments('');
    setFeedbackBanner({
      type: 'success',
      message: `Envío de la versión v${newDispatch.versionSent} registrado y vinculado a los escenarios aprobados.`,
    });
  };

  const handleRegisterOutcome = () => {
    const chosenScenario = request.scenarios.find((s) => s.id === outcomeScenarioId);
    const calc = chosenScenario
      ? calculateScenarioFinancials(
          chosenScenario,
          request.estimatedBudgetPerPerson,
          request.budgetCurrency
        )
      : null;

    const newOutcome: ProposalOutcome = {
      id: `out_${Date.now()}`,
      requestId: request.id,
      decision: outcomeDecision,
      acceptedScenarioId: outcomeDecision === 'Aceptada' ? outcomeScenarioId : undefined,
      acceptedScenarioVersion:
        outcomeDecision === 'Aceptada' ? chosenScenario?.currentVersion : undefined,
      acceptedAmount:
        outcomeDecision === 'Aceptada' ? calc?.totalGroupSellingPrice : undefined,
      acceptedCurrency:
        outcomeDecision === 'Aceptada' ? chosenScenario?.saleCurrency : undefined,
      recordedAt: new Date().toISOString(),
      recordedByUid: currentUser.uid,
      recordedByName: currentUser.displayName,
      clientApproverName: outcomeApproverName.trim() || request.requesterName,
      evidenceReference: outcomeEvidence.trim() || 'Confirmacion_Escrita.pdf',
      rejectionReason:
        outcomeDecision === 'Rechazada' ? outcomeComments.trim() || 'Presupuesto fuera de rango' : undefined,
      comments: outcomeComments.trim(),
    };

    // Mark selected scenario without deleting or overwriting remaining scenarios
    const updatedScenarios = request.scenarios.map((s) => {
      if (outcomeDecision === 'Aceptada') {
        return {
          ...s,
          commercialStatus:
            s.id === outcomeScenarioId
              ? ('Seleccionada / Aceptada' as const)
              : s.commercialStatus,
        };
      }
      return s;
    });

    onUpdateRequest(
      {
        ...request,
        status: outcomeDecision === 'Aceptada' ? 'Aceptada' : 'Rechazada',
        updatedAt: new Date().toISOString(),
        scenarios: updatedScenarios,
        outcomes: [newOutcome, ...request.outcomes],
      },
      `Registro de ${outcomeDecision.toLowerCase()} de propuesta`,
      outcomeDecision === 'Aceptada'
        ? `Escenario "${chosenScenario?.name}" aceptado por ${newOutcome.clientApproverName}. Evidencia: ${newOutcome.evidenceReference}.`
        : `Propuesta rechazada. Motivo: ${newOutcome.rejectionReason}`
    );

    setFeedbackBanner({
      type: 'success',
      message: `Resultado comercial (${outcomeDecision}) registrado conservando todos los escenarios históricos.`,
    });
  };

  const TABS: {
    id: DossierTab;
    label: string;
    group: 'Operación' | 'Finanzas y Cotización' | 'Gobierno y Cierre';
    count?: number;
    internalOnly?: boolean;
  }[] = [
    { id: 'general', label: '01. Info General', group: 'Operación' },
    { id: 'especificaciones', label: '02. Especificaciones', group: 'Operación' },
    {
      id: 'escenarios',
      label: '03. Cotizador & Chaperones',
      group: 'Finanzas y Cotización',
      count: request.scenarios.length,
      internalOnly: true,
    },
    {
      id: 'comparativo',
      label: '04. Comparativo Columnas',
      group: 'Finanzas y Cotización',
      count: request.scenarios.length,
      internalOnly: true,
    },
    {
      id: 'documentos',
      label: '06. Propuestas & PDF',
      group: 'Finanzas y Cotización',
      count: request.documents.length,
    },
    {
      id: 'aprobaciones',
      label: '05. Aprobaciones',
      group: 'Gobierno y Cierre',
      internalOnly: true,
    },
    {
      id: 'envios',
      label: '07. Envíos',
      group: 'Gobierno y Cierre',
      count: request.dispatches.length,
    },
    {
      id: 'seguimiento',
      label: '08. Aceptación',
      group: 'Gobierno y Cierre',
      count: request.outcomes.length,
    },
    {
      id: 'historial',
      label: '09. Línea de Tiempo & Bitácora',
      group: 'Gobierno y Cierre',
      count: request.auditTrail.length + request.statusHistory.length,
    },
  ];

  const visibleTabs = TABS.filter((t) => !t.internalOnly || showInternalFinancials);

  const currentProcessStage = useMemo(
    () => resolveCoreProcessStage(request),
    [request]
  );

  const currentUserResponsibility = useMemo(
    () =>
      resolveUserResponsibilityInRequest(
        currentUser,
        request,
        settings.roleDefinitions
      ),
    [currentUser, request, settings.roleDefinitions]
  );

  // Compute live EE Sheet metrics for the Sticky Financial Summary Bar
  const activeEESheetSummary = useMemo(() => {
    if (!activeScenario) return null;
    const idx = Math.max(
      0,
      request.scenarios.findIndex((s) => s.id === activeScenario.id)
    );
    const sheet = ensureScenarioHasEESheet(
      activeScenario,
      idx,
      request.programType,
      `${request.city}, ${request.country}`,
      settings.adminCustomRubros || []
    );
    const calc = calculateEESheet(sheet);
    return { sheet, calc };
  }, [
    activeScenario,
    request.scenarios,
    request.programType,
    request.city,
    request.country,
    settings.adminCustomRubros,
  ]);

  const handleQuickStepStatus = (targetStatus: RequestStatus) => {
    if (!showInternalFinancials || targetStatus === request.status) return;
    const now = new Date().toISOString();
    onUpdateRequest(
      {
        ...request,
        status: targetStatus,
        updatedAt: now,
        statusHistory: [
          {
            id: `sh_${Date.now()}`,
            previousStatus: request.status,
            newStatus: targetStatus,
            changedByUid: currentUser.uid,
            changedByName: currentUser.displayName,
            changedAt: now,
            note: `Avance rápido desde barra de progreso a ${targetStatus}.`,
          },
          ...request.statusHistory,
        ],
      },
      `Cambio de etapa operativa a ${targetStatus}`,
      `Transición rápida en barra de flujo: ${request.status} → ${targetStatus}`
    );
    setFeedbackBanner({
      type: 'success',
      message: `Estado del expediente actualizado a "${targetStatus}" y registrado en la bitácora inmutable.`,
    });
  };

  return (
    <div className="space-y-4">
      {/* Top Dossier Header + Interactive Workflow Stepper */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              onClick={onBack}
              className="p-2 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              title="Volver al listado"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono">
                <span className="font-bold text-[#0B3B70]">{request.folio}</span>
                <span>·</span>
                <span className="font-semibold text-slate-800">
                  Estado actual: {request.status}
                </span>
                <span>·</span>
                <span>
                  Destino: {request.city}, {request.country}
                </span>
                <span>·</span>
                <span>Entrega límite: {request.proposalDueDate}</span>
              </div>
              <h1 className="text-lg font-bold text-slate-900 mt-1">
                {request.groupName}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Solicita: {request.requesterName} ({request.requesterEmail}) · Ejecutivo
                Xplore Together: {request.commercialExecutiveName}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                setActiveTab(activeTab === 'historial' ? 'general' : 'historial')
              }
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg border flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeTab === 'historial'
                  ? 'bg-[#0B3B70] text-white border-[#0B3B70]'
                  : 'text-slate-800 bg-slate-100 border-slate-300 hover:bg-slate-200'
              }`}
              title="Visualizar línea de tiempo gráfica de cambios de precio, estado y notas"
            >
              <Clock className="w-3.5 h-3.5 text-[#0B3B70] shrink-0" />
              <span>
                {activeTab === 'historial'
                  ? 'Volver a Ficha General'
                  : `Línea de Tiempo (${request.auditTrail.length + request.statusHistory.length})`}
              </span>
            </button>
            {showInternalFinancials && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setActiveTab(activeTab === 'comparativo' ? 'escenarios' : 'comparativo')
                  }
                  className="px-3.5 py-2 text-xs font-medium text-[#0B3B70] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 flex items-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  <Columns3 className="w-3.5 h-3.5" />
                  {activeTab === 'comparativo'
                    ? 'Ir al Cotizador de Rubros'
                    : `Comparar ${request.scenarios.length} Opciones`}
                </button>
                {onOpenAISpreadsheetImporter && (
                  <button
                    type="button"
                    onClick={onOpenAISpreadsheetImporter}
                    className="px-3.5 py-2 text-xs font-semibold text-emerald-950 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 flex items-center gap-1.5 whitespace-nowrap transition-colors"
                    title="Importar opciones o sábana desde Excel (.xlsx) o liga de Google Spreadsheets vía IA"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                    Importar Excel / Sheets con IA
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => exportScenarioComparisonExcel(request)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" /> Exportar
                  Excel
                </button>
                <button
                  type="button"
                  onClick={handleRenewQuoteValidity}
                  className="px-3.5 py-2 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 flex items-center gap-1.5 whitespace-nowrap transition-colors"
                  title="Extiende la fecha límite +15 días y sincroniza el tipo de cambio oficial"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-700" /> Renovar Vigencia (+15d)
                </button>
              </>
            )}
          </div>
        </div>

        {/* SLA / Vigencia Alert Strip when expired or urgent */}
        {(slaInfo.isExpired || slaInfo.isUrgent) && (
          <div
            className={`px-4 py-2.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
              slaInfo.isExpired
                ? 'bg-red-50 border-red-200 text-red-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" />
              <span>
                {slaInfo.isExpired ? (
                  <>
                    <strong>Alerta SLA — Cotización Vencida:</strong> La fecha límite (
                    <span className="font-mono">{request.proposalDueDate}</span>) ha expirado. Se recomienda renovar vigencia y actualizar tipo de cambio antes de enviar al colegio.
                  </>
                ) : (
                  <>
                    <strong>Seguimiento Comercial SLA:</strong> Esta propuesta vence en{' '}
                    <strong className="font-mono">{slaInfo.daysRemaining} día(s)</strong> (
                    <span className="font-mono">{request.proposalDueDate}</span>).
                  </>
                )}
              </span>
            </div>
            {showInternalFinancials && (
              <button
                type="button"
                onClick={handleRenewQuoteValidity}
                className="px-3 py-1 bg-white border border-current rounded-md font-semibold hover:bg-slate-50 shrink-0"
              >
                Extender +15 días y Recalcular FX →
              </button>
            )}
          </div>
        )}

        {/* Clear 4-Stage Process Bar: Solicitada -> Cotizada -> Aprobada -> Enviada */}
        <div className="pt-3 border-t border-slate-100 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Proceso Comercial en 4 Etapas (haz clic en una etapa para actualizar el estado o ir a su módulo)
            </span>
            <span className="font-mono tabular-nums">
              {request.participants} alumnos · {request.chaperones} chaperones base
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {CORE_PROCESS_STAGES.map((stageMeta) => {
              const isCompleted = stageMeta.stepNumber < currentProcessStage.stepNumber;
              const isCurrent = stageMeta.stepNumber === currentProcessStage.stepNumber;
              return (
                <button
                  key={stageMeta.id}
                  type="button"
                  onClick={() => {
                    if (stageMeta.id !== currentProcessStage.id && showInternalFinancials) {
                      handleQuickStepStatus(stageMeta.canonicalStatus);
                      setActiveTab(stageMeta.defaultTab);
                    } else if (showInternalFinancials) {
                      setActiveTab(stageMeta.defaultTab);
                    }
                  }}
                  className={`p-3 rounded-xl border text-left transition-colors flex flex-col justify-between gap-1 ${
                    isCurrent
                      ? 'bg-[#0B3B70] border-[#0B3B70] text-white'
                      : isCompleted
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900 hover:bg-emerald-100/70'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`text-[11px] font-mono ${
                        isCurrent
                          ? 'text-sky-200'
                          : isCompleted
                            ? 'text-emerald-700'
                            : 'text-slate-400'
                      }`}
                    >
                      Etapa 0{stageMeta.stepNumber}
                    </span>
                    {isCompleted && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    )}
                    {isCurrent && (
                      <span className="text-[10px] font-mono text-amber-300">
                        ETAPA ACTUAL
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-bold">{stageMeta.label}</div>
                  <div
                    className={`text-[11px] line-clamp-1 ${
                      isCurrent ? 'text-slate-200' : 'text-slate-500'
                    }`}
                  >
                    {stageMeta.shortDescription}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Current User Responsibility Callout Bar */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2 text-slate-500">
                <span>
                  Tu participación:{' '}
                  <strong className="text-slate-900">
                    {currentUserResponsibility.involvementRelation}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Proceso actual:{' '}
                  <strong className="text-[#0B3B70]">
                    0{currentProcessStage.stepNumber}. {currentProcessStage.label}
                  </strong>{' '}
                  ({request.status})
                </span>
              </div>
              <div className="text-slate-800">
                <strong className="text-slate-900">Tu responsabilidad en esta etapa: </strong>
                <span>{currentUserResponsibility.responsibilitySummary}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {showInternalFinancials &&
                currentUserResponsibility.nextStageToAdvance && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextSt = currentUserResponsibility.nextStageToAdvance!;
                      handleQuickStepStatus(nextSt.canonicalStatus);
                      setActiveTab(nextSt.defaultTab);
                    }}
                    className="px-3 py-1.5 font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap"
                  >
                    Pasar a Etapa 0{currentUserResponsibility.nextStageToAdvance.stepNumber}:{' '}
                    {currentUserResponsibility.nextStageToAdvance.label} →
                  </button>
                )}

              {activeTab !== currentUserResponsibility.targetTab && (
                <button
                  type="button"
                  onClick={() => setActiveTab(currentUserResponsibility.targetTab)}
                  className="px-3.5 py-1.5 font-semibold text-white bg-[#0B3B70] rounded-lg hover:bg-[#082d56] transition-colors whitespace-nowrap"
                >
                  {currentUserResponsibility.nextActionLabel} →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Notification Banner */}
      {feedbackBanner && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            feedbackBanner.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : feedbackBanner.type === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackBanner.type === 'error' || feedbackBanner.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            onClick={() => setFeedbackBanner(null)}
            className="text-xs underline ml-4 shrink-0"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Logical 3-Group Tab Navigation Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-2 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {(['Operación', 'Finanzas y Cotización', 'Gobierno y Cierre'] as const).map(
            (groupName, groupIdx) => {
              const groupTabs = visibleTabs.filter((t) => t.group === groupName);
              if (groupTabs.length === 0) return null;
              return (
                <React.Fragment key={groupName}>
                  {groupIdx > 0 && (
                    <div className="h-6 w-px bg-slate-200 mx-1.5 shrink-0" />
                  )}
                  <div className="flex items-center gap-1">
                    <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 select-none">
                      {groupName}:
                    </span>
                    {groupTabs.map((tab) => {
                      const isActive = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                            isActive
                              ? 'bg-[#0B3B70] text-white font-semibold shadow-2xs'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          <span>{tab.label}</span>
                          {typeof tab.count === 'number' && (
                            <span
                              className={`font-mono text-[11px] ${
                                isActive ? 'text-sky-200' : 'text-slate-400'
                              }`}
                            >
                              ({tab.count})
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </React.Fragment>
              );
            }
          )}
        </div>
      </div>

      {/* Sticky Financial Summary Bar when inside Quoter or Comparator */}
      {showInternalFinancials &&
        activeEESheetSummary &&
        (activeTab === 'escenarios' || activeTab === 'comparativo') && (
          <div className="sticky top-14 z-20 bg-[#0B3B70] text-white rounded-xl px-5 py-3 shadow-md border border-blue-900 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <span className="text-sky-200 block text-[10px] uppercase tracking-wider">
                  Escenario Activo
                </span>
                <strong className="font-mono text-sm">
                  {activeEESheetSummary.sheet.optionTitle} (
                  {activeEESheetSummary.sheet.participants} alum. ·{' '}
                  {activeEESheetSummary.sheet.days}d)
                </strong>
              </div>
              <div className="h-7 w-px bg-blue-800 hidden sm:block" />
              <div>
                <span className="text-sky-200 block text-[10px]">
                  SubTotal (Con Líder)
                </span>
                <span className="font-mono font-semibold text-sm tabular-nums">
                  {formatMoney(
                    activeEESheetSummary.calc.subTotal2ConLider,
                    activeEESheetSummary.sheet.currencyCode
                  )}{' '}
                  {activeEESheetSummary.sheet.currencyCode}
                </span>
              </div>
              <div className="h-7 w-px bg-blue-800 hidden sm:block" />
              <div>
                <span className="text-sky-200 block text-[10px]">
                  % Comisión / Utilidad
                </span>
                <span className="font-mono font-bold text-sm text-amber-300 tabular-nums">
                  {activeEESheetSummary.calc.effectiveCommissionPercent.toFixed(2)}% (
                  {formatMoney(
                    activeEESheetSummary.calc.comisionPerParticipant,
                    activeEESheetSummary.sheet.currencyCode
                  )}
                  )
                </span>
              </div>
              <div className="h-7 w-px bg-blue-800 hidden sm:block" />
              <div>
                <span className="text-sky-200 block text-[10px]">
                  PRECIO FINAL ({activeEESheetSummary.sheet.currencyCode})
                </span>
                <span className="font-mono font-bold text-sm text-white tabular-nums">
                  {formatMoney(
                    activeEESheetSummary.calc.precioFinalInCurrency,
                    activeEESheetSummary.sheet.currencyCode
                  )}{' '}
                  {activeEESheetSummary.sheet.currencyCode}
                </span>
              </div>
              <div className="h-7 w-px bg-blue-800 hidden sm:block" />
              <div>
                <span className="text-sky-200 block text-[10px]">
                  Estimado por Alumno (MXN)
                </span>
                <span className="font-mono font-bold text-sm text-emerald-300 tabular-nums">
                  {formatMoney(
                    activeEESheetSummary.calc.estimadoEnPesosPerParticipant,
                    'MXN'
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {request.scenarios.map((sc, i) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => setSelectedScenarioId(sc.id)}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                    sc.id === activeScenario?.id
                      ? 'bg-white text-[#0B3B70] font-bold'
                      : 'bg-blue-900/70 text-blue-100 hover:bg-blue-800'
                  }`}
                >
                  Opción {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}

      {/* TAB 1: INFORMACIÓN GENERAL */}
      {activeTab === 'general' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Información General del Expediente
              </h2>
              <p className="text-xs text-slate-500">
                Datos maestros de la solicitud e identificación del grupo
              </p>
            </div>
            {showInternalFinancials && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-600">Cambiar estado:</span>
                <select
                  value={request.status}
                  onChange={(e) => {
                    const nextStatus = e.target.value as RequestStatus;
                    const now = new Date().toISOString();
                    onUpdateRequest(
                      {
                        ...request,
                        status: nextStatus,
                        updatedAt: now,
                        statusHistory: [
                          {
                            id: `sh_${Date.now()}`,
                            previousStatus: request.status,
                            newStatus: nextStatus,
                            changedByUid: currentUser.uid,
                            changedByName: currentUser.displayName,
                            changedAt: now,
                            note: `Estado cambiado manualmente a ${nextStatus}.`,
                          },
                          ...request.statusHistory,
                        ],
                      },
                      `Cambio de estado a ${nextStatus}`,
                      `Estado anterior: ${request.status} → Nuevo: ${nextStatus}`
                    );
                  }}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg font-medium bg-slate-50"
                >
                  {[
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
                  ].map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="font-semibold text-slate-800">Datos del Solicitante</div>
              <div>
                <span className="text-slate-500 block">Institución / Grupo:</span>
                <span className="font-medium text-slate-900">{request.groupName}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Contacto Solicitante:</span>
                <span className="font-medium text-slate-900">{request.requesterName}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Correo Electrónico:</span>
                <span className="font-mono text-slate-800">{request.requesterEmail}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Ejecutivo Comercial EE:</span>
                <span className="font-medium text-slate-900">
                  {request.commercialExecutiveName}
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="font-semibold text-slate-800">Parámetros del Viaje</div>
              <div>
                <span className="text-slate-500 block">Destino:</span>
                <span className="font-medium text-slate-900">
                  {request.city}, {request.country}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Tipo de Programa:</span>
                <span className="font-medium text-slate-900">{request.programType}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Fechas de Salida y Regreso:</span>
                <span className="font-mono text-slate-900">
                  {request.departureDate} al {request.returnDate}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Fecha Límite de Propuesta:</span>
                <span className="font-mono font-semibold text-[#0B3B70]">
                  {request.proposalDueDate}
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="font-semibold text-slate-800">Aforo Base y Presupuesto</div>
              <div>
                <span className="text-slate-500 block">Participantes Pagantes Base:</span>
                <span className="font-mono font-semibold text-slate-900">
                  {request.participants} estudiantes
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Chaperones y Staff EE:</span>
                <span className="font-mono text-slate-900">
                  {request.chaperones} chaperones · {request.additionalStaff} staff adicional
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Presupuesto Estimado por Alumno:</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatMoney(request.estimatedBudgetPerPerson, request.budgetCurrency)}{' '}
                  {request.budgetCurrency}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Comentarios y Requerimientos:</span>
                <span className="text-slate-800">
                  {request.specialRequirements || request.additionalComments || 'Sin notas'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ESPECIFICACIONES */}
      {activeTab === 'especificaciones' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Especificaciones Operativas y Académicas
            </h2>
            <p className="text-xs text-slate-500">
              Configuración de alojamiento, proveedor, cursos, vuelos y servicios incluidos/excluidos
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-slate-500 block mb-1">Alojamiento</span>
              <strong className="text-slate-900">{request.specifications.accommodationType}</strong>
            </div>
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-slate-500 block mb-1">Escuela / Proveedor Receptor</span>
              <strong className="text-slate-900">
                {request.specifications.schoolOrProvider || 'Por confirmar'}
              </strong>
            </div>
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-slate-500 block mb-1">Cursos y Actividades</span>
              <strong className="text-slate-900">{request.specifications.coursesOrActivities}</strong>
            </div>
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-slate-500 block mb-1">Traslados y Alimentación</span>
              <strong className="text-slate-900">
                {request.specifications.transfers} · {request.specifications.meals}
              </strong>
            </div>
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-slate-500 block mb-1">Vuelos y Excursiones</span>
              <strong className="text-slate-900">
                {request.specifications.flightDetails} · {request.specifications.excursions}
              </strong>
            </div>
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-slate-500 block mb-1">Seguro y Accesibilidad</span>
              <strong className="text-slate-900">
                {request.specifications.insurance} · {request.specifications.accessibilityRequirements}
              </strong>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-3 border-t border-slate-200 text-xs">
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">
                Servicios Incluidos en Propuesta Comercial
              </h3>
              <ul className="list-disc list-inside space-y-1 text-slate-700 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                {request.specifications.includedServices.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">Servicios No Incluidos</h3>
              <ul className="list-disc list-inside space-y-1 text-slate-700 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                {request.specifications.excludedServices.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          </div>

          {Object.keys(request.specifications.customFields).length > 0 && (
            <div className="pt-3 border-t border-slate-200 text-xs">
              <h3 className="font-semibold text-slate-900 mb-2">
                Campos Configurables del Tipo de Programa ({request.programType})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {Object.entries(request.specifications.customFields).map(([k, v]) => (
                  <div
                    key={k}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <span className="text-slate-500 block">{k}</span>
                    <strong className="text-slate-900">{v}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* =====================================================================
              CONSTRUCTOR DE ITINERARIO DÍA POR DÍA ("DAY-BY-DAY VISUAL BUILDER" — MEJORA #2)
             ===================================================================== */}
          <div className="pt-5 border-t border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-[#0B3B70]">
                  <MapPin className="w-4 h-4" />
                  <span>CONSTRUCTOR DE ITINERARIO ACADÉMICO Y CULTURAL DÍA POR DÍA</span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                  Agenda Día por Día (Mañana, Tarde, Noche, Alimentos y Hospedaje)
                </h3>
                <p className="text-xs text-slate-500">
                  Este itinerario se integra automáticamente en el <strong>Portal Interactivo del Colegio</strong> y en el <strong>PDF Comercial Imprimible</strong>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    const targetDays =
                      (request.specifications.itineraryDays &&
                      request.specifications.itineraryDays.length > 0
                        ? request.specifications.itineraryDays.length
                        : activeScenario?.days) || 8;
                    const suggested = buildSuggestedItineraryDays(
                      `${request.city}, ${request.country} ${request.programType}`,
                      Math.min(15, Math.max(4, targetDays))
                    );
                    onUpdateRequest(
                      {
                        ...request,
                        updatedAt: new Date().toISOString(),
                        specifications: {
                          ...request.specifications,
                          itineraryDays: suggested,
                        },
                      },
                      'Generación automática de itinerario académico día por día',
                      `Se generaron ${suggested.length} días sugeridos para ${request.city}, ${request.country}.`
                    );
                    setFeedbackBanner({
                      type: 'success',
                      message: `Itinerario académico y cultural de ${suggested.length} días generado para ${request.city}, ${request.country}.`,
                    });
                  }}
                  className="px-3.5 py-2 font-semibold text-[#0B3B70] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Auto-Generar Itinerario Sugerido por Destino
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const currentDays = request.specifications.itineraryDays || [];
                    const nextNum = currentDays.length + 1;
                    const newDay: ItineraryDayEntry = {
                      dayNumber: nextNum,
                      title: `Día ${nextNum}: Sesiones Académicas y Visita Cultural en ${request.city}`,
                      location: `${request.city}, ${request.country}`,
                      morningActivity: 'Módulos académicos y taller práctico en campus receptor',
                      afternoonActivity: 'Recorrido cultural guiado y actividad de liderazgo',
                      eveningActivity: 'Cena grupal y reflexión con chaperones',
                      mealsIncluded: 'Desayuno, Comida y Cena',
                      accommodation: request.specifications.accommodationType || 'Residencia estudiantil',
                    };
                    onUpdateRequest(
                      {
                        ...request,
                        updatedAt: new Date().toISOString(),
                        specifications: {
                          ...request.specifications,
                          itineraryDays: [...currentDays, newDay],
                        },
                      },
                      `Adición de Día ${nextNum} al itinerario`,
                      `Se agregó Día ${nextNum} en ${request.folio}`
                    );
                  }}
                  className="px-3.5 py-2 font-semibold text-white bg-[#0B3B70] rounded-lg hover:bg-[#082d56] flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> + Añadir Día
                </button>
              </div>
            </div>

            {(!request.specifications.itineraryDays ||
              request.specifications.itineraryDays.length === 0) ? (
              <div className="p-6 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center space-y-2 text-xs">
                <p className="text-slate-600 font-medium">
                  Aún no se han capturado días en el itinerario de este expediente.
                </p>
                <p className="text-slate-500">
                  Haz clic en <strong>"Auto-Generar Itinerario Sugerido por Destino"</strong> para poblar la agenda completa de {request.city} en un clic.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {request.specifications.itineraryDays.map((dayItem, idx) => {
                  const updateDayField = (
                    patch: Partial<ItineraryDayEntry>
                  ) => {
                    const currentList = request.specifications.itineraryDays || [];
                    const nextList = currentList.map((d, i) =>
                      i === idx ? { ...d, ...patch } : d
                    );
                    onUpdateRequest(
                      {
                        ...request,
                        updatedAt: new Date().toISOString(),
                        specifications: {
                          ...request.specifications,
                          itineraryDays: nextList,
                        },
                      },
                      `Actualización de Día ${dayItem.dayNumber} del itinerario`,
                      `Modificación en "${dayItem.title}"`
                    );
                  };

                  return (
                    <div
                      key={`${dayItem.dayNumber}_${idx}`}
                      className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="px-2.5 py-1 bg-[#0B3B70] text-white font-mono font-bold rounded-md shrink-0">
                            DÍA {dayItem.dayNumber}
                          </span>
                          <input
                            type="text"
                            value={dayItem.title}
                            onChange={(e) =>
                              updateDayField({ title: e.target.value })
                            }
                            className="flex-1 px-2.5 py-1 border border-slate-300 rounded-lg bg-white font-bold text-slate-900"
                            placeholder="Título del día..."
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={dayItem.location}
                            onChange={(e) =>
                              updateDayField({ location: e.target.value })
                            }
                            className="w-48 px-2.5 py-1 border border-slate-300 rounded-lg bg-white font-medium text-slate-700"
                            placeholder="Sede / Ciudad..."
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const currentList =
                                request.specifications.itineraryDays || [];
                              const filtered = currentList
                                .filter((_, i) => i !== idx)
                                .map((d, i) => ({ ...d, dayNumber: i + 1 }));
                              onUpdateRequest(
                                {
                                  ...request,
                                  updatedAt: new Date().toISOString(),
                                  specifications: {
                                    ...request.specifications,
                                    itineraryDays: filtered,
                                  },
                                },
                                `Eliminación de Día ${dayItem.dayNumber} del itinerario`,
                                `Se reenumeraron los ${filtered.length} días restantes.`
                              );
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-600 border border-slate-200 bg-white rounded-lg"
                            title="Eliminar día"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Actividad Mañana (Académica / Taller)
                          </label>
                          <input
                            type="text"
                            value={dayItem.morningActivity}
                            onChange={(e) =>
                              updateDayField({ morningActivity: e.target.value })
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Actividad Tarde (Cultural / Visita)
                          </label>
                          <input
                            type="text"
                            value={dayItem.afternoonActivity}
                            onChange={(e) =>
                              updateDayField({ afternoonActivity: e.target.value })
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Actividad Noche / Integración
                          </label>
                          <input
                            type="text"
                            value={dayItem.eveningActivity}
                            onChange={(e) =>
                              updateDayField({ eveningActivity: e.target.value })
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500 shrink-0">
                            Alimentos:
                          </span>
                          <input
                            type="text"
                            value={dayItem.mealsIncluded}
                            onChange={(e) =>
                              updateDayField({ mealsIncluded: e.target.value })
                            }
                            className="flex-1 px-2.5 py-1 border border-slate-300 rounded-lg bg-white"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500 shrink-0">
                            Hospedaje:
                          </span>
                          <input
                            type="text"
                            value={dayItem.accommodation}
                            onChange={(e) =>
                              updateDayField({
                                accommodation: e.target.value,
                              })
                            }
                            className="flex-1 px-2.5 py-1 border border-slate-300 rounded-lg bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: COTIZADOR DE VIAJES, MOTOR FINANCIERO Y GASTOS DE CHAPERONES (MÓDULOS D, E y F) */}
      {activeTab === 'escenarios' && showInternalFinancials && activeScenario && activeCalculation && (
        <div className="space-y-6">
          {/* Scenario Selector Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {request.scenarios.map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => setSelectedScenarioId(sc.id)}
                  className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    sc.id === activeScenario.id
                      ? 'bg-[#0B3B70] text-white border-[#0B3B70]'
                      : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {sc.name} (v{sc.currentVersion} · {sc.approvalStatus})
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onOpenAISpreadsheetImporter && (
                <button
                  type="button"
                  onClick={onOpenAISpreadsheetImporter}
                  className="px-3 py-1.5 text-xs font-semibold text-emerald-950 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                  Importar de Excel / Google Sheets (IA)
                </button>
              )}
              <button
                type="button"
                onClick={() => handleAddScenario(true)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1"
              >
                <Copy className="w-3.5 h-3.5" /> Duplicar Escenario (+5 alumnos)
              </button>
              <button
                type="button"
                onClick={() => handleAddScenario(false)}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Nuevo Escenario
              </button>
              <button
                type="button"
                onClick={handleSaveScenarioVersionSnapshot}
                className="px-3 py-1.5 text-xs font-semibold text-[#0B3B70] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 flex items-center gap-1"
              >
                <Save className="w-3.5 h-3.5" /> Guardar Instantánea v{activeScenario.currentVersion + 1}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('comparativo')}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 flex items-center gap-1"
              >
                <Columns3 className="w-3.5 h-3.5" /> Comparar en Columnas ({request.scenarios.length})
              </button>
            </div>
          </div>

          {/* Quoter Mode Switcher: Hoja Oficial EE (Exact Spreadsheet Layout) vs Motor Paramétrico */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setQuoterViewMode('hoja_ee')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  quoterViewMode === 'hoja_ee'
                    ? 'bg-[#0B3B70] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hoja Oficial EE (Rubros + Chaperones Escuela/EE)
              </button>
              <button
                type="button"
                onClick={() => setQuoterViewMode('parametrico')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  quoterViewMode === 'parametrico'
                    ? 'bg-[#0B3B70] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Vista Paramétrica Detallada
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  const idx = request.scenarios.findIndex((s) => s.id === activeScenario.id);
                  const ukSheet = syncAdminRubrosIntoSheet(
                    createOfficialUKExampleSheet(
                      `OPCION ${idx >= 0 ? idx + 1 : 1}`,
                      activeScenario.participants
                    ),
                    settings.adminCustomRubros || []
                  );
                  mutateScenario(
                    activeScenario.id,
                    (sc) => ({
                      ...sc,
                      participants: ukSheet.participants,
                      days: ukSheet.days,
                      costCurrency: 'GBP',
                      exchangeRate: ukSheet.exchangeRate,
                      eeSheet: ukSheet,
                    }),
                    'Carga de plantilla oficial Verano Grupal UK — Sol Camps Londres y Oxford'
                  );
                }}
                className="px-3 py-1.5 text-xs font-medium text-[#0B3B70] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
              >
                Cargar Ejemplo Oficial UK (Sol Camps Londres y Oxford)
              </button>
            </div>
          </div>

          {quoterViewMode === 'hoja_ee' && (
            <EEOfficialSheetEditor
              scenario={activeScenario}
              scenarioIndex={Math.max(
                0,
                request.scenarios.findIndex((s) => s.id === activeScenario.id)
              )}
              request={request}
              adminCustomRubros={settings.adminCustomRubros || []}
              supplierRates={settings.supplierRates || []}
              currentUser={currentUser}
              onUpdateScenarioSheet={(nextSheet: EESheetModel, summary: string) => {
                const sheetCalc = calculateEESheet(nextSheet);
                mutateScenario(
                  activeScenario.id,
                  (sc) => ({
                    ...sc,
                    participants: nextSheet.participants,
                    days: nextSheet.days,
                    exchangeRate: nextSheet.exchangeRate,
                    chaperones: nextSheet.chaperonesEscuela + nextSheet.chaperonesEE,
                    financialParameters: {
                      ...sc.financialParameters,
                      targetMarginOrMarkupPercent: Number(
                        sheetCalc.effectiveCommissionPercent.toFixed(2)
                      ),
                    },
                    eeSheet: nextSheet,
                  }),
                  `Hoja Oficial EE: ${summary}`
                );
              }}
              onAddGlobalAdminRubro={(rubro) => {
                if (onAddAdminRubro) {
                  onAddAdminRubro(rubro);
                }
              }}
              savedTemplates={settings.savedSheetTemplates}
              onSaveSheetTemplate={onSaveSheetTemplate}
            />
          )}

          {/* Calculation Validation Errors if any */}
          {!activeCalculation.valid && (
            <div className="p-4 bg-red-50 border border-red-300 rounded-xl text-xs text-red-800">
              <strong className="block mb-1">
                Alerta del Motor Financiero (Operación bloqueada hasta corregir):
              </strong>
              <ul className="list-disc list-inside">
                {activeCalculation.errors.map((e, idx) => (
                  <li key={idx}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Scenario Parameters Strip + Live Financial Summary Cards */}
          {quoterViewMode === 'parametrico' && (
          <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left 7 cols: Parameters & Formula Strategy */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Parámetros del Escenario y Motor de Fórmulas ({activeScenario.financialParameters.formulaVersion})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Recálculo automático al modificar participantes, chaperones, días, divisas o estrategia de margen/recargo
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="sm:col-span-2">
                  <label className="block text-slate-600 mb-1">Nombre del Escenario</label>
                  <input
                    type="text"
                    value={activeScenario.name}
                    onChange={(e) =>
                      mutateScenario(
                        activeScenario.id,
                        (sc) => ({ ...sc, name: e.target.value }),
                        'Renombrar escenario'
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Participantes Pagantes</label>
                  <input
                    type="number"
                    min={1}
                    value={activeScenario.participants}
                    onChange={(e) =>
                      mutateScenario(
                        activeScenario.id,
                        (sc) => ({ ...sc, participants: Number(e.target.value) }),
                        'Cambio de número de participantes'
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-[#0B3B70]"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Chaperones</label>
                  <input
                    type="number"
                    min={0}
                    value={activeScenario.chaperones}
                    onChange={(e) =>
                      mutateScenario(
                        activeScenario.id,
                        (sc) => ({ ...sc, chaperones: Number(e.target.value) }),
                        'Cambio de número de chaperones'
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Días de viaje</label>
                  <input
                    type="number"
                    min={1}
                    value={activeScenario.days}
                    onChange={(e) =>
                      mutateScenario(
                        activeScenario.id,
                        (sc) => ({
                          ...sc,
                          days: Number(e.target.value),
                          nights: Math.max(1, Number(e.target.value) - 1),
                        }),
                        'Cambio de días de viaje'
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Divisa Costos</label>
                  <select
                    value={activeScenario.costCurrency}
                    onChange={(e) =>
                      mutateScenario(
                        activeScenario.id,
                        (sc) => ({ ...sc, costCurrency: e.target.value as CurrencyCode }),
                        'Cambio de divisa de costos'
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono bg-slate-50"
                  >
                    <option value="USD">USD</option>
                    <option value="CAD">CAD</option>
                    <option value="GBP">GBP</option>
                    <option value="EUR">EUR</option>
                    <option value="MXN">MXN</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Divisa Venta</label>
                  <select
                    value={activeScenario.saleCurrency}
                    onChange={(e) =>
                      mutateScenario(
                        activeScenario.id,
                        (sc) => ({ ...sc, saleCurrency: e.target.value as CurrencyCode }),
                        'Cambio de divisa de venta'
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono bg-slate-50"
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                    <option value="CAD">CAD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Tipo de Cambio</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.01"
                    value={activeScenario.exchangeRate}
                    onChange={(e) =>
                      mutateScenario(
                        activeScenario.id,
                        (sc) => ({ ...sc, exchangeRate: Number(e.target.value) }),
                        'Actualización de tipo de cambio en escenario'
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-semibold"
                  />
                </div>
              </div>

              {/* Financial Strategy Controls: Margin on Sale vs Markup on Cost & Commissions */}
              <div className="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Método de Precio (Módulo E)
                  </label>
                  <select
                    value={activeScenario.financialParameters.pricingStrategy}
                    onChange={(e) =>
                      mutateScenario(
                        activeScenario.id,
                        (sc) => ({
                          ...sc,
                          financialParameters: {
                            ...sc.financialParameters,
                            pricingStrategy: e.target.value as PricingStrategy,
                          },
                        }),
                        'Cambio entre Margen sobre Venta y Recargo sobre Costo'
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-slate-50 font-medium"
                  >
                    <option value="margin_on_sale">Margen sobre venta [Costo / (1 - m)]</option>
                    <option value="markup_on_cost">Recargo sobre costo [Costo × (1 + r)]</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    {activeScenario.financialParameters.pricingStrategy === 'margin_on_sale'
                      ? '% Margen Objetivo (< 100%)'
                      : '% Recargo sobre Costo'}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={activeScenario.financialParameters.targetMarginOrMarkupPercent}
                    onChange={(e) =>
                      mutateScenario(
                        activeScenario.id,
                        (sc) => ({
                          ...sc,
                          financialParameters: {
                            ...sc.financialParameters,
                            targetMarginOrMarkupPercent: Number(e.target.value),
                          },
                        }),
                        'Cambio de porcentaje de margen/recargo'
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-[#0B3B70]"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Descuento por Alumno ({activeScenario.saleCurrency})
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={activeScenario.financialParameters.discountPerParticipant}
                    onChange={(e) =>
                      mutateScenario(
                        activeScenario.id,
                        (sc) => ({
                          ...sc,
                          financialParameters: {
                            ...sc.financialParameters,
                            discountPerParticipant: Number(e.target.value),
                          },
                        }),
                        'Ajuste de descuento por participante'
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 mb-1">Base Comisión Escuela</label>
                  <select
                    value={activeScenario.financialParameters.schoolCommissionBasis}
                    onChange={(e) =>
                      mutateScenario(
                        activeScenario.id,
                        (sc) => ({
                          ...sc,
                          financialParameters: {
                            ...sc.financialParameters,
                            schoolCommissionBasis: e.target.value as CommissionBasis,
                          },
                        }),
                        'Cambio base comisión escuela'
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-slate-50"
                  >
                    <option value="sobre_venta">% Sobre precio de venta</option>
                    <option value="sobre_costo">% Sobre costo directo</option>
                    <option value="fijo_por_participante">Monto fijo por participante</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 mb-1">Valor Comisión Escuela</label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    value={activeScenario.financialParameters.schoolCommissionValue}
                    onChange={(e) =>
                      mutateScenario(
                        activeScenario.id,
                        (sc) => ({
                          ...sc,
                          financialParameters: {
                            ...sc.financialParameters,
                            schoolCommissionValue: Number(e.target.value),
                          },
                        }),
                        'Cambio valor comisión escuela'
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 mb-1">
                    Comisión Coordinadora (Fijo/Alumno)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={activeScenario.financialParameters.coordinatorCommissionValue}
                    onChange={(e) =>
                      mutateScenario(
                        activeScenario.id,
                        (sc) => ({
                          ...sc,
                          financialParameters: {
                            ...sc.financialParameters,
                            coordinatorCommissionValue: Number(e.target.value),
                          },
                        }),
                        'Cambio comisión coordinadora'
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Right 5 cols: Real-Time Financial Summary Ledger */}
            <div className="lg:col-span-5 bg-[#0B3B70] text-white rounded-xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs text-blue-200 border-b border-blue-800 pb-2.5">
                  <span>RESUMEN AUDITABLE DEL ESCENARIO</span>
                  <span className="font-mono">v{activeScenario.currentVersion} · {activeScenario.saleCurrency}</span>
                </div>

                <div className="grid grid-cols-2 gap-4 my-4">
                  <div>
                    <div className="text-xs text-blue-200">Precio Venta / Participante</div>
                    <div className="text-2xl font-bold font-mono tabular-nums mt-0.5">
                      {formatMoney(
                        activeCalculation.sellingPricePerParticipant,
                        activeCalculation.saleCurrency
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-blue-200">Precio Total del Grupo</div>
                    <div className="text-xl font-bold font-mono tabular-nums mt-0.5">
                      {formatMoney(
                        activeCalculation.totalGroupSellingPrice,
                        activeCalculation.saleCurrency
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs border-t border-blue-800 pt-3 font-mono tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-blue-200">Costo directo base:</span>
                    <span>
                      {formatMoney(
                        activeCalculation.totalDirectCost,
                        activeCalculation.saleCurrency
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-200">Gastos chaperones/líderes:</span>
                    <span>
                      {formatMoney(
                        activeCalculation.chaperoneTotalInSaleCurrency,
                        activeCalculation.saleCurrency
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-200">Comisiones (Escuela + Coord.):</span>
                    <span>
                      {formatMoney(
                        activeCalculation.totalCommissions,
                        activeCalculation.saleCurrency
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold border-t border-blue-800/80 pt-1">
                    <span className="text-blue-100">Costo total del escenario:</span>
                    <span>
                      {formatMoney(
                        activeCalculation.totalScenarioCost,
                        activeCalculation.saleCurrency
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-200">Costo unitario por participante:</span>
                    <span>
                      {formatMoney(
                        activeCalculation.costPerParticipant,
                        activeCalculation.saleCurrency
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-300 font-semibold pt-1">
                    <span>Utilidad neta estimada:</span>
                    <span>
                      {formatMoney(
                        activeCalculation.estimatedProfit,
                        activeCalculation.saleCurrency
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-300">
                    <span>Margen sobre venta / Recargo efectivo:</span>
                    <span>
                      {activeCalculation.estimatedMarginPercent.toFixed(2)}% /{' '}
                      {activeCalculation.effectiveMarkupPercent.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-blue-200 pt-1 border-t border-blue-800/80">
                    <span>Variación vs presupuesto alumno:</span>
                    <span>
                      {activeCalculation.budgetVariancePerParticipant >= 0 ? '+' : ''}
                      {formatMoney(
                        activeCalculation.budgetVariancePerParticipant,
                        activeCalculation.saleCurrency
                      )}{' '}
                      ({activeCalculation.budgetVariancePercent.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-blue-800 flex items-center justify-between text-xs">
                <span className="text-blue-200">
                  Aprobación: <strong className="text-white">{activeScenario.approvalStatus}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => handleRequestApproval(activeScenario)}
                  className="px-3 py-1.5 bg-white text-[#0B3B70] font-semibold rounded-lg hover:bg-blue-50"
                >
                  Solicitar Aprobación →
                </button>
              </div>
            </div>
          </div>

          {/* SUBMÓDULO F: GASTOS DE CHAPERONES, LÍDERES Y STAFF */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Módulo F. Submódulo de Gastos de Chaperones, Líderes y Staff ({activeScenario.chaperones} chaperones · {activeScenario.additionalStaff} staff)
                </h3>
                <p className="text-xs text-slate-500">
                  Configura qué gastos se prorratean entre participantes, cuáles absorbe EE y cuáles se cobran por separado
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-slate-700">Política de absorción:</span>
                <select
                  value={activeScenario.chaperoneExpenses.allocationMode}
                  onChange={(e) =>
                    mutateScenario(
                      activeScenario.id,
                      (sc) => ({
                        ...sc,
                        chaperoneExpenses: {
                          ...sc.chaperoneExpenses,
                          allocationMode: e.target.value as ChaperoneAllocationMode,
                        },
                      }),
                      'Cambio en política de absorción de gastos de chaperones'
                    )
                  }
                  className="px-3 py-1.5 border border-slate-300 rounded-lg font-medium bg-slate-50"
                >
                  <option value="distribuido_participantes">
                    Distribuir / Prorratear entre los {activeScenario.participants} participantes
                  </option>
                  <option value="absorbido_ee">
                    Absorbido por la agencia EE (impacta margen interno)
                  </option>
                  <option value="cobrado_separado">
                    Cobrado y facturado por separado al colegio
                  </option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
              <div>
                <label className="block text-slate-600 mb-1">
                  Viaje / Vuelo por Chaperón ({activeScenario.chaperoneExpenses.currency})
                </label>
                <input
                  type="number"
                  min={0}
                  value={activeScenario.chaperoneExpenses.travelCostPerChaperone}
                  onChange={(e) =>
                    mutateScenario(
                      activeScenario.id,
                      (sc) => ({
                        ...sc,
                        chaperoneExpenses: {
                          ...sc.chaperoneExpenses,
                          travelCostPerChaperone: Number(e.target.value),
                        },
                      }),
                      'Actualización gasto de viaje chaperón'
                    )
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Alojamiento por Chaperón</label>
                <input
                  type="number"
                  min={0}
                  value={activeScenario.chaperoneExpenses.accommodationPerChaperone}
                  onChange={(e) =>
                    mutateScenario(
                      activeScenario.id,
                      (sc) => ({
                        ...sc,
                        chaperoneExpenses: {
                          ...sc.chaperoneExpenses,
                          accommodationPerChaperone: Number(e.target.value),
                        },
                      }),
                      'Actualización alojamiento chaperón'
                    )
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Alimentación por Chaperón</label>
                <input
                  type="number"
                  min={0}
                  value={activeScenario.chaperoneExpenses.mealsPerChaperone}
                  onChange={(e) =>
                    mutateScenario(
                      activeScenario.id,
                      (sc) => ({
                        ...sc,
                        chaperoneExpenses: {
                          ...sc.chaperoneExpenses,
                          mealsPerChaperone: Number(e.target.value),
                        },
                      }),
                      'Actualización alimentos chaperón'
                    )
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Seguro + Kit Chaperón</label>
                <input
                  type="number"
                  min={0}
                  value={activeScenario.chaperoneExpenses.insurancePerChaperone}
                  onChange={(e) =>
                    mutateScenario(
                      activeScenario.id,
                      (sc) => ({
                        ...sc,
                        chaperoneExpenses: {
                          ...sc.chaperoneExpenses,
                          insurancePerChaperone: Number(e.target.value),
                        },
                      }),
                      'Actualización seguro chaperón'
                    )
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">
                  Viáticos por Día ({activeScenario.days} días)
                </label>
                <input
                  type="number"
                  min={0}
                  value={activeScenario.chaperoneExpenses.dailyStipendPerChaperone}
                  onChange={(e) =>
                    mutateScenario(
                      activeScenario.id,
                      (sc) => ({
                        ...sc,
                        chaperoneExpenses: {
                          ...sc.chaperoneExpenses,
                          dailyStipendPerChaperone: Number(e.target.value),
                        },
                      }),
                      'Actualización viático diario chaperón'
                    )
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Compensación + Fondo Emerg.</label>
                <input
                  type="number"
                  min={0}
                  value={activeScenario.chaperoneExpenses.additionalCompensationPerChaperone}
                  onChange={(e) =>
                    mutateScenario(
                      activeScenario.id,
                      (sc) => ({
                        ...sc,
                        chaperoneExpenses: {
                          ...sc.chaperoneExpenses,
                          additionalCompensationPerChaperone: Number(e.target.value),
                        },
                      }),
                      'Actualización compensación chaperón'
                    )
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Gastos Fijos del Líder</label>
                <input
                  type="number"
                  min={0}
                  value={activeScenario.chaperoneExpenses.leaderFixedExpense}
                  onChange={(e) =>
                    mutateScenario(
                      activeScenario.id,
                      (sc) => ({
                        ...sc,
                        chaperoneExpenses: {
                          ...sc.chaperoneExpenses,
                          leaderFixedExpense: Number(e.target.value),
                        },
                      }),
                      'Actualización gasto fijo de líder'
                    )
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Compensación del Líder</label>
                <input
                  type="number"
                  min={0}
                  value={activeScenario.chaperoneExpenses.leaderCompensation}
                  onChange={(e) =>
                    mutateScenario(
                      activeScenario.id,
                      (sc) => ({
                        ...sc,
                        chaperoneExpenses: {
                          ...sc.chaperoneExpenses,
                          leaderCompensation: Number(e.target.value),
                        },
                      }),
                      'Actualización compensación líder'
                    )
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Costo por Staff EE</label>
                <input
                  type="number"
                  min={0}
                  value={activeScenario.chaperoneExpenses.staffCostPerPerson}
                  onChange={(e) =>
                    mutateScenario(
                      activeScenario.id,
                      (sc) => ({
                        ...sc,
                        chaperoneExpenses: {
                          ...sc.chaperoneExpenses,
                          staffCostPerPerson: Number(e.target.value),
                        },
                      }),
                      'Actualización costo staff EE'
                    )
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div className="sm:col-span-3 bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <span className="text-slate-500 block">
                    Total Chaperones, Líder y Staff ({activeScenario.saleCurrency}):
                  </span>
                  <strong className="font-mono text-sm text-slate-900">
                    {formatMoney(
                      activeCalculation.chaperoneTotalInSaleCurrency,
                      activeScenario.saleCurrency
                    )}
                  </strong>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block">Impacto en Costo por Alumno:</span>
                  <strong className="font-mono text-sm text-[#0B3B70]">
                    {activeScenario.participants > 0
                      ? formatMoney(
                          activeCalculation.chaperoneDistributedToParticipants /
                            activeScenario.participants,
                          activeScenario.saleCurrency
                        )
                      : '$0.00'}{' '}
                    / alumno
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* CONFIGURABLE LINE ITEMS TABLE (MÓDULO D) */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Conceptos Configurables del Escenario ({activeScenario.lineItems.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Agrega conceptos del catálogo oficial EE o conceptos personalizados sin alterar cotizaciones históricas
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={selectedCatalogId}
                  onChange={(e) => setSelectedCatalogId(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-slate-50"
                >
                  <option value="">+ Agregar desde Catálogo EE...</option>
                  {settings.catalogConcepts.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} (${cat.defaultCost} {cat.defaultCurrency} · {cat.defaultBasis})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const tpl = settings.catalogConcepts.find(
                      (c) => c.id === selectedCatalogId
                    );
                    if (!tpl) return;
                    const newItem: QuoteLineItem = {
                      id: `li_${Date.now()}`,
                      name: tpl.name,
                      category: tpl.category,
                      description: `Concepto de catálogo: ${tpl.category}`,
                      quantity: 1,
                      unit: tpl.defaultUnit,
                      unitCost: tpl.defaultCost,
                      currency: tpl.defaultCurrency,
                      basis: tpl.defaultBasis,
                      isInternalCostOnly: tpl.isInternalCostOnly,
                      isMandatory: tpl.isMandatory,
                      isTaxable: tpl.isTaxable,
                      isIncludedInPrice: true,
                      active: true,
                    };
                    mutateScenario(
                      activeScenario.id,
                      (sc) => ({ ...sc, lineItems: [...sc.lineItems, newItem] }),
                      `Agregado concepto de catálogo: ${tpl.name}`
                    );
                    setSelectedCatalogId('');
                  }}
                  className="px-3 py-1.5 bg-[#0B3B70] text-white font-semibold rounded-lg hover:bg-[#082d56]"
                >
                  Insertar de Catálogo
                </button>
              </div>
            </div>

            {/* Custom Concept Quick Adder */}
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
              <input
                type="text"
                value={customConceptName}
                onChange={(e) => setCustomConceptName(e.target.value)}
                placeholder="Nombre de concepto personalizado..."
                className="sm:col-span-2 px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
              />
              <select
                value={customConceptCategory}
                onChange={(e) =>
                  setCustomConceptCategory(e.target.value as LineItemCategory)
                }
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
              >
                {LINE_ITEM_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  min={0}
                  value={customConceptCost}
                  onChange={(e) => setCustomConceptCost(Number(e.target.value))}
                  className="w-24 px-2 py-1.5 border border-slate-300 rounded-lg bg-white font-mono"
                />
                <select
                  value={customConceptBasis}
                  onChange={(e) =>
                    setCustomConceptBasis(e.target.value as LineItemBasis)
                  }
                  className="flex-1 px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="por_participante">Por alumno</option>
                  <option value="por_chaperon">Por chaperón</option>
                  <option value="por_grupo">Por grupo</option>
                  <option value="por_dia">Por día</option>
                  <option value="fijo">Importe fijo</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!customConceptName.trim()) return;
                  const newItem: QuoteLineItem = {
                    id: `li_custom_${Date.now()}`,
                    name: customConceptName.trim(),
                    category: customConceptCategory,
                    description: 'Concepto personalizado',
                    quantity: 1,
                    unit: 'unidad',
                    unitCost: Number(customConceptCost) || 0,
                    currency: activeScenario.costCurrency,
                    basis: customConceptBasis,
                    isInternalCostOnly: false,
                    isMandatory: false,
                    isTaxable: false,
                    isIncludedInPrice: true,
                    active: true,
                  };
                  mutateScenario(
                    activeScenario.id,
                    (sc) => ({ ...sc, lineItems: [...sc.lineItems, newItem] }),
                    `Agregado concepto personalizado: ${newItem.name}`
                  );
                  setCustomConceptName('');
                }}
                className="px-3 py-1.5 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Añadir Concepto
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Activo</th>
                    <th className="py-2.5 px-3">Concepto / Categoría</th>
                    <th className="py-2.5 px-3">Base de Cálculo</th>
                    <th className="py-2.5 px-3 text-right">Cant.</th>
                    <th className="py-2.5 px-3 text-right">Costo Unitario</th>
                    <th className="py-2.5 px-3">Moneda</th>
                    <th className="py-2.5 px-3">Visibilidad</th>
                    <th className="py-2.5 px-3 text-right">Importe ({activeScenario.saleCurrency})</th>
                    <th className="py-2.5 px-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {activeScenario.lineItems.map((item) => {
                    const calcRow = activeCalculation.lineItemResults.find(
                      (r) => r.id === item.id
                    );
                    return (
                      <tr
                        key={item.id}
                        className={item.active ? 'hover:bg-slate-50' : 'bg-slate-100/70 opacity-60'}
                      >
                        <td className="py-2.5 px-3">
                          <input
                            type="checkbox"
                            checked={item.active}
                            onChange={(e) =>
                              mutateScenario(
                                activeScenario.id,
                                (sc) => ({
                                  ...sc,
                                  lineItems: sc.lineItems.map((li) =>
                                    li.id === item.id
                                      ? { ...li, active: e.target.checked }
                                      : li
                                  ),
                                }),
                                'Activar/desactivar concepto'
                              )
                            }
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-900">{item.name}</div>
                          <div className="text-slate-500">
                            {item.category} · {item.isIncludedInPrice ? 'Incluido en precio' : 'Cobrado por separado'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <select
                            value={item.basis}
                            onChange={(e) =>
                              mutateScenario(
                                activeScenario.id,
                                (sc) => ({
                                  ...sc,
                                  lineItems: sc.lineItems.map((li) =>
                                    li.id === item.id
                                      ? { ...li, basis: e.target.value as LineItemBasis }
                                      : li
                                  ),
                                }),
                                'Cambio de base de cálculo de concepto'
                              )
                            }
                            className="px-2 py-1 border border-slate-300 rounded bg-white"
                          >
                            <option value="por_participante">Por participante</option>
                            <option value="por_chaperon">Por chaperón</option>
                            <option value="por_grupo">Por grupo</option>
                            <option value="por_dia">Por día</option>
                            <option value="fijo">Importe fijo</option>
                          </select>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) =>
                              mutateScenario(
                                activeScenario.id,
                                (sc) => ({
                                  ...sc,
                                  lineItems: sc.lineItems.map((li) =>
                                    li.id === item.id
                                      ? { ...li, quantity: Number(e.target.value) }
                                      : li
                                  ),
                                }),
                                'Cambio de cantidad en concepto'
                              )
                            }
                            className="w-16 px-2 py-1 text-right border border-slate-300 rounded font-mono"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            min={0}
                            value={item.unitCost}
                            onChange={(e) =>
                              mutateScenario(
                                activeScenario.id,
                                (sc) => ({
                                  ...sc,
                                  lineItems: sc.lineItems.map((li) =>
                                    li.id === item.id
                                      ? { ...li, unitCost: Number(e.target.value) }
                                      : li
                                  ),
                                }),
                                'Cambio de costo unitario en concepto'
                              )
                            }
                            className="w-24 px-2 py-1 text-right border border-slate-300 rounded font-mono"
                          />
                        </td>
                        <td className="py-2.5 px-3 font-mono">{item.currency}</td>
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() =>
                              mutateScenario(
                                activeScenario.id,
                                (sc) => ({
                                  ...sc,
                                  lineItems: sc.lineItems.map((li) =>
                                    li.id === item.id
                                      ? {
                                          ...li,
                                          isInternalCostOnly: !li.isInternalCostOnly,
                                        }
                                      : li
                                  ),
                                }),
                                'Cambio de visibilidad comercial de concepto'
                              )
                            }
                            className="text-xs underline text-slate-700"
                          >
                            {item.isInternalCostOnly
                              ? 'Costo Interno Confidencial'
                              : 'Visible en Propuesta'}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                          {calcRow
                            ? formatMoney(
                                calcRow.convertedAmountInSaleCurrency,
                                activeScenario.saleCurrency
                              )
                            : '$0.00'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const dup: QuoteLineItem = {
                                  ...structuredClone(item),
                                  id: `li_${Date.now()}`,
                                  name: `${item.name} (Copia)`,
                                };
                                mutateScenario(
                                  activeScenario.id,
                                  (sc) => ({
                                    ...sc,
                                    lineItems: [...sc.lineItems, dup],
                                  }),
                                  'Duplicar concepto'
                                );
                              }}
                              title="Duplicar concepto"
                              className="p-1 text-slate-500 hover:text-slate-900"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                mutateScenario(
                                  activeScenario.id,
                                  (sc) => ({
                                    ...sc,
                                    lineItems: sc.lineItems.filter(
                                      (li) => li.id !== item.id
                                    ),
                                  }),
                                  'Eliminar concepto de escenario'
                                )
                              }
                              title="Quitar concepto"
                              className="p-1 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Assumptions Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 space-y-1">
              <strong className="text-slate-800 block">
                Supuestos explícitos del cálculo ({activeCalculation.formulaVersion}):
              </strong>
              {activeCalculation.assumptions.map((assump, i) => (
                <div key={i}>• {assump}</div>
              ))}
            </div>
          </div>
          </>
          )}

          {/* Embedded Read-Only Immutable Activity Log inside Every Quotation */}
          <ImmutableActivityLogPanel request={request} compact={true} />
        </div>
      )}

      {/* TAB 4: COMPARADOR DE PROPUESTAS EN COLUMNAS VERTICALES (MÓDULO G) */}
      {activeTab === 'comparativo' && showInternalFinancials && (
        <div className="space-y-6">
          {/* Vertical Side-by-Side Column Comparator */}
          <EEColumnComparator
            request={request}
            adminCustomRubros={settings.adminCustomRubros || []}
            onSelectScenarioToEdit={(scenarioId) => {
              setSelectedScenarioId(scenarioId);
              setQuoterViewMode('hoja_ee');
              setActiveTab('escenarios');
            }}
            onDuplicateScenario={() => handleAddScenario(true)}
          />

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Resumen Ejecutivo Consolidado del Expediente ({request.folio})
                </h2>
                <p className="text-xs text-slate-500">
                  Matriz de indicadores clave y variación presupuestal por escenario
                </p>
              </div>
              <button
                type="button"
                onClick={() => exportScenarioComparisonExcel(request)}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B3B70] rounded-lg hover:bg-[#082d56] flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4" /> Exportar Matriz Ejecutiva CSV
              </button>
            </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Escenario</th>
                  <th className="py-3 px-4 text-right">Participantes</th>
                  <th className="py-3 px-4 text-right">Chaperones</th>
                  <th className="py-3 px-4 text-right">Días</th>
                  <th className="py-3 px-4 text-right">Costo Total</th>
                  <th className="py-3 px-4 text-right">Costo / Participante</th>
                  <th className="py-3 px-4 text-right">Precio / Participante</th>
                  <th className="py-3 px-4 text-right">Precio Total Grupo</th>
                  <th className="py-3 px-4 text-right">Margen Est.</th>
                  <th className="py-3 px-4 text-right">Presupuesto</th>
                  <th className="py-3 px-4 text-right">Variación vs Presup.</th>
                  <th className="py-3 px-4">Aprobación</th>
                  <th className="py-3 px-4">Estado Comercial</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {request.scenarios.map((sc) => {
                  const calc = calculateScenarioFinancials(
                    sc,
                    request.estimatedBudgetPerPerson,
                    request.budgetCurrency
                  );
                  return (
                    <tr key={sc.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {sc.name} (v{sc.currentVersion})
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold">
                        {sc.participants}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {sc.chaperones}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {sc.days}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {formatMoney(calc.totalScenarioCost, sc.saleCurrency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {formatMoney(calc.costPerParticipant, sc.saleCurrency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-[#0B3B70]">
                        {formatMoney(calc.sellingPricePerParticipant, sc.saleCurrency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                        {formatMoney(calc.totalGroupSellingPrice, sc.saleCurrency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                        {calc.estimatedMarginPercent.toFixed(2)}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                        {formatMoney(calc.budgetTargetPerParticipant, sc.saleCurrency)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums font-medium ${
                          calc.budgetVariancePerParticipant <= 0
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {calc.budgetVariancePerParticipant > 0 ? '+' : ''}
                        {formatMoney(calc.budgetVariancePerParticipant, sc.saleCurrency)} (
                        {calc.budgetVariancePercent.toFixed(1)}%)
                      </td>
                      <td className="py-3 px-4 font-medium">{sc.approvalStatus}</td>
                      <td className="py-3 px-4 text-slate-700">{sc.commercialStatus}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      )}

      {/* TAB 5: APROBACIONES (MÓDULO H) */}
      {activeTab === 'aprobaciones' && showInternalFinancials && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-base font-semibold text-slate-900">
              Módulo H. Flujo de Aprobaciones Internas y Segregación de Funciones
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Cada aprobación corresponde a una versión concreta. Cualquier cambio material posterior en costos, margen, moneda o tipo de cambio invalida automáticamente la aprobación.
            </p>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Comentarios del Aprobador
                </label>
                <input
                  type="text"
                  value={approvalComment}
                  onChange={(e) => setApprovalComment(e.target.value)}
                  placeholder="Ej. Rentabilidad validada contra presupuesto de oficina..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Motivo de Rechazo / Solicitud de Cambios (Obligatorio si se rechaza)
                </label>
                <input
                  type="text"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Ej. Margen inferior al mínimo permitido sin justificación..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* COMPARADOR DE DIFERENCIAS DESTACADAS (Δ DIFF) PARA EL COMITÉ */}
          {request.scenarios.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <GitCompare className="w-4 h-4 text-[#0B3B70]" />
                    Comparador de Diferencias Destacadas (Δ) para Comité de Aprobación
                  </h3>
                  <p className="text-xs text-slate-500">
                    Contrasta de un vistazo el aforo, margen, precio final, tipo de cambio y plan de pagos (Inscripción + parcialidades) frente a la Opción Base.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-2.5 px-3">Opción / Escenario</th>
                      <th className="py-2.5 px-3 text-right">Aforo (Δ)</th>
                      <th className="py-2.5 px-3 text-right">TC Aplicado</th>
                      <th className="py-2.5 px-3 text-right">Comisión / Margen (Δ)</th>
                      <th className="py-2.5 px-3 text-right">Precio / Alumno MXN (Δ)</th>
                      <th className="py-2.5 px-3 text-right">Utilidad Total Grupo</th>
                      <th className="py-2.5 px-3">Plan de Pagos Configurado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                    {request.scenarios.map((sc, idx) => {
                      const baseSheet = ensureScenarioHasEESheet(
                        request.scenarios[0],
                        0,
                        request.programType,
                        `${request.city}, ${request.country}`,
                        settings.adminCustomRubros || []
                      );
                      const baseCalc = calculateEESheet(baseSheet);
                      const sheet = ensureScenarioHasEESheet(
                        sc,
                        idx,
                        request.programType,
                        `${request.city}, ${request.country}`,
                        settings.adminCustomRubros || []
                      );
                      const calc = calculateEESheet(sheet);
                      const plan = ensurePaymentPlanConfig(sheet.paymentPlan);
                      const diffPax = sheet.participants - baseSheet.participants;
                      const diffMargin =
                        calc.effectiveCommissionPercent -
                        baseCalc.effectiveCommissionPercent;
                      const diffPriceMXN =
                        calc.estimadoEnPesosPerParticipant -
                        baseCalc.estimadoEnPesosPerParticipant;

                      return (
                        <tr key={sc.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-sans">
                            <strong className="text-slate-900">{sheet.optionTitle}</strong>
                            <span className="text-slate-500 block text-[11px]">
                              v{sc.currentVersion} · {sc.approvalStatus}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="font-bold text-slate-900">
                              {sheet.participants} alum.
                            </span>
                            {idx > 0 && (
                              <span
                                className={`block text-[11px] ${
                                  diffPax >= 0 ? 'text-emerald-700' : 'text-amber-700'
                                }`}
                              >
                                {diffPax >= 0 ? `+${diffPax}` : diffPax} vs Op. 1
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-700">
                            ${sheet.exchangeRate.toFixed(2)} ({sheet.currencyCode})
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span
                              className={`font-bold ${
                                calc.effectiveCommissionPercent >= 18
                                  ? 'text-emerald-700'
                                  : 'text-amber-700'
                              }`}
                            >
                              {calc.effectiveCommissionPercent.toFixed(2)}%
                            </span>
                            {idx > 0 && (
                              <span className="block text-[11px] text-slate-500">
                                {diffMargin >= 0 ? `+${diffMargin.toFixed(2)}%` : `${diffMargin.toFixed(2)}%`}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="font-bold text-[#0B3B70]">
                              {formatMoney(calc.estimadoEnPesosPerParticipant, 'MXN')}
                            </span>
                            {idx > 0 && (
                              <span
                                className={`block text-[11px] ${
                                  diffPriceMXN <= 0 ? 'text-emerald-700' : 'text-amber-700'
                                }`}
                              >
                                {diffPriceMXN >= 0 ? '+' : ''}
                                {formatMoney(diffPriceMXN, 'MXN')}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-emerald-700">
                            {formatMoney(
                              calc.comisionPerParticipant *
                                sheet.participants *
                                sheet.exchangeRate,
                              'MXN'
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-sans text-slate-700">
                            {plan.includeRegistrationFee
                              ? `Inscripción + ${plan.installmentsCount} pago(s)`
                              : `Sin inscripción · ${plan.installmentsCount} pago(s)`}{' '}
                            ({plan.frequency})
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {request.scenarios.map((sc) => {
              const calc = calculateScenarioFinancials(
                sc,
                request.estimatedBudgetPerPerson,
                request.budgetCurrency
              );
              const policy = resolveApplicableApprovalPolicy(
                sc,
                request,
                settings.approvalPolicies
              );
              const isSelfCreated = sc.createdByUid === currentUser.uid && policy.enforceSegregationOfDuties;

              return (
                <div
                  key={sc.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <div>
                      <div className="text-xs text-slate-500 font-mono">
                        Versión actual: v{sc.currentVersion} · Elaboró: {sc.createdByName} · Política aplicable:{' '}
                        <strong>{policy.name}</strong>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                        {sc.name} — Estado: <span className="text-[#0B3B70]">{sc.approvalStatus}</span>
                      </h3>
                      <div className="text-xs text-slate-600 font-mono mt-1">
                        Precio/Alumno: {formatMoney(calc.sellingPricePerParticipant, sc.saleCurrency)} ·
                        Total Grupo: {formatMoney(calc.totalGroupSellingPrice, sc.saleCurrency)} ·
                        Margen: {calc.estimatedMarginPercent.toFixed(2)}%
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isSelfCreated && (
                        <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded flex items-center gap-1">
                          <ShieldAlert className="w-3.5 h-3.5" /> Segregación activa (creador: {sc.createdByName})
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRecordApprovalDecision(sc, 'Aprobar')}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800"
                      >
                        Aprobar v{sc.currentVersion}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRecordApprovalDecision(sc, 'Solicitar cambios')}
                        className="px-3.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100"
                      >
                        Solicitar Cambios
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRecordApprovalDecision(sc, 'Rechazar')}
                        className="px-3.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-300 rounded-lg hover:bg-red-100"
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>

                  {/* Decisions History */}
                  {sc.approvals.length > 0 && (
                    <div className="space-y-1.5 text-xs">
                      <strong className="text-slate-700 block">
                        Registro de Decisiones de Aprobación:
                      </strong>
                      {sc.approvals.map((app) => (
                        <div
                          key={app.id}
                          className={`p-2.5 rounded border flex items-center justify-between ${
                            app.invalidated
                              ? 'bg-slate-100 border-slate-300 text-slate-500 line-through'
                              : 'bg-slate-50 border-slate-200 text-slate-800'
                          }`}
                        >
                          <div>
                            <strong>{app.decision}</strong> (v{app.scenarioVersion}) por{' '}
                            <strong>{app.approverName}</strong> · {app.comments}
                            {app.rejectionReason ? ` · Motivo: ${app.rejectionReason}` : ''}
                            {app.invalidated ? ` [${app.invalidatedReason}]` : ''}
                          </div>
                          <span className="font-mono text-slate-500">
                            {new Date(app.decidedAt).toLocaleString('es-MX')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 6: GENERADOR DE PROPUESTAS Y DOCUMENTOS + PORTAL CLIENTE INTERACTIVO (MÓDULO I) */}
      {activeTab === 'documentos' && (
        <div className="space-y-6">
          {/* PORTAL INTERACTIVO DE PROPUESTA ("LIGA COMPARTIBLE PARA COLEGIO / CLIENTE") */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-[#0B3B70]">
                  <Share2 className="w-4 h-4" />
                  <span>PORTAL INTERACTIVO DE PROPUESTA PARA EL COLEGIO (LIGA COMPARTIBLE)</span>
                </div>
                <h2 className="text-base font-bold text-slate-900 mt-0.5">
                  Vista Cliente en Línea con Selección de Opciones y Plan de Pagos (Inscripción + 1 a 15 Pagos)
                </h2>
                <p className="text-xs text-slate-500">
                  Permite al director o coordinador del colegio revisar cada opción, consultar el calendario de pagos (Inscripción y hasta 15 parcialidades) y aceptar la propuesta o solicitar ajustes en un clic.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowClientPortalView((prev) => !prev)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  showClientPortalView
                    ? 'bg-slate-900 text-white'
                    : 'bg-[#0B3B70] text-white hover:bg-[#082d56]'
                }`}
              >
                <Share2 className="w-3.5 h-3.5" />
                {showClientPortalView
                  ? 'Ocultar Portal Interactivo del Cliente'
                  : 'Abrir Vista Interactiva del Cliente'}
              </button>
            </div>

            {showClientPortalView && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-5">
                {/* Client Portal Header */}
                <div className="bg-[#0B3B70] text-white rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <span className="text-[11px] font-mono uppercase tracking-wider text-sky-200">
                      Propuesta Oficial Xplore Together · Folio {request.folio}
                    </span>
                    <h3 className="text-lg font-bold mt-0.5">{request.groupName}</h3>
                    <p className="text-xs text-blue-100 mt-0.5">
                      Destino: {request.city}, {request.country} · Salida: {request.departureDate} al{' '}
                      {request.returnDate} · Vigencia: {docValidity}
                    </p>
                  </div>
                  <div className="text-right font-mono text-xs">
                    <span className="text-sky-200 block">Atención personalizada:</span>
                    <strong>{request.requesterName}</strong>
                    <span className="block text-blue-200">{request.requesterEmail}</span>
                  </div>
                </div>

                {/* Option Cards Selector for Client */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  {request.scenarios.map((sc, idx) => {
                    const sheet = ensureScenarioHasEESheet(
                      sc,
                      idx,
                      request.programType,
                      `${request.city}, ${request.country}`,
                      settings.adminCustomRubros || []
                    );
                    const calc = calculateEESheet(sheet);
                    const plan = ensurePaymentPlanConfig(sheet.paymentPlan);
                    const isSelected = (portalSelectedScenarioId || request.scenarios[0]?.id) === sc.id;

                    return (
                      <div
                        key={sc.id}
                        onClick={() => setPortalSelectedScenarioId(sc.id)}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-white border-[#0B3B70] ring-2 ring-[#0B3B70]/15 shadow-xs'
                            : 'bg-white/80 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <strong className="text-[#0B3B70] font-mono">
                            {sheet.optionTitle}
                          </strong>
                          <span className="font-mono text-[11px] text-slate-500">
                            {sheet.participants} alumnos · {sheet.days} días
                          </span>
                        </div>
                        <div className="mt-2">
                          <span className="text-[11px] text-slate-500 block">
                            Precio por Participante ({sheet.currencyCode}):
                          </span>
                          <div className="text-xl font-bold font-mono tabular-nums text-slate-900">
                            {formatMoney(calc.precioFinalInCurrency, sheet.currencyCode)}{' '}
                            <span className="text-xs font-normal">{sheet.currencyCode}</span>
                          </div>
                          <div className="text-xs font-mono tabular-nums text-emerald-700 font-semibold mt-0.5">
                            Estimado MXN: {formatMoney(calc.estimadoEnPesosPerParticipant, 'MXN')}
                          </div>
                        </div>
                        <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-600 flex items-center justify-between">
                          <span>Plan de pagos:</span>
                          <strong className="font-mono text-slate-900">
                            {plan.includeRegistrationFee
                              ? `Inscripción + ${plan.installmentsCount} pagos`
                              : `${plan.installmentsCount} pagos`}
                          </strong>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Selected Option Payment Schedule (Inscripción + 1..15 Pagos) */}
                {(() => {
                  const chosenSc =
                    request.scenarios.find((s) => s.id === portalSelectedScenarioId) ||
                    request.scenarios[0];
                  if (!chosenSc) return null;
                  const idx = Math.max(
                    0,
                    request.scenarios.findIndex((s) => s.id === chosenSc.id)
                  );
                  const sheet = ensureScenarioHasEESheet(
                    chosenSc,
                    idx,
                    request.programType,
                    `${request.city}, ${request.country}`,
                    settings.adminCustomRubros || []
                  );
                  const schedule = buildPaymentScheduleForSheet(sheet);
                  const plan = ensurePaymentPlanConfig(sheet.paymentPlan);

                  return (
                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-[#0B3B70]" />
                            Calendario de Pagos por Participante — {sheet.optionTitle} (
                            {plan.includeRegistrationFee
                              ? `Inscripción + ${plan.installmentsCount} Pagos`
                              : `${plan.installmentsCount} Pagos`}
                            )
                          </h4>
                          <p className="text-[11px] text-slate-500">
                            Frecuencia: {plan.frequency} · Primer pago: {plan.firstInstallmentDate}
                          </p>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-sans font-semibold">
                              <th className="py-2 px-3">Concepto / Pago</th>
                              <th className="py-2 px-3">Fecha Límite</th>
                              <th className="py-2 px-3 text-right">% del Total</th>
                              <th className="py-2 px-3 text-right">
                                Monto ({sheet.currencyCode})
                              </th>
                              <th className="py-2 px-3 text-right">Equivalente MXN</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {schedule.map((inst) => (
                              <tr
                                key={inst.number}
                                className={
                                  inst.number === 0
                                    ? 'bg-blue-50/60 font-semibold text-[#0B3B70]'
                                    : 'hover:bg-slate-50'
                                }
                              >
                                <td className="py-2 px-3 font-sans">{inst.label}</td>
                                <td className="py-2 px-3">{inst.dueDate}</td>
                                <td className="py-2 px-3 text-right">
                                  {inst.percentOfTotal.toFixed(2)}%
                                </td>
                                <td className="py-2 px-3 text-right font-semibold">
                                  {formatMoney(inst.amountInCurrency, sheet.currencyCode)}{' '}
                                  {sheet.currencyCode}
                                </td>
                                <td className="py-2 px-3 text-right text-emerald-700 font-semibold">
                                  {formatMoney(inst.amountInMXN, 'MXN')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Tiered Volume Pricing Table inside Client Portal (Mejora #7) */}
                      {(() => {
                        const tiers = buildVolumePricingTiersForSheet(sheet, [
                          15, 20, 25, 30, 35,
                        ]);
                        return (
                          <div className="pt-3 border-t border-slate-200 space-y-2">
                            <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                              <Layers className="w-3.5 h-3.5 text-[#0B3B70]" />
                              Tabla de Precios por Volumen de Alumnos Inscritos ({sheet.optionTitle})
                            </h5>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-sans font-semibold">
                                    <th className="py-2 px-3">Rango de Aforo</th>
                                    <th className="py-2 px-3 text-center">
                                      Chaperones / Gratuidades Incluidas
                                    </th>
                                    <th className="py-2 px-3 text-right">
                                      Precio por Alumno ({sheet.currencyCode})
                                    </th>
                                    <th className="py-2 px-3 text-right">
                                      Estimado por Alumno (MXN)
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                  {tiers.map((t) => (
                                    <tr
                                      key={t.participants}
                                      className={
                                        t.participants === sheet.participants
                                          ? 'bg-blue-50/70 font-semibold text-[#0B3B70]'
                                          : 'hover:bg-slate-50'
                                      }
                                    >
                                      <td className="py-1.5 px-3 font-sans">
                                        {t.tierLabel}{' '}
                                        {t.participants === sheet.participants &&
                                          '(Cotización Base)'}
                                      </td>
                                      <td className="py-1.5 px-3 text-center">
                                        {t.chaperones} chaperón(es)
                                      </td>
                                      <td className="py-1.5 px-3 text-right font-semibold">
                                        {formatMoney(
                                          t.sellingPriceInCurrency,
                                          sheet.currencyCode
                                        )}{' '}
                                        {sheet.currencyCode}
                                      </td>
                                      <td className="py-1.5 px-3 text-right text-emerald-700 font-semibold">
                                        {formatMoney(t.sellingPriceInMXN, 'MXN')}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Day-by-Day Itinerary inside Client Portal (Mejora #2) */}
                      {request.specifications.itineraryDays &&
                        request.specifications.itineraryDays.length > 0 && (
                          <div className="pt-3 border-t border-slate-200 space-y-2">
                            <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-[#0B3B70]" />
                              Itinerario Académico y Cultural Día por Día ({request.specifications.itineraryDays.length} días)
                            </h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                              {request.specifications.itineraryDays.map((day) => (
                                <div
                                  key={day.dayNumber}
                                  className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1"
                                >
                                  <div className="flex items-center justify-between">
                                    <strong className="text-[#0B3B70]">
                                      Día {day.dayNumber}: {day.title}
                                    </strong>
                                    <span className="font-mono text-[10px] text-slate-500">
                                      {day.location}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-700">
                                    <strong>Mañana:</strong> {day.morningActivity} ·{' '}
                                    <strong>Tarde:</strong> {day.afternoonActivity}
                                  </p>
                                  <p className="text-[10px] text-slate-500">
                                    <strong>Noche:</strong> {day.eveningActivity} ·{' '}
                                    <strong>Alimentos:</strong> {day.mealsIncluded}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      {/* 1-Click Client Decision Actions */}
                      <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
                        <input
                          type="text"
                          value={portalFeedbackComment}
                          onChange={(e) => setPortalFeedbackComment(e.target.value)}
                          placeholder="Comentarios o ajustes solicitados por el colegio (ej. ajustar a 10 pagos o cambiar fecha de salida)..."
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg bg-white"
                        />
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const now = new Date().toISOString();
                              onUpdateRequest(
                                {
                                  ...request,
                                  status: 'En negociación',
                                  updatedAt: now,
                                },
                                'Solicitud de ajuste desde Portal Cliente',
                                `El cliente (${request.requesterName}) solicitó ajustes sobre ${sheet.optionTitle}: "${
                                  portalFeedbackComment.trim() || 'Revisión de plan de pagos / aforo'
                                }"`
                              );
                              setPortalFeedbackComment('');
                              setFeedbackBanner({
                                type: 'warning',
                                message: `Solicitud de ajuste registrada en bitácora y estado actualizado a "En negociación".`,
                              });
                            }}
                            className="px-3.5 py-2 font-medium text-amber-900 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100"
                          >
                            Solicitar Ajuste
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const calc = calculateScenarioFinancials(
                                chosenSc,
                                request.estimatedBudgetPerPerson,
                                request.budgetCurrency
                              );
                              const newOutcome: ProposalOutcome = {
                                id: `out_${Date.now()}`,
                                requestId: request.id,
                                decision: 'Aceptada',
                                acceptedScenarioId: chosenSc.id,
                                acceptedScenarioVersion: chosenSc.currentVersion,
                                acceptedAmount: calc.totalGroupSellingPrice,
                                acceptedCurrency: chosenSc.saleCurrency,
                                recordedAt: new Date().toISOString(),
                                recordedByUid: currentUser.uid,
                                recordedByName: request.requesterName,
                                clientApproverName: request.requesterName,
                                evidenceReference: 'Aceptacion_Portal_En_Linea_EE.pdf',
                                comments:
                                  portalFeedbackComment.trim() ||
                                  `Aceptada en línea con plan de ${
                                    plan.includeRegistrationFee
                                      ? `Inscripción + ${plan.installmentsCount} pagos`
                                      : `${plan.installmentsCount} pagos`
                                  }.`,
                              };
                              onUpdateRequest(
                                {
                                  ...request,
                                  status: 'Aceptada',
                                  updatedAt: new Date().toISOString(),
                                  scenarios: request.scenarios.map((s) =>
                                    s.id === chosenSc.id
                                      ? { ...s, commercialStatus: 'Seleccionada / Aceptada' as const }
                                      : s
                                  ),
                                  outcomes: [newOutcome, ...request.outcomes],
                                },
                                'Aceptación en línea desde Portal Cliente',
                                `${request.requesterName} aceptó ${chosenSc.name} (${sheet.optionTitle}) desde el Portal Interactivo.`
                              );
                              setFeedbackBanner({
                                type: 'success',
                                message: `¡Propuesta aceptada en línea! Se registró la aceptación de ${sheet.optionTitle} con su plan de pagos.`,
                              });
                            }}
                            className="px-4 py-2 font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Aceptar Propuesta en Línea
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {showInternalFinancials && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="border-b border-slate-200 pb-3">
                <h2 className="text-base font-semibold text-slate-900">
                  Módulo I. Generador de Propuestas Comerciales e Internas
                </h2>
                <p className="text-xs text-slate-500">
                  La Propuesta Comercial para el Cliente omite estrictamente costos internos, comisiones, márgenes y notas privadas.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Formato del Documento
                  </label>
                  <select
                    value={docType}
                    onChange={(e) =>
                      setDocType(e.target.value as 'comercial_cliente' | 'interno_costos')
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 font-medium"
                  >
                    <option value="comercial_cliente">
                      Propuesta Comercial para el Cliente (Sin costos internos)
                    </option>
                    <option value="interno_costos">
                      Documento Interno de Costos y Rentabilidad (Confidencial EE)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Vigencia de la Propuesta
                  </label>
                  <input
                    type="date"
                    value={docValidity}
                    onChange={(e) => setDocValidity(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Escenarios a incluir ({docScenarioIds.length})
                  </label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {request.scenarios.map((sc) => (
                      <label key={sc.id} className="inline-flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={docScenarioIds.includes(sc.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setDocScenarioIds([...docScenarioIds, sc.id]);
                            } else {
                              setDocScenarioIds(
                                docScenarioIds.filter((id) => id !== sc.id)
                              );
                            }
                          }}
                        />
                        <span>{sc.name.split(':')[0]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-slate-700 font-medium mb-1">
                    Condiciones de Pago
                  </label>
                  <input
                    type="text"
                    value={docPaymentTerms}
                    onChange={(e) => setDocPaymentTerms(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Notas Relevantes
                  </label>
                  <input
                    type="text"
                    value={docNotes}
                    onChange={(e) => setDocNotes(e.target.value)}
                    placeholder="Notas visibles en documento..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleGenerateDocument}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0B3B70] rounded-lg hover:bg-[#082d56] flex items-center gap-1.5"
                >
                  <FileText className="w-4 h-4" /> Generar Copia Inmutable del Documento
                </button>
              </div>
            </div>
          )}

          {/* List of Immutable Generated Documents + Live Preview */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Documentos Inmutables Generados ({request.documents.filter((d) => showInternalFinancials || d.type === 'comercial_cliente').length})
            </h3>
            {request.documents.filter((d) => showInternalFinancials || d.type === 'comercial_cliente')
              .length === 0 ? (
              <p className="text-xs text-slate-500">
                Aún no se han generado documentos para este expediente.
              </p>
            ) : (
              <div className="space-y-3">
                {request.documents
                  .filter((d) => showInternalFinancials || d.type === 'comercial_cliente')
                  .map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <strong className="text-slate-900">
                          {doc.type === 'comercial_cliente'
                            ? 'Propuesta Comercial para el Cliente'
                            : 'Hoja Interna de Costos y Rentabilidad'}{' '}
                          — Versión v{doc.versionNumber}
                        </strong>
                        <div className="text-slate-500 font-mono mt-0.5">
                          Generado: {new Date(doc.generatedAt).toLocaleString('es-MX')} por{' '}
                          {doc.generatedBy} · {doc.immutableSnapshot.scenarios.length} escenario(s)
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewDocId(previewDocId === doc.id ? null : doc.id)
                          }
                          className="px-3 py-1.5 border border-slate-300 bg-white rounded-lg hover:bg-slate-100 flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />{' '}
                          {previewDocId === doc.id ? 'Ocultar Vista Previa' : 'Vista Previa'}
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadProposalHTMLAsDocument(doc)}
                          className="px-3 py-1.5 bg-[#0B3B70] text-white font-semibold rounded-lg hover:bg-[#082d56]"
                        >
                          Descargar Documento Imprimible / PDF
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {previewDocId &&
              (() => {
                const docToPreview = request.documents.find((d) => d.id === previewDocId);
                if (!docToPreview) return null;
                return (
                  <div className="mt-4 border border-slate-300 rounded-xl overflow-hidden">
                    <div className="bg-slate-800 text-white px-4 py-2 text-xs flex justify-between">
                      <span>
                        Vista Previa de Copia Inmutable — v{docToPreview.versionNumber} (
                        {docToPreview.type === 'comercial_cliente'
                          ? 'Sin Costos Internos'
                          : 'Desglose Interno'}
                        )
                      </span>
                      <span className="font-mono">{docToPreview.folio}</span>
                    </div>
                    <iframe
                      title="Vista previa de propuesta"
                      srcDoc={buildProposalPrintableHTML(docToPreview)}
                      className="w-full h-[460px] bg-white"
                    />
                  </div>
                );
              })()}
          </div>
        </div>
      )}

      {/* TAB 7: REGISTRO DE ENVÍOS (MÓDULO J - PARTE 1) */}
      {activeTab === 'envios' && (
        <div className="space-y-5">
          {showInternalFinancials && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Módulo J. Registro Formal de Envío de Propuesta
                </h2>
                <p className="text-xs text-slate-500">
                  Regla crítica: El sistema bloquea cualquier registro de envío externo si los escenarios seleccionados no cuentan con todas las aprobaciones vigentes.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Nombre del Destinatario
                  </label>
                  <input
                    type="text"
                    value={dispatchRecipientName}
                    onChange={(e) => setDispatchRecipientName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Correo / Contacto del Destinatario
                  </label>
                  <input
                    type="text"
                    value={dispatchRecipientEmail}
                    onChange={(e) => setDispatchRecipientEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Canal de Envío
                  </label>
                  <select
                    value={dispatchChannel}
                    onChange={(e) =>
                      setDispatchChannel(e.target.value as ProposalDispatch['channel'])
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50"
                  >
                    <option value="Correo electrónico (registro manual)">
                      Correo electrónico (registro manual)
                    </option>
                    <option value="Enlace compartido">Enlace compartido</option>
                    <option value="WhatsApp / Entrega directa">
                      WhatsApp / Entrega directa en junta
                    </option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-slate-700 font-medium mb-1">
                    Comentarios y Acuerdos de Seguimiento
                  </label>
                  <input
                    type="text"
                    value={dispatchComments}
                    onChange={(e) => setDispatchComments(e.target.value)}
                    placeholder="Ej. Propuesta enviada para junta con comité académico el jueves..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleRegisterDispatch}
                    className="w-full px-4 py-2 text-xs font-semibold text-white bg-[#0B3B70] rounded-lg hover:bg-[#082d56] flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" /> Registrar Envío Oficial
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Bitácora de Envíos Realizados ({request.dispatches.length})
            </h3>
            {request.dispatches.length === 0 ? (
              <p className="text-xs text-slate-500">
                No se ha registrado ningún envío para este expediente.
              </p>
            ) : (
              <div className="space-y-2.5 text-xs">
                {request.dispatches.map((d) => (
                  <div
                    key={d.id}
                    className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <strong className="text-slate-900">
                        Versión enviada: v{d.versionSent} → Destinatario: {d.recipientName} (
                        {d.recipientEmail})
                      </strong>
                      <div className="text-slate-600 mt-0.5">
                        Canal: {d.channel} · Enviado por: {d.sentByName} · Escenarios:{' '}
                        {d.scenarioIds.length} · Seguimiento: <strong>{d.followUpStatus}</strong>
                      </div>
                      {d.comments && <div className="text-slate-500 mt-0.5">{d.comments}</div>}
                    </div>
                    <span className="font-mono text-slate-500 shrink-0">
                      {new Date(d.sentAt).toLocaleString('es-MX')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 8: SEGUIMIENTO Y ACEPTACIÓN (MÓDULO J - PARTE 2) */}
      {activeTab === 'seguimiento' && (
        <div className="space-y-5">
          {showInternalFinancials && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Registro de Aceptación o Rechazo del Cliente
                </h2>
                <p className="text-xs text-slate-500">
                  Al aceptar un escenario se marca como seleccionado y se conserva la evidencia, manteniendo intactos los demás escenarios para auditoría.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Decisión del Cliente
                  </label>
                  <select
                    value={outcomeDecision}
                    onChange={(e) =>
                      setOutcomeDecision(e.target.value as 'Aceptada' | 'Rechazada')
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 font-semibold"
                  >
                    <option value="Aceptada">Propuesta Aceptada</option>
                    <option value="Rechazada">Propuesta Rechazada</option>
                  </select>
                </div>

                {outcomeDecision === 'Aceptada' && (
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">
                      Escenario Aceptado por el Colegio
                    </label>
                    <select
                      value={outcomeScenarioId}
                      onChange={(e) => setOutcomeScenarioId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50"
                    >
                      {request.scenarios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} (v{s.currentVersion})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Persona que Autoriza / Acepta en Escuela
                  </label>
                  <input
                    type="text"
                    value={outcomeApproverName}
                    onChange={(e) => setOutcomeApproverName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Documento de Evidencia / Convenio Adjunto
                  </label>
                  <input
                    type="text"
                    value={outcomeEvidence}
                    onChange={(e) => setOutcomeEvidence(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-slate-700 font-medium mb-1">
                    Comentarios / Motivo de Decisión
                  </label>
                  <input
                    type="text"
                    value={outcomeComments}
                    onChange={(e) => setOutcomeComments(e.target.value)}
                    placeholder="Detalles del acuerdo o razón de rechazo..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleRegisterOutcome}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800"
                >
                  Guardar Decisión del Cliente y Evidencia
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Resultados Comerciales Registrados ({request.outcomes.length})
            </h3>
            {request.outcomes.length === 0 ? (
              <p className="text-xs text-slate-500">
                Aún no se ha registrado aceptación o rechazo definitivo del cliente.
              </p>
            ) : (
              <div className="space-y-3 text-xs">
                {request.outcomes.map((o) => {
                  const sc = request.scenarios.find((s) => s.id === o.acceptedScenarioId);
                  return (
                    <div
                      key={o.id}
                      className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <strong className="text-slate-900">
                          Resultado: {o.decision}{' '}
                          {sc ? `— ${sc.name} (v${o.acceptedScenarioVersion})` : ''}
                        </strong>
                        <div className="text-slate-600 mt-0.5">
                          Autorizó en cliente: <strong>{o.clientApproverName}</strong> · Registró
                          en EE: {o.recordedByName} · Evidencia:{' '}
                          <span className="font-mono">{o.evidenceReference}</span>
                        </div>
                        {o.acceptedAmount && (
                          <div className="font-mono font-semibold text-emerald-700 mt-1">
                            Importe total aceptado:{' '}
                            {formatMoney(o.acceptedAmount, o.acceptedCurrency)} {o.acceptedCurrency}
                          </div>
                        )}
                        {o.comments && <div className="text-slate-500 mt-0.5">{o.comments}</div>}
                      </div>
                      <span className="font-mono text-slate-500">
                        {new Date(o.recordedAt).toLocaleString('es-MX')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 9: LÍNEA DE TIEMPO GRÁFICA Y BITÁCORA INMUTABLE DE AUDITORÍA */}
      {activeTab === 'historial' && (
        <div className="space-y-6">
          <ImmutableActivityLogPanel
            request={request}
            compact={false}
            onAddAuditNote={(actionTitle, noteDetails, categoryHint) => {
              const prefix =
                categoryHint === 'precio'
                  ? '[Precio / Costos]'
                  : categoryHint === 'estado'
                    ? '[Estado / Comité]'
                    : '[Nota / Seguimiento]';
              onUpdateRequest(
                {
                  ...request,
                  updatedAt: new Date().toISOString(),
                },
                `${prefix} ${actionTitle}`,
                noteDetails
              );
              setFeedbackBanner({
                type: 'success',
                message: 'Nota registrada y sellada en la línea de tiempo del expediente.',
              });
            }}
          />
        </div>
      )}
    </div>
  );
};

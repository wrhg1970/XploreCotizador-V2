import {
  RequestStatus,
  RoleDefinition,
  TravelRequest,
  UserProfile,
} from '../types/domain';
import { getEffectiveUserPermissions } from '../security/rbac';
import { DossierTab } from '../components/RequestDetailDossier';

export type CoreProcessStageId = 'solicitada' | 'cotizada' | 'aprobada' | 'enviada';

export interface CoreProcessStageMeta {
  id: CoreProcessStageId;
  stepNumber: 1 | 2 | 3 | 4;
  label: 'Solicitada' | 'Cotizada' | 'Aprobada' | 'Enviada';
  shortDescription: string;
  canonicalStatus: RequestStatus;
  defaultTab: DossierTab;
  progressPercent: number;
}

export const CORE_PROCESS_STAGES: readonly CoreProcessStageMeta[] = [
  {
    id: 'solicitada',
    stepNumber: 1,
    label: 'Solicitada',
    shortDescription: 'Ficha recibida y especificaciones iniciales del colegio',
    canonicalStatus: 'Recibida',
    defaultTab: 'general',
    progressPercent: 25,
  },
  {
    id: 'cotizada',
    stepNumber: 2,
    label: 'Cotizada',
    shortDescription: 'Sábana EE y opciones financieras estructuradas',
    canonicalStatus: 'En cotización',
    defaultTab: 'escenarios',
    progressPercent: 50,
  },
  {
    id: 'aprobada',
    stepNumber: 3,
    label: 'Aprobada',
    shortDescription: 'Validada por Comité y lista para emitir propuesta al cliente',
    canonicalStatus: 'Aprobada',
    defaultTab: 'aprobaciones',
    progressPercent: 75,
  },
  {
    id: 'enviada',
    stepNumber: 4,
    label: 'Enviada',
    shortDescription: 'Propuesta entregada al colegio y en seguimiento de cierre',
    canonicalStatus: 'Enviada',
    defaultTab: 'envios',
    progressPercent: 100,
  },
] as const;

/**
 * Maps any detailed RequestStatus (and scenario state) to one of the 4 clear process stages:
 * 1. Solicitada
 * 2. Cotizada
 * 3. Aprobada
 * 4. Enviada
 */
export function resolveCoreProcessStage(request: TravelRequest): CoreProcessStageMeta {
  const st = request.status;

  if (
    st === 'Enviada' ||
    st === 'En negociación' ||
    st === 'Aceptada' ||
    st === 'Rechazada' ||
    request.dispatches.length > 0
  ) {
    return CORE_PROCESS_STAGES[3]; // 4. Enviada
  }

  if (
    st === 'Aprobada' ||
    (request.scenarios.length > 0 &&
      request.scenarios.some((s) => s.approvalStatus === 'Aprobado') &&
      st !== 'En cotización')
  ) {
    return CORE_PROCESS_STAGES[2]; // 3. Aprobada
  }

  if (
    st === 'En cotización' ||
    st === 'Pendiente de aprobación' ||
    st === 'En análisis'
  ) {
    return CORE_PROCESS_STAGES[1]; // 2. Cotizada
  }

  return CORE_PROCESS_STAGES[0]; // 1. Solicitada (Borrador, Recibida, Vencida, etc.)
}

export interface UserInvolvementAndResponsibility {
  isInvolved: boolean;
  involvementRelation: string; // Cómo está involucrado el usuario
  responsibilitySummary: string; // Qué responsabilidad tiene en esta propuesta
  nextActionLabel: string; // Texto del botón de acción principal
  targetTab: DossierTab; // Pestaña a la que lleva el botón
  requiresImmediateActionByUser: boolean; // Si la pelota está en la cancha de este usuario hoy
  nextStageToAdvance?: CoreProcessStageMeta; // Siguiente etapa del flujo 1->2->3->4
}

/**
 * Determines how the given user is involved in a TravelRequest, what their concrete responsibility is
 * at the current stage (Solicitada -> Cotizada -> Aprobada -> Enviada), and whether it requires their immediate action.
 */
export function resolveUserResponsibilityInRequest(
  user: UserProfile,
  request: TravelRequest,
  roleDefinitions?: RoleDefinition[]
): UserInvolvementAndResponsibility {
  const perms = getEffectiveUserPermissions(user, roleDefinitions);
  const stage = resolveCoreProcessStage(request);

  const isExecutiveOwner =
    request.commercialExecutiveUid === user.uid ||
    request.ownerUid === user.uid ||
    request.commercialExecutiveName.toLowerCase() === user.displayName.toLowerCase();

  const isScenarioCreatorOrApprover =
    request.scenarios.some((s) => s.createdByUid === user.uid) ||
    request.scenarios.some((s) => s.approvals.some((a) => a.approverUid === user.uid)) ||
    request.auditTrail.some((aud) => aud.actorUid === user.uid);

  const isSameOffice =
    user.officeId === request.officeId ||
    (user.allowedOffices || []).includes(request.officeId);

  const isSharedExternal = (user.sharedRequestIds || []).includes(request.id);

  // Determine relation badge text
  let involvementRelation = 'Colaborador de Oficina';
  if (isExecutiveOwner) {
    involvementRelation = 'Ejecutivo Titular de la Propuesta';
  } else if (perms.canAuthorizeQuotes && user.role === 'Aprobador') {
    involvementRelation = 'Aprobador de Comité';
  } else if (user.role === 'Finanzas') {
    involvementRelation = 'Revisor Financiero y Márgenes';
  } else if (user.role === 'Operaciones') {
    involvementRelation = 'Ingeniería de Costos y Operación';
  } else if (user.role === 'Administrador') {
    involvementRelation = 'Supervisión General y Comité';
  } else if (user.userType === 'externo' || isSharedExternal) {
    involvementRelation = 'Revisor Invitado / Cliente';
  } else if (isScenarioCreatorOrApprover) {
    involvementRelation = 'Participante en Cotización';
  }

  const isInvolved =
    isExecutiveOwner ||
    isScenarioCreatorOrApprover ||
    isSameOffice ||
    isSharedExternal ||
    perms.officeScope === 'todas';

  const nextStageIdx = CORE_PROCESS_STAGES.findIndex((s) => s.id === stage.id) + 1;
  const nextStageToAdvance =
    nextStageIdx < CORE_PROCESS_STAGES.length
      ? CORE_PROCESS_STAGES[nextStageIdx]
      : undefined;

  // Stage 1: SOLICITADA
  if (stage.id === 'solicitada') {
    if (perms.canEditQuotes) {
      return {
        isInvolved,
        involvementRelation,
        responsibilitySummary:
          'Completar costos de rubros y chaperones en la Sábana EE para pasar la solicitud a etapa Cotizada.',
        nextActionLabel: 'Elaborar Cotización (Sábana EE)',
        targetTab: 'escenarios',
        requiresImmediateActionByUser: isExecutiveOwner || user.role === 'Operaciones' || user.role === 'Administrador',
        nextStageToAdvance,
      };
    }
    return {
      isInvolved,
      involvementRelation,
      responsibilitySummary:
        'Consultar especificaciones de viaje registradas mientras el área comercial estructura los costos.',
      nextActionLabel: 'Ver Ficha de Solicitud',
      targetTab: 'general',
      requiresImmediateActionByUser: false,
      nextStageToAdvance: undefined,
    };
  }

  // Stage 2: COTIZADA
  if (stage.id === 'cotizada') {
    const hasPendingApproval =
      request.status === 'Pendiente de aprobación' ||
      request.scenarios.some((s) => s.approvalStatus === 'Pendiente');

    if (perms.canAuthorizeQuotes) {
      return {
        isInvolved,
        involvementRelation,
        responsibilitySummary: hasPendingApproval
          ? 'Autorizar o dictaminar las opciones cotizadas en Comité para liberar el envío al colegio.'
          : 'Revisar la utilidad, tipo de cambio y rubros cotizados para otorgar aprobación de Comité.',
        nextActionLabel: 'Revisar y Aprobar Cotización',
        targetTab: 'aprobaciones',
        requiresImmediateActionByUser: true,
        nextStageToAdvance,
      };
    }

    if (perms.canEditQuotes) {
      return {
        isInvolved,
        involvementRelation,
        responsibilitySummary: hasPendingApproval
          ? 'En espera de firma del Comité de Aprobación; puedes ajustar escenarios o comparar columnas.'
          : 'Verificar escenarios en el Comparador de Columnas y solicitar aprobación formal del Comité.',
        nextActionLabel: 'Comparar Opciones y Solicitar Aprobación',
        targetTab: 'comparativo',
        requiresImmediateActionByUser: !hasPendingApproval && isExecutiveOwner,
        nextStageToAdvance,
      };
    }

    return {
      isInvolved,
      involvementRelation,
      responsibilitySummary: 'Propuesta en fase de cotización y validación financiera interna.',
      nextActionLabel: 'Consultar Avance',
      targetTab: 'documentos',
      requiresImmediateActionByUser: false,
    };
  }

  // Stage 3: APROBADA
  if (stage.id === 'aprobada') {
    if (perms.canEditQuotes || perms.canExportDocuments) {
      return {
        isInvolved,
        involvementRelation,
        responsibilitySummary:
          'Cotización aprobada por Comité. Tu responsabilidad es generar el PDF Comercial y registrar el envío al colegio.',
        nextActionLabel: 'Emitir PDF y Enviar al Colegio',
        targetTab: 'documentos',
        requiresImmediateActionByUser: isExecutiveOwner || user.role === 'Administrador',
        nextStageToAdvance,
      };
    }
    return {
      isInvolved,
      involvementRelation,
      responsibilitySummary: 'Cotización aprobada; lista para su envío formal a la institución.',
      nextActionLabel: 'Ver Propuesta Aprobada',
      targetTab: 'documentos',
      requiresImmediateActionByUser: false,
    };
  }

  // Stage 4: ENVIADA
  const isClosed = request.status === 'Aceptada' || request.status === 'Rechazada';
  if (isClosed) {
    return {
      isInvolved,
      involvementRelation,
      responsibilitySummary:
        request.status === 'Aceptada'
          ? 'Propuesta aceptada por el colegio. Consultar convenio, calendario de pagos y bitácora.'
          : 'Expediente concluido sin aceptación. Disponible para consulta histórica o recotización.',
      nextActionLabel: 'Ver Cierre y Plan de Pagos',
      targetTab: 'seguimiento',
      requiresImmediateActionByUser: false,
    };
  }

  if (user.userType === 'externo') {
    return {
      isInvolved,
      involvementRelation,
      responsibilitySummary:
        'Revisar las opciones comerciales recibidas, calendario de pagos e itinerario.',
      nextActionLabel: 'Revisar Propuesta Comercial',
      targetTab: 'documentos',
      requiresImmediateActionByUser: true,
    };
  }

  return {
    isInvolved,
    involvementRelation,
    responsibilitySummary:
      'Dar seguimiento comercial con el colegio y registrar la decisión final (Aceptada / Ajustes).',
    nextActionLabel: 'Registrar Respuesta del Colegio',
    targetTab: 'seguimiento',
    requiresImmediateActionByUser: isExecutiveOwner,
  };
}

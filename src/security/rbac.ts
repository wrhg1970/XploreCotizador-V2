import {
  ApprovalPolicyRule,
  QuoteScenario,
  RoleDefinition,
  RolePermissions,
  SystemSettings,
  TravelRequest,
  UserProfile,
} from '../types/domain';
import { calculateScenarioFinancials } from '../engine/financialEngine';

export const DEFAULT_ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    id: 'role_admin',
    name: 'Administrador',
    description:
      'Control total del sistema: configura roles y usuarios, autoriza cotizaciones, edita, borra y consulta todas las oficinas.',
    isSystemDefault: true,
    userType: 'interno',
    permissions: {
      canViewRequests: true,
      canCreateRequests: true,
      canEditQuotes: true,
      canDeleteRecords: true,
      canAuthorizeQuotes: true,
      canViewInternalCosts: true,
      canExportDocuments: true,
      canManageConfigAndUsers: true,
      officeScope: 'todas',
      maxApprovalAmountMXN: 50000000,
    },
    updatedAt: '2026-10-23T08:00:00Z',
    updatedBy: 'Sistema Xplore Together',
  },
  {
    id: 'role_aprobador',
    name: 'Aprobador',
    description:
      'Comité Directivo: autoriza o rechaza escenarios de cotización, consulta costos internos y revisa todas las oficinas.',
    isSystemDefault: true,
    userType: 'interno',
    permissions: {
      canViewRequests: true,
      canCreateRequests: false,
      canEditQuotes: true,
      canDeleteRecords: false,
      canAuthorizeQuotes: true,
      canViewInternalCosts: true,
      canExportDocuments: true,
      canManageConfigAndUsers: false,
      officeScope: 'todas',
      maxApprovalAmountMXN: 25000000,
    },
    updatedAt: '2026-10-23T08:00:00Z',
    updatedBy: 'Sistema Xplore Together',
  },
  {
    id: 'role_finanzas',
    name: 'Finanzas',
    description:
      'Dirección Financiera: autoriza márgenes especiales, edita tipos de cambio, audita costos internos y exporta reportes.',
    isSystemDefault: true,
    userType: 'interno',
    permissions: {
      canViewRequests: true,
      canCreateRequests: true,
      canEditQuotes: true,
      canDeleteRecords: true,
      canAuthorizeQuotes: true,
      canViewInternalCosts: true,
      canExportDocuments: true,
      canManageConfigAndUsers: true,
      officeScope: 'todas',
      maxApprovalAmountMXN: 20000000,
    },
    updatedAt: '2026-10-23T08:00:00Z',
    updatedBy: 'Sistema Xplore Together',
  },
  {
    id: 'role_operaciones',
    name: 'Operaciones',
    description:
      'Equipo Operativo: construye y edita hojas de cotización, rubros y chaperones en todas las oficinas, sin facultad de autorizar.',
    isSystemDefault: true,
    userType: 'interno',
    permissions: {
      canViewRequests: true,
      canCreateRequests: true,
      canEditQuotes: true,
      canDeleteRecords: false,
      canAuthorizeQuotes: false,
      canViewInternalCosts: true,
      canExportDocuments: true,
      canManageConfigAndUsers: false,
      officeScope: 'todas',
      maxApprovalAmountMXN: 0,
    },
    updatedAt: '2026-10-23T08:00:00Z',
    updatedBy: 'Sistema Xplore Together',
  },
  {
    id: 'role_comercial',
    name: 'Ejecutivo Comercial',
    description:
      'Ejecutivo de Oficina: crea solicitudes, edita cotizaciones de su oficina asignada y genera propuestas para colegios.',
    isSystemDefault: true,
    userType: 'interno',
    permissions: {
      canViewRequests: true,
      canCreateRequests: true,
      canEditQuotes: true,
      canDeleteRecords: false,
      canAuthorizeQuotes: false,
      canViewInternalCosts: true,
      canExportDocuments: true,
      canManageConfigAndUsers: false,
      officeScope: 'propia',
      maxApprovalAmountMXN: 0,
    },
    updatedAt: '2026-10-23T08:00:00Z',
    updatedBy: 'Sistema Xplore Together',
  },
  {
    id: 'role_solo_lectura',
    name: 'Auditor / Solo Lectura',
    description:
      'Perfil de consulta interna: solo puede ver expedientes y exportar reportes, sin permisos para editar, borrar ni autorizar.',
    isSystemDefault: true,
    userType: 'interno',
    permissions: {
      canViewRequests: true,
      canCreateRequests: false,
      canEditQuotes: false,
      canDeleteRecords: false,
      canAuthorizeQuotes: false,
      canViewInternalCosts: true,
      canExportDocuments: true,
      canManageConfigAndUsers: false,
      officeScope: 'todas',
      maxApprovalAmountMXN: 0,
    },
    updatedAt: '2026-10-23T08:00:00Z',
    updatedBy: 'Sistema Xplore Together',
  },
  {
    id: 'role_externo',
    name: 'Usuario Externo',
    description:
      'Cliente / Colegio invitado: solo ve propuestas comerciales compartidas explícitamente, sin acceso a costos internos ni edición.',
    isSystemDefault: true,
    userType: 'externo',
    permissions: {
      canViewRequests: true,
      canCreateRequests: false,
      canEditQuotes: false,
      canDeleteRecords: false,
      canAuthorizeQuotes: false,
      canViewInternalCosts: false,
      canExportDocuments: true,
      canManageConfigAndUsers: false,
      officeScope: 'propia',
      maxApprovalAmountMXN: 0,
    },
    updatedAt: '2026-10-23T08:00:00Z',
    updatedBy: 'Sistema Xplore Together',
  },
];

/**
 * Resolves the effective permissions for a user by combining their assigned RoleDefinition
 * with any individual customPermissions overrides configured on their UserProfile.
 */
export function getEffectiveUserPermissions(
  user: UserProfile,
  roleDefinitions?: RoleDefinition[]
): RolePermissions {
  const catalog =
    roleDefinitions && roleDefinitions.length > 0
      ? roleDefinitions
      : DEFAULT_ROLE_DEFINITIONS;

  const matchedRole =
    catalog.find((r) => r.name.toLowerCase() === user.role.toLowerCase()) ||
    DEFAULT_ROLE_DEFINITIONS.find(
      (r) => r.name.toLowerCase() === user.role.toLowerCase()
    );

  const basePermissions: RolePermissions = matchedRole
    ? { ...matchedRole.permissions }
    : {
        canViewRequests: true,
        canCreateRequests: user.userType === 'interno',
        canEditQuotes: user.userType === 'interno',
        canDeleteRecords: false,
        canAuthorizeQuotes: false,
        canViewInternalCosts: user.userType === 'interno',
        canExportDocuments: true,
        canManageConfigAndUsers: false,
        officeScope: 'propia',
        maxApprovalAmountMXN: 0,
      };

  if (user.customPermissions) {
    return {
      ...basePermissions,
      ...user.customPermissions,
    };
  }

  return basePermissions;
}

/**
 * Verifies whether a user email or account is authorized to access Xplore Together.
 * Enforces invitation or authorized domain verification.
 */
export function isUserAuthorizedToAccess(
  email: string | null | undefined,
  existingProfile: UserProfile | undefined,
  authorizedDomains: string[]
): { allowed: boolean; reason?: string } {
  if (!email) {
    return {
      allowed: false,
      reason: 'El usuario no cuenta con un correo electrónico válido.',
    };
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Bootstrapped Administrator is always authorized
  if (normalizedEmail === 'wrhg1970@gmail.com') {
    return { allowed: true };
  }

  // If user has an existing profile, check if active or invited
  if (existingProfile) {
    if (existingProfile.status === 'inactivo') {
      return {
        allowed: false,
        reason: 'La cuenta se encuentra desactivada por un administrador.',
      };
    }
    return { allowed: true };
  }

  // Check domain allowlist
  const domain = normalizedEmail.split('@')[1] || '';
  if (authorizedDomains.map((d) => d.toLowerCase()).includes(domain)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `El dominio @${domain} no está en la lista autorizada y no existe invitación activa para ${normalizedEmail}.`,
  };
}

/**
 * Checks whether a user has permission to view a specific TravelRequest dossier.
 * Enforces strict office isolation and external user restrictions.
 */
export function canUserViewRequest(
  user: UserProfile,
  request: TravelRequest,
  roleDefinitions?: RoleDefinition[]
): boolean {
  if (user.status === 'inactivo') return false;

  const perms = getEffectiveUserPermissions(user, roleDefinitions);
  if (!perms.canViewRequests) return false;

  if (user.role === 'Usuario Externo' || user.userType === 'externo') {
    return (
      Boolean(user.sharedRequestIds?.includes(request.id)) ||
      request.authorizedUids.includes(user.uid)
    );
  }

  if (perms.officeScope === 'todas') {
    return true;
  }

  // Office-scoped roles: only allowed offices or assigned commercial executive
  return (
    user.officeId === request.officeId ||
    user.allowedOffices.includes(request.officeId) ||
    request.commercialExecutiveUid === user.uid
  );
}

/**
 * Checks whether a user can view confidential internal costs, commissions, and margins.
 * External users can NEVER see internal financials.
 */
export function canUserSeeInternalCosts(
  user: UserProfile,
  roleDefinitions?: RoleDefinition[]
): boolean {
  if (user.status === 'inactivo') return false;
  if (user.role === 'Usuario Externo' || user.userType === 'externo') return false;
  const perms = getEffectiveUserPermissions(user, roleDefinitions);
  return perms.canViewInternalCosts;
}

/**
 * Checks whether a user can edit quotes, rubros, and scenarios.
 */
export function canUserEditQuotes(
  user: UserProfile,
  roleDefinitions?: RoleDefinition[]
): boolean {
  if (user.status === 'inactivo') return false;
  return getEffectiveUserPermissions(user, roleDefinitions).canEditQuotes;
}

/**
 * Checks whether a user can delete requests, scenarios, or rubros.
 */
export function canUserDeleteRecords(
  user: UserProfile,
  roleDefinitions?: RoleDefinition[]
): boolean {
  if (user.status === 'inactivo') return false;
  return getEffectiveUserPermissions(user, roleDefinitions).canDeleteRecords;
}

/**
 * Checks whether a user can create new requests or scenarios.
 */
export function canUserCreateRequests(
  user: UserProfile,
  roleDefinitions?: RoleDefinition[]
): boolean {
  if (user.status === 'inactivo') return false;
  return getEffectiveUserPermissions(user, roleDefinitions).canCreateRequests;
}

/**
 * Checks whether a user can authorize/approve scenarios.
 */
export function canUserAuthorizeQuotes(
  user: UserProfile,
  roleDefinitions?: RoleDefinition[]
): boolean {
  if (user.status === 'inactivo') return false;
  return getEffectiveUserPermissions(user, roleDefinitions).canAuthorizeQuotes;
}

/**
 * Checks whether a user can edit global financial rules, roles, users, or exchange rates.
 */
export function canUserManageFinancialConfig(
  user: UserProfile,
  roleDefinitions?: RoleDefinition[]
): boolean {
  if (user.status === 'inactivo') return false;
  return getEffectiveUserPermissions(user, roleDefinitions).canManageConfigAndUsers;
}

/**
 * Evaluates which ApprovalPolicyRule applies to a scenario based on its calculated margin and total amount.
 */
export function resolveApplicableApprovalPolicy(
  scenario: QuoteScenario,
  request: TravelRequest,
  policies: ApprovalPolicyRule[]
): ApprovalPolicyRule {
  const calc = calculateScenarioFinancials(
    scenario,
    request.estimatedBudgetPerPerson,
    request.budgetCurrency
  );

  // If margin is below threshold (e.g., < 15%), require stricter multi-level approval
  const lowMarginPolicy = policies.find(
    (p) => calc.estimatedMarginPercent < p.minMarginPercent
  );
  if (lowMarginPolicy) return lowMarginPolicy;

  return (
    policies[0] || {
      id: 'pol_standard',
      name: 'Política Estándar Comercial',
      minMarginPercent: 15,
      maxGroupAmountMXN: 5000000,
      requiredLevels: 1,
      requiredRoles: ['Aprobador', 'Finanzas', 'Administrador'],
      enforceSegregationOfDuties: true,
    }
  );
}

/**
 * Validates if a user can approve a specific scenario version.
 * Enforces role/custom authorization permissions AND Segregation of Duties.
 */
export function validateApprovalPermission(
  user: UserProfile,
  scenario: QuoteScenario,
  policy: ApprovalPolicyRule,
  roleDefinitions?: RoleDefinition[]
): { allowed: boolean; reason?: string } {
  if (user.status !== 'activo') {
    return { allowed: false, reason: 'El usuario no se encuentra activo.' };
  }

  const perms = getEffectiveUserPermissions(user, roleDefinitions);
  if (!perms.canAuthorizeQuotes) {
    return {
      allowed: false,
      reason: `El perfil "${user.displayName}" (${user.role}) no tiene habilitado el permiso de Autorizar Cotizaciones.`,
    };
  }

  if (policy.enforceSegregationOfDuties && scenario.createdByUid === user.uid) {
    return {
      allowed: false,
      reason:
        'Segregación de funciones: Un usuario no puede autorizar un escenario elaborado por sí mismo.',
    };
  }

  return { allowed: true };
}

/**
 * CRITICAL BUSINESS RULE (Módulo H):
 * Do NOT allow external dispatch of a proposal unless ALL included scenarios have valid,
 * non-invalidated approvals matching their currentVersion.
 */
export function validateCanDispatchProposal(
  request: TravelRequest,
  scenarioIdsToSend: string[],
  settings: SystemSettings
): { allowed: boolean; reason?: string } {
  if (!scenarioIdsToSend || scenarioIdsToSend.length === 0) {
    return {
      allowed: false,
      reason: 'Debes seleccionar al menos un escenario para enviar.',
    };
  }

  for (const scId of scenarioIdsToSend) {
    const scenario = request.scenarios.find((s) => s.id === scId);
    if (!scenario) {
      return {
        allowed: false,
        reason: `El escenario ${scId} no existe en el expediente.`,
      };
    }

    if (scenario.approvalStatus !== 'Aprobado') {
      return {
        allowed: false,
        reason: `El escenario "${scenario.name}" tiene estado de aprobación "${scenario.approvalStatus}". No se permite el envío externo sin todas las aprobaciones vigentes.`,
      };
    }

    const policy = resolveApplicableApprovalPolicy(
      scenario,
      request,
      settings.approvalPolicies
    );

    const validApprovalsForCurrentVersion = scenario.approvals.filter(
      (a) =>
        a.scenarioVersion === scenario.currentVersion &&
        a.decision === 'Aprobar' &&
        !a.invalidated
    );

    if (validApprovalsForCurrentVersion.length < policy.requiredLevels) {
      return {
        allowed: false,
        reason: `El escenario "${scenario.name}" (v${scenario.currentVersion}) requiere ${policy.requiredLevels} nivel(es) de aprobación vigentes y solo cuenta con ${validApprovalsForCurrentVersion.length}.`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Validates travel request step 1 fields, including returnDate >= departureDate.
 */
export function validateTravelRequestDatesAndFields(input: {
  groupName: string;
  officeId: string;
  requesterName: string;
  departureDate: string;
  returnDate: string;
  proposalDueDate: string;
  participants: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.groupName || input.groupName.trim().length < 2) {
    errors.push('El nombre del grupo es obligatorio.');
  }
  if (!input.officeId) {
    errors.push('La oficina solicitante es obligatoria.');
  }
  if (!input.requesterName || !input.requesterName.trim()) {
    errors.push('El nombre de la persona que solicita es obligatorio.');
  }
  if (!input.departureDate || !input.returnDate) {
    errors.push('Las fechas de salida y de regreso son obligatorias.');
  } else {
    const dep = new Date(input.departureDate).getTime();
    const ret = new Date(input.returnDate).getTime();
    if (ret < dep) {
      errors.push('La fecha de regreso no puede ser anterior a la fecha de salida.');
    }
  }
  if (!Number.isFinite(input.participants) || input.participants <= 0) {
    errors.push('El número de participantes debe ser mayor a cero.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

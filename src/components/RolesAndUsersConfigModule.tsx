import React, { useMemo, useState } from 'react';
import {
  ApprovalPolicyRule,
  CurrencyCode,
  Office,
  RoleDefinition,
  RolePermissions,
  SupplierRateItem,
  SystemSettings,
  UserProfile,
  UserRole,
  UserStatus,
  UserType,
} from '../types/domain';
import {
  DEFAULT_ROLE_DEFINITIONS,
  getEffectiveUserPermissions,
} from '../security/rbac';
import { formatMoney } from '../utils/exporters';
import {
  ShieldCheck,
  Users,
  KeyRound,
  Plus,
  Trash2,
  Eye,
  Edit3,
  CheckCircle2,
  Search,
  Sliders,
  RotateCcw,
  Building2,
  Lock,
  MapPin,
  Globe,
} from 'lucide-react';

interface RolesAndUsersConfigModuleProps {
  settings: SystemSettings;
  users: UserProfile[];
  currentUser: UserProfile;
  onUpdateSettings: (
    next: SystemSettings,
    auditAction: string,
    details: string
  ) => void;
  onUpdateUsers: (
    nextUsers: UserProfile[],
    auditAction: string,
    details: string
  ) => void;
}

type ConfigSubTab = 'roles' | 'usuarios' | 'oficinas' | 'politicas' | 'proveedores';
type CapabilityFilter =
  | 'todos'
  | 'autoriza'
  | 'edita'
  | 'borra'
  | 'solo_ve';

const PERMISSION_KEYS: {
  key: keyof Pick<
    RolePermissions,
    | 'canViewRequests'
    | 'canCreateRequests'
    | 'canEditQuotes'
    | 'canDeleteRecords'
    | 'canAuthorizeQuotes'
    | 'canViewInternalCosts'
    | 'canExportDocuments'
    | 'canManageConfigAndUsers'
  >;
  shortLabel: string;
  description: string;
}[] = [
  {
    key: 'canViewRequests',
    shortLabel: 'Ver',
    description: 'Consultar expedientes, cotizaciones y propuestas',
  },
  {
    key: 'canCreateRequests',
    shortLabel: 'Crear',
    description: 'Registrar nuevas solicitudes y crear escenarios',
  },
  {
    key: 'canEditQuotes',
    shortLabel: 'Editar',
    description: 'Modificar costos, rubros, chaperones y comisiones',
  },
  {
    key: 'canDeleteRecords',
    shortLabel: 'Borrar',
    description: 'Eliminar solicitudes, escenarios o rubros personalizados',
  },
  {
    key: 'canAuthorizeQuotes',
    shortLabel: 'Autorizar',
    description: 'Aprobar o rechazar cotizaciones en comité y liberar envíos',
  },
  {
    key: 'canViewInternalCosts',
    shortLabel: 'Costos Internos',
    description: 'Ver precios netos, utilidad y comisiones confidenciales',
  },
  {
    key: 'canExportDocuments',
    shortLabel: 'Exportar',
    description: 'Descargar propuestas PDF y comparativos Excel / CSV',
  },
  {
    key: 'canManageConfigAndUsers',
    shortLabel: 'Configurar',
    description: 'Administrar roles, usuarios, oficinas y catálogos',
  },
];

export const RolesAndUsersConfigModule: React.FC<RolesAndUsersConfigModuleProps> = ({
  settings,
  users,
  currentUser,
  onUpdateSettings,
  onUpdateUsers,
}) => {
  const roleDefinitions: RoleDefinition[] =
    settings.roleDefinitions && settings.roleDefinitions.length > 0
      ? settings.roleDefinitions
      : DEFAULT_ROLE_DEFINITIONS;

  const currentUserPerms = getEffectiveUserPermissions(
    currentUser,
    roleDefinitions
  );
  const canManage = currentUserPerms.canManageConfigAndUsers;

  const [activeSubTab, setActiveSubTab] = useState<ConfigSubTab>('usuarios');
  const [capabilityFilter, setCapabilityFilter] =
    useState<CapabilityFilter>('todos');
  const [userSearch, setUserSearch] = useState('');
  const [officeFilter, setOfficeFilter] = useState('all');
  const [expandedUserUid, setExpandedUserUid] = useState<string | null>(null);
  const [pendingDeleteUserUid, setPendingDeleteUserUid] = useState<string | null>(null);
  const [pendingDeleteOfficeId, setPendingDeleteOfficeId] = useState<string | null>(null);

  // New Custom Role State
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRoleUserType, setNewRoleUserType] = useState<UserType>('interno');
  const [newRolePerms, setNewRolePerms] = useState<RolePermissions>({
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
  });

  // New User Form State
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('Ejecutivo Comercial');
  const [newUserOfficeId, setNewUserOfficeId] = useState(
    settings.offices[0]?.id || 'of_cdmx'
  );
  const [newUserMultiOffice, setNewUserMultiOffice] = useState(false);
  const [newUserCanDelete, setNewUserCanDelete] = useState(false);

  // New Office Form State
  const [newOfficeCode, setNewOfficeCode] = useState('');
  const [newOfficeName, setNewOfficeName] = useState('');
  const [newOfficeCity, setNewOfficeCity] = useState('');
  const [newOfficePhone, setNewOfficePhone] = useState('');
  const [newOfficeEmail, setNewOfficeEmail] = useState('');
  const [newOfficeTargetMXN, setNewOfficeTargetMXN] = useState(12000000);
  const [officeDirectorySearch, setOfficeDirectorySearch] = useState('');

  // New Approval Policy State
  const [newPolicyName, setNewPolicyName] = useState('');
  const [newPolicyMinMargin, setNewPolicyMinMargin] = useState(15);
  const [newPolicyMaxAmount, setNewPolicyMaxAmount] = useState(5000000);
  const [newPolicyLevels, setNewPolicyLevels] = useState(1);

  // Supplier / DMC Master Rate Catalog State (Mejora #4)
  const supplierRates = settings.supplierRates || [];
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierSeasonFilter, setSupplierSeasonFilter] = useState<string>('all');
  const [newSupProvider, setNewSupProvider] = useState('');
  const [newSupCategory, setNewSupCategory] =
    useState<SupplierRateItem['category']>('Escuela / Campus');
  const [newSupDestination, setNewSupDestination] = useState('');
  const [newSupSeason, setNewSupSeason] =
    useState<SupplierRateItem['season']>('Temporada Alta');
  const [newSupCurrency, setNewSupCurrency] = useState<CurrencyCode>('USD');
  const [newSupNetStudent, setNewSupNetStudent] = useState(2100);
  const [newSupNetChaperone, setNewSupNetChaperone] = useState(1450);
  const [newSupFreePlaceRatio, setNewSupFreePlaceRatio] = useState(10);
  const [newSupNotes, setNewSupNotes] = useState(
    'Alojamiento, alimentos, actividades académicas y traslados locales'
  );
  const [newSupValidUntil, setNewSupValidUntil] = useState('2027-08-31');

  // Compute governance summary metrics
  const governanceSummary = useMemo(() => {
    const activeUsers = users.filter((u) => u.status !== 'inactivo');
    const withPerms = activeUsers.map((u) => ({
      user: u,
      perms: getEffectiveUserPermissions(u, roleDefinitions),
    }));

    const authorizers = withPerms.filter((x) => x.perms.canAuthorizeQuotes);
    const editors = withPerms.filter((x) => x.perms.canEditQuotes);
    const deleters = withPerms.filter((x) => x.perms.canDeleteRecords);
    const viewOnly = withPerms.filter(
      (x) =>
        x.perms.canViewRequests &&
        !x.perms.canEditQuotes &&
        !x.perms.canDeleteRecords &&
        !x.perms.canAuthorizeQuotes
    );

    return {
      authorizers,
      editors,
      deleters,
      viewOnly,
    };
  }, [users, roleDefinitions]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (
        officeFilter !== 'all' &&
        u.officeId !== officeFilter &&
        !u.allowedOffices.includes(officeFilter)
      ) {
        return false;
      }
      if (q) {
        const match =
          u.displayName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q);
        if (!match) return false;
      }

      const perms = getEffectiveUserPermissions(u, roleDefinitions);
      if (capabilityFilter === 'autoriza' && !perms.canAuthorizeQuotes) return false;
      if (capabilityFilter === 'edita' && !perms.canEditQuotes) return false;
      if (capabilityFilter === 'borra' && !perms.canDeleteRecords) return false;
      if (
        capabilityFilter === 'solo_ve' &&
        (perms.canEditQuotes || perms.canDeleteRecords || perms.canAuthorizeQuotes)
      )
        return false;

      return true;
    });
  }, [users, officeFilter, userSearch, capabilityFilter, roleDefinitions]);

  const handleToggleRolePermission = (
    roleId: string,
    permKey: keyof RolePermissions,
    value: boolean | 'propia' | 'todas' | number
  ) => {
    if (!canManage) return;
    const targetRole = roleDefinitions.find((r) => r.id === roleId);
    if (!targetRole) return;

    const updatedRoles = roleDefinitions.map((r) => {
      if (r.id !== roleId) return r;
      return {
        ...r,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.displayName,
        permissions: {
          ...r.permissions,
          [permKey]: value,
        },
      };
    });

    onUpdateSettings(
      {
        ...settings,
        roleDefinitions: updatedRoles,
      },
      `Actualización de permiso en rol "${targetRole.name}"`,
      `Permiso ${String(permKey)} cambiado a ${String(value)} por ${currentUser.displayName}`
    );
  };

  const applyQuickRolePreset = (
    preset: 'autorizador' | 'editor' | 'solo_lectura' | 'admin_total'
  ) => {
    if (preset === 'autorizador') {
      setNewRolePerms({
        canViewRequests: true,
        canCreateRequests: false,
        canEditQuotes: true,
        canDeleteRecords: false,
        canAuthorizeQuotes: true,
        canViewInternalCosts: true,
        canExportDocuments: true,
        canManageConfigAndUsers: false,
        officeScope: 'todas',
        maxApprovalAmountMXN: 15000000,
      });
    } else if (preset === 'editor') {
      setNewRolePerms({
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
      });
    } else if (preset === 'solo_lectura') {
      setNewRolePerms({
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
      });
    } else {
      setNewRolePerms({
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
      });
    }
  };

  const handleCreateCustomRole = () => {
    if (!canManage || !newRoleName.trim()) return;
    const trimmedName = newRoleName.trim();
    if (
      roleDefinitions.some(
        (r) => r.name.toLowerCase() === trimmedName.toLowerCase()
      )
    ) {
      return;
    }

    const newRole: RoleDefinition = {
      id: `role_custom_${Date.now()}`,
      name: trimmedName,
      description:
        newRoleDesc.trim() ||
        `Rol personalizado configurado por ${currentUser.displayName}.`,
      isSystemDefault: false,
      userType: newRoleUserType,
      permissions: { ...newRolePerms },
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.displayName,
    };

    onUpdateSettings(
      {
        ...settings,
        roleDefinitions: [...roleDefinitions, newRole],
      },
      `Creación de nuevo rol "${newRole.name}"`,
      `Permisos: Ver=${newRole.permissions.canViewRequests}, Editar=${newRole.permissions.canEditQuotes}, Borrar=${newRole.permissions.canDeleteRecords}, Autorizar=${newRole.permissions.canAuthorizeQuotes}`
    );

    setNewRoleName('');
    setNewRoleDesc('');
  };

  const handleDeleteCustomRole = (role: RoleDefinition) => {
    if (!canManage || role.isSystemDefault) return;
    const nextRoles = roleDefinitions.filter((r) => r.id !== role.id);
    onUpdateSettings(
      {
        ...settings,
        roleDefinitions: nextRoles,
      },
      `Eliminación de rol personalizado "${role.name}"`,
      `Rol eliminado por ${currentUser.displayName}.`
    );
  };

  const handleCreateUser = () => {
    if (!newUserName.trim() || !newUserEmail.trim()) return;
    const matchedRoleDef = roleDefinitions.find((r) => r.name === newUserRole);
    const allOfficeIds = settings.offices.map((o) => o.id);
    const newUser: UserProfile = {
      uid: `usr_${Date.now()}`,
      email: newUserEmail.trim().toLowerCase(),
      displayName: newUserName.trim(),
      role: newUserRole,
      userType:
        matchedRoleDef?.userType ||
        (newUserRole === 'Usuario Externo' ? 'externo' : 'interno'),
      officeId: newUserOfficeId,
      allowedOffices: newUserMultiOffice ? allOfficeIds : [newUserOfficeId],
      status: 'activo',
      lastActiveAt: new Date().toISOString(),
      customPermissions: newUserCanDelete
        ? { canDeleteRecords: true }
        : undefined,
    };

    onUpdateUsers(
      [...users, newUser],
      `Alta de usuario "${newUser.displayName}"`,
      `Correo: ${newUser.email} · Rol asignado: ${newUser.role} · Oficina: ${newUser.officeId}`
    );
    setNewUserName('');
    setNewUserEmail('');
    setNewUserCanDelete(false);
  };

  const handleChangeUserRole = (user: UserProfile, nextRole: UserRole) => {
    const matchedRoleDef = roleDefinitions.find((r) => r.name === nextRole);
    const nextUsers = users.map((u) =>
      u.uid === user.uid
        ? {
            ...u,
            role: nextRole,
            userType:
              matchedRoleDef?.userType ||
              (nextRole === 'Usuario Externo' ? 'externo' : 'interno'),
          }
        : u
    );
    onUpdateUsers(
      nextUsers,
      `Cambio de rol de usuario ${user.displayName}`,
      `Rol anterior: ${user.role} → Nuevo rol: ${nextRole}`
    );
  };

  const handleToggleUserCustomPerm = (
    user: UserProfile,
    permKey: keyof RolePermissions,
    nextVal: boolean
  ) => {
    const nextUsers = users.map((u) => {
      if (u.uid !== user.uid) return u;
      return {
        ...u,
        customPermissions: {
          ...(u.customPermissions || {}),
          [permKey]: nextVal,
        },
      };
    });
    onUpdateUsers(
      nextUsers,
      `Ajuste de permiso individual para ${user.displayName}`,
      `Permiso "${String(permKey)}" establecido en ${nextVal ? 'HABILITADO' : 'RESTRINGIDO'}`
    );
  };

  const handleSetUserSoloLectura = (user: UserProfile) => {
    const nextUsers = users.map((u) => {
      if (u.uid !== user.uid) return u;
      return {
        ...u,
        customPermissions: {
          ...(u.customPermissions || {}),
          canViewRequests: true,
          canCreateRequests: false,
          canEditQuotes: false,
          canDeleteRecords: false,
          canAuthorizeQuotes: false,
        },
      };
    });
    onUpdateUsers(
      nextUsers,
      `Perfil "Solo Ve (Lectura)" aplicado a ${user.displayName}`,
      `Se deshabilitaron permisos de crear, editar, borrar y autorizar.`
    );
  };

  const handleResetUserCustomPerms = (user: UserProfile) => {
    const nextUsers = users.map((u) =>
      u.uid === user.uid ? { ...u, customPermissions: undefined } : u
    );
    onUpdateUsers(
      nextUsers,
      `Restablecimiento de permisos base de rol para ${user.displayName}`,
      `Se eliminaron excepciones individuales; hereda 100% del rol ${user.role}.`
    );
  };

  const handleDeleteUser = (user: UserProfile) => {
    if (users.length <= 1) return;
    const remaining = users.filter((u) => u.uid !== user.uid);
    setPendingDeleteUserUid(null);
    onUpdateUsers(
      remaining,
      `Usuario "${user.displayName}" borrado del sistema`,
      `Usuario ${user.email} (${user.role}) eliminado del directorio.`
    );
  };

  const handleToggleUserAllowedOffice = (user: UserProfile, officeId: string) => {
    const exists = user.allowedOffices.includes(officeId);
    let nextAllowed = exists
      ? user.allowedOffices.filter((id) => id !== officeId)
      : [...user.allowedOffices, officeId];

    // Ensure at least primary office remains
    if (nextAllowed.length === 0) {
      nextAllowed = [user.officeId];
    }

    const nextPrimary = nextAllowed.includes(user.officeId)
      ? user.officeId
      : nextAllowed[0];

    const nextUsers = users.map((u) =>
      u.uid === user.uid
        ? {
            ...u,
            officeId: nextPrimary,
            allowedOffices: nextAllowed,
          }
        : u
    );

    onUpdateUsers(
      nextUsers,
      `Actualización de oficinas asignadas a ${user.displayName}`,
      `Oficinas habilitadas: ${nextAllowed.join(', ')}`
    );
  };

  // Office Management Handlers
  const handleCreateOffice = () => {
    const code = newOfficeCode.trim().toUpperCase();
    const name = newOfficeName.trim();
    const city = newOfficeCity.trim();
    if (!code || !name || !city) return;

    const officeId = `of_${code.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now().toString().slice(-3)}`;
    const newOffice: Office = {
      id: officeId,
      code,
      name,
      city,
      phone: newOfficePhone.trim() || undefined,
      email: newOfficeEmail.trim() || undefined,
      active: true,
      annualTargetMXN: Math.max(0, Number(newOfficeTargetMXN) || 10000000),
    };

    onUpdateSettings(
      {
        ...settings,
        offices: [...settings.offices, newOffice],
      },
      `Alta de nueva oficina "${newOffice.code} — ${newOffice.name}"`,
      `Ciudad: ${newOffice.city} · Tel: ${newOffice.phone || 'S/N'} · Email: ${newOffice.email || 'S/C'}`
    );

    setNewOfficeCode('');
    setNewOfficeName('');
    setNewOfficeCity('');
    setNewOfficePhone('');
    setNewOfficeEmail('');
  };

  const handleUpdateOffice = (officeId: string, patch: Partial<Office>) => {
    const target = settings.offices.find((o) => o.id === officeId);
    if (!target) return;

    const nextOffices = settings.offices.map((o) =>
      o.id === officeId ? { ...o, ...patch } : o
    );

    onUpdateSettings(
      {
        ...settings,
        offices: nextOffices,
      },
      `Actualización de oficina "${target.code}"`,
      `Cambios aplicados en sede ${target.name}`
    );
  };

  const handleDeleteOffice = (office: Office) => {
    if (settings.offices.length <= 1) return;
    const remainingOffices = settings.offices.filter((o) => o.id !== office.id);
    const fallbackOfficeId = remainingOffices[0].id;

    // Reassign any user whose primary office was the deleted office
    const hasAffectedUsers = users.some(
      (u) => u.officeId === office.id || u.allowedOffices.includes(office.id)
    );
    if (hasAffectedUsers) {
      const updatedUsers = users.map((u) => {
        const filteredAllowed = u.allowedOffices.filter((id) => id !== office.id);
        const nextOfficeId =
          u.officeId === office.id ? fallbackOfficeId : u.officeId;
        const nextAllowed =
          filteredAllowed.length > 0 ? filteredAllowed : [nextOfficeId];
        return {
          ...u,
          officeId: nextOfficeId,
          allowedOffices: nextAllowed,
        };
      });
      onUpdateUsers(
        updatedUsers,
        `Reasignación de usuarios por baja de oficina ${office.code}`,
        `Usuarios reasignados a ${remainingOffices[0].code}`
      );
    }

    setPendingDeleteOfficeId(null);
    onUpdateSettings(
      {
        ...settings,
        offices: remainingOffices,
      },
      `Oficina "${office.code} — ${office.name}" eliminada`,
      `Sede dada de baja por ${currentUser.displayName}`
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#0B3B70]">
            <ShieldCheck className="w-4 h-4" />
            <span>GOBIERNO DE ACCESOS, OFICINAS Y CONTROL DE PERMISOS (RBAC)</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight mt-1">
            Menú de Configuración: Roles, Usuarios y Oficinas
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Administra las <strong>oficinas</strong>, da de alta o <strong>borra usuarios</strong> y define quién{' '}
            <strong>autoriza</strong>, quién <strong>solo ve</strong>, quién <strong>edita</strong> y quién{' '}
            <strong>borra</strong> en Xplore Together.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span
            className={`px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 ${
              canManage
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            {canManage
              ? `Edición de Configuración Habilitada (${currentUser.role})`
              : `Modo Consulta (${currentUser.role})`}
          </span>
        </div>
      </div>

      {/* 5 Governance Summary Cards: Autoriza, Edita, Borra, Solo Ve, Oficinas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <button
          type="button"
          onClick={() => {
            setActiveSubTab('usuarios');
            setCapabilityFilter(
              capabilityFilter === 'autoriza' ? 'todos' : 'autoriza'
            );
          }}
          className={`text-left p-4 rounded-xl border transition-all ${
            capabilityFilter === 'autoriza' && activeSubTab === 'usuarios'
              ? 'bg-blue-50/70 border-[#0B3B70] ring-2 ring-[#0B3B70]/15'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold text-[#0B3B70]">QUIÉN AUTORIZA</span>
            <CheckCircle2 className="w-4 h-4 text-[#0B3B70]" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {governanceSummary.authorizers.length} usuarios
          </div>
          <div className="text-[11px] text-slate-600 mt-1 truncate">
            {governanceSummary.authorizers
              .map((x) => x.user.displayName.split(' ')[0])
              .join(', ') || 'Ninguno'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Aprueban cotizaciones y liberan propuestas
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab('usuarios');
            setCapabilityFilter(capabilityFilter === 'edita' ? 'todos' : 'edita');
          }}
          className={`text-left p-4 rounded-xl border transition-all ${
            capabilityFilter === 'edita' && activeSubTab === 'usuarios'
              ? 'bg-blue-50/70 border-[#0B3B70] ring-2 ring-[#0B3B70]/15'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold text-emerald-700">QUIÉN EDITA</span>
            <Edit3 className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {governanceSummary.editors.length} usuarios
          </div>
          <div className="text-[11px] text-slate-600 mt-1 truncate">
            {governanceSummary.editors
              .map((x) => x.user.displayName.split(' ')[0])
              .join(', ') || 'Ninguno'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Capturan y modifican costos, rubros y comisiones
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab('usuarios');
            setCapabilityFilter(capabilityFilter === 'borra' ? 'todos' : 'borra');
          }}
          className={`text-left p-4 rounded-xl border transition-all ${
            capabilityFilter === 'borra' && activeSubTab === 'usuarios'
              ? 'bg-blue-50/70 border-[#0B3B70] ring-2 ring-[#0B3B70]/15'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold text-red-700">QUIÉN BORRA</span>
            <Trash2 className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {governanceSummary.deleters.length} usuarios
          </div>
          <div className="text-[11px] text-slate-600 mt-1 truncate">
            {governanceSummary.deleters
              .map((x) => x.user.displayName.split(' ')[0])
              .join(', ') || 'Ninguno'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Pueden eliminar solicitudes, escenarios o rubros
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab('usuarios');
            setCapabilityFilter(
              capabilityFilter === 'solo_ve' ? 'todos' : 'solo_ve'
            );
          }}
          className={`text-left p-4 rounded-xl border transition-all ${
            capabilityFilter === 'solo_ve' && activeSubTab === 'usuarios'
              ? 'bg-blue-50/70 border-[#0B3B70] ring-2 ring-[#0B3B70]/15'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold text-slate-700">QUIÉN SOLO VE</span>
            <Eye className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {governanceSummary.viewOnly.length} usuarios
          </div>
          <div className="text-[11px] text-slate-600 mt-1 truncate">
            {governanceSummary.viewOnly
              .map((x) => x.user.displayName.split(' ')[0])
              .join(', ') || 'Ninguno'}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Acceso exclusivo de lectura sin edición ni borrado
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('oficinas')}
          className={`text-left p-4 rounded-xl border transition-all ${
            activeSubTab === 'oficinas'
              ? 'bg-blue-50/70 border-[#0B3B70] ring-2 ring-[#0B3B70]/15'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold text-[#0B3B70]">OFICINAS Y SEDES</span>
            <Building2 className="w-4 h-4 text-[#0B3B70]" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {settings.offices.filter((o) => o.active).length} sedes
          </div>
          <div className="text-[11px] text-slate-600 mt-1 truncate font-mono">
            {settings.offices.map((o) => o.code).join(' · ')}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Administrar oficinas, ciudades y adscripción
          </div>
        </button>
      </div>

      {/* Sub-Navigation Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveSubTab('usuarios')}
            className={`px-4 py-2 text-xs font-medium rounded-lg flex items-center gap-2 transition-colors ${
              activeSubTab === 'usuarios'
                ? 'bg-[#0B3B70] text-white font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>1. Usuarios, Permisos y Borrado ({users.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('oficinas')}
            className={`px-4 py-2 text-xs font-medium rounded-lg flex items-center gap-2 transition-colors ${
              activeSubTab === 'oficinas'
                ? 'bg-[#0B3B70] text-white font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>2. Oficinas y Sedes ({settings.offices.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('roles')}
            className={`px-4 py-2 text-xs font-medium rounded-lg flex items-center gap-2 transition-colors ${
              activeSubTab === 'roles'
                ? 'bg-[#0B3B70] text-white font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>3. Roles y Matriz de Permisos ({roleDefinitions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('politicas')}
            className={`px-4 py-2 text-xs font-medium rounded-lg flex items-center gap-2 transition-colors ${
              activeSubTab === 'politicas'
                ? 'bg-[#0B3B70] text-white font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>
              4. Reglas de Autorización por Margen ({settings.approvalPolicies.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('proveedores')}
            className={`px-4 py-2 text-xs font-medium rounded-lg flex items-center gap-2 transition-colors ${
              activeSubTab === 'proveedores'
                ? 'bg-[#0B3B70] text-white font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>
              5. Tarifario Maestro Proveedores / DMC ({supplierRates.length})
            </span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          SUB-TAB 1: DIRECTORIO DE USUARIOS, PERMISOS Y BORRADO
         ===================================================================== */}
      {activeSubTab === 'usuarios' && (
        <div className="space-y-6">
          {/* Add / Invite User Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-2xs">
            <div className="border-b border-slate-200 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  + Dar de Alta / Autorizar Nuevo Usuario
                </h2>
                <p className="text-xs text-slate-500">
                  Asigna su rol inicial, oficina principal, alcance de oficinas y si tiene permiso para borrar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab('oficinas')}
                className="text-xs font-semibold text-[#0B3B70] hover:underline flex items-center gap-1"
              >
                <Building2 className="w-3.5 h-3.5" /> Administrar catálogo de oficinas ({settings.offices.length})
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs items-end">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Nombre completo *
                </label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Ej. Ana Sofía Morales"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Correo electrónico *
                </label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="ana.morales@xploretogether.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Rol Asignado
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-medium"
                >
                  {roleDefinitions.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Oficina Principal
                </label>
                <select
                  value={newUserOfficeId}
                  onChange={(e) => setNewUserOfficeId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {settings.offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} — {o.city}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 pb-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={newUserMultiOffice}
                    onChange={(e) => setNewUserMultiOffice(e.target.checked)}
                    className="accent-[#0B3B70]"
                  />
                  <span>Todas las oficinas</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-red-700 font-medium">
                  <input
                    type="checkbox"
                    checked={newUserCanDelete}
                    onChange={(e) => setNewUserCanDelete(e.target.checked)}
                    className="accent-red-600"
                  />
                  <span>Permiso para Borrar</span>
                </label>
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleCreateUser}
                  className="w-full px-4 py-2 bg-[#0B3B70] text-white font-semibold rounded-lg hover:bg-[#082d56] flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Registrar Usuario
                </button>
              </div>
            </div>
          </div>

          {/* Filter & Search Bar for Users */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(
                [
                  { id: 'todos', label: `Todos (${users.length})` },
                  {
                    id: 'autoriza',
                    label: `Quién Autoriza (${governanceSummary.authorizers.length})`,
                  },
                  {
                    id: 'edita',
                    label: `Quién Edita (${governanceSummary.editors.length})`,
                  },
                  {
                    id: 'borra',
                    label: `Quién Borra (${governanceSummary.deleters.length})`,
                  },
                  {
                    id: 'solo_ve',
                    label: `Quién Solo Ve (${governanceSummary.viewOnly.length})`,
                  },
                ] as { id: CapabilityFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCapabilityFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    capabilityFilter === tab.id
                      ? 'bg-[#0B3B70] text-white font-semibold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Buscar por nombre, correo o rol..."
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none"
                />
              </div>

              <select
                value={officeFilter}
                onChange={(e) => setOfficeFilter(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-slate-50"
              >
                <option value="all">Todas las oficinas ({settings.offices.length})</option>
                {settings.offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} — {o.city}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Users Table with Direct Permission Switches, Office Selector, and Prominent Delete Button */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-3 px-4">Usuario / Correo</th>
                    <th className="py-3 px-4">Rol Asignado</th>
                    <th className="py-3 px-4">Oficina Principal y Sedes</th>
                    <th className="py-3 px-4">
                      Facultades Rápidas (Clic para activar/desactivar)
                    </th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones / Borrar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredUsers.map((u) => {
                    const effective = getEffectiveUserPermissions(
                      u,
                      roleDefinitions
                    );
                    const hasCustomOverrides = Boolean(
                      u.customPermissions &&
                        Object.keys(u.customPermissions).length > 0
                    );
                    const isExpanded = expandedUserUid === u.uid;
                    const isConfirmingDelete = pendingDeleteUserUid === u.uid;
                    const isSoloLectura =
                      effective.canViewRequests &&
                      !effective.canEditQuotes &&
                      !effective.canDeleteRecords &&
                      !effective.canAuthorizeQuotes;

                    return (
                      <React.Fragment key={u.uid}>
                        <tr className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900">
                                {u.displayName}
                              </span>
                              {u.uid === currentUser.uid && (
                                <span className="px-1.5 py-0.5 text-[10px] font-mono bg-blue-50 text-[#0B3B70] border border-blue-200 rounded">
                                  Sesión activa
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-slate-500 text-[11px]">
                              {u.email}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <select
                              value={u.role}
                              onChange={(e) =>
                                handleChangeUserRole(
                                  u,
                                  e.target.value as UserRole
                                )
                              }
                              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-medium text-slate-900"
                            >
                              {roleDefinitions.map((r) => (
                                <option key={r.id} value={r.name}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={u.officeId}
                                  onChange={(e) => {
                                    const nextOffice = e.target.value;
                                    onUpdateUsers(
                                      users.map((item) =>
                                        item.uid === u.uid
                                          ? {
                                              ...item,
                                              officeId: nextOffice,
                                              allowedOffices: Array.from(
                                                new Set([
                                                  nextOffice,
                                                  ...item.allowedOffices,
                                                ])
                                              ),
                                            }
                                          : item
                                      ),
                                      `Cambio de oficina de ${u.displayName}`,
                                      `Nueva oficina principal: ${nextOffice}`
                                    );
                                  }}
                                  className="px-2 py-1 border border-slate-300 rounded bg-white font-mono text-slate-800"
                                >
                                  {settings.offices.map((o) => (
                                    <option key={o.id} value={o.id}>
                                      {o.code} — {o.city}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                {settings.offices.map((o) => {
                                  const isAllowed =
                                    effective.officeScope === 'todas' ||
                                    u.allowedOffices.includes(o.id) ||
                                    u.officeId === o.id;
                                  return (
                                    <button
                                      key={o.id}
                                      type="button"
                                      onClick={() =>
                                        handleToggleUserAllowedOffice(u, o.id)
                                      }
                                      className={`px-1.5 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                                        isAllowed
                                          ? 'bg-blue-50 border-blue-200 text-[#0B3B70] font-semibold'
                                          : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-700'
                                      }`}
                                      title={`Habilitar/deshabilitar acceso de ${u.displayName} a oficina ${o.name} (${o.city})`}
                                    >
                                      {o.code}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleUserCustomPerm(
                                    u,
                                    'canAuthorizeQuotes',
                                    !effective.canAuthorizeQuotes
                                  )
                                }
                                className={`px-2 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                                  effective.canAuthorizeQuotes
                                    ? 'bg-blue-50 border-blue-300 text-[#0B3B70] font-semibold'
                                    : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-700'
                                }`}
                                title="Clic para activar o desactivar permiso de Autorizar"
                              >
                                {effective.canAuthorizeQuotes ? '✓ Autoriza' : 'Autoriza'}
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleUserCustomPerm(
                                    u,
                                    'canEditQuotes',
                                    !effective.canEditQuotes
                                  )
                                }
                                className={`px-2 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                                  effective.canEditQuotes
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold'
                                    : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-700'
                                }`}
                                title="Clic para activar o desactivar permiso de Editar"
                              >
                                {effective.canEditQuotes ? '✓ Edita' : 'Edita'}
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleUserCustomPerm(
                                    u,
                                    'canDeleteRecords',
                                    !effective.canDeleteRecords
                                  )
                                }
                                className={`px-2 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                                  effective.canDeleteRecords
                                    ? 'bg-red-50 border-red-300 text-red-700 font-semibold'
                                    : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-700'
                                }`}
                                title="Clic para activar o desactivar permiso de Borrar expedientes/escenarios"
                              >
                                {effective.canDeleteRecords ? '✓ Borra' : 'Borra'}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSetUserSoloLectura(u)}
                                className={`px-2 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                                  isSoloLectura
                                    ? 'bg-amber-50 border-amber-300 text-amber-900 font-semibold'
                                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800'
                                }`}
                                title="Dejar a este usuario únicamente con permiso de lectura (Solo Ve)"
                              >
                                {isSoloLectura ? '👁 Solo Ve' : 'Solo Ve'}
                              </button>
                            </div>
                            {hasCustomOverrides && (
                              <div className="text-[10px] text-[#0B3B70] font-medium mt-1">
                                Permisos personalizados activos
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <select
                              value={u.status}
                              onChange={(e) => {
                                const nextSt = e.target.value as UserStatus;
                                onUpdateUsers(
                                  users.map((item) =>
                                    item.uid === u.uid
                                      ? { ...item, status: nextSt }
                                      : item
                                  ),
                                  `Cambio de estado de usuario ${u.displayName}`,
                                  `Nuevo estado: ${nextSt}`
                                );
                              }}
                              className={`px-2 py-1 border rounded font-medium ${
                                u.status === 'activo'
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                  : 'border-slate-300 bg-slate-100 text-slate-600'
                              }`}
                            >
                              <option value="activo">Activo</option>
                              <option value="invitado">Invitado</option>
                              <option value="inactivo">Inactivo</option>
                            </select>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedUserUid(isExpanded ? null : u.uid)
                                }
                                className="px-2.5 py-1.5 text-xs font-medium text-[#0B3B70] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 whitespace-nowrap"
                              >
                                {isExpanded ? 'Ocultar Detalle' : 'Más Permisos'}
                              </button>

                              {isConfirmingDelete ? (
                                <div className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(u)}
                                    className="px-2 py-0.5 bg-red-600 text-white text-[11px] font-semibold rounded hover:bg-red-700"
                                  >
                                    Confirmar Borrar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingDeleteUserUid(null)}
                                    className="px-1.5 py-0.5 text-slate-600 hover:text-slate-900 text-[11px]"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={users.length <= 1}
                                  onClick={() => setPendingDeleteUserUid(u.uid)}
                                  className="px-2.5 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 inline-flex items-center gap-1 disabled:opacity-40 whitespace-nowrap"
                                  title="Borrar usuario del sistema"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Borrar</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Row for Individual User Permission Overrides & Multi-Office Assignment */}
                        {isExpanded && (
                          <tr className="bg-slate-50/90 border-b border-slate-200">
                            <td colSpan={6} className="p-4">
                              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <strong className="text-slate-900">
                                      Configuración Detallada de Permisos y Oficinas para {u.displayName} ({u.role})
                                    </strong>
                                    <p className="text-[11px] text-slate-500">
                                      Otorga o restringe permisos específicos o asigna múltiples oficinas a este usuario.
                                    </p>
                                  </div>
                                  {hasCustomOverrides && (
                                    <button
                                      type="button"
                                      onClick={() => handleResetUserCustomPerms(u)}
                                      className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 underline"
                                    >
                                      <RotateCcw className="w-3 h-3" /> Restablecer a valores del rol
                                    </button>
                                  )}
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                                  {PERMISSION_KEYS.map((col) => {
                                    const isChecked = Boolean(effective[col.key]);
                                    return (
                                      <label
                                        key={col.key}
                                        className={`p-2.5 rounded-lg border flex flex-col justify-between gap-1 cursor-pointer ${
                                          isChecked
                                            ? 'bg-blue-50/60 border-blue-300 text-[#0B3B70]'
                                            : 'bg-slate-50 border-slate-200 text-slate-500'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="font-semibold">
                                            {col.shortLabel}
                                          </span>
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={(e) =>
                                              handleToggleUserCustomPerm(
                                                u,
                                                col.key,
                                                e.target.checked
                                              )
                                            }
                                            className="accent-[#0B3B70]"
                                          />
                                        </div>
                                        <span className="text-[10px] leading-tight">
                                          {col.description}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>

                                {/* Office Assignment Checkboxes */}
                                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                                      <Building2 className="w-3.5 h-3.5 text-[#0B3B70]" />
                                      Oficinas Autorizadas:
                                    </span>
                                    {settings.offices.map((o) => {
                                      const checked =
                                        u.allowedOffices.includes(o.id) ||
                                        u.officeId === o.id;
                                      return (
                                        <label
                                          key={o.id}
                                          className={`px-2.5 py-1 rounded-lg border text-xs inline-flex items-center gap-1.5 cursor-pointer ${
                                            checked
                                              ? 'bg-blue-50 border-blue-200 text-[#0B3B70] font-semibold'
                                              : 'bg-slate-50 border-slate-200 text-slate-600'
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() =>
                                              handleToggleUserAllowedOffice(u, o.id)
                                            }
                                            className="accent-[#0B3B70]"
                                          />
                                          <span>
                                            {o.code} ({o.city})
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>

                                  <button
                                    type="button"
                                    disabled={users.length <= 1}
                                    onClick={() => handleDeleteUser(u)}
                                    className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 inline-flex items-center gap-1.5 disabled:opacity-40"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Borrar Definitivamente a {u.displayName}
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 2: CATÁLOGO DE OFICINAS Y SEDES OPERATIVAS
         ===================================================================== */}
      {activeSubTab === 'oficinas' && (
        <div className="space-y-6">
          {/* Create New Office Form */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-2xs">
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900">
                + Dar de Alta Nueva Oficina / Sede Regional
              </h2>
              <p className="text-xs text-slate-500">
                Agrega nuevas oficinas para asignar ejecutivos comerciales, separar expedientes por plaza y filtrar reportes financieros.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 text-xs items-end">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Código *
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={newOfficeCode}
                  onChange={(e) => setNewOfficeCode(e.target.value.toUpperCase())}
                  placeholder="Ej. QRO, CUN"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Nombre de la Oficina *
                </label>
                <input
                  type="text"
                  value={newOfficeName}
                  onChange={(e) => setNewOfficeName(e.target.value)}
                  placeholder="Ej. Oficina Bajío"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Ciudad / Estado *
                </label>
                <input
                  type="text"
                  value={newOfficeCity}
                  onChange={(e) => setNewOfficeCity(e.target.value)}
                  placeholder="Ej. Querétaro"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Teléfono Oficial
                </label>
                <input
                  type="text"
                  value={newOfficePhone}
                  onChange={(e) => setNewOfficePhone(e.target.value)}
                  placeholder="Ej. (442).245.1771"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Email Oficial
                </label>
                <input
                  type="email"
                  value={newOfficeEmail}
                  onChange={(e) => setNewOfficeEmail(e.target.value)}
                  placeholder="sede@estudiantesembajadores.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Meta Anual (MXN)
                </label>
                <input
                  type="number"
                  step={500000}
                  min={0}
                  value={newOfficeTargetMXN}
                  onChange={(e) => setNewOfficeTargetMXN(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleCreateOffice}
                  className="w-full px-4 py-2 bg-[#0B3B70] text-white font-semibold rounded-lg hover:bg-[#082d56] flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Crear Oficina
                </button>
              </div>
            </div>
          </div>

          {/* Offices Directory Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Directorio Nacional de Oficinas Estudiantes Embajadores ({settings.offices.length} sedes)
                </h3>
                <p className="text-xs text-slate-500">
                  Catálogo sincronizado con <strong>estudiantesembajadores.com/oficinas/</strong> · Edita código, sede, ciudad, teléfono, correo o estado operativo.
                </p>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={officeDirectorySearch}
                  onChange={(e) => setOfficeDirectorySearch(e.target.value)}
                  placeholder="Buscar ciudad, código, teléfono o correo..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-[#0B3B70]"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-3 px-4">Código</th>
                    <th className="py-3 px-4">Nombre de la Sede</th>
                    <th className="py-3 px-4">Ciudad</th>
                    <th className="py-3 px-4">Teléfono / Contacto</th>
                    <th className="py-3 px-4">Correo Oficial</th>
                    <th className="py-3 px-4">Meta Anual (MXN)</th>
                    <th className="py-3 px-4">Usuarios</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones / Borrar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {settings.offices
                    .filter((office) => {
                      const q = officeDirectorySearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        office.code.toLowerCase().includes(q) ||
                        office.name.toLowerCase().includes(q) ||
                        office.city.toLowerCase().includes(q) ||
                        (office.phone || '').toLowerCase().includes(q) ||
                        (office.email || '').toLowerCase().includes(q)
                      );
                    })
                    .map((office) => {
                      const assignedUsers = users.filter(
                        (u) =>
                          u.officeId === office.id ||
                          u.allowedOffices.includes(office.id)
                      );
                      const primaryUsers = users.filter(
                        (u) => u.officeId === office.id
                      );
                      const isConfirmingDelete = pendingDeleteOfficeId === office.id;

                      return (
                        <tr key={office.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              maxLength={10}
                              value={office.code}
                              onChange={(e) =>
                                handleUpdateOffice(office.id, {
                                  code: e.target.value.toUpperCase(),
                                })
                              }
                              className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-mono font-bold text-[#0B3B70] uppercase"
                            />
                          </td>

                          <td className="py-3 px-4">
                            <input
                              type="text"
                              value={office.name}
                              onChange={(e) =>
                                handleUpdateOffice(office.id, {
                                  name: e.target.value,
                                })
                              }
                              className="w-full min-w-[175px] px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-medium text-slate-900"
                            />
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <input
                                type="text"
                                value={office.city}
                                onChange={(e) =>
                                  handleUpdateOffice(office.id, {
                                    city: e.target.value,
                                  })
                                }
                                className="w-full min-w-[130px] px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800"
                              />
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <input
                              type="text"
                              value={office.phone || ''}
                              placeholder="Teléfono..."
                              onChange={(e) =>
                                handleUpdateOffice(office.id, {
                                  phone: e.target.value,
                                })
                              }
                              className="w-36 px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-mono text-slate-700"
                            />
                          </td>

                          <td className="py-3 px-4">
                            <input
                              type="email"
                              value={office.email || ''}
                              placeholder="correo@estudiantesembajadores.com"
                              onChange={(e) =>
                                handleUpdateOffice(office.id, {
                                  email: e.target.value,
                                })
                              }
                              className="w-56 px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-mono text-slate-700"
                            />
                          </td>

                          <td className="py-3 px-4">
                            <input
                              type="number"
                              step={500000}
                              min={0}
                              value={office.annualTargetMXN ?? 10000000}
                              onChange={(e) =>
                                handleUpdateOffice(office.id, {
                                  annualTargetMXN: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                              className="w-32 px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-mono font-semibold text-emerald-700"
                            />
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <span className="font-mono font-semibold text-slate-900">
                                {primaryUsers.length} tit.
                              </span>
                              <span className="text-slate-400">·</span>
                              <span className="text-slate-500">
                                {assignedUsers.length} acc.
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setOfficeFilter(office.id);
                                  setActiveSubTab('usuarios');
                                }}
                                className="text-[11px] text-[#0B3B70] font-semibold hover:underline ml-1"
                              >
                                Ver →
                              </button>
                            </div>
                          </td>

                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateOffice(office.id, {
                                active: !office.active,
                              })
                            }
                            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                              office.active
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                : 'bg-slate-100 border-slate-300 text-slate-500'
                            }`}
                          >
                            {office.active ? '● Activa' : '○ Inactiva'}
                          </button>
                        </td>

                        <td className="py-3 px-4 text-right">
                          {isConfirmingDelete ? (
                            <div className="inline-flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteOffice(office)}
                                className="px-2 py-0.5 bg-red-600 text-white text-[11px] font-semibold rounded hover:bg-red-700"
                              >
                                Confirmar Borrar
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDeleteOfficeId(null)}
                                className="px-1.5 py-0.5 text-slate-600 hover:text-slate-900 text-[11px]"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={settings.offices.length <= 1}
                              onClick={() => setPendingDeleteOfficeId(office.id)}
                              className="px-2.5 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 inline-flex items-center gap-1 disabled:opacity-40"
                              title="Borrar oficina"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Borrar</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 3: DEFINICIÓN DE ROLES Y MATRIZ DE PERMISOS
         ===================================================================== */}
      {activeSubTab === 'roles' && (
        <div className="space-y-6">
          {/* Interactive Permissions Matrix */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Matriz Interactiva de Roles y Permisos Operativos
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Marca o desmarca las casillas para definir qué puede hacer cada rol en tiempo real (Ver, Crear, Editar, Borrar, Autorizar, Ver Costos Internos, Exportar y Configurar).
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#0B3B70] text-white font-semibold">
                    <th className="py-3 px-4 min-w-[210px]">Rol / Perfil</th>
                    {PERMISSION_KEYS.map((col) => (
                      <th
                        key={col.key}
                        className="py-3 px-2.5 text-center whitespace-nowrap"
                        title={col.description}
                      >
                        {col.shortLabel}
                      </th>
                    ))}
                    <th className="py-3 px-3 text-center whitespace-nowrap">
                      Alcance Oficinas
                    </th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {roleDefinitions.map((role) => {
                    const usersInRole = users.filter(
                      (u) => u.role.toLowerCase() === role.name.toLowerCase()
                    ).length;

                    return (
                      <tr key={role.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <strong className="text-slate-900">{role.name}</strong>
                            <span className="text-[11px] font-mono text-slate-400">
                              ({usersInRole} usr)
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                            {role.description}
                          </div>
                        </td>

                        {PERMISSION_KEYS.map((col) => {
                          const checked = Boolean(role.permissions[col.key]);
                          return (
                            <td key={col.key} className="py-3 px-2.5 text-center">
                              <input
                                type="checkbox"
                                disabled={!canManage}
                                checked={checked}
                                onChange={(e) =>
                                  handleToggleRolePermission(
                                    role.id,
                                    col.key,
                                    e.target.checked
                                  )
                                }
                                className="w-4 h-4 accent-[#0B3B70] rounded cursor-pointer disabled:opacity-50"
                                title={`${role.name} — ${col.description}`}
                              />
                            </td>
                          );
                        })}

                        <td className="py-3 px-3 text-center">
                          <select
                            disabled={!canManage}
                            value={role.permissions.officeScope}
                            onChange={(e) =>
                              handleToggleRolePermission(
                                role.id,
                                'officeScope',
                                e.target.value as 'propia' | 'todas'
                              )
                            }
                            className="px-2 py-1 text-xs border border-slate-300 rounded bg-white font-medium text-slate-800 disabled:bg-slate-100"
                          >
                            <option value="propia">Solo su oficina</option>
                            <option value="todas">Todas las oficinas</option>
                          </select>
                        </td>

                        <td className="py-3 px-3 text-right">
                          {role.isSystemDefault ? (
                            <span className="text-[11px] text-slate-400 font-mono">
                              Rol Base
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={!canManage}
                              onClick={() => handleDeleteCustomRole(role)}
                              className="text-xs text-red-600 hover:underline inline-flex items-center gap-1 disabled:opacity-40"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Borrar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Create New Custom Role Card */}
          {canManage && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    + Crear Nuevo Rol Personalizado
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configura un nuevo perfil de acceso (ej. Director Regional, Coordinador de Campus, Auditor Externo) y define sus permisos exactos.
                  </p>
                </div>

                {/* Quick Templates */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-slate-500 mr-1">Plantilla rápida:</span>
                  <button
                    type="button"
                    onClick={() => applyQuickRolePreset('autorizador')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium"
                  >
                    Autorizador
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuickRolePreset('editor')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium"
                  >
                    Editor Comercial
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuickRolePreset('solo_lectura')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium"
                  >
                    Solo Ver / Lectura
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuickRolePreset('admin_total')}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium"
                  >
                    Control Total
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    Nombre del Rol *
                  </label>
                  <input
                    type="text"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="Ej. Director Regional Norte"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:border-[#0B3B70] focus:outline-none"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-slate-600 mb-1 font-medium">
                    Descripción / Responsabilidad
                  </label>
                  <input
                    type="text"
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                    placeholder="Ej. Autoriza cotizaciones de Monterrey y Guadalajara..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:border-[#0B3B70] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    Tipo de Usuario y Alcance
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={newRoleUserType}
                      onChange={(e) =>
                        setNewRoleUserType(e.target.value as UserType)
                      }
                      className="flex-1 px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="interno">Interno</option>
                      <option value="externo">Externo</option>
                    </select>
                    <select
                      value={newRolePerms.officeScope}
                      onChange={(e) =>
                        setNewRolePerms((prev) => ({
                          ...prev,
                          officeScope: e.target.value as 'propia' | 'todas',
                        }))
                      }
                      className="flex-1 px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="propia">Su Oficina</option>
                      <option value="todas">Todas</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Checkboxes for the new role */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 pt-1 text-xs">
                {PERMISSION_KEYS.map((col) => (
                  <label
                    key={col.key}
                    className={`p-2.5 rounded-lg border flex items-center gap-2 cursor-pointer transition-colors ${
                      newRolePerms[col.key]
                        ? 'bg-blue-50/70 border-blue-300 text-[#0B3B70] font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(newRolePerms[col.key])}
                      onChange={(e) =>
                        setNewRolePerms((prev) => ({
                          ...prev,
                          [col.key]: e.target.checked,
                        }))
                      }
                      className="accent-[#0B3B70]"
                    />
                    <span className="truncate">{col.shortLabel}</span>
                  </label>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleCreateCustomRole}
                  className="px-4 py-2 bg-[#0B3B70] text-white text-xs font-semibold rounded-lg hover:bg-[#082d56] flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Guardar Nuevo Rol en el Sistema
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 4: POLÍTICAS Y REGLAS DE QUIÉN AUTORIZA POR MARGEN Y MONTO
         ===================================================================== */}
      {activeSubTab === 'politicas' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-2xs">
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900">
                Políticas de Comité y Niveles de Autorización Financiera
              </h2>
              <p className="text-xs text-slate-500">
                Define qué roles deben autorizar una cotización según el porcentaje de comisión/margen y el volumen financiero del grupo.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {settings.approvalPolicies.map((pol) => (
                <div
                  key={pol.id}
                  className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <strong className="text-sm text-slate-900">{pol.name}</strong>
                      <div className="text-slate-500 font-mono text-[11px] mt-0.5">
                        ID: {pol.id} · Niveles requeridos: {pol.requiredLevels}
                      </div>
                    </div>
                    {canManage && settings.approvalPolicies.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings(
                            {
                              ...settings,
                              approvalPolicies: settings.approvalPolicies.filter(
                                (p) => p.id !== pol.id
                              ),
                            },
                            `Eliminación de política de aprobación "${pol.name}"`,
                            `Política removida por ${currentUser.displayName}`
                          )
                        }
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-slate-500 mb-1">
                        Margen Mínimo (%)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        disabled={!canManage}
                        value={pol.minMarginPercent}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          onUpdateSettings(
                            {
                              ...settings,
                              approvalPolicies: settings.approvalPolicies.map(
                                (item) =>
                                  item.id === pol.id
                                    ? { ...item, minMarginPercent: val }
                                    : item
                              ),
                            },
                            `Ajuste de margen mínimo en "${pol.name}"`,
                            `Nuevo margen mínimo: ${val}%`
                          );
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-500 mb-1">
                        Monto Máximo Grupo (MXN)
                      </label>
                      <input
                        type="number"
                        step="100000"
                        disabled={!canManage}
                        value={pol.maxGroupAmountMXN}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          onUpdateSettings(
                            {
                              ...settings,
                              approvalPolicies: settings.approvalPolicies.map(
                                (item) =>
                                  item.id === pol.id
                                    ? { ...item, maxGroupAmountMXN: val }
                                    : item
                              ),
                            },
                            `Ajuste de monto máximo en "${pol.name}"`,
                            `Nuevo tope: ${formatMoney(val, 'MXN')}`
                          );
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="pt-1 flex items-center justify-between">
                    <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700">
                      <input
                        type="checkbox"
                        disabled={!canManage}
                        checked={pol.enforceSegregationOfDuties}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          onUpdateSettings(
                            {
                              ...settings,
                              approvalPolicies: settings.approvalPolicies.map(
                                (item) =>
                                  item.id === pol.id
                                    ? {
                                        ...item,
                                        enforceSegregationOfDuties: checked,
                                      }
                                    : item
                              ),
                            },
                            `Segregación de funciones en "${pol.name}"`,
                            `Prohibir auto-aprobación: ${checked ? 'Sí' : 'No'}`
                          );
                        }}
                        className="accent-[#0B3B70]"
                      />
                      <span>
                        Segregación de funciones (quien cotiza no puede auto-autorizar)
                      </span>
                    </label>
                  </div>

                  <div className="text-[11px] text-slate-600 pt-1 border-t border-slate-200">
                    Roles que autorizan esta política:{' '}
                    <strong className="text-[#0B3B70]">
                      {pol.requiredRoles.join(', ')}
                    </strong>
                  </div>
                </div>
              ))}
            </div>

            {canManage && (
              <div className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs items-end">
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    Nueva Regla de Autorización
                  </label>
                  <input
                    type="text"
                    value={newPolicyName}
                    onChange={(e) => setNewPolicyName(e.target.value)}
                    placeholder="Ej. Comité Especial Margen < 12%"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    Margen Mínimo (%)
                  </label>
                  <input
                    type="number"
                    value={newPolicyMinMargin}
                    onChange={(e) => setNewPolicyMinMargin(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">
                    Niveles de Firma Requeridos
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={3}
                    value={newPolicyLevels}
                    onChange={(e) => setNewPolicyLevels(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                  />
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!newPolicyName.trim()) return;
                      const newPol: ApprovalPolicyRule = {
                        id: `pol_${Date.now()}`,
                        name: newPolicyName.trim(),
                        minMarginPercent: Number(newPolicyMinMargin) || 12,
                        maxGroupAmountMXN: Number(newPolicyMaxAmount) || 10000000,
                        requiredLevels: Math.max(1, Number(newPolicyLevels) || 1),
                        requiredRoles: ['Administrador', 'Aprobador', 'Finanzas'],
                        enforceSegregationOfDuties: true,
                      };
                      onUpdateSettings(
                        {
                          ...settings,
                          approvalPolicies: [...settings.approvalPolicies, newPol],
                        },
                        `Creación de política de autorización "${newPol.name}"`,
                        `Margen mínimo ${newPol.minMarginPercent}%, ${newPol.requiredLevels} nivel(es).`
                      );
                      setNewPolicyName('');
                    }}
                    className="w-full px-4 py-2 bg-[#0B3B70] text-white font-semibold rounded-lg hover:bg-[#082d56] flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Añadir Regla
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 5: TARIFARIO MAESTRO DE PROVEEDORES, ESCUELAS Y DMC (MEJORA #4)
         ===================================================================== */}
      {activeSubTab === 'proveedores' && (
        <div className="space-y-6">
          {/* Add New Supplier Rate Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-2xs">
            <div className="border-b border-slate-200 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  + Registrar Nueva Tarifa de Proveedor, Escuela Receptora u Operador DMC
                </h2>
                <p className="text-xs text-slate-500">
                  Configura precios netos por temporada, divisa, costo de chaperón y ratio de gratuidad (Free Place). Estas tarifas pueden inyectarse en un clic dentro de la Hoja Oficial EE.
                </p>
              </div>
              <span className="text-xs font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
                {supplierRates.length} tarifas activas en catálogo
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Proveedor / Escuela / DMC *
                </label>
                <input
                  type="text"
                  value={newSupProvider}
                  onChange={(e) => setNewSupProvider(e.target.value)}
                  placeholder="Ej. Sol Camps UK / EF Oxford"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Categoría *
                </label>
                <select
                  value={newSupCategory}
                  onChange={(e) =>
                    setNewSupCategory(
                      e.target.value as SupplierRateItem['category']
                    )
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Escuela / Campus">Escuela / Campus</option>
                  <option value="Operador DMC">Operador DMC</option>
                  <option value="Aerolínea">Aerolínea</option>
                  <option value="Seguro">Seguro</option>
                  <option value="Transporte">Transporte</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Destino (Ciudad, País) *
                </label>
                <input
                  type="text"
                  value={newSupDestination}
                  onChange={(e) => setNewSupDestination(e.target.value)}
                  placeholder="Ej. Londres y Oxford, Reino Unido"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Temporada y Divisa
                </label>
                <div className="flex gap-1.5">
                  <select
                    value={newSupSeason}
                    onChange={(e) =>
                      setNewSupSeason(e.target.value as SupplierRateItem['season'])
                    }
                    className="w-2/3 px-2 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Temporada Alta">Temporada Alta</option>
                    <option value="Temporada Baja">Temporada Baja</option>
                    <option value="Todo el Año">Todo el Año</option>
                  </select>
                  <select
                    value={newSupCurrency}
                    onChange={(e) =>
                      setNewSupCurrency(e.target.value as CurrencyCode)
                    }
                    className="w-1/3 px-2 py-2 border border-slate-300 rounded-lg bg-white font-mono font-bold"
                  >
                    <option value="GBP">GBP</option>
                    <option value="USD">USD</option>
                    <option value="CAD">CAD</option>
                    <option value="EUR">EUR</option>
                    <option value="MXN">MXN</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Ratio Free Place (1 : N)
                </label>
                <select
                  value={newSupFreePlaceRatio}
                  onChange={(e) => setNewSupFreePlaceRatio(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                >
                  <option value={8}>1 : 8 alumnos</option>
                  <option value={10}>1 : 10 alumnos</option>
                  <option value={12}>1 : 12 alumnos</option>
                  <option value={15}>1 : 15 alumnos</option>
                  <option value={20}>1 : 20 alumnos</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs items-end">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Costo Neto / Alumno ({newSupCurrency})
                </label>
                <input
                  type="number"
                  step="10"
                  value={newSupNetStudent}
                  onChange={(e) => setNewSupNetStudent(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono font-bold text-[#0B3B70]"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-medium">
                  Costo Neto Chaperón ({newSupCurrency})
                </label>
                <input
                  type="number"
                  step="10"
                  value={newSupNetChaperone}
                  onChange={(e) => setNewSupNetChaperone(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-slate-600 mb-1 font-medium">
                  Notas / Servicios Incluidos en Tarifa
                </label>
                <input
                  type="text"
                  value={newSupNotes}
                  onChange={(e) => setNewSupNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => {
                    if (!newSupProvider.trim()) return;
                    const newRate: SupplierRateItem = {
                      id: `sup_${Date.now()}`,
                      providerName: newSupProvider.trim(),
                      category: newSupCategory,
                      destination:
                        newSupDestination.trim() || 'Destino Internacional',
                      season: newSupSeason,
                      currency: newSupCurrency,
                      netCostPerStudent: Number(newSupNetStudent) || 0,
                      chaperoneNetCost: Number(newSupNetChaperone) || 0,
                      freePlaceRatio: Number(newSupFreePlaceRatio) || 10,
                      notes: newSupNotes.trim(),
                      validUntil: newSupValidUntil,
                    };
                    onUpdateSettings(
                      {
                        ...settings,
                        supplierRates: [newRate, ...supplierRates],
                      },
                      `Alta de tarifa maestra DMC "${newRate.providerName} — ${newRate.destination}"`,
                      `Neto alumno: ${newRate.netCostPerStudent} ${newRate.currency} (${newRate.season}) · Free Place 1:${newRate.freePlaceRatio}`
                    );
                    setNewSupProvider('');
                    setNewSupDestination('');
                  }}
                  className="w-full px-4 py-2 bg-[#0B3B70] text-white font-semibold rounded-lg hover:bg-[#082d56] flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Guardar Tarifa DMC
                </button>
              </div>
            </div>
          </div>

          {/* Filter & Search Bar for Supplier Rates */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              {['all', 'Temporada Alta', 'Temporada Baja', 'Todo el Año'].map(
                (seasonOpt) => (
                  <button
                    key={seasonOpt}
                    type="button"
                    onClick={() => setSupplierSeasonFilter(seasonOpt)}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      supplierSeasonFilter === seasonOpt
                        ? 'bg-[#0B3B70] text-white font-semibold'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {seasonOpt === 'all' ? 'Todas las Temporadas' : seasonOpt}
                  </button>
                )
              )}
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
              <input
                type="text"
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                placeholder="Buscar por escuela, ciudad o categoría..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* Supplier Rates Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#0B3B70] text-white font-semibold">
                    <th className="py-3 px-4">Proveedor / Escuela / DMC</th>
                    <th className="py-3 px-4">Destino</th>
                    <th className="py-3 px-4">Temporada</th>
                    <th className="py-3 px-4 text-right">Costo Neto Alumno</th>
                    <th className="py-3 px-4 text-right">Costo Neto Chaperón</th>
                    <th className="py-3 px-4 text-center">Ratio Free Place</th>
                    <th className="py-3 px-4">Vigencia</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {supplierRates
                    .filter((item) => {
                      if (
                        supplierSeasonFilter !== 'all' &&
                        item.season !== supplierSeasonFilter
                      )
                        return false;
                      if (supplierSearch.trim()) {
                        const q = supplierSearch.toLowerCase();
                        return (
                          item.providerName.toLowerCase().includes(q) ||
                          item.category.toLowerCase().includes(q) ||
                          item.destination.toLowerCase().includes(q) ||
                          item.notes.toLowerCase().includes(q)
                        );
                      }
                      return true;
                    })
                    .map((rate) => (
                      <tr key={rate.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <strong className="text-slate-900 block">
                            {rate.providerName}
                          </strong>
                          <span className="text-[11px] text-slate-600 font-medium">
                            {rate.category}
                          </span>
                          <span className="block text-[10px] text-slate-400 mt-0.5">
                            {rate.notes}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800">
                          {rate.destination}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              rate.season === 'Temporada Alta'
                                ? 'bg-amber-50 text-amber-900 border border-amber-200'
                                : rate.season === 'Temporada Baja'
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-blue-50 text-[#0B3B70] border border-blue-200'
                            }`}
                          >
                            {rate.season}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              step="10"
                              value={rate.netCostPerStudent}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                onUpdateSettings(
                                  {
                                    ...settings,
                                    supplierRates: supplierRates.map((r) =>
                                      r.id === rate.id
                                        ? { ...r, netCostPerStudent: val }
                                        : r
                                    ),
                                  },
                                  `Actualizó costo neto alumno en ${rate.providerName}`,
                                  `Nuevo costo neto: ${val} ${rate.currency}`
                                );
                              }}
                              className="w-24 text-right px-2 py-1 border border-slate-300 rounded bg-white font-bold text-[#0B3B70]"
                            />
                            <span className="font-bold text-slate-600">
                              {rate.currency}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              step="10"
                              value={rate.chaperoneNetCost}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                onUpdateSettings(
                                  {
                                    ...settings,
                                    supplierRates: supplierRates.map((r) =>
                                      r.id === rate.id
                                        ? { ...r, chaperoneNetCost: val }
                                        : r
                                    ),
                                  },
                                  `Actualizó costo chaperón en ${rate.providerName}`,
                                  `Nuevo costo chaperón: ${val} ${rate.currency}`
                                );
                              }}
                              className="w-20 text-right px-2 py-1 border border-slate-300 rounded bg-white text-slate-800"
                            />
                            <span className="text-slate-500">{rate.currency}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          <span className="px-2 py-1 bg-blue-50 text-[#0B3B70] border border-blue-200 rounded font-bold">
                            1 : {rate.freePlaceRatio}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {rate.validUntil}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateSettings(
                                {
                                  ...settings,
                                  supplierRates: supplierRates.filter(
                                    (r) => r.id !== rate.id
                                  ),
                                },
                                `Eliminó tarifa de proveedor "${rate.providerName}"`,
                                `Destino: ${rate.destination}`
                              )
                            }
                            className="px-2.5 py-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Borrar
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  AdminCustomRubroTemplate,
  AuditLogEntry,
  RequestStatus,
  SavedSheetTemplate,
  SystemSettings,
  TravelRequest,
  UserProfile,
} from './types/domain';
import {
  INITIAL_SYSTEM_SETTINGS,
  INITIAL_USERS,
} from './data/seedData';
import {
  canUserDeleteRecords,
  canUserEditQuotes,
  canUserSeeInternalCosts,
  canUserViewRequest,
  isUserAuthorizedToAccess,
} from './security/rbac';
import {
  DashboardModule,
  RequestsAdministratorModule,
} from './components/DashboardAndRequestsModule';
import {
  DossierTab,
  RequestDetailDossier,
} from './components/RequestDetailDossier';
import {
  AdministrationModule,
  GlobalApprovalsView,
  GlobalDispatchesView,
  IntegrationsModule,
  ReportsModule,
} from './components/ReportsAndAdminModules';
import { RolesAndUsersConfigModule } from './components/RolesAndUsersConfigModule';
import { NewRequestWizardModal } from './components/NewRequestWizardModal';
import { AISpreadsheetQuoteImporterModal } from './components/AISpreadsheetQuoteImporterModal';
import { PersonalWorkflowDashboard } from './components/PersonalWorkflowDashboard';
import { LandingPage } from './components/LandingPage';
import {
  LayoutDashboard,
  FileText,
  Calculator,
  CheckSquare,
  Send,
  BarChart3,
  Plug,
  Settings,
  LogIn,
  LogOut,
  Plus,
  UserCheck,
  ShieldAlert,
  ShieldCheck,
  Home,
  CheckCircle2,
  Bell,
  Menu,
  X,
  Clock,
  Calendar,
  Sparkles,
  FileSpreadsheet,
} from 'lucide-react';

const APP_DATA_EPOCH = '2026-10-26';

type NavSection =
  | 'mi_dashboard'
  | 'dashboard'
  | 'solicitudes'
  | 'cotizaciones'
  | 'aprobaciones'
  | 'propuestas_enviadas'
  | 'reportes'
  | 'integraciones'
  | 'configuracion'
  | 'administracion';

export default function App() {
  const [showLandingPage, setShowLandingPage] = useState<boolean>(true);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [settings, setSettings] = useState<SystemSettings>({
    ...INITIAL_SYSTEM_SETTINGS,
    globalAuditLog: [],
  });
  const [users, setUsers] = useState<UserProfile[]>(INITIAL_USERS);
  const [requests, setRequests] = useState<TravelRequest[]>([]);

  // Active RBAC user profile (allows switching between EE roles/offices for QA verification)
  const [activePersonaUid, setActivePersonaUid] = useState<string>('usr_admin_ee');

  const [activeNav, setActiveNav] = useState<NavSection>('mi_dashboard');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [dossierInitialTab, setDossierInitialTab] = useState<DossierTab>('escenarios');

  // New / Duplicate Request Modal state
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isAIImporterOpen, setIsAIImporterOpen] = useState(false);
  const [duplicateSourceRequest, setDuplicateSourceRequest] =
    useState<TravelRequest | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3800);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // 1. Track Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthReady(true);

      if (user) {
        const accessCheck = isUserAuthorizedToAccess(
          user.email,
          users.find((u) => u.email.toLowerCase() === (user.email || '').toLowerCase()),
          settings.authorizedDomains
        );
        if (!accessCheck.allowed) {
          setAuthError(accessCheck.reason || 'Acceso restringido.');
          return;
        }
        setAuthError(null);

        // Ensure current authenticated user profile exists in Firestore /users/{uid}
        const userDocPath = `users/${user.uid}`;
        try {
          const existingSnap = await getDoc(doc(db, 'users', user.uid));
          if (!existingSnap.exists()) {
            const isBootstrapAdmin = user.email === 'wrhg1970@gmail.com';
            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              email: user.email || 'usuario@estudiantesembajadores.com',
              displayName: user.displayName || 'Ejecutivo EE',
              role: isBootstrapAdmin ? 'Administrador' : 'Ejecutivo Comercial',
              userType: 'interno',
              officeId: 'of_cdmx',
              status: 'activo',
              lastActiveAt: new Date().toISOString(),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, userDocPath);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Attach Firestore listeners when authenticated
  useEffect(() => {
    if (!authReady || !firebaseUser) return;

    const reqQuery = query(
      collection(db, 'travel_requests'),
      where('authorizedUids', 'array-contains', firebaseUser.uid)
    );

    const unsubRequests = onSnapshot(
      reqQuery,
      async (snapshot) => {
        if (snapshot.empty) {
          setRequests([]);
        } else {
          const loaded: TravelRequest[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const payload = data.payload as TravelRequest | undefined;
            if (payload?.dataEpoch === APP_DATA_EPOCH) {
              loaded.push(payload);
            }
          });
          if (loaded.length > 0) {
            loaded.sort((a, b) => a.folio.localeCompare(b.folio));
            setRequests(loaded);
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'travel_requests');
      }
    );

    return () => {
      unsubRequests();
    };
  }, [authReady, firebaseUser]);

  const currentUser: UserProfile = useMemo(() => {
    const found = users.find((u) => u.uid === activePersonaUid);
    if (found) return found;
    return INITIAL_USERS[0];
  }, [users, activePersonaUid]);

  // Filter requests strictly by RBAC & Office isolation for the active user role
  const accessibleRequests = useMemo(() => {
    return requests.filter((req) =>
      canUserViewRequest(currentUser, req, settings.roleDefinitions)
    );
  }, [requests, currentUser, settings.roleDefinitions]);

  const selectedRequest = useMemo(() => {
    if (!selectedRequestId) return null;
    const found = accessibleRequests.find((r) => r.id === selectedRequestId);
    return found || null;
  }, [accessibleRequests, selectedRequestId]);

  // Compute Smart Alerts & Automatic Reminders (Mejora #8)
  const smartNotifications = useMemo(() => {
    const items: {
      id: string;
      category: 'sla' | 'aprobacion' | 'cobranza';
      severity: 'critical' | 'warning' | 'info';
      title: string;
      subtitle: string;
      requestId: string;
      folio: string;
      targetTab: DossierTab;
    }[] = [];

    const refNow = new Date('2026-10-23T12:00:00Z').getTime();

    accessibleRequests.forEach((req) => {
      const isClosed = ['Aceptada', 'Rechazada', 'Cancelada'].includes(req.status);
      if (!isClosed && req.proposalDueDate) {
        const dueMs = new Date(`${req.proposalDueDate}T12:00:00Z`).getTime();
        const daysLeft = Math.round((dueMs - refNow) / (1000 * 60 * 60 * 24));
        if (daysLeft < 0 || req.status === 'Vencida') {
          items.push({
            id: `notif_sla_exp_${req.id}`,
            category: 'sla',
            severity: 'critical',
            title: `${req.folio} — Cotización Vencida (${req.proposalDueDate})`,
            subtitle: `${req.groupName} · Requiere renovar vigencia (+15d) y tipo de cambio`,
            requestId: req.id,
            folio: req.folio,
            targetTab: 'escenarios',
          });
        } else if (daysLeft <= 7) {
          items.push({
            id: `notif_sla_urg_${req.id}`,
            category: 'sla',
            severity: 'warning',
            title: `${req.folio} — Vigencia vence en ${daysLeft} día(s)`,
            subtitle: `${req.groupName} (${req.city}) · Fecha límite: ${req.proposalDueDate}`,
            requestId: req.id,
            folio: req.folio,
            targetTab: 'escenarios',
          });
        }
      }

      // Check pending committee approvals
      const pendingScenarios = req.scenarios.filter(
        (s) => s.approvalStatus === 'Pendiente'
      );
      if (pendingScenarios.length > 0) {
        items.push({
          id: `notif_app_${req.id}`,
          category: 'aprobacion',
          severity: 'warning',
          title: `${req.folio} — ${pendingScenarios.length} opción(es) por autorizar en Comité`,
          subtitle: `${req.groupName} · Pendiente dictamen financiero`,
          requestId: req.id,
          folio: req.folio,
          targetTab: 'aprobaciones',
        });
      }

      // Check upcoming payment plan registration / first installment dates
      const firstSc = req.scenarios[0];
      const plan = firstSc?.eeSheet?.paymentPlan;
      if (plan && !isClosed) {
        const nextDue = plan.includeRegistrationFee
          ? plan.registrationDueDate
          : plan.firstInstallmentDate;
        if (nextDue) {
          items.push({
            id: `notif_pay_${req.id}`,
            category: 'cobranza',
            severity: 'info',
            title: `${req.folio} — Próximo corte de ${
              plan.includeRegistrationFee ? 'Inscripción' : '1er Pago'
            }: ${nextDue}`,
            subtitle: `${req.groupName} · Esquema de ${
              plan.includeRegistrationFee
                ? `Inscripción + ${plan.installmentsCount} pagos`
                : `${plan.installmentsCount} pagos`
            }`,
            requestId: req.id,
            folio: req.folio,
            targetTab: 'documentos',
          });
        }
      }
    });

    return items;
  }, [accessibleRequests]);

  const persistRequestToFirestore = async (
    updatedReq: TravelRequest,
    isNew: boolean = false
  ) => {
    if (!firebaseUser) return;
    const docPath = `travel_requests/${updatedReq.id}`;
    const stampedReq: TravelRequest = { ...updatedReq, dataEpoch: APP_DATA_EPOCH };
    const ownerUid = firebaseUser.uid;
    const authorizedUids = Array.from(
      new Set([ownerUid, ...updatedReq.authorizedUids])
    ).slice(0, 50);

    try {
      if (isNew) {
        await setDoc(doc(db, 'travel_requests', updatedReq.id), {
          id: updatedReq.id,
          folio: updatedReq.folio,
          groupName: stampedReq.groupName,
          officeId: stampedReq.officeId,
          status: stampedReq.status,
          ownerUid,
          authorizedUids,
          payload: { ...stampedReq, ownerUid, authorizedUids } as unknown as Record<
            string,
            unknown
          >,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const snap = await getDoc(doc(db, 'travel_requests', updatedReq.id));
        if (snap.exists()) {
          const existingData = snap.data();
          await setDoc(doc(db, 'travel_requests', updatedReq.id), {
            id: existingData.id,
            folio: existingData.folio,
            groupName: stampedReq.groupName,
            officeId: stampedReq.officeId,
            status: stampedReq.status,
            ownerUid: existingData.ownerUid,
            authorizedUids,
            payload: {
              ...stampedReq,
              ownerUid: existingData.ownerUid,
              authorizedUids,
            } as unknown as Record<string, unknown>,
            createdAt: existingData.createdAt,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
  };

  const recordAudit = (action: string, moduleName: string, entityId: string, details: string) => {
    const newEntry: AuditLogEntry = Object.freeze({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      actorUid: currentUser.uid,
      actorName: currentUser.displayName,
      actorRole: currentUser.role,
      action,
      module: moduleName,
      entityId,
      details,
    });
    setSettings((prev) => ({
      ...prev,
      globalAuditLog: [newEntry, ...prev.globalAuditLog].slice(0, 100),
    }));
    return newEntry;
  };

  const handleSaveNewRequest = async (newReq: TravelRequest) => {
    const creationAudit = recordAudit(
      `Creación de solicitud ${newReq.folio}`,
      'Solicitudes',
      newReq.folio,
      `Grupo: ${newReq.groupName} (${newReq.participants} participantes)`
    );
    const enrichedNewReq: TravelRequest = {
      ...newReq,
      auditTrail: [creationAudit, ...(newReq.auditTrail || [])],
    };
    setRequests((prev) => [enrichedNewReq, ...prev]);
    setSelectedRequestId(enrichedNewReq.id);
    setDossierInitialTab('escenarios');
    showToast(`Expediente ${enrichedNewReq.folio} creado y abierto en el Cotizador.`);
    await persistRequestToFirestore(enrichedNewReq, true);
  };

  const handleUpdateRequest = async (
    updated: TravelRequest,
    auditAction: string,
    auditDetails: string
  ) => {
    const auditEntry = recordAudit(auditAction, 'Cotización', updated.folio, auditDetails);
    const withAudit: TravelRequest = {
      ...updated,
      auditTrail: [auditEntry, ...updated.auditTrail],
    };
    setRequests((prev) => prev.map((r) => (r.id === withAudit.id ? withAudit : r)));
    showToast(`${updated.folio}: ${auditAction}`);
    await persistRequestToFirestore(withAudit, false);
  };

  const handleChangeStatusFromTable = async (
    requestId: string,
    newStatus: RequestStatus,
    note: string
  ) => {
    const target = requests.find((r) => r.id === requestId);
    if (!target) return;
    const now = new Date().toISOString();
    const updated: TravelRequest = {
      ...target,
      status: newStatus,
      updatedAt: now,
      statusHistory: [
        {
          id: `sh_${Date.now()}`,
          previousStatus: target.status,
          newStatus,
          changedByUid: currentUser.uid,
          changedByName: currentUser.displayName,
          changedAt: now,
          note,
        },
        ...target.statusHistory,
      ],
    };
    await handleUpdateRequest(
      updated,
      `Cambio de estado a ${newStatus}`,
      `${target.folio}: ${target.status} → ${newStatus}`
    );
  };

  const handleGoogleSignIn = async () => {
    try {
      setAuthError(null);
      await signInWithPopup(auth, googleProvider);
      setShowLandingPage(false);
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'No se pudo completar el inicio de sesión con Google.'
      );
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleAddAdminRubro = (rubro: AdminCustomRubroTemplate) => {
    setSettings((prev) => ({
      ...prev,
      adminCustomRubros: [...(prev.adminCustomRubros || []), rubro],
    }));
    recordAudit(
      `Integración de nuevo rubro oficial EE: ${rubro.label}`,
      'Administración / Hoja EE',
      rubro.id,
      `Rubro "${rubro.label}" integrado al bloque ${rubro.section} ($${rubro.defaultAmount})`
    );
    showToast(`Rubro "${rubro.label}" guardado en el catálogo global.`);
  };

  const handleSaveSheetTemplate = (template: SavedSheetTemplate) => {
    setSettings((prev) => ({
      ...prev,
      savedSheetTemplates: [template, ...(prev.savedSheetTemplates || [])],
    }));
    recordAudit(
      `Creación de plantilla de destino: ${template.name}`,
      'Plantillas Hoja EE',
      template.id,
      `Plantilla "${template.name}" (${template.destination} · ${template.sheet.currencyCode}) guardada por ${currentUser.displayName}`
    );
    showToast(`Plantilla "${template.name}" guardada en el catálogo rápido.`);
  };

  const handleDeleteRequest = (req: TravelRequest) => {
    if (!canUserDeleteRecords(currentUser, settings.roleDefinitions)) {
      showToast(`El rol ${currentUser.role} no tiene permiso para borrar expedientes.`);
      return;
    }
    setRequests((prev) => prev.filter((r) => r.id !== req.id));
    recordAudit(
      `Eliminación de expediente ${req.folio}`,
      'Solicitudes',
      req.folio,
      `Expediente "${req.groupName}" eliminado por ${currentUser.displayName} (${currentUser.role})`
    );
    showToast(`Expediente ${req.folio} eliminado correctamente.`);
  };

  const showInternalMenus = canUserSeeInternalCosts(
    currentUser,
    settings.roleDefinitions
  );

  const sidebarItems: {
    id: NavSection;
    label: string;
    icon: React.FC<{ className?: string }>;
    internalOnly?: boolean;
  }[] = [
    { id: 'mi_dashboard', label: 'Mi Dashboard Personal', icon: UserCheck },
    { id: 'dashboard', label: 'Dashboard Ejecutivo', icon: LayoutDashboard },
    { id: 'solicitudes', label: 'Solicitudes', icon: FileText },
    { id: 'cotizaciones', label: 'Cotizaciones', icon: Calculator, internalOnly: true },
    { id: 'aprobaciones', label: 'Aprobaciones', icon: CheckSquare, internalOnly: true },
    { id: 'propuestas_enviadas', label: 'Propuestas enviadas', icon: Send },
    { id: 'reportes', label: 'Reportes', icon: BarChart3, internalOnly: true },
    { id: 'integraciones', label: 'Integraciones', icon: Plug, internalOnly: true },
    {
      id: 'configuracion',
      label: 'Configuración',
      icon: ShieldCheck,
    },
    { id: 'administracion', label: 'Parámetros Financieros', icon: Settings, internalOnly: true },
  ];

  const visibleSidebarItems = sidebarItems.filter(
    (item) => !item.internalOnly || showInternalMenus
  );

  const openSection = (itemId: NavSection) => {
    if (itemId === 'cotizaciones' && accessibleRequests[0]) {
      setSelectedRequestId(accessibleRequests[0].id);
      setDossierInitialTab('escenarios');
      setActiveNav('cotizaciones');
    } else {
      setSelectedRequestId(null);
      setActiveNav(itemId);
    }
    setMobileNavOpen(false);
    setIsNotificationsOpen(false);
  };

  if (showLandingPage) {
    return (
      <LandingPage
        onLoginWithGoogle={handleGoogleSignIn}
        onEnterDemoWorkspace={() => {
          setShowLandingPage(false);
        }}
        isSignedIn={Boolean(firebaseUser)}
        userEmail={firebaseUser?.email}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6FB] text-slate-900">
      {/* Top Bar Contract: Zone 1 (Wordmark) — Zone 2 (5 Concise Nav Links) — Zone 3 (Primary Action) */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-white border-b border-slate-200/90 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#mi_dashboard"
          onClick={(e) => {
            e.preventDefault();
            setSelectedRequestId(null);
            setActiveNav('mi_dashboard');
          }}
          className="text-xl font-bold tracking-tight text-[#0F2547] whitespace-nowrap shrink-0 font-display"
        >
          Xplore Together
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            onClick={() => {
              setSelectedRequestId(null);
              setActiveNav('mi_dashboard');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeNav === 'mi_dashboard' && !selectedRequestId
                ? 'text-[#1D4ED8] font-semibold underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900'
            }`}
          >
            Mi Dashboard
          </button>
          <button
            onClick={() => {
              setSelectedRequestId(null);
              setActiveNav('dashboard');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeNav === 'dashboard' && !selectedRequestId
                ? 'text-[#1D4ED8] font-semibold underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900'
            }`}
          >
            Dashboard Global
          </button>
          <button
            onClick={() => {
              setSelectedRequestId(null);
              setActiveNav('solicitudes');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeNav === 'solicitudes' && !selectedRequestId
                ? 'text-[#1D4ED8] font-semibold underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900'
            }`}
          >
            Solicitudes
          </button>
          <button
            onClick={() => {
              setSelectedRequestId(null);
              setActiveNav('propuestas_enviadas');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeNav === 'propuestas_enviadas' && !selectedRequestId
                ? 'text-[#1D4ED8] font-semibold underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900'
            }`}
          >
            Propuestas Enviadas
          </button>
          <button
            onClick={() => {
              setSelectedRequestId(null);
              setActiveNav('configuracion');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeNav === 'configuracion' && !selectedRequestId
                ? 'text-[#1D4ED8] font-semibold underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900'
            }`}
          >
            Configuración
          </button>
        </nav>

        {/* Zone 3: Alerts & Primary Action */}
        <div className="flex items-center gap-2 shrink-0 relative">
          <button
            type="button"
            onClick={() => setMobileNavOpen((prev) => !prev)}
            className="lg:hidden p-2 text-slate-700 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
            aria-expanded={mobileNavOpen}
            aria-label={mobileNavOpen ? 'Cerrar menú' : 'Abrir menú'}
          >
            {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          {/* Smart Notification Bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsNotificationsOpen((prev) => !prev)}
              className="relative p-2 text-slate-600 hover:text-[#1D4ED8] bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
              title="Centro de Alertas SLA, Comité y Recordatorios de Plan de Pagos"
            >
              <Bell className="w-4 h-4" />
              {smartNotifications.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-red-600 text-white text-[10px] font-mono font-bold rounded-full flex items-center justify-center shadow-2xs">
                  {smartNotifications.length}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 mt-2 w-96 max-w-[92vw] bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden text-xs">
                <div className="px-4 py-3 bg-[#0F2547] text-white flex items-center justify-between">
                  <div>
                    <strong className="block text-xs font-display">
                      Centro de Alertas y Recordatorios Automáticos
                    </strong>
                    <span className="text-[10px] text-sky-200 font-mono">
                      SLA Vigencia · Comité · Calendario de Pagos
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsNotificationsOpen(false)}
                    className="text-[11px] text-sky-200 hover:text-white underline cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>

                <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                  {smartNotifications.length === 0 ? (
                    <div className="p-5 text-center text-slate-500">
                      No hay alertas pendientes en este momento.
                    </div>
                  ) : (
                    smartNotifications.map((notif) => (
                      <button
                        key={notif.id}
                        type="button"
                        onClick={() => {
                          setSelectedRequestId(notif.requestId);
                          const allowedTab = showInternalMenus
                            ? notif.targetTab
                            : 'documentos';
                          setDossierInitialTab(allowedTab);
                          setIsNotificationsOpen(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3 cursor-pointer"
                      >
                        <div
                          className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${
                            notif.severity === 'critical'
                              ? 'bg-red-50 text-red-600 border border-red-200'
                              : notif.severity === 'warning'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-blue-50 text-[#1D4ED8] border border-blue-200'
                          }`}
                        >
                          {notif.category === 'sla' ? (
                            <Clock className="w-3.5 h-3.5" />
                          ) : notif.category === 'aprobacion' ? (
                            <CheckSquare className="w-3.5 h-3.5" />
                          ) : (
                            <Calendar className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900 truncate">
                            {notif.title}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                            {notif.subtitle}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setDuplicateSourceRequest(null);
              setIsNewModalOpen(true);
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#1D4ED8] rounded-xl hover:bg-[#1E40AF] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Nueva Solicitud
          </button>
        </div>
      </header>

      {mobileNavOpen && (
        <nav className="lg:hidden bg-white border-b border-slate-200 px-3 py-3 grid grid-cols-2 gap-1.5">
          {visibleSidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = !selectedRequestId && activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openSection(item.id)}
                className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium rounded-xl cursor-pointer ${
                  isActive
                    ? 'bg-[#0F2547] text-white'
                    : 'text-slate-700 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Workspace Body: Sidebar + Main Canvas */}
      <div className="flex-1 flex items-start">
        {/* Lateral Sidebar (256px) */}
        <aside className="w-64 bg-white border-r border-slate-200/90 hidden lg:flex flex-col justify-between p-4 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 font-mono">
                FLUJO COMERCIAL EE
              </div>
              {visibleSidebarItems.map((item) => {
                const Icon = item.icon;
                const isActive = !selectedRequestId && activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => openSection(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-[#0F2547] text-white font-semibold shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Quick Tools in Sidebar */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="px-3 text-[11px] font-semibold text-slate-400 font-mono">
                ACCESOS RÁPIDOS
              </div>
              <button
                type="button"
                onClick={() => setIsAIImporterOpen(true)}
                className="w-full px-3 py-2 text-xs font-semibold text-emerald-950 bg-emerald-50/90 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span className="truncate">Importar Excel / Sheets IA</span>
              </button>
              <button
                type="button"
                onClick={() => setShowLandingPage(true)}
                className="w-full px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-200/80 rounded-xl hover:bg-slate-100 transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Home className="w-3.5 h-3.5 shrink-0" />
                <span>Volver a Portada (Inicio)</span>
              </button>
            </div>
          </div>

          {/* Auth & Session Panel */}
          <div className="pt-4 border-t border-slate-200/90 space-y-3 text-xs">
            <div>
              <span className="text-slate-400 block mb-1 text-[11px]">Sesión Google OAuth</span>
              {firebaseUser ? (
                <div className="space-y-2">
                  <div className="font-medium text-slate-900 truncate">
                    {firebaseUser.displayName || firebaseUser.email}
                  </div>
                  <div className="font-mono text-[11px] text-emerald-700 truncate">
                    Firestore Sincronizado
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="w-full px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Cerrar Sesión
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGoogleSignIn}
                  className="w-full px-3 py-2 text-xs font-semibold text-[#1D4ED8] bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" /> Iniciar con Google
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 p-4 md:p-6 space-y-5 max-w-[1440px] mx-auto w-full">
          {/* Sub-Toolbar: Active Role / Office Context & Quick Verification Switcher */}
          <div className="bg-white border border-slate-200/90 rounded-2xl px-4 py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-600 min-w-0">
              <UserCheck className="w-4 h-4 text-[#1D4ED8] shrink-0" />
              <strong className="text-slate-900 truncate">{currentUser.displayName}</strong>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span>{currentUser.role}</span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="font-mono text-slate-900">
                {settings.offices.find((o) => o.id === currentUser.officeId)?.code ||
                  currentUser.officeId}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="role-switcher" className="text-slate-500 whitespace-nowrap">
                Simular usuario / rol:
              </label>
              <select
                id="role-switcher"
                value={activePersonaUid}
                onChange={(e) => {
                  const nextUid = e.target.value;
                  setActivePersonaUid(nextUid);
                  const nextUser = users.find((u) => u.uid === nextUid);
                  if (
                    nextUser &&
                    !canUserSeeInternalCosts(nextUser, settings.roleDefinitions)
                  ) {
                    if (selectedRequestId) {
                      setDossierInitialTab('documentos');
                    } else {
                      setActiveNav('mi_dashboard');
                    }
                  }
                }}
                className="px-2.5 py-1.5 border border-slate-200 rounded-xl bg-slate-50 font-medium text-slate-900"
              >
                {users
                  .filter((u) => u.status === 'activo')
                  .map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.displayName} — [{u.role}]
                    </option>
                  ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  setSelectedRequestId(null);
                  setActiveNav('configuracion');
                }}
                className="px-3 py-1.5 text-xs font-semibold text-[#1D4ED8] bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Roles y Usuarios
              </button>
            </div>
          </div>

          {authError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {/* Render Active View or Selected Dossier */}
          {selectedRequest ? (
            <RequestDetailDossier
              key={`${selectedRequest.id}_${dossierInitialTab}`}
              request={selectedRequest}
              settings={settings}
              currentUser={currentUser}
              initialTab={dossierInitialTab}
              onBack={() => setSelectedRequestId(null)}
              onUpdateRequest={handleUpdateRequest}
              onAddAdminRubro={handleAddAdminRubro}
              onSaveSheetTemplate={handleSaveSheetTemplate}
              onOpenAISpreadsheetImporter={() => setIsAIImporterOpen(true)}
            />
          ) : (
            <>
              {activeNav === 'mi_dashboard' && (
                <PersonalWorkflowDashboard
                  currentUser={currentUser}
                  requests={requests}
                  offices={settings.offices}
                  roleDefinitions={settings.roleDefinitions}
                  onSelectRequest={(req, targetTab) => {
                    setSelectedRequestId(req.id);
                    const allowedTab = canUserSeeInternalCosts(
                      currentUser,
                      settings.roleDefinitions
                    )
                      ? targetTab || 'escenarios'
                      : 'documentos';
                    setDossierInitialTab(allowedTab);
                  }}
                  onChangeStatus={handleChangeStatusFromTable}
                  onOpenNewModal={() => {
                    setDuplicateSourceRequest(null);
                    setIsNewModalOpen(true);
                  }}
                  onOpenAIImporter={() => setIsAIImporterOpen(true)}
                />
              )}

              {activeNav === 'dashboard' && (
                <DashboardModule
                  requests={accessibleRequests}
                  offices={settings.offices}
                  users={users}
                  onSelectRequest={(req, targetTab) => {
                    setSelectedRequestId(req.id);
                    const allowedTab = canUserSeeInternalCosts(currentUser)
                      ? targetTab || 'escenarios'
                      : 'documentos';
                    setDossierInitialTab(allowedTab);
                  }}
                  onOpenNewModal={(dup) => {
                    setDuplicateSourceRequest(dup || null);
                    setIsNewModalOpen(true);
                  }}
                />
              )}

              {(activeNav === 'solicitudes' || activeNav === 'cotizaciones') && (
                <RequestsAdministratorModule
                  requests={accessibleRequests}
                  offices={settings.offices}
                  canEdit={canUserEditQuotes(currentUser, settings.roleDefinitions)}
                  canDelete={canUserDeleteRecords(currentUser, settings.roleDefinitions)}
                  onSelectRequest={(req, targetTab) => {
                    setSelectedRequestId(req.id);
                    const allowedTab = canUserSeeInternalCosts(
                      currentUser,
                      settings.roleDefinitions
                    )
                      ? targetTab || 'escenarios'
                      : 'documentos';
                    setDossierInitialTab(allowedTab);
                  }}
                  onOpenNewModal={(dup) => {
                    setDuplicateSourceRequest(dup || null);
                    setIsNewModalOpen(true);
                  }}
                  onChangeStatus={handleChangeStatusFromTable}
                  onDeleteRequest={handleDeleteRequest}
                />
              )}

              {activeNav === 'configuracion' && (
                <RolesAndUsersConfigModule
                  settings={settings}
                  users={users}
                  currentUser={currentUser}
                  onUpdateSettings={(next, action, details) => {
                    setSettings(next);
                    recordAudit(action, 'Configuración RBAC', 'roles_permissions', details);
                    showToast(action);
                  }}
                  onUpdateUsers={(nextUsers, action, details) => {
                    setUsers(nextUsers);
                    if (
                      nextUsers.length > 0 &&
                      !nextUsers.some((u) => u.uid === activePersonaUid)
                    ) {
                      setActivePersonaUid(nextUsers[0].uid);
                    }
                    recordAudit(action, 'Usuarios RBAC', 'users_directory', details);
                    showToast(action);
                  }}
                />
              )}

              {activeNav === 'aprobaciones' && showInternalMenus && (
                <GlobalApprovalsView
                  requests={accessibleRequests}
                  onOpenDossierTab={(req, tab) => {
                    setSelectedRequestId(req.id);
                    setDossierInitialTab(tab);
                  }}
                />
              )}

              {activeNav === 'propuestas_enviadas' && (
                <GlobalDispatchesView
                  requests={accessibleRequests}
                  onOpenDossierTab={(req, tab) => {
                    setSelectedRequestId(req.id);
                    setDossierInitialTab(tab);
                  }}
                />
              )}

              {activeNav === 'reportes' && showInternalMenus && (
                <ReportsModule requests={accessibleRequests} settings={settings} />
              )}

              {activeNav === 'integraciones' && showInternalMenus && (
                <IntegrationsModule
                  settings={settings}
                  requests={accessibleRequests}
                  onUpdateSettings={(next, action, details) => {
                    setSettings(next);
                    recordAudit(action, 'Integraciones', 'adapters', details);
                  }}
                />
              )}

              {activeNav === 'administracion' && showInternalMenus && (
                <AdministrationModule
                  settings={settings}
                  users={users}
                  currentUser={currentUser}
                  onUpdateSettings={(next, action, details) => {
                    setSettings(next);
                    recordAudit(action, 'Administración', 'system_settings', details);
                  }}
                  onUpdateUsers={(nextUsers, action, details) => {
                    setUsers(nextUsers);
                    recordAudit(action, 'Usuarios', 'users_rbac', details);
                  }}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* 3-Step New / Duplicate Request Modal */}
      <NewRequestWizardModal
        isOpen={isNewModalOpen}
        onClose={() => {
          setIsNewModalOpen(false);
          setDuplicateSourceRequest(null);
        }}
        onSaveRequest={(req) => handleSaveNewRequest(req)}
        offices={settings.offices}
        currentUser={currentUser}
        existingCount={requests.length}
        initialRequestToDuplicate={duplicateSourceRequest}
      />

      {/* AI Excel & Google Spreadsheets Quote Importer Modal */}
      <AISpreadsheetQuoteImporterModal
        isOpen={isAIImporterOpen}
        onClose={() => setIsAIImporterOpen(false)}
        offices={settings.offices}
        currentUser={currentUser}
        existingRequestCount={requests.length}
        targetRequest={selectedRequest}
        onCreateNewRequestFromAI={(newReq, sourceSummary) => {
          const aiAudit = recordAudit(
            `[Precio / Costos] Importación de cotización vía IA (${newReq.folio})`,
            'Importador IA (Excel / Sheets)',
            newReq.folio,
            `Cotización y sábana EE estructuradas automáticamente con Gemini AI desde: ${sourceSummary}.`
          );
          const enriched: TravelRequest = {
            ...newReq,
            auditTrail: [aiAudit, ...(newReq.auditTrail || [])],
          };
          setRequests((prev) => [enriched, ...prev]);
          setSelectedRequestId(enriched.id);
          setDossierInitialTab('escenarios');
          showToast(
            `Cotización ${enriched.folio} importada vía IA (${enriched.scenarios.length} opción/es) y abierta en la Sábana EE.`
          );
          void persistRequestToFirestore(enriched, true);
        }}
        onAppendScenariosToRequest={(targetReq, newScenarios, sourceSummary) => {
          const updated: TravelRequest = {
            ...targetReq,
            updatedAt: new Date().toISOString(),
            scenarios: [...targetReq.scenarios, ...newScenarios],
          };
          void handleUpdateRequest(
            updated,
            `[Precio / Costos] Importación IA de ${newScenarios.length} opción(es) desde Excel/Sheets`,
            `Se anexaron ${newScenarios.length} escenario(s) estructurados por IA desde ${sourceSummary}.`
          );
          setSelectedRequestId(targetReq.id);
          setDossierInitialTab('escenarios');
        }}
      />

      {/* Non-Intrusive Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg border border-slate-700 flex items-center gap-2.5 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="truncate">{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-white text-[11px] underline shrink-0"
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}

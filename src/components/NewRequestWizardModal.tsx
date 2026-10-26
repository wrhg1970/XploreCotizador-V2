import React, { useState, useEffect } from 'react';
import {
  CurrencyCode,
  Office,
  ProgramType,
  TravelRequest,
  TravelSpecification,
  UserProfile,
} from '../types/domain';
import { validateTravelRequestDatesAndFields } from '../security/rbac';
import { X, Plus, Trash2, Check, FileText, Copy } from 'lucide-react';

interface NewRequestWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveRequest: (request: TravelRequest, isDraft: boolean) => void;
  offices: Office[];
  currentUser: UserProfile;
  existingCount: number;
  initialRequestToDuplicate?: TravelRequest | null;
}

const PROGRAM_TYPES: ProgramType[] = [
  'Inmersión Académica',
  'Campamento de Verano',
  'Curso de Idiomas',
  'Tour Cultural y Universitario',
  'STEM & Robótica',
  'Liderazgo Internacional',
];

const DRAFT_STORAGE_KEY = 'ee_cotizador_new_request_draft_v1';

export const NewRequestWizardModal: React.FC<NewRequestWizardModalProps> = ({
  isOpen,
  onClose,
  onSaveRequest,
  offices,
  currentUser,
  existingCount,
  initialRequestToDuplicate,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [errors, setErrors] = useState<string[]>([]);

  const generatedFolio = `EE-2026-${String(101 + existingCount).padStart(3, '0')}`;

  const [groupName, setGroupName] = useState('');
  const [officeId, setOfficeId] = useState(currentUser.officeId || offices[0]?.id || 'of_cdmx');
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [proposalDueDate, setProposalDueDate] = useState('2026-11-15');
  const [departureDate, setDepartureDate] = useState('2027-06-10');
  const [returnDate, setReturnDate] = useState('2027-06-24');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [participants, setParticipants] = useState(25);
  const [chaperones, setChaperones] = useState(2);
  const [additionalStaff, setAdditionalStaff] = useState(1);
  const [estimatedBudgetPerPerson, setEstimatedBudgetPerPerson] = useState(85000);
  const [budgetCurrency, setBudgetCurrency] = useState<CurrencyCode>('MXN');
  const [programType, setProgramType] = useState<ProgramType>('Inmersión Académica');
  const [additionalComments, setAdditionalComments] = useState('');
  const [specialRequirements, setSpecialRequirements] = useState('');
  const [attachmentName, setAttachmentName] = useState('');

  const [specs, setSpecs] = useState<TravelSpecification>({
    accommodationType: 'Residencia estudiantil en campus (habitación doble)',
    schoolOrProvider: '',
    coursesOrActivities: '20 lecciones semanales + talleres académicos',
    transfers: 'Traslados privados aeropuerto-campus-aeropuerto y transporte local',
    meals: 'Pensión completa (3 alimentos diarios)',
    insurance: 'Seguro médico internacional cobertura amplia sin deducible',
    flightsIncluded: true,
    flightDetails: 'Vuelo redondo desde México con equipaje documentado',
    excursions: 'Visitas académicas, museos y recorrido cultural de fin de semana',
    accessibilityRequirements: 'Ninguno reportado',
    operationalNotes: '',
    includedServices: [
      'Programa académico y material didáctico',
      'Alojamiento y 3 alimentos diarios',
      'Seguro médico internacional y Kit EE',
      'Traslados locales programados',
    ],
    excludedServices: [
      'Trámite de pasaporte y visa',
      'Gastos personales',
    ],
    customFields: {
      'Rango de edad': '14 a 18 años',
    },
  });

  const [newIncludedService, setNewIncludedService] = useState('');
  const [newExcludedService, setNewExcludedService] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [customVal, setCustomVal] = useState('');

  // Load either duplicate source or saved draft
  useEffect(() => {
    if (!isOpen) return;
    if (initialRequestToDuplicate) {
      setGroupName(`${initialRequestToDuplicate.groupName} (Copia)`);
      setOfficeId(initialRequestToDuplicate.officeId);
      setRequesterName(initialRequestToDuplicate.requesterName);
      setRequesterEmail(initialRequestToDuplicate.requesterEmail);
      setProposalDueDate(initialRequestToDuplicate.proposalDueDate);
      setDepartureDate(initialRequestToDuplicate.departureDate);
      setReturnDate(initialRequestToDuplicate.returnDate);
      setCity(initialRequestToDuplicate.city);
      setCountry(initialRequestToDuplicate.country);
      setParticipants(initialRequestToDuplicate.participants);
      setChaperones(initialRequestToDuplicate.chaperones);
      setAdditionalStaff(initialRequestToDuplicate.additionalStaff);
      setEstimatedBudgetPerPerson(initialRequestToDuplicate.estimatedBudgetPerPerson);
      setBudgetCurrency(initialRequestToDuplicate.budgetCurrency);
      setProgramType(initialRequestToDuplicate.programType);
      setAdditionalComments(initialRequestToDuplicate.additionalComments);
      setSpecialRequirements(initialRequestToDuplicate.specialRequirements);
      setSpecs(structuredClone(initialRequestToDuplicate.specifications));
      return;
    }

    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.groupName) setGroupName(parsed.groupName);
        if (parsed.requesterName) setRequesterName(parsed.requesterName);
        if (parsed.requesterEmail) setRequesterEmail(parsed.requesterEmail);
        if (parsed.city) setCity(parsed.city);
        if (parsed.country) setCountry(parsed.country);
      }
    } catch {
      // Ignore storage error
    }
  }, [isOpen, initialRequestToDuplicate]);

  // Auto-save recoverable draft to localStorage
  useEffect(() => {
    if (!isOpen || initialRequestToDuplicate) return;
    try {
      localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          groupName,
          requesterName,
          requesterEmail,
          city,
          country,
        })
      );
    } catch {
      // Ignore
    }
  }, [groupName, requesterName, requesterEmail, city, country, isOpen, initialRequestToDuplicate]);

  if (!isOpen) return null;

  const handleNextStep = () => {
    if (step === 1) {
      const validation = validateTravelRequestDatesAndFields({
        groupName,
        officeId,
        requesterName,
        departureDate,
        returnDate,
        proposalDueDate,
        participants,
      });
      if (!validation.valid) {
        setErrors(validation.errors);
        return;
      }
      if (!city.trim() || !country.trim()) {
        setErrors(['La ciudad y el país destino son obligatorios.']);
        return;
      }
      setErrors([]);
      setStep(2);
    } else if (step === 2) {
      setErrors([]);
      setStep(3);
    }
  };

  const handleBuildAndSubmit = (isDraft: boolean) => {
    const validation = validateTravelRequestDatesAndFields({
      groupName,
      officeId,
      requesterName,
      departureDate,
      returnDate,
      proposalDueDate,
      participants,
    });
    if (!validation.valid) {
      setErrors(validation.errors);
      setStep(1);
      return;
    }

    const now = new Date().toISOString();
    const dep = new Date(departureDate);
    const ret = new Date(returnDate);
    const diffDays = Math.max(1, Math.round((ret.getTime() - dep.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const nights = Math.max(1, diffDays - 1);

    const newReq: TravelRequest = {
      id: `req_ee_${Date.now()}`,
      folio: generatedFolio,
      groupName: groupName.trim(),
      officeId,
      requesterName: requesterName.trim(),
      requesterEmail: requesterEmail.trim() || 'contacto@institucion.edu.mx',
      commercialExecutiveUid: currentUser.uid,
      commercialExecutiveName: currentUser.displayName,
      createdAt: now,
      updatedAt: now,
      proposalDueDate,
      departureDate,
      returnDate,
      city: city.trim() || 'Destino por definir',
      country: country.trim() || 'País por definir',
      participants: Number(participants),
      chaperones: Number(chaperones),
      additionalStaff: Number(additionalStaff),
      estimatedBudgetPerPerson: Number(estimatedBudgetPerPerson),
      budgetCurrency,
      programType,
      additionalComments: additionalComments.trim(),
      specialRequirements: specialRequirements.trim(),
      status: isDraft ? 'Borrador' : 'Recibida',
      ownerUid: currentUser.uid,
      authorizedUids: [currentUser.uid, 'usr_admin_ee'],
      specifications: specs,
      attachments: attachmentName.trim()
        ? [
            {
              id: `att_${Date.now()}`,
              name: attachmentName.trim(),
              mimeType: 'application/pdf',
              sizeBytes: 245000,
              uploadedBy: currentUser.displayName,
              uploadedAt: now,
              category: 'solicitud',
              isExternalVisible: true,
              referenceUrl: `#adjunto-${attachmentName.trim()}`,
            },
          ]
        : [],
      scenarios: initialRequestToDuplicate
        ? structuredClone(initialRequestToDuplicate.scenarios)
        : [
            {
              id: `sc_${Date.now()}_a`,
              name: `Escenario Base: ${participants} Participantes + ${chaperones} Chaperones`,
              participants: Number(participants),
              chaperones: Number(chaperones),
              additionalStaff: Number(additionalStaff),
              days: diffDays,
              nights,
              costCurrency: 'USD',
              saleCurrency: budgetCurrency,
              exchangeRate: 19.85,
              exchangeRateDate: now.slice(0, 10),
              exchangeRateValidUntil: proposalDueDate,
              createdAt: now,
              validUntil: proposalDueDate,
              createdByUid: currentUser.uid,
              createdByName: currentUser.displayName,
              lineItems: [
                {
                  id: `li_${Date.now()}_1`,
                  name: 'Precio neto del programa académico y alojamiento',
                  category: 'Precio neto del programa',
                  description: `${specs.accommodationType} · ${specs.coursesOrActivities}`,
                  quantity: 1,
                  unit: 'alumno',
                  unitCost: 1850,
                  currency: 'USD',
                  basis: 'por_participante',
                  isInternalCostOnly: false,
                  isMandatory: true,
                  isTaxable: false,
                  isIncludedInPrice: true,
                  active: true,
                },
                {
                  id: `li_${Date.now()}_2`,
                  name: 'Transporte terrestre privado y traslados aeropuerto',
                  category: 'Transporte y traslados',
                  description: specs.transfers,
                  quantity: 1,
                  unit: 'grupo',
                  unitCost: 3100,
                  currency: 'USD',
                  basis: 'por_grupo',
                  isInternalCostOnly: false,
                  isMandatory: true,
                  isTaxable: false,
                  isIncludedInPrice: true,
                  active: true,
                },
                {
                  id: `li_${Date.now()}_3`,
                  name: 'Seguro médico internacional y Kit EE',
                  category: 'Seguro',
                  description: specs.insurance,
                  quantity: 1,
                  unit: 'alumno',
                  unitCost: 140,
                  currency: 'USD',
                  basis: 'por_participante',
                  isInternalCostOnly: false,
                  isMandatory: true,
                  isTaxable: false,
                  isIncludedInPrice: true,
                  active: true,
                },
                {
                  id: `li_${Date.now()}_4`,
                  name: 'Gastos de operación interna EE',
                  category: 'Gastos de operación',
                  description: 'Coordinación operativa y envío de kits',
                  quantity: 1,
                  unit: 'grupo',
                  unitCost: 650,
                  currency: 'USD',
                  basis: 'por_grupo',
                  isInternalCostOnly: true,
                  isMandatory: true,
                  isTaxable: false,
                  isIncludedInPrice: true,
                  active: true,
                },
              ],
              chaperoneExpenses: {
                travelCostPerChaperone: 850,
                insurancePerChaperone: 95,
                transportPerChaperone: 120,
                accommodationPerChaperone: 920,
                mealsPerChaperone: 340,
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
                formulaVersion: 'v1.0-EE-Provisional',
                pricingStrategy: 'margin_on_sale',
                targetMarginOrMarkupPercent: 21,
                schoolCommissionBasis: 'sobre_venta',
                schoolCommissionValue: 5,
                coordinatorCommissionBasis: 'fijo_por_participante',
                coordinatorCommissionValue: budgetCurrency === 'MXN' ? 1200 : 60,
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
            },
          ],
      documents: [],
      dispatches: [],
      outcomes: [],
      statusHistory: [
        {
          id: `sh_${Date.now()}`,
          previousStatus: 'Nuevo',
          newStatus: isDraft ? 'Borrador' : 'Recibida',
          changedByUid: currentUser.uid,
          changedByName: currentUser.displayName,
          changedAt: now,
          note: isDraft
            ? 'Solicitud guardada como borrador.'
            : `Solicitud registrada formalmente con folio ${generatedFolio}.`,
        },
      ],
      auditTrail: [
        {
          id: `aud_${Date.now()}`,
          timestamp: now,
          actorUid: currentUser.uid,
          actorName: currentUser.displayName,
          actorRole: currentUser.role,
          action: isDraft ? 'Guardado de borrador de solicitud' : 'Registro de nueva solicitud de viaje',
          module: 'Solicitudes',
          entityId: generatedFolio,
          details: `Grupo: ${groupName.trim()} (${participants} participantes, destino ${city}, ${country}).`,
        },
      ],
    };

    localStorage.removeItem(DRAFT_STORAGE_KEY);
    onSaveRequest(newReq, isDraft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl shadow-xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#0B3B70] text-white">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {initialRequestToDuplicate ? 'Duplicar Solicitud de Viaje' : 'Nueva Solicitud de Cotización Grupal'}
            </h2>
            <p className="text-xs text-blue-100 mt-0.5 font-mono">
              Folio asignado: {generatedFolio} · Responsable: {currentUser.displayName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-blue-100 hover:text-white rounded-lg transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 text-xs font-medium">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`py-3 px-4 text-left border-b-2 transition-colors ${
              step === 1
                ? 'border-[#0B3B70] text-[#0B3B70] bg-white font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            01. Información General
          </button>
          <button
            type="button"
            onClick={() => setStep(2)}
            className={`py-3 px-4 text-left border-b-2 transition-colors ${
              step === 2
                ? 'border-[#0B3B70] text-[#0B3B70] bg-white font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            02. Especificaciones del Programa
          </button>
          <button
            type="button"
            onClick={() => setStep(3)}
            className={`py-3 px-4 text-left border-b-2 transition-colors ${
              step === 3
                ? 'border-[#0B3B70] text-[#0B3B70] bg-white font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            03. Confirmación y Registro
          </button>
        </div>

        {/* Error Banner */}
        {errors.length > 0 && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            <p className="font-semibold mb-1">Por favor corrige los siguientes campos:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Body */}
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-5">
          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre del Grupo / Institución Educativa *
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Ej. Colegio Alemán — Viaje Académico Berlín"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B3B70]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Oficina Solicitante *
                </label>
                <select
                  value={officeId}
                  onChange={(e) => setOfficeId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B3B70]"
                >
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} — {o.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Persona que solicita (Contacto Escuela) *
                </label>
                <input
                  type="text"
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  placeholder="Ej. Mtra. Claudia Morales"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Correo del solicitante
                </label>
                <input
                  type="email"
                  value={requesterEmail}
                  onChange={(e) => setRequesterEmail(e.target.value)}
                  placeholder="cmorales@colegio.edu.mx"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tipo de Programa *
                </label>
                <select
                  value={programType}
                  onChange={(e) => setProgramType(e.target.value as ProgramType)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  {PROGRAM_TYPES.map((pt) => (
                    <option key={pt} value={pt}>
                      {pt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Ciudad Destino *
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Ej. Toronto"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  País Destino *
                </label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Ej. Canadá"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Fecha Límite Entrega Propuesta *
                </label>
                <input
                  type="date"
                  value={proposalDueDate}
                  onChange={(e) => setProposalDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Fecha de Salida *
                </label>
                <input
                  type="date"
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Fecha de Regreso *
                </label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Alumnos *
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={participants}
                    onChange={(e) => setParticipants(Number(e.target.value))}
                    className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Chaperones
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={chaperones}
                    onChange={(e) => setChaperones(Number(e.target.value))}
                    className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Staff EE
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={additionalStaff}
                    onChange={(e) => setAdditionalStaff(Number(e.target.value))}
                    className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Presupuesto Estimado por Alumno
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    value={estimatedBudgetPerPerson}
                    onChange={(e) => setEstimatedBudgetPerPerson(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                  <select
                    value={budgetCurrency}
                    onChange={(e) => setBudgetCurrency(e.target.value as CurrencyCode)}
                    className="px-2.5 py-2 text-sm border border-slate-300 rounded-lg font-mono bg-slate-50"
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                    <option value="CAD">CAD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Adjuntar archivo de referencia (nombre PDF/Doc)
                </label>
                <input
                  type="text"
                  value={attachmentName}
                  onChange={(e) => setAttachmentName(e.target.value)}
                  placeholder="Ej. Requerimientos_Colegio_2027.pdf"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Requerimientos Especiales (dietas, visas, médicos)
                  </label>
                  <textarea
                    rows={2}
                    value={specialRequirements}
                    onChange={(e) => setSpecialRequirements(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Comentarios Adicionales Comerciales
                  </label>
                  <textarea
                    rows={2}
                    value={additionalComments}
                    onChange={(e) => setAdditionalComments(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tipo de Alojamiento
                  </label>
                  <input
                    type="text"
                    value={specs.accommodationType}
                    onChange={(e) =>
                      setSpecs({ ...specs, accommodationType: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Escuela, Universidad o Proveedor Receptor
                  </label>
                  <input
                    type="text"
                    value={specs.schoolOrProvider}
                    onChange={(e) =>
                      setSpecs({ ...specs, schoolOrProvider: e.target.value })
                    }
                    placeholder="Ej. University of Toronto International"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Cursos, Talleres o Actividades Académicas
                  </label>
                  <input
                    type="text"
                    value={specs.coursesOrActivities}
                    onChange={(e) =>
                      setSpecs({ ...specs, coursesOrActivities: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Plan de Alimentación
                  </label>
                  <input
                    type="text"
                    value={specs.meals}
                    onChange={(e) => setSpecs({ ...specs, meals: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Traslados y Transporte Local
                  </label>
                  <input
                    type="text"
                    value={specs.transfers}
                    onChange={(e) => setSpecs({ ...specs, transfers: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Visitas y Excursiones Solicitadas
                  </label>
                  <input
                    type="text"
                    value={specs.excursions}
                    onChange={(e) => setSpecs({ ...specs, excursions: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Included / Excluded Services */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-2">
                    Servicios Incluidos en la Propuesta
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newIncludedService}
                      onChange={(e) => setNewIncludedService(e.target.value)}
                      placeholder="Agregar servicio incluido..."
                      className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newIncludedService.trim()) {
                          setSpecs({
                            ...specs,
                            includedServices: [
                              ...specs.includedServices,
                              newIncludedService.trim(),
                            ],
                          });
                          setNewIncludedService('');
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg"
                    >
                      Agregar
                    </button>
                  </div>
                  <ul className="space-y-1 text-xs text-slate-700">
                    {specs.includedServices.map((srv, idx) => (
                      <li
                        key={idx}
                        className="flex items-center justify-between bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200"
                      >
                        <span>{srv}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setSpecs({
                              ...specs,
                              includedServices: specs.includedServices.filter(
                                (_, i) => i !== idx
                              ),
                            })
                          }
                          className="text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-2">
                    Servicios Excluidos
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newExcludedService}
                      onChange={(e) => setNewExcludedService(e.target.value)}
                      placeholder="Agregar servicio no incluido..."
                      className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newExcludedService.trim()) {
                          setSpecs({
                            ...specs,
                            excludedServices: [
                              ...specs.excludedServices,
                              newExcludedService.trim(),
                            ],
                          });
                          setNewExcludedService('');
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg"
                    >
                      Agregar
                    </button>
                  </div>
                  <ul className="space-y-1 text-xs text-slate-700">
                    {specs.excludedServices.map((srv, idx) => (
                      <li
                        key={idx}
                        className="flex items-center justify-between bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200"
                      >
                        <span>{srv}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setSpecs({
                              ...specs,
                              excludedServices: specs.excludedServices.filter(
                                (_, i) => i !== idx
                              ),
                            })
                          }
                          className="text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Dynamic Configurable Custom Fields per Program */}
              <div className="pt-3 border-t border-slate-200">
                <label className="block text-xs font-semibold text-slate-800 mb-2">
                  Campos Configurables Adicionales (Sin modificar código)
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={customKey}
                    onChange={(e) => setCustomKey(e.target.value)}
                    placeholder="Nombre del campo (ej. Certificación de idioma)"
                    className="w-1/3 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    type="text"
                    value={customVal}
                    onChange={(e) => setCustomVal(e.target.value)}
                    placeholder="Valor o especificación"
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customKey.trim() && customVal.trim()) {
                        setSpecs({
                          ...specs,
                          customFields: {
                            ...specs.customFields,
                            [customKey.trim()]: customVal.trim(),
                          },
                        });
                        setCustomKey('');
                        setCustomVal('');
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-white rounded-lg flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Añadir Campo
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {Object.entries(specs.customFields).map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between text-xs bg-slate-50 px-3 py-1.5 rounded border border-slate-200"
                    >
                      <span>
                        <strong>{k}:</strong> {v}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...specs.customFields };
                          delete next[k];
                          setSpecs({ ...specs, customFields: next });
                        }}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-sm">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div>
                    <span className="text-xs text-slate-500 block">FOLIO AUTOMÁTICO</span>
                    <span className="font-mono font-bold text-[#0B3B70]">{generatedFolio}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-500 block">PROGRAMA</span>
                    <span className="font-semibold text-slate-900">{programType}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">Grupo / Escuela:</span>
                    <strong className="text-slate-900">{groupName || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Solicitante:</span>
                    <strong className="text-slate-900">{requesterName || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Destino:</span>
                    <strong className="text-slate-900">
                      {city}, {country}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Fechas del viaje:</span>
                    <strong className="font-mono text-slate-900">
                      {departureDate} → {returnDate}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Fecha límite propuesta:</span>
                    <strong className="font-mono text-slate-900">{proposalDueDate}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Aforo inicial:</span>
                    <strong className="font-mono text-slate-900">
                      {participants} alumnos · {chaperones} chap. · {additionalStaff} staff
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Presupuesto objetivo:</span>
                    <strong className="font-mono text-slate-900">
                      ${estimatedBudgetPerPerson.toLocaleString('es-MX')} {budgetCurrency}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Alojamiento:</span>
                    <strong className="text-slate-900">{specs.accommodationType}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Servicios incluidos:</span>
                    <strong className="text-slate-900">
                      {specs.includedServices.length} conceptos registrados
                    </strong>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-600">
                Al registrar la solicitud se creará automáticamente el expediente con su primer escenario base listo para cotizar y comparar en el motor financiero.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => handleBuildAndSubmit(true)}
              className="px-4 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" /> Guardar Borrador
            </button>
          </div>

          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((step - 1) as 1 | 2)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
              >
                Anterior
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3B70] rounded-lg hover:bg-[#082d56]"
              >
                Siguiente Paso
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleBuildAndSubmit(false)}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#0B3B70] rounded-lg hover:bg-[#082d56] flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Registrar Solicitud ({generatedFolio})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

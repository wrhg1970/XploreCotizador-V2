import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  CurrencyCode,
  EERubroRow,
  EESheetModel,
  ItineraryDayEntry,
  Office,
  ProgramType,
  QuoteScenario,
  TravelRequest,
  UserProfile,
} from '../types/domain';
import {
  buildSuggestedItineraryDays,
  calculateEESheet,
  DEFAULT_FREE_PLACES_RULE,
  DEFAULT_PAYMENT_PLAN_CONFIG,
  getCurrencyDisplayName,
} from '../engine/eeSheetEngine';
import { formatMoney } from '../utils/exporters';
import {
  Sparkles,
  FileSpreadsheet,
  Link2,
  ClipboardPaste,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowRight,
  Loader2,
  Download,
  Layers,
  DollarSign,
  Users,
  Calendar,
  MapPin,
} from 'lucide-react';

interface ExtractedAIRubro {
  label: string;
  amount: number;
  note?: string;
}

interface ExtractedAIScenario {
  optionTitle: string;
  programTitle: string;
  destinationSubtitle?: string;
  currencyCode: string;
  exchangeRate: number;
  participants: number;
  days: number;
  chaperonesEscuela?: number;
  chaperonesEE?: number;
  emergencyFund?: number;
  dailyExpenseRate?: number;
  leaderCompensation?: number;
  pricingInputMode?: 'percent' | 'final_price' | string;
  commissionPercent?: number;
  manualFinalPrice?: number;
  freePlaceRatio?: number;
  installmentsCount?: number;
  conceptos: ExtractedAIRubro[];
  chaperoneRubros?: ExtractedAIRubro[];
}

interface ExtractedAIQuotePayload {
  aiAnalysisSummary: string;
  groupName: string;
  requesterName?: string;
  requesterEmail?: string;
  city: string;
  country: string;
  programType: string;
  departureDate?: string;
  returnDate?: string;
  proposalDueDate?: string;
  participants: number;
  chaperones?: number;
  days: number;
  nights?: number;
  currencyCode: string;
  exchangeRate: number;
  specialRequirements?: string;
  schoolOrProvider?: string;
  accommodationType?: string;
  flightsIncluded?: boolean;
  flightDetails?: string;
  includedServices?: string[];
  excludedServices?: string[];
  itineraryDays?: ItineraryDayEntry[];
  scenarios: ExtractedAIScenario[];
}

interface AISpreadsheetQuoteImporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  offices: Office[];
  currentUser: UserProfile;
  existingRequestCount: number;
  targetRequest?: TravelRequest | null;
  onCreateNewRequestFromAI: (newRequest: TravelRequest, sourceSummary: string) => void;
  onAppendScenariosToRequest?: (
    targetRequest: TravelRequest,
    newScenarios: QuoteScenario[],
    sourceSummary: string
  ) => void;
}

const VALID_CURRENCIES: CurrencyCode[] = ['USD', 'GBP', 'CAD', 'EUR', 'MXN'];
const VALID_PROGRAMS: ProgramType[] = [
  'Inmersión Académica',
  'Campamento de Verano',
  'Curso de Idiomas',
  'Tour Cultural y Universitario',
  'STEM & Robótica',
  'Liderazgo Internacional',
];

function normalizeCurrency(raw?: string): CurrencyCode {
  const upper = (raw || 'USD').toUpperCase().trim();
  if (VALID_CURRENCIES.includes(upper as CurrencyCode)) {
    return upper as CurrencyCode;
  }
  if (upper.includes('LIBRA') || upper.includes('GBP') || upper.includes('£')) return 'GBP';
  if (upper.includes('EUR') || upper.includes('€')) return 'EUR';
  if (upper.includes('CAD') || upper.includes('CAN')) return 'CAD';
  if (upper.includes('MXN') || upper.includes('PESO')) return 'MXN';
  return 'USD';
}

function normalizeProgramType(raw?: string): ProgramType {
  const found = VALID_PROGRAMS.find(
    (p) => p.toLowerCase() === (raw || '').toLowerCase().trim()
  );
  if (found) return found;
  const lower = (raw || '').toLowerCase();
  if (lower.includes('verano') || lower.includes('camp')) return 'Campamento de Verano';
  if (lower.includes('idioma') || lower.includes('ingl') || lower.includes('franc'))
    return 'Curso de Idiomas';
  if (lower.includes('stem') || lower.includes('rob') || lower.includes('nasa'))
    return 'STEM & Robótica';
  if (lower.includes('lider')) return 'Liderazgo Internacional';
  if (lower.includes('tour') || lower.includes('univ') || lower.includes('cultur'))
    return 'Tour Cultural y Universitario';
  return 'Inmersión Académica';
}

/**
 * Converts an AI-extracted scenario into an official EESheetModel with canonical EE rubric rows
 */
function convertAIScenarioToEESheet(
  aiSc: ExtractedAIScenario,
  idx: number,
  fallbackCity: string
): EESheetModel {
  const currencyCode = normalizeCurrency(aiSc.currencyCode);
  const exchangeRate = Math.max(1, Number(aiSc.exchangeRate) || (currencyCode === 'GBP' ? 26.5 : 20.1));
  const participants = Math.max(1, Math.round(Number(aiSc.participants) || 20));
  const days = Math.max(1, Math.round(Number(aiSc.days) || 14));

  // Canonical EE left-block concept rows
  const canonicalConceptDefs: { id: string; label: string; keywords: string[]; isInternalOnly?: boolean }[] = [
    { id: 'rub_precio_neto', label: 'Precio Neto', keywords: ['precio neto', 'programa', 'paquete', 'colegiatura', 'alojamiento', 'base', 'campamento'] },
    { id: 'rub_transfer', label: 'Transfer', keywords: ['transfer', 'transporte', 'traslado', 'autobus', 'autobús', 'coach'] },
    { id: 'rub_comidas', label: 'Comidas', keywords: ['comida', 'alimento', 'meal', 'lunch', 'cena'] },
    { id: 'rub_kit_ee', label: 'Kit EE', keywords: ['kit ee', 'kit', 'mochila', 'playera'] },
    { id: 'rub_seguro_msi', label: 'Seguro MSI', keywords: ['seguro', 'asistencia', 'insurance', 'msi'] },
    { id: 'rub_promocion', label: 'Promoción', keywords: ['promocion', 'promoción', 'descuento', 'beca', 'promo'] },
    { id: 'rub_costo_envios_kits', label: 'Costo envios Kits', keywords: ['envio', 'envío', 'mensajeria', 'paqueteria'], isInternalOnly: true },
    { id: 'rub_operacion', label: 'Operación', keywords: ['operacion', 'operación', 'operativo', 'gastos de operacion'], isInternalOnly: true },
    { id: 'rub_otros_gastos', label: 'Otros gastos', keywords: ['otros gastos', 'vuelo', 'avion', 'avión', 'aereo', 'aéreo', 'boleto', 'visa'] },
    { id: 'rub_comision_escuela', label: 'Comisión Escuela', keywords: ['comision escuela', 'comisión escuela', 'colegio', 'apoyo escuela'], isInternalOnly: true },
    { id: 'rub_comision_coordinadora', label: 'Comisión Coordinadora', keywords: ['coordinadora', 'coordinador', 'incentivo'], isInternalOnly: true },
  ];

  const conceptos: EERubroRow[] = canonicalConceptDefs.map((def) => ({
    id: def.id,
    label: def.label,
    amount: 0,
    note: '',
    isInternalOnly: def.isInternalOnly,
  }));

  const extraConceptos: EERubroRow[] = [];

  for (const rawRow of aiSc.conceptos || []) {
    const rowLabelLower = (rawRow.label || '').toLowerCase().trim();
    const amount = Math.max(0, Number(rawRow.amount) || 0);
    const matchedCanonical = canonicalConceptDefs.find((def) =>
      def.keywords.some((kw) => rowLabelLower.includes(kw))
    );

    if (matchedCanonical) {
      const target = conceptos.find((c) => c.id === matchedCanonical.id);
      if (target) {
        target.amount = Math.round((target.amount + amount) * 100) / 100;
        if (rawRow.note) {
          target.note = target.note ? `${target.note}, ${rawRow.note}` : rawRow.note;
        } else if (
          matchedCanonical.id === 'rub_otros_gastos' &&
          !target.note &&
          (rowLabelLower.includes('vuelo') || rowLabelLower.includes('avi'))
        ) {
          target.note = 'avión';
        }
      }
    } else if (amount > 0) {
      extraConceptos.push({
        id: `rub_ai_${idx}_${extraConceptos.length + 1}`,
        label: rawRow.label || `Rubro Importado ${extraConceptos.length + 1}`,
        amount,
        note: rawRow.note || 'Importado IA',
      });
    }
  }

  // Canonical EE right-block chaperone rows
  const canonicalChapDefs: { id: string; label: string; keywords: string[] }[] = [
    { id: 'chap_costo', label: 'Costo chaperon', keywords: ['costo chaperon', 'paquete chaperon', 'estancia'] },
    { id: 'chap_viaje', label: 'Gastos del Viaje', keywords: ['gastos del viaje', 'vuelo', 'viaje', 'avion', 'boleto'] },
    { id: 'chap_seguro', label: 'Seguro', keywords: ['seguro', 'asistencia'] },
    { id: 'chap_transfer', label: 'Transfer', keywords: ['transfer', 'traslado', 'transporte'] },
    { id: 'chap_kit', label: 'Kit', keywords: ['kit'] },
    { id: 'chap_extra', label: 'Chaperon Extra', keywords: ['extra', 'compensacion', 'adicional', 'hospedaje'] },
  ];

  const chaperoneRubros: EERubroRow[] = canonicalChapDefs.map((def) => ({
    id: def.id,
    label: def.label,
    amount: 0,
  }));

  for (const rawChap of aiSc.chaperoneRubros || []) {
    const chapLower = (rawChap.label || '').toLowerCase().trim();
    const amount = Math.max(0, Number(rawChap.amount) || 0);
    const matched = canonicalChapDefs.find((def) =>
      def.keywords.some((kw) => chapLower.includes(kw))
    );
    if (matched) {
      const target = chaperoneRubros.find((c) => c.id === matched.id);
      if (target) {
        target.amount = Math.round((target.amount + amount) * 100) / 100;
      }
    } else if (amount > 0) {
      chaperoneRubros[0].amount = Math.round((chaperoneRubros[0].amount + amount) * 100) / 100;
    }
  }

  // Ensure sensible defaults if chaperone rubros were not explicitly itemized in the Excel
  const hasAnyChapAmount = chaperoneRubros.some((r) => r.amount > 0);
  if (!hasAnyChapAmount) {
    chaperoneRubros[1].amount = 950; // Gastos del Viaje
    chaperoneRubros[2].amount = 120; // Seguro
    chaperoneRubros[4].amount = 65; // Kit
  }

  const chaperonesEscuela = Math.max(0, Math.round(Number(aiSc.chaperonesEscuela) || 0));
  const chaperonesEE = Math.max(
    0,
    Math.round(Number(aiSc.chaperonesEE) ?? (chaperonesEscuela === 0 ? 2 : 1))
  );
  const totalChap = Math.max(1, chaperonesEscuela + chaperonesEE);
  const dailyExpenseRate = Math.max(0, Number(aiSc.dailyExpenseRate) || 25);
  const dailyExpenseCalculatedTotal =
    Math.round(dailyExpenseRate * days * totalChap * 100) / 100;

  const commPct =
    typeof aiSc.commissionPercent === 'number' && aiSc.commissionPercent > 0
      ? aiSc.commissionPercent
      : 18.5;
  const manualFinal =
    typeof aiSc.manualFinalPrice === 'number' && aiSc.manualFinalPrice > 0
      ? aiSc.manualFinalPrice
      : 0;
  const pricingInputMode: 'percent' | 'final_price' =
    aiSc.pricingInputMode === 'final_price' && manualFinal > 0 ? 'final_price' : 'percent';

  return {
    optionTitle: aiSc.optionTitle || `OPCIÓN ${idx + 1}`,
    programTitle: aiSc.programTitle || 'Programa Educativo Importado',
    destinationSubtitle: aiSc.destinationSubtitle || fallbackCity,
    currencyLabel: getCurrencyDisplayName(currencyCode),
    currencyCode,
    exchangeRate,
    participants,
    days,
    conceptos: [...conceptos, ...extraConceptos],
    overrideLeaderExpense: false,
    manualLeaderExpenseAmount: 0,
    leaderCompensation: Math.max(0, Number(aiSc.leaderCompensation) || 0),
    pricingInputMode,
    commissionPercent: commPct,
    manualFinalPrice: manualFinal,
    chaperonesEscuela,
    chaperonesEE,
    emergencyFund: Math.max(0, Number(aiSc.emergencyFund) || 150),
    dailyExpenseRate,
    dailyExpenseCalculatedTotal,
    chaperoneRubros,
    paymentPlan: {
      ...DEFAULT_PAYMENT_PLAN_CONFIG,
      installmentsCount: Math.min(15, Math.max(1, Math.round(Number(aiSc.installmentsCount) || 6))),
    },
    freePlacesRule: {
      ...DEFAULT_FREE_PLACES_RULE,
      studentsPerFreePlace: Math.max(5, Math.round(Number(aiSc.freePlaceRatio) || 10)),
    },
  };
}

const DEMO_SPREADSHEET_TEXT = `=== PESTAÑA / HOJA: "Cotización Colegio Irlandés 2027" (28 filas) ===
COLEGIO / INSTITUCIÓN: | Colegio Irlandés de Monterrey | CONTACTO: | Mtra. Patricia Garza (pgarza@irlandes.edu.mx)
PROGRAMA: | Inmersión Académica & Liderazgo UK - Francia | DESTINO: | Londres, Oxford y París
SALIDA: | 2027-06-14 | REGRESO: | 2027-07-02 | DURACIÓN: | 19 días / 18 noches
MONEDA BASE: | GBP (Libras Esterlinas) | TIPO DE CAMBIO: | 26.40 MXN | FREE PLACE: | 1:10 (2 profesores liberados)

TABLA COMPARATIVA DE OPCIONES COTIZADAS:
CONCEPTO / RUBRO POR ALUMNO | OPCIÓN 1: Residencia Universitaria (20 Alumnos) | OPCIÓN 2: Hotel Ejecutivo + Eurostar VIP (25 Alumnos) | NOTAS
Precio neto del programa (Curso + Alojamiento) | 3450.00 | 3890.00 | Sol Camps UK & Paris Campus
Transporte local (Oyster Card + Coach privado + Eurostar) | 280.00 | 360.00 | Incluye tren alta velocidad Londres-París
Comidas adicionales (Cenas temáticas Sena y Támesis) | 160.00 | 220.00 | Pensión completa
Kit EE (Mochila, hoodie, porta pasaporte) | 60.00 | 60.00 | Kit oficial Xplore Together
Seguro médico internacional cobertura amplia | 95.00 | 95.00 | Cobertura EUR/UK sin deducible
Promoción pronto pago | 45.00 | 45.00 | Beca pronta inscripción
Costo envío de kits | 12.00 | 12.00 | Mensajería DHL a Monterrey
Gastos de operación EE | 30.00 | 35.00 | Coordinación operativa
Otros gastos (Vuelo redondo CDMX-LHR / CDG-CDMX) | 980.00 | 980.00 | avión British Airways / Air France
Comisión de escuela (Apoyo fondo becas colegio) | 150.00 | 180.00 | Solicitado por dirección
Comisión de coordinadora | 110.00 | 120.00 | Coordinación docente

DESGLOSE DE CHAPERONES (2 Chaperones EE):
Gastos del Viaje Chaperón | 1050.00 | 1150.00
Seguro Chaperón | 140.00 | 140.00
Transfer Chaperón | 90.00 | 90.00
Kit Chaperón | 60.00 | 60.00
Chaperón Extra (Hospedaje single) | 950.00 | 1250.00
Fondo de Emergencia Grupal | 180.00 | 200.00
Viáticos por día Chaperón | 25.00 | 30.00
% Comisión / Margen Comercial EE | 18.5% | 19.0%
Plan de Pagos sugerido | Inscripción 15% + 8 pagos mensuales | Inscripción 15% + 8 pagos mensuales`;

export const AISpreadsheetQuoteImporterModal: React.FC<
  AISpreadsheetQuoteImporterModalProps
> = ({
  isOpen,
  onClose,
  offices,
  currentUser,
  existingRequestCount,
  targetRequest,
  onCreateNewRequestFromAI,
  onAppendScenariosToRequest,
}) => {
  const [sourceTab, setSourceTab] = useState<'excel' | 'gsheets' | 'paste'>('excel');
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [rawSpreadsheetText, setRawSpreadsheetText] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [detectedSheets, setDetectedSheets] = useState<
    { name: string; rowCount: number; csv: string }[]
  >([]);
  const [customPromptNotes, setCustomPromptNotes] = useState('');

  const [isFetchingSheet, setIsFetchingSheet] = useState(false);
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Extracted AI Preview State
  const [extractedData, setExtractedData] = useState<ExtractedAIQuotePayload | null>(null);
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>(
    targetRequest?.officeId || currentUser.officeId || offices[0]?.id || 'of_cdmx'
  );
  const [importTargetMode, setImportTargetMode] = useState<'append_current' | 'new_request'>(
    targetRequest ? 'append_current' : 'new_request'
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleExcelFileUpload = async (file: File) => {
    setErrorMessage(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
      const sheetsInfo: { name: string; rowCount: number; csv: string }[] = [];
      const blocks: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        if (!ws) continue;
        const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
          header: 1,
          defval: '',
          blankrows: false,
        });
        const cleanLines = rows
          .slice(0, 250)
          .map((r) =>
            (Array.isArray(r) ? r : [])
              .map((cell) => String(cell ?? '').replace(/\r?\n/g, ' ').trim())
              .join(' | ')
          )
          .filter((line) => line.replace(/\|/g, '').trim().length > 0);

        if (cleanLines.length > 0) {
          const csvText = cleanLines.join('\n');
          sheetsInfo.push({
            name: sheetName,
            rowCount: cleanLines.length,
            csv: csvText,
          });
          blocks.push(
            `=== PESTAÑA / HOJA: "${sheetName}" (${cleanLines.length} filas) ===\n${csvText}`
          );
        }
      }

      if (blocks.length === 0) {
        setErrorMessage('El archivo Excel seleccionado está vacío o no contiene filas legibles.');
        return;
      }

      setDetectedSheets(sheetsInfo);
      setRawSpreadsheetText(blocks.join('\n\n'));
      setSourceLabel(`Archivo Excel: ${file.name}`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? `Error al leer el archivo Excel: ${err.message}`
          : 'No se pudo procesar el archivo Excel seleccionado.'
      );
    }
  };

  const handleFetchGoogleSpreadsheet = async () => {
    if (!googleSheetUrl.trim()) {
      setErrorMessage('Ingresa una liga de Google Spreadsheets (https://docs.google.com/spreadsheets/d/...).');
      return;
    }
    setErrorMessage(null);
    setIsFetchingSheet(true);
    try {
      const resp = await fetch('/api/ai/fetch-google-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: googleSheetUrl.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'No se pudo descargar la hoja de Google Spreadsheets.');
      }
      setDetectedSheets(data.sheets || []);
      setRawSpreadsheetText(data.combinedText || '');
      setSourceLabel(`Google Spreadsheets (${data.spreadsheetId})`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Error al conectar con la liga de Google Spreadsheets.'
      );
    } finally {
      setIsFetchingSheet(false);
    }
  };

  const handleDownloadSampleExcelTemplate = () => {
    const wb = XLSX.utils.book_new();
    const rows = [
      ['COTIZACIÓN OFICIAL XPLORE TOGETHER - PLANTILLA EXCEL PARA IMPORTACIÓN IA'],
      ['Colegio / Institución', 'Colegio Irlandés de Monterrey', 'Contacto', 'Mtra. Patricia Garza', 'Correo', 'pgarza@irlandes.edu.mx'],
      ['Destino Ciudad', 'Londres, Oxford y París', 'País', 'Reino Unido y Francia', 'Programa', 'Inmersión Académica'],
      ['Fecha Salida', '2027-06-14', 'Fecha Regreso', '2027-07-02', 'Días', 19],
      ['Alumnos Pagantes', 20, 'Chaperones EE', 2, 'Moneda', 'GBP', 'Tipo de Cambio', 26.4],
      [],
      ['RUBRO POR ALUMNO (CONCEPTOS)', 'OPCIÓN 1 (Residencia 20 pax)', 'OPCIÓN 2 (Hotel + Eurostar 25 pax)', 'NOTA / DETALLE'],
      ['Precio neto del programa', 3450, 3890, 'Curso + Alojamiento Sol Camps'],
      ['Transporte', 280, 360, 'Oyster Card + Eurostar Londres-París'],
      ['Comidas', 160, 220, 'Pensión completa 3 alimentos'],
      ['Kit EE', 60, 60, 'Kit de viaje completo'],
      ['Seguro MSI', 95, 95, 'Cobertura internacional sin deducible'],
      ['Promoción', 45, 45, 'Pronto pago'],
      ['Costo envios Kits', 12, 12, 'Mensajería DHL'],
      ['Operación', 30, 35, 'Gastos operativos'],
      ['Otros gastos', 980, 980, 'avión vuelo redondo'],
      ['Comisión Escuela', 150, 180, 'Beca institucional colegio'],
      ['Comisión Coordinadora', 110, 120, 'Coordinación académica'],
      [],
      ['GASTOS DE CHAPERONES', 'OPCIÓN 1', 'OPCIÓN 2', 'NOTAS'],
      ['Gastos del Viaje', 1050, 1150, 'Vuelo + programa'],
      ['Seguro', 140, 140, 'Seguro chaperón'],
      ['Transfer', 90, 90, 'Traslados'],
      ['Kit', 60, 60, 'Kit EE'],
      ['Chaperon Extra', 950, 1250, 'Suplemento habitación'],
      ['Fondo de Emergencia', 180, 200, 'Fondo grupal'],
      ['Gastos por día', 25, 30, 'Viáticos diarios'],
      ['% Comisión EE', 18.5, 19.0, 'Margen comercial'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Cotizacion_EE');
    XLSX.writeFile(wb, 'Plantilla_Cotizacion_Xplore_Together_IA.xlsx');
  };

  const handleLoadDemoSpreadsheet = () => {
    setErrorMessage(null);
    setRawSpreadsheetText(DEMO_SPREADSHEET_TEXT);
    setSourceLabel('Demo Sábana Excel: Colegio Irlandés — Londres, Oxford y París (2 Opciones)');
    setDetectedSheets([
      {
        name: 'Cotización Colegio Irlandés 2027',
        rowCount: 28,
        csv: DEMO_SPREADSHEET_TEXT,
      },
    ]);
  };

  const handleRunAIExtraction = async () => {
    if (!rawSpreadsheetText.trim()) {
      setErrorMessage(
        'Primero sube un archivo Excel (.xlsx/.csv), conecta una liga de Google Spreadsheets o pega las celdas de tu cotización.'
      );
      return;
    }

    setErrorMessage(null);
    setIsAnalyzingAI(true);
    try {
      const response = await fetch('/api/ai/import-quote-spreadsheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetText: rawSpreadsheetText,
          sourceDescription: sourceLabel || 'Hoja de cálculo Excel / Google Sheets',
          customInstructions: customPromptNotes.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.extracted) {
        throw new Error(
          data.error || 'No fue posible estructurar la cotización con IA. Verifica el contenido.'
        );
      }

      setExtractedData(data.extracted as ExtractedAIQuotePayload);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Error al comunicarse con el motor de IA para importar la cotización.'
      );
    } finally {
      setIsAnalyzingAI(false);
    }
  };

  const buildScenariosFromExtracted = (payload: ExtractedAIQuotePayload): QuoteScenario[] => {
    const now = new Date().toISOString();
    const baseParticipants = Math.max(1, Number(payload.participants) || 20);
    const baseChaperones = Math.max(1, Number(payload.chaperones) || 2);
    const baseDays = Math.max(1, Number(payload.days) || 14);
    const baseNights = Math.max(1, Number(payload.nights) || baseDays - 1);
    const dueDate = payload.proposalDueDate || '2026-11-30';

    const rawScenarios =
      payload.scenarios && payload.scenarios.length > 0
        ? payload.scenarios
        : [
            {
              optionTitle: 'OPCIÓN 1',
              programTitle: payload.groupName || 'Programa Importado IA',
              destinationSubtitle: `${payload.city}, ${payload.country}`,
              currencyCode: payload.currencyCode || 'USD',
              exchangeRate: payload.exchangeRate || 20.1,
              participants: baseParticipants,
              days: baseDays,
              conceptos: [{ label: 'Precio neto del programa', amount: 2200 }],
            },
          ];

    return rawScenarios.map((aiSc, idx) => {
      const eeSheet = convertAIScenarioToEESheet(
        aiSc,
        idx,
        `${payload.city || 'Destino'}, ${payload.country || ''}`
      );
      const calc = calculateEESheet(eeSheet);

      return {
        id: `sc_ai_${Date.now()}_${idx + 1}`,
        name: `${eeSheet.optionTitle} — ${eeSheet.programTitle} (${eeSheet.participants} alum.)`,
        participants: eeSheet.participants,
        chaperones: eeSheet.chaperonesEscuela + eeSheet.chaperonesEE,
        additionalStaff: 0,
        days: eeSheet.days,
        nights: Math.max(1, eeSheet.days - 1 || baseNights),
        costCurrency: eeSheet.currencyCode,
        saleCurrency: eeSheet.currencyCode,
        exchangeRate: eeSheet.exchangeRate,
        exchangeRateDate: now.slice(0, 10),
        exchangeRateValidUntil: dueDate,
        createdAt: now,
        validUntil: dueDate,
        createdByUid: currentUser.uid,
        createdByName: currentUser.displayName,
        lineItems: [
          {
            id: `li_ai_${Date.now()}_${idx}_1`,
            name: `Costo consolidado sábana EE (${eeSheet.programTitle})`,
            category: 'Precio neto del programa',
            description: `Importado con IA desde ${sourceLabel || 'Excel / Google Sheets'}`,
            quantity: 1,
            unit: 'alumno',
            unitCost: calc.subTotal1Conceptos,
            currency: eeSheet.currencyCode,
            basis: 'por_participante',
            isInternalCostOnly: false,
            isMandatory: true,
            isTaxable: false,
            isIncludedInPrice: true,
            active: true,
          },
        ],
        chaperoneExpenses: {
          travelCostPerChaperone: calc.subTotalPerChaperon,
          insurancePerChaperone: 0,
          transportPerChaperone: 0,
          accommodationPerChaperone: 0,
          mealsPerChaperone: 0,
          kitPerChaperone: 0,
          dailyStipendPerChaperone: eeSheet.dailyExpenseRate,
          extraordinaryExpensesPerChaperone: 0,
          additionalCompensationPerChaperone: 0,
          emergencyFundPerChaperone: eeSheet.emergencyFund,
          leaderFixedExpense: 0,
          leaderCompensation: eeSheet.leaderCompensation,
          staffCostPerPerson: 0,
          currency: eeSheet.currencyCode,
          allocationMode: 'distribuido_participantes',
        },
        financialParameters: {
          formulaVersion: 'v2.0-EE-Sheet-AI',
          pricingStrategy: 'markup_on_cost',
          targetMarginOrMarkupPercent: calc.effectiveCommissionPercent,
          schoolCommissionBasis: 'fijo_por_participante',
          schoolCommissionValue: 0,
          coordinatorCommissionBasis: 'fijo_por_participante',
          coordinatorCommissionValue: 0,
          discountPerParticipant: 0,
          taxRatePercent: 0,
        },
        eeSheet,
        currentVersion: 1,
        versions: [],
        approvalStatus: 'No solicitada',
        requiredApprovalLevels: 1,
        approvals: [],
        commercialStatus: 'En preparación',
        lastMaterialSignature: '',
      };
    });
  };

  const handleConfirmImport = () => {
    if (!extractedData) return;

    const builtScenarios = buildScenariosFromExtracted(extractedData);
    const firstSheetCalc = builtScenarios[0]?.eeSheet
      ? calculateEESheet(builtScenarios[0].eeSheet)
      : null;

    if (
      importTargetMode === 'append_current' &&
      targetRequest &&
      onAppendScenariosToRequest
    ) {
      onAppendScenariosToRequest(
        targetRequest,
        builtScenarios,
        `${sourceLabel || 'Excel / Google Spreadsheets'} (${builtScenarios.length} opción/opciones extraídas por IA)`
      );
      onClose();
      return;
    }

    const now = new Date().toISOString();
    const folio = `EE-2026-${String(101 + existingRequestCount).padStart(3, '0')}`;
    const currencyCode = normalizeCurrency(extractedData.currencyCode);
    const programType = normalizeProgramType(extractedData.programType);
    const days = Math.max(1, Number(extractedData.days) || 14);
    const itineraryDays =
      extractedData.itineraryDays && extractedData.itineraryDays.length > 0
        ? extractedData.itineraryDays
        : buildSuggestedItineraryDays(
            `${extractedData.city}, ${extractedData.country}`,
            days
          );

    const newReq: TravelRequest = {
      id: `req_ai_${Date.now()}`,
      folio,
      groupName: extractedData.groupName || 'Colegio Importado vía IA',
      officeId: selectedOfficeId,
      requesterName: extractedData.requesterName || 'Coordinación Internacional',
      requesterEmail: extractedData.requesterEmail || 'coordinacion@colegio.edu.mx',
      commercialExecutiveUid: currentUser.uid,
      commercialExecutiveName: currentUser.displayName,
      createdAt: now,
      updatedAt: now,
      proposalDueDate: extractedData.proposalDueDate || '2026-11-30',
      departureDate: extractedData.departureDate || '2027-06-15',
      returnDate: extractedData.returnDate || '2027-06-30',
      city: extractedData.city || 'Londres',
      country: extractedData.country || 'Reino Unido',
      participants: Math.max(1, Number(extractedData.participants) || 20),
      chaperones: Math.max(1, Number(extractedData.chaperones) || 2),
      additionalStaff: 0,
      estimatedBudgetPerPerson: firstSheetCalc
        ? Math.round(firstSheetCalc.estimadoEnPesosPerParticipant)
        : 95000,
      budgetCurrency: 'MXN',
      programType,
      additionalComments: extractedData.aiAnalysisSummary || '',
      specialRequirements:
        extractedData.specialRequirements ||
        `Cotización importada automáticamente vía IA desde ${sourceLabel || 'Excel / Google Spreadsheets'}.`,
      status: 'En cotización',
      ownerUid: currentUser.uid,
      authorizedUids: [currentUser.uid, 'usr_admin_ee'],
      specifications: {
        accommodationType:
          extractedData.accommodationType || 'Residencia estudiantil / Hotel según opción',
        schoolOrProvider: extractedData.schoolOrProvider || 'Operador DMC / Campus',
        coursesOrActivities: `${programType} (${days} días)`,
        transfers: 'Traslados aeropuerto y transporte local incluidos en sábana',
        meals: 'Alimentos según desglose de sábana EE',
        insurance: 'Seguro médico internacional cobertura amplia',
        flightsIncluded:
          typeof extractedData.flightsIncluded === 'boolean'
            ? extractedData.flightsIncluded
            : true,
        flightDetails: extractedData.flightDetails || 'Vuelo redondo según rubro Otros Gastos',
        excursions: 'Actividades académicas y culturales según itinerario',
        accessibilityRequirements: 'Ninguno reportado',
        operationalNotes: extractedData.aiAnalysisSummary || '',
        includedServices:
          extractedData.includedServices && extractedData.includedServices.length > 0
            ? extractedData.includedServices
            : [
                'Programa académico y alojamiento según opción',
                'Seguro médico internacional y Kit EE',
                'Traslados y acompañamiento de chaperones',
              ],
        excludedServices:
          extractedData.excludedServices && extractedData.excludedServices.length > 0
            ? extractedData.excludedServices
            : ['Trámite de pasaporte / visa', 'Gastos personales'],
        customFields: {
          'Origen de Cotización': `Importación IA (${sourceLabel || 'Excel / Google Sheets'})`,
          'Divisa Base': `${currencyCode} (TC ${extractedData.exchangeRate})`,
        },
        itineraryDays,
      },
      attachments: [],
      scenarios: builtScenarios,
      documents: [],
      dispatches: [],
      outcomes: [],
      statusHistory: [
        {
          id: `sh_ai_${Date.now()}`,
          previousStatus: 'Nuevo',
          newStatus: 'En cotización',
          changedByUid: currentUser.uid,
          changedByName: currentUser.displayName,
          changedAt: now,
          note: `Expediente e ingeniería financiera importados vía IA desde ${sourceLabel || 'Excel / Google Spreadsheets'}.`,
        },
      ],
      auditTrail: [],
    };

    onCreateNewRequestFromAI(
      newReq,
      `${sourceLabel || 'Excel / Google Sheets'} (${builtScenarios.length} escenario(s) estructurados con Gemini AI)`
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-5xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-[#0B3B70] text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-900 border border-blue-700 rounded-xl">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">
                  Importador Inteligente de Cotizaciones con IA (Excel & Google Spreadsheets)
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 rounded">
                  GEMINI AI · MAPEO AUTOMÁTICO SÁBANA EE
                </span>
              </div>
              <p className="text-xs text-sky-200 mt-0.5">
                Sube un archivo Excel (.xlsx, .xls, .csv) o pega una liga de Google Spreadsheets: la IA interpreta rubros, chaperones, divisas y opciones automáticamente.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-sky-200 hover:text-white rounded-lg hover:bg-blue-900/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Source Selector Tabs */}
          {!extractedData && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setSourceTab('excel')}
                    className={`px-3.5 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors ${
                      sourceTab === 'excel'
                        ? 'bg-[#0B3B70] text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    1. Subir Archivo Excel (.xlsx / .csv)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceTab('gsheets')}
                    className={`px-3.5 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors ${
                      sourceTab === 'gsheets'
                        ? 'bg-[#0B3B70] text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Link2 className="w-4 h-4" />
                    2. Liga de Google Spreadsheets
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceTab('paste')}
                    className={`px-3.5 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors ${
                      sourceTab === 'paste'
                        ? 'bg-[#0B3B70] text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <ClipboardPaste className="w-4 h-4" />
                    3. Pegar Celdas Directamente
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoadDemoSpreadsheet}
                    className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                    Cargar Ejemplo de Sábana Excel (Demo)
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadSampleExcelTemplate}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-700" />
                    Descargar Plantilla .xlsx
                  </button>
                </div>
              </div>

              {/* TAB 1: UPLOAD EXCEL FILE */}
              {sourceTab === 'excel' && (
                <div className="border-2 border-dashed border-slate-300 hover:border-[#0B3B70] rounded-xl p-6 bg-slate-50/70 text-center transition-colors">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.ods"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleExcelFileUpload(file);
                    }}
                  />
                  <FileSpreadsheet className="w-10 h-10 text-emerald-700 mx-auto mb-2" />
                  <div className="text-sm font-bold text-slate-900">
                    Selecciona o arrastra tu archivo de cotización Excel (.xlsx, .xls, .csv)
                  </div>
                  <p className="text-xs text-slate-500 mt-1 max-w-xl mx-auto">
                    Soporta libros con múltiples pestañas y columnas comparativas (Opción 1, Opción 2, Chaperones, Itinerario). La IA mapeará los importes a la Sábana Oficial Xplore Together.
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-[#0B3B70] text-white font-semibold rounded-lg hover:bg-blue-900 flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      Elegir Archivo Excel / CSV de mi Equipo
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: GOOGLE SPREADSHEETS URL */}
              {sourceTab === 'gsheets' && (
                <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                    <Link2 className="w-4 h-4 text-[#0B3B70]" />
                    <span>Importar desde una Liga de Google Spreadsheets</span>
                  </div>
                  <p className="text-slate-600">
                    Pega el enlace de tu hoja de Google Sheets (asegúrate de que tenga permiso de lectura en <strong>&ldquo;Cualquier persona con el enlace&rdquo;</strong> para que el servidor descargue todas sus pestañas automáticamente).
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="url"
                      value={googleSheetUrl}
                      onChange={(e) => setGoogleSheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0"
                      className="flex-1 px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-xs"
                    />
                    <button
                      type="button"
                      disabled={isFetchingSheet}
                      onClick={handleFetchGoogleSpreadsheet}
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold rounded-lg flex items-center justify-center gap-2 shrink-0"
                    >
                      {isFetchingSheet ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Conectando con Google Sheets...
                        </>
                      ) : (
                        <>
                          <FileSpreadsheet className="w-4 h-4" />
                          Leer Google Spreadsheet
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: PASTE CELLS OR VIEW EXTRACTED RAW TEXT */}
              {(sourceTab === 'paste' || rawSpreadsheetText) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-800 flex items-center gap-2">
                      <span>
                        {sourceLabel
                          ? `Datos leídos listos para IA — ${sourceLabel}`
                          : 'Pega aquí las celdas copiadas desde Excel o Google Sheets (Ctrl+V):'}
                      </span>
                      {detectedSheets.length > 0 && (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded font-mono text-[11px]">
                          {detectedSheets.length}{' '}
                          {detectedSheets.length === 1 ? 'pestaña detectada' : 'pestañas detectadas'}
                        </span>
                      )}
                    </label>
                    {rawSpreadsheetText && (
                      <button
                        type="button"
                        onClick={() => {
                          setRawSpreadsheetText('');
                          setDetectedSheets([]);
                          setSourceLabel('');
                        }}
                        className="text-slate-500 hover:text-red-600 underline text-[11px]"
                      >
                        Limpiar contenido
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={7}
                    value={rawSpreadsheetText}
                    onChange={(e) => {
                      setRawSpreadsheetText(e.target.value);
                      if (!sourceLabel) setSourceLabel('Celdas pegadas manualmente');
                    }}
                    placeholder="Copia cualquier tabla de costos desde Excel o Google Spreadsheets y pégala aquí (Ctrl+V)..."
                    className="w-full p-3 bg-slate-900 text-emerald-300 font-mono text-[11px] rounded-xl border border-slate-700 leading-relaxed"
                  />
                </div>
              )}

              {/* Optional Custom AI Instructions */}
              <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2">
                <label className="block font-semibold text-[#0B3B70]">
                  Instrucciones adicionales para la IA (Opcional):
                </label>
                <input
                  type="text"
                  value={customPromptNotes}
                  onChange={(e) => setCustomPromptNotes(e.target.value)}
                  placeholder="Ej. Usa un tipo de cambio de 20.50 MXN, considera 2 chaperones liberados y 18% de margen comercial..."
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>
            </>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}

          {/* STEP 2: AI EXTRACTED QUOTE PREVIEW & CONFIRMATION */}
          {extractedData && (
            <div className="space-y-5">
              {/* AI Analysis Summary Banner */}
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-emerald-600 text-white rounded-lg shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-emerald-950 text-sm">
                      Cotización Estructurada con Éxito por Gemini AI ({extractedData.scenarios.length}{' '}
                      {extractedData.scenarios.length === 1 ? 'Opción detectada' : 'Opciones detectadas'})
                    </div>
                    <p className="text-emerald-900 mt-1 leading-relaxed">
                      {extractedData.aiAnalysisSummary}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setExtractedData(null)}
                  className="px-3 py-1.5 bg-white border border-emerald-300 text-emerald-900 font-semibold rounded-lg hover:bg-emerald-100 shrink-0"
                >
                  ← Cambiar Archivo / Fuente
                </button>
              </div>

              {/* Target Destination Mode when opened inside an existing Dossier */}
              {targetRequest && onAppendScenariosToRequest && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <strong className="text-[#0B3B70] block">
                      ¿Dónde deseas importar las opciones extraídas por la IA?
                    </strong>
                    <span className="text-slate-600">
                      Puedes agregarlas directamente al expediente actual ({targetRequest.folio} — {targetRequest.groupName}) o crear un nuevo expediente.
                    </span>
                  </div>
                  <div className="inline-flex bg-white p-1 rounded-lg border border-blue-200 shrink-0">
                    <button
                      type="button"
                      onClick={() => setImportTargetMode('append_current')}
                      className={`px-3 py-1.5 rounded-md font-semibold ${
                        importTargetMode === 'append_current'
                          ? 'bg-[#0B3B70] text-white'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      Agregar a {targetRequest.folio}
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportTargetMode('new_request')}
                      className={`px-3 py-1.5 rounded-md font-semibold ${
                        importTargetMode === 'new_request'
                          ? 'bg-[#0B3B70] text-white'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      Crear Nuevo Expediente
                    </button>
                  </div>
                </div>
              )}

              {/* Editable General Metadata Grid */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-[#0B3B70]" />
                  <span>Datos Generales Detectados (Puedes ajustarlos antes de guardar)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Colegio / Grupo Solicitante
                    </label>
                    <input
                      type="text"
                      value={extractedData.groupName}
                      onChange={(e) =>
                        setExtractedData({ ...extractedData, groupName: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Ciudad y País Destino
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={extractedData.city}
                        onChange={(e) =>
                          setExtractedData({ ...extractedData, city: e.target.value })
                        }
                        placeholder="Ciudad"
                        className="w-1/2 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                      />
                      <input
                        type="text"
                        value={extractedData.country}
                        onChange={(e) =>
                          setExtractedData({ ...extractedData, country: e.target.value })
                        }
                        placeholder="País"
                        className="w-1/2 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Oficina Xplore Together
                    </label>
                    <select
                      value={selectedOfficeId}
                      onChange={(e) => setSelectedOfficeId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-900"
                    >
                      {offices.map((of) => (
                        <option key={of.id} value={of.id}>
                          {of.code} — {of.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Divisa Base y Tipo de Cambio
                    </label>
                    <div className="flex gap-1.5">
                      <select
                        value={normalizeCurrency(extractedData.currencyCode)}
                        onChange={(e) =>
                          setExtractedData({ ...extractedData, currencyCode: e.target.value })
                        }
                        className="w-24 px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900"
                      >
                        {VALID_CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        value={extractedData.exchangeRate}
                        onChange={(e) =>
                          setExtractedData({
                            ...extractedData,
                            exchangeRate: Number(e.target.value) || 1,
                          })
                        }
                        className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-slate-900"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Scenarios Preview Cards */}
              <div className="space-y-3">
                <div className="font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#0B3B70]" />
                  <span>
                    Previsualización de Sábanas Oficiales EE Extraídas ({extractedData.scenarios.length})
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {extractedData.scenarios.map((sc, idx) => {
                    const previewSheet = convertAIScenarioToEESheet(
                      sc,
                      idx,
                      `${extractedData.city}, ${extractedData.country}`
                    );
                    const calc = calculateEESheet(previewSheet);
                    const nonZeroConcepts = previewSheet.conceptos.filter((c) => c.amount > 0);

                    return (
                      <div
                        key={idx}
                        className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs"
                      >
                        <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-mono uppercase text-amber-300 block">
                              {previewSheet.optionTitle} · {previewSheet.participants} alumnos ·{' '}
                              {previewSheet.days} días
                            </span>
                            <strong className="text-xs">{previewSheet.programTitle}</strong>
                          </div>
                          <div className="text-right font-mono">
                            <div className="text-xs font-bold text-emerald-300 tabular-nums">
                              {formatMoney(calc.precioFinalInCurrency, previewSheet.currencyCode)}{' '}
                              {previewSheet.currencyCode}
                            </div>
                            <div className="text-[11px] text-slate-300 tabular-nums">
                              {formatMoney(calc.estimadoEnPesosPerParticipant, 'MXN')} MXN / alumno
                            </div>
                          </div>
                        </div>

                        <div className="p-3.5 space-y-2.5">
                          <div className="text-[11px] font-semibold text-slate-700">
                            Rubros por Alumno Detectados ({nonZeroConcepts.length} con costo activo):
                          </div>
                          <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                            {nonZeroConcepts.map((c) => (
                              <div
                                key={c.id}
                                className="px-3 py-1.5 flex items-center justify-between text-[11px]"
                              >
                                <div className="truncate pr-2">
                                  <span className="font-medium text-slate-800">{c.label}</span>
                                  {c.note && (
                                    <span className="ml-1.5 text-slate-400 italic">
                                      ({c.note})
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                                  {formatMoney(c.amount, previewSheet.currencyCode)}
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono">
                            <div className="p-2 bg-slate-50 rounded border border-slate-200">
                              <span className="text-slate-500 block text-[10px]">SubTotal 1</span>
                              <strong className="text-slate-900 tabular-nums">
                                {formatMoney(calc.subTotal1Conceptos, previewSheet.currencyCode)}
                              </strong>
                            </div>
                            <div className="p-2 bg-slate-50 rounded border border-slate-200">
                              <span className="text-slate-500 block text-[10px]">
                                Gastos Líder ({calc.totalChaperonCount} chap.)
                              </span>
                              <strong className="text-slate-900 tabular-nums">
                                {formatMoney(calc.gastosDelLider, previewSheet.currencyCode)}
                              </strong>
                            </div>
                            <div className="p-2 bg-emerald-50 rounded border border-emerald-200">
                              <span className="text-emerald-700 block text-[10px]">
                                % Comisión ({calc.effectiveCommissionPercent.toFixed(1)}%)
                              </span>
                              <strong className="text-emerald-900 tabular-nums">
                                {formatMoney(calc.comisionPerParticipant, previewSheet.currencyCode)}
                              </strong>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Cancelar
          </button>

          {!extractedData ? (
            <button
              type="button"
              disabled={isAnalyzingAI || !rawSpreadsheetText.trim()}
              onClick={handleRunAIExtraction}
              className="px-5 py-2.5 bg-[#0B3B70] hover:bg-blue-900 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 transition-colors"
            >
              {isAnalyzingAI ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                  <span>Analizando Excel y Estructurando Sábana EE con IA...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Analizar e Importar Cotización con IA</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleRunAIExtraction}
                disabled={isAnalyzingAI}
                className="px-3.5 py-2 text-xs font-semibold text-[#0B3B70] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
              >
                Re-analizar con IA
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {importTargetMode === 'append_current' && targetRequest
                    ? `Importar ${extractedData.scenarios.length} Opción(es) en ${targetRequest.folio}`
                    : `Crear Expediente y Abrir en Cotizador (${extractedData.scenarios.length} Opción/es)`}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import * as XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAIClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || 'missing_key',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Extracts spreadsheetId and optional gid from any Google Spreadsheets URL
 */
function parseGoogleSheetUrl(rawUrl: string): { spreadsheetId: string; gid?: string } | null {
  const trimmed = rawUrl.trim();
  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  const spreadsheetId = idMatch[1];
  const gidMatch = trimmed.match(/[#&?]gid=([0-9]+)/);
  return {
    spreadsheetId,
    gid: gidMatch ? gidMatch[1] : undefined,
  };
}

/**
 * Converts an XLSX workbook buffer into readable multi-sheet CSV/table text
 */
function workbookBufferToStructuredText(buffer: Buffer): {
  sheets: { name: string; csv: string; rowCount: number }[];
  combinedText: string;
} {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheets: { name: string; csv: string; rowCount: number }[] = [];
  const blocks: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;
    const rows = XLSX.utils.sheet_to_json<string[]>(worksheet, {
      header: 1,
      defval: '',
      blankrows: false,
    });
    if (rows.length === 0) continue;

    const csvLines = rows
      .slice(0, 250)
      .map((row) =>
        (Array.isArray(row) ? row : [])
          .map((cell) => String(cell ?? '').replace(/\r?\n/g, ' ').trim())
          .join(' | ')
      )
      .filter((line) => line.replace(/\|/g, '').trim().length > 0);

    if (csvLines.length > 0) {
      const csvText = csvLines.join('\n');
      sheets.push({
        name: sheetName,
        csv: csvText,
        rowCount: csvLines.length,
      });
      blocks.push(`=== PESTAÑA / HOJA: "${sheetName}" (${csvLines.length} filas) ===\n${csvText}`);
    }
  }

  return {
    sheets,
    combinedText: blocks.join('\n\n'),
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support large base64 Excel payloads
  app.use(express.json({ limit: '15mb' }));

  /**
   * POST /api/ai/fetch-google-sheet
   * Downloads a Google Spreadsheet via its export endpoint (.xlsx or .csv) and converts all tabs into structured text
   */
  app.post('/api/ai/fetch-google-sheet', async (req, res) => {
    try {
      const { url } = req.body as { url?: string };
      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'Debes proporcionar una liga válida de Google Spreadsheets.' });
        return;
      }

      const parsed = parseGoogleSheetUrl(url);
      if (!parsed) {
        res.status(400).json({
          error:
            'El enlace no parece ser una liga válida de Google Spreadsheets (debe contener /spreadsheets/d/ID).',
        });
        return;
      }

      const { spreadsheetId, gid } = parsed;

      // 1. Try downloading as .xlsx first so we get all tabs & names
      const xlsxExportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
      const xlsxResp = await fetch(xlsxExportUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; XploreTogetherImporter/1.0)',
        },
        redirect: 'follow',
      });

      const contentType = xlsxResp.headers.get('content-type') || '';

      if (
        xlsxResp.ok &&
        !contentType.includes('text/html') &&
        (contentType.includes('spreadsheet') ||
          contentType.includes('octet-stream') ||
          contentType.includes('excel'))
      ) {
        const arrayBuf = await xlsxResp.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const parsedWorkbook = workbookBufferToStructuredText(buffer);
        if (parsedWorkbook.combinedText.trim().length > 0) {
          res.json({
            spreadsheetId,
            sheets: parsedWorkbook.sheets,
            combinedText: parsedWorkbook.combinedText,
          });
          return;
        }
      }

      // 2. Fallback to CSV export for the specific gid (or default first sheet)
      const csvExportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv${
        gid ? `&gid=${gid}` : ''
      }`;
      const csvResp = await fetch(csvExportUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; XploreTogetherImporter/1.0)',
        },
        redirect: 'follow',
      });

      const csvContentType = csvResp.headers.get('content-type') || '';
      if (!csvResp.ok || csvContentType.includes('text/html')) {
        res.status(422).json({
          error:
            'El documento de Google Spreadsheets es privado o requiere permisos. En Google Sheets haz clic en "Compartir" → "Cualquier persona con el enlace (Lector)" e intenta de nuevo, o copia y pega las celdas directamente.',
        });
        return;
      }

      const csvText = await csvResp.text();
      if (!csvText.trim() || csvText.trim().startsWith('<!DOCTYPE html')) {
        res.status(422).json({
          error:
            'No se pudo leer el contenido público de la hoja de Google Spreadsheets. Verifica que tenga acceso de lectura con el enlace o pega las celdas directamente.',
        });
        return;
      }

      const buffer = Buffer.from(csvText, 'utf-8');
      const parsedCsv = workbookBufferToStructuredText(buffer);

      res.json({
        spreadsheetId,
        sheets:
          parsedCsv.sheets.length > 0
            ? parsedCsv.sheets
            : [{ name: gid ? `Hoja (GID ${gid})` : 'Hoja Principal', csv: csvText, rowCount: csvText.split('\n').length }],
        combinedText:
          parsedCsv.combinedText || `=== PESTAÑA: "Google Sheet" ===\n${csvText.slice(0, 30000)}`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error inesperado al conectar con Google Spreadsheets.';
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/ai/import-quote-spreadsheet
   * Uses Gemini 3.8 Flash with Structured JSON Schema to parse any Excel/Google Sheet into Xplore Together's EESheetModel + TravelRequest structure.
   */
  app.post('/api/ai/import-quote-spreadsheet', async (req, res) => {
    try {
      const {
        spreadsheetText,
        fileBase64,
        fileName,
        sourceDescription,
        customInstructions,
      } = req.body as {
        spreadsheetText?: string;
        fileBase64?: string;
        fileName?: string;
        sourceDescription?: string;
        customInstructions?: string;
      };

      let normalizedText = (spreadsheetText || '').trim();

      // If client sent a base64 binary Excel file, parse it with SheetJS on the server as well
      if (!normalizedText && fileBase64) {
        const buffer = Buffer.from(fileBase64, 'base64');
        const extracted = workbookBufferToStructuredText(buffer);
        normalizedText = extracted.combinedText;
      }

      if (!normalizedText) {
        res.status(400).json({
          error: 'No se recibieron datos de Excel o Google Spreadsheets para analizar.',
        });
        return;
      }

      const systemInstruction = `Eres un analista financiero y cotizador experto de Xplore Together (EE Viajes Educativos).
Tu tarea es analizar el contenido crudo de una hoja de cálculo (Excel o Google Spreadsheets) y extraer toda la información para estructurar una cotización oficial de viaje educativo grupal.

REGLAS DE MAPEO A LA HOJA OFICIAL EE (Xplore Together):
1. Datos Generales del Expediente:
   - Identifica el nombre del colegio/grupo (groupName), ciudad (city), país (country), tipo de programa (programType: 'Inmersión Académica' | 'Campamento de Verano' | 'Curso de Idiomas' | 'Tour Cultural y Universitario' | 'STEM & Robótica' | 'Liderazgo Internacional'), fechas de salida y regreso (YYYY-MM-DD), días (days), noches (nights), alumnos pagantes (participants) y chaperones (chaperones).
   - Identifica la moneda base de los costos (currencyCode: 'USD' | 'GBP' | 'CAD' | 'EUR' | 'MXN') y el tipo de cambio a pesos mexicanos (exchangeRate). Si no viene explícito el tipo de cambio, usa valores de referencia realistas: GBP=26.50, USD=20.10, EUR=21.80, CAD=14.60, MXN=1.0.

2. Escenarios / Opciones Cotizadas (scenarios):
   - Si la hoja de cálculo contiene varias columnas comparativas (ej. Opción 1, Opción 2, Opción 3) o varias pestañas de opciones, extrae cada una como un elemento en el arreglo "scenarios". Si solo hay una cotización, genera al menos 1 escenario completo.
   - Para cada escenario, mapea los costos por alumno dentro de "conceptos" procurando usar las etiquetas oficiales de la Sábana EE cuando correspondan:
     * "Precio neto del programa" (alojamiento, colegiatura/curso, paquete base DMC/escuela)
     * "Transporte" (traslados locales, pases de transporte, autobús)
     * "Comidas" (alimentos no incluidos en paquete base)
     * "Kit" (kit de viaje EE, mochilas, playeras)
     * "Seguro" (seguro de viaje / asistencia médica)
     * "Promociones" (descuentos o becas aplicables)
     * "Envío de kits" (mensajería/paquetería)
     * "Gastos de operación" (gastos operativos, guías, entradas)
     * "Otros gastos" (vuelos / avión, visas, propinas u otros rubros relevantes; indica en "note" el detalle como "avión", "visas", etc.)
     * "Comisión de escuela" (comisión o apoyo económico para el colegio)
     * "Comisión de coordinadora" (incentivo o comisión de coordinación)
     * Si existen rubros adicionales específicos en el Excel, inclúyelos también como filas adicionales en "conceptos".
   - Mapea los costos de profesores/chaperones dentro de "chaperoneRubros":
     * "Gastos del Viaje" (vuelo/programa del chaperón)
     * "Seguro" (seguro del chaperón)
     * "Transfer" (traslados del chaperón)
     * "Kit" (kit del chaperón)
     * "Chaperon Extra" (cargos adicionales de acompañante)
   - Extrae el fondo de emergencia ("emergencyFund"), viáticos diarios por día ("dailyExpenseRate"), número de chaperones de la escuela ("chaperonesEscuela") y de EE ("chaperonesEE").
   - Si el Excel especifica un % de comisión/margen ("commissionPercent") o un Precio Final de Venta por alumno ("manualFinalPrice"), extráelos con precisión numérica.

3. Itinerario y Servicios:
   - Si el Excel incluye días de itinerario o actividades, extráelos en "itineraryDays".
   - Extrae servicios incluidos ("includedServices") y no incluidos ("excludedServices").`;

      const userPrompt = `Fuente del archivo: ${sourceDescription || fileName || 'Hoja de cálculo importada'}
${customInstructions ? `Instrucciones adicionales del usuario: ${customInstructions}\n` : ''}
Contenido de la hoja de cálculo (Excel / Google Spreadsheets):
------------------------------------------------------------
${normalizedText.slice(0, 45000)}
------------------------------------------------------------
Analiza los datos anteriores y devuelve el objeto JSON estructurado con la cotización completa.`;

      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: userPrompt,
        config: {
          systemInstruction,
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              aiAnalysisSummary: {
                type: Type.STRING,
                description:
                  'Resumen ejecutivo en español explicando qué detectó la IA en el Excel/Spreadsheet, cuántos escenarios y rubros se estructuraron y cualquier supuesto aplicado.',
              },
              groupName: {
                type: Type.STRING,
                description: 'Nombre del colegio, institución o grupo educativo.',
              },
              requesterName: {
                type: Type.STRING,
                description: 'Nombre del contacto o coordinador solicitante.',
              },
              requesterEmail: {
                type: Type.STRING,
                description: 'Correo electrónico del solicitante si aparece, o sugerido.',
              },
              city: {
                type: Type.STRING,
                description: 'Ciudad o ciudades destino (ej. Londres y Oxford).',
              },
              country: {
                type: Type.STRING,
                description: 'País destino (ej. Reino Unido, Estados Unidos, Canadá).',
              },
              programType: {
                type: Type.STRING,
                description:
                  'Uno de: Inmersión Académica, Campamento de Verano, Curso de Idiomas, Tour Cultural y Universitario, STEM & Robótica, Liderazgo Internacional.',
              },
              departureDate: {
                type: Type.STRING,
                description: 'Fecha de salida en formato YYYY-MM-DD.',
              },
              returnDate: {
                type: Type.STRING,
                description: 'Fecha de regreso en formato YYYY-MM-DD.',
              },
              proposalDueDate: {
                type: Type.STRING,
                description: 'Fecha límite de entrega o vigencia en formato YYYY-MM-DD.',
              },
              participants: {
                type: Type.INTEGER,
                description: 'Cantidad de alumnos pagantes base.',
              },
              chaperones: {
                type: Type.INTEGER,
                description: 'Cantidad total de chaperones o profesores acompañantes.',
              },
              days: {
                type: Type.INTEGER,
                description: 'Duración total del viaje en días.',
              },
              nights: {
                type: Type.INTEGER,
                description: 'Duración total del viaje en noches.',
              },
              currencyCode: {
                type: Type.STRING,
                description: 'Código de moneda: USD, GBP, CAD, EUR o MXN.',
              },
              exchangeRate: {
                type: Type.NUMBER,
                description: 'Tipo de cambio a MXN.',
              },
              specialRequirements: {
                type: Type.STRING,
                description: 'Observaciones, notas operativas o requerimientos especiales detectados.',
              },
              schoolOrProvider: {
                type: Type.STRING,
                description: 'Nombre del operador DMC, campus o escuela receptora.',
              },
              accommodationType: {
                type: Type.STRING,
                description: 'Tipo de alojamiento (Residencia estudiantil, Hotel, Homestay, etc.).',
              },
              flightsIncluded: {
                type: Type.BOOLEAN,
                description: 'True si la cotización contempla boleto de avión.',
              },
              flightDetails: {
                type: Type.STRING,
                description: 'Detalle de vuelos o ruta aérea si se menciona.',
              },
              includedServices: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Lista de servicios incluidos en la cotización.',
              },
              excludedServices: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Lista de servicios no incluidos.',
              },
              itineraryDays: {
                type: Type.ARRAY,
                description: 'Días de itinerario detectados o estructurados.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    dayNumber: { type: Type.INTEGER },
                    title: { type: Type.STRING },
                    location: { type: Type.STRING },
                    morningActivity: { type: Type.STRING },
                    afternoonActivity: { type: Type.STRING },
                    eveningActivity: { type: Type.STRING },
                    mealsIncluded: { type: Type.STRING },
                    accommodation: { type: Type.STRING },
                  },
                  required: ['dayNumber', 'title', 'location'],
                },
              },
              scenarios: {
                type: Type.ARRAY,
                description: 'Lista de opciones o escenarios financieros extraídos del Excel.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    optionTitle: {
                      type: Type.STRING,
                      description: 'Ej. OPCIÓN 1, OPCIÓN 2',
                    },
                    programTitle: {
                      type: Type.STRING,
                      description: 'Título del programa en este escenario.',
                    },
                    destinationSubtitle: {
                      type: Type.STRING,
                      description: 'Subtítulo de sede o destino.',
                    },
                    currencyCode: {
                      type: Type.STRING,
                      description: 'USD, GBP, CAD, EUR o MXN.',
                    },
                    exchangeRate: {
                      type: Type.NUMBER,
                    },
                    participants: {
                      type: Type.INTEGER,
                    },
                    days: {
                      type: Type.INTEGER,
                    },
                    chaperonesEscuela: {
                      type: Type.INTEGER,
                    },
                    chaperonesEE: {
                      type: Type.INTEGER,
                    },
                    emergencyFund: {
                      type: Type.NUMBER,
                    },
                    dailyExpenseRate: {
                      type: Type.NUMBER,
                    },
                    leaderCompensation: {
                      type: Type.NUMBER,
                    },
                    pricingInputMode: {
                      type: Type.STRING,
                      description: 'percent o final_price',
                    },
                    commissionPercent: {
                      type: Type.NUMBER,
                      description: 'Porcentaje de utilidad / comisión EE (ej. 18.6).',
                    },
                    manualFinalPrice: {
                      type: Type.NUMBER,
                      description: 'Precio final por participante en divisa base.',
                    },
                    freePlaceRatio: {
                      type: Type.INTEGER,
                      description: 'Ratio de lugares libres (ej. 10 para 1:10).',
                    },
                    installmentsCount: {
                      type: Type.INTEGER,
                      description: 'Número de pagos sugeridos (1 a 15).',
                    },
                    conceptos: {
                      type: Type.ARRAY,
                      description: 'Rubros de costo por alumno (Bloque Izquierdo de Sábana EE).',
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          label: { type: Type.STRING },
                          amount: { type: Type.NUMBER },
                          note: { type: Type.STRING },
                        },
                        required: ['label', 'amount'],
                      },
                    },
                    chaperoneRubros: {
                      type: Type.ARRAY,
                      description: 'Rubros de costo por chaperón (Bloque Derecho de Sábana EE).',
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          label: { type: Type.STRING },
                          amount: { type: Type.NUMBER },
                          note: { type: Type.STRING },
                        },
                        required: ['label', 'amount'],
                      },
                    },
                  },
                  required: [
                    'optionTitle',
                    'programTitle',
                    'currencyCode',
                    'exchangeRate',
                    'participants',
                    'days',
                    'conceptos',
                  ],
                },
              },
            },
            required: [
              'aiAnalysisSummary',
              'groupName',
              'city',
              'country',
              'programType',
              'participants',
              'days',
              'currencyCode',
              'exchangeRate',
              'scenarios',
            ],
          },
        },
      });

      const rawJson = response.text;
      if (!rawJson) {
        res.status(502).json({
          error: 'El modelo de IA no devolvió una respuesta estructurada válida.',
        });
        return;
      }

      const parsedQuote = JSON.parse(rawJson.trim());
      res.json({
        success: true,
        extracted: parsedQuote,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error al procesar la cotización con IA.';
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

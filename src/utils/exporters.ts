import { ProposalDocument, TravelRequest } from '../types/domain';
import { calculateScenarioFinancials } from '../engine/financialEngine';

export function formatMoney(amount: number, currency: string = 'MXN'): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function exportToExcelCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escapeCell = (cell: string | number) => {
    const str = String(cell ?? '').replace(/"/g, '""');
    return `"${str}"`;
  };
  const csvContent =
    '\uFEFF' + // UTF-8 BOM for Microsoft Excel compatibility with Spanish characters
    [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportScenarioComparisonExcel(request: TravelRequest): void {
  const headers = [
    'Folio',
    'Grupo',
    'Escenario',
    'Versión',
    'Participantes',
    'Chaperones',
    'Días',
    'Moneda Venta',
    'Costo Total',
    'Costo por Participante',
    'Precio Venta por Participante',
    'Precio Total Grupo',
    'Utilidad Estimada',
    'Margen (%)',
    'Presupuesto por Participante',
    'Variación vs Presupuesto',
    'Estado Aprobación',
  ];

  const rows = request.scenarios.map((sc) => {
    const calc = calculateScenarioFinancials(
      sc,
      request.estimatedBudgetPerPerson,
      request.budgetCurrency
    );
    return [
      request.folio,
      request.groupName,
      sc.name,
      `v${sc.currentVersion}`,
      sc.participants,
      sc.chaperones,
      sc.days,
      sc.saleCurrency,
      calc.totalScenarioCost,
      calc.costPerParticipant,
      calc.sellingPricePerParticipant,
      calc.totalGroupSellingPrice,
      calc.estimatedProfit,
      `${calc.estimatedMarginPercent}%`,
      calc.budgetTargetPerParticipant,
      calc.budgetVariancePerParticipant,
      sc.approvalStatus,
    ];
  });

  exportToExcelCSV(`Comparativo_${request.folio}.csv`, headers, rows);
}

/**
 * Generates a clean HTML document suitable for PDF download / print preview,
 * strictly enforcing the separation between client commercial proposals and internal cost sheets.
 */
export function buildProposalPrintableHTML(doc: ProposalDocument): string {
  const snap = doc.immutableSnapshot;
  const isCommercial = doc.type === 'comercial_cliente';

  const scenariosHTML = snap.scenarios
    .map((sc) => {
      const internalSection =
        !isCommercial && sc.internalBreakdown
          ? `
        <div style="margin-top: 12px; padding: 12px; background: #F8FAFC; border: 1px solid #CBD5E1; font-size: 12px;">
          <strong>Desglose Financiero Interno (Confidencial EE — Fórmula ${sc.internalBreakdown.formulaVersion}):</strong>
          <table style="width:100%; margin-top:8px; border-collapse: collapse;">
            <tr>
              <td>Costo directo base:</td>
              <td style="text-align:right; font-family: monospace;">${formatMoney(sc.internalBreakdown.totalDirectCost, sc.saleCurrency)}</td>
              <td>Comisiones totales:</td>
              <td style="text-align:right; font-family: monospace;">${formatMoney(sc.internalBreakdown.totalCommissions, sc.saleCurrency)}</td>
            </tr>
            <tr>
              <td>Costo total escenario:</td>
              <td style="text-align:right; font-family: monospace;">${formatMoney(sc.internalBreakdown.totalScenarioCost, sc.saleCurrency)}</td>
              <td>Utilidad estimada:</td>
              <td style="text-align:right; font-family: monospace;">${formatMoney(sc.internalBreakdown.estimatedProfit, sc.saleCurrency)}</td>
            </tr>
            <tr>
              <td>Costo por participante:</td>
              <td style="text-align:right; font-family: monospace;">${formatMoney(sc.internalBreakdown.costPerParticipant, sc.saleCurrency)}</td>
              <td>Margen estimado:</td>
              <td style="text-align:right; font-family: monospace;">${sc.internalBreakdown.estimatedMarginPercent.toFixed(2)}%</td>
            </tr>
          </table>
        </div>`
          : '';

      const paymentScheduleHTML =
        sc.paymentSchedule && sc.paymentSchedule.length > 0
          ? `
        <div style="margin-top: 14px; border-top: 1px solid #E2E8F0; padding-top: 10px;">
          <strong style="font-size: 12px; color: #0B3B70;">Calendario y Plan de Pagos por Participante (${sc.paymentSchedule.some((p) => p.number === 0) ? `Inscripción + ${sc.paymentSchedule.filter((p) => p.number > 0).length} Pagos` : `${sc.paymentSchedule.length} Pagos`}):</strong>
          <table style="width:100%; margin-top:6px; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background:#F1F5F9; color:#334155; text-align:left;">
                <th style="padding:5px 8px; border-bottom:1px solid #CBD5E1;">Concepto / Parcialidad</th>
                <th style="padding:5px 8px; border-bottom:1px solid #CBD5E1;">Fecha Límite</th>
                <th style="padding:5px 8px; border-bottom:1px solid #CBD5E1; text-align:right;">%</th>
                <th style="padding:5px 8px; border-bottom:1px solid #CBD5E1; text-align:right;">Importe (${sc.currencyCode || sc.saleCurrency})</th>
                <th style="padding:5px 8px; border-bottom:1px solid #CBD5E1; text-align:right;">Estimado (MXN)</th>
              </tr>
            </thead>
            <tbody>
              ${sc.paymentSchedule
                .map(
                  (inst) => `
                <tr style="border-bottom: 1px solid #E2E8F0; ${inst.number === 0 ? 'background:#EFF6FF; font-weight:600;' : ''}">
                  <td style="padding:5px 8px;">${inst.label}</td>
                  <td style="padding:5px 8px; font-family: monospace;">${inst.dueDate}</td>
                  <td style="padding:5px 8px; text-align:right; font-family: monospace;">${inst.percentOfTotal.toFixed(1)}%</td>
                  <td style="padding:5px 8px; text-align:right; font-family: monospace;">${formatMoney(inst.amountInCurrency, sc.currencyCode || sc.saleCurrency)}</td>
                  <td style="padding:5px 8px; text-align:right; font-family: monospace;">${formatMoney(inst.amountInMXN, 'MXN')}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>`
          : '';

      const volumeTiersHTML =
        sc.volumeTiers && sc.volumeTiers.length > 0
          ? `
        <div style="margin-top: 14px; border-top: 1px solid #E2E8F0; padding-top: 10px;">
          <strong style="font-size: 12px; color: #0B3B70;">Cotización Escalonada por Rangos de Aforo (Tabla de Precios por Volumen de Alumnos):</strong>
          <table style="width:100%; margin-top:6px; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background:#F1F5F9; color:#334155; text-align:left;">
                <th style="padding:5px 8px; border-bottom:1px solid #CBD5E1;">Rango de Alumnos Pagantes</th>
                <th style="padding:5px 8px; border-bottom:1px solid #CBD5E1; text-align:center;">Gratuidades / Chaperones</th>
                <th style="padding:5px 8px; border-bottom:1px solid #CBD5E1; text-align:right;">Precio por Alumno (${sc.currencyCode || sc.saleCurrency})</th>
                <th style="padding:5px 8px; border-bottom:1px solid #CBD5E1; text-align:right;">Estimado por Alumno (MXN)</th>
              </tr>
            </thead>
            <tbody>
              ${sc.volumeTiers
                .map(
                  (t) => `
                <tr style="border-bottom: 1px solid #E2E8F0; ${t.participants === sc.participants ? 'background:#ECFDF5; font-weight:600;' : ''}">
                  <td style="padding:5px 8px;">${t.tierLabel} ${t.participants === sc.participants ? '(Aforo Base)' : ''}</td>
                  <td style="padding:5px 8px; text-align:center; font-family: monospace;">${t.chaperones} chap. (${t.earnedFreePlaces} free place)</td>
                  <td style="padding:5px 8px; text-align:right; font-family: monospace;">${formatMoney(t.sellingPriceInCurrency, sc.currencyCode || sc.saleCurrency)}</td>
                  <td style="padding:5px 8px; text-align:right; font-family: monospace;">${formatMoney(t.sellingPriceInMXN, 'MXN')}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>`
          : '';

      return `
      <div style="border: 1px solid #E2E8F0; padding: 16px; margin-bottom: 16px; border-radius: 6px;">
        <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom: 1px solid #E2E8F0; padding-bottom: 8px; margin-bottom: 12px;">
          <h3 style="margin:0; color:#0B3B70; font-size: 16px;">${sc.scenarioName} (v${sc.versionNumber})</h3>
          <span style="font-size:13px; color:#475569;">${sc.participants} participantes · ${sc.chaperones} chaperones · ${sc.days} días / ${sc.nights} noches</span>
        </div>
        <div style="display:flex; justify-content:space-between; background:#EFF6FF; padding: 12px 16px; border-radius:4px; margin-bottom:12px;">
          <div>
            <div style="font-size:11px; color:#1E40AF;">PRECIO POR PARTICIPANTE</div>
            <div style="font-size:20px; font-weight:700; color:#0B3B70; font-family: monospace;">${formatMoney(sc.sellingPricePerParticipant, sc.saleCurrency)} ${sc.saleCurrency}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px; color:#1E40AF;">INVERSIÓN TOTAL DEL GRUPO (${sc.participants} ALUMNOS)</div>
            <div style="font-size:18px; font-weight:600; color:#0F172A; font-family: monospace;">${formatMoney(sc.totalGroupSellingPrice, sc.saleCurrency)} ${sc.saleCurrency}</div>
          </div>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 12px;">
          <div>
            <strong style="color:#0F172A;">Servicios Incluidos:</strong>
            <ul style="margin: 6px 0 0 16px; padding:0; color:#334155;">
              ${sc.includedServices.map((s) => `<li style="margin-bottom:4px;">${s}</li>`).join('')}
            </ul>
          </div>
          <div>
            <strong style="color:#0F172A;">Servicios No Incluidos:</strong>
            <ul style="margin: 6px 0 0 16px; padding:0; color:#475569;">
              ${sc.excludedServices.map((s) => `<li style="margin-bottom:4px;">${s}</li>`).join('')}
            </ul>
          </div>
        </div>
        ${volumeTiersHTML}
        ${paymentScheduleHTML}
        ${internalSection}
      </div>`;
    })
    .join('');

  const itinerarySectionHTML =
    snap.itineraryDays && snap.itineraryDays.length > 0
      ? `
  <div class="section-title">Itinerario Académico y Cultural Día por Día (${snap.itineraryDays.length} Días)</div>
  <table style="width:100%; border-collapse: collapse; font-size: 11px; margin-bottom: 18px; border: 1px solid #E2E8F0;">
    <thead>
      <tr style="background:#0B3B70; color:#FFFFFF; text-align:left;">
        <th style="padding:6px 8px; width:65px;">Día</th>
        <th style="padding:6px 8px; width:22%;">Título / Sede</th>
        <th style="padding:6px 8px;">Mañana (Académico)</th>
        <th style="padding:6px 8px;">Tarde (Cultural / Visitas)</th>
        <th style="padding:6px 8px;">Noche / Alojamiento</th>
      </tr>
    </thead>
    <tbody>
      ${snap.itineraryDays
        .map(
          (d, idx) => `
        <tr style="border-bottom: 1px solid #E2E8F0; ${idx % 2 === 1 ? 'background:#F8FAFC;' : ''}">
          <td style="padding:6px 8px; font-family: monospace; font-weight:700; color:#0B3B70;">Día ${d.dayNumber}</td>
          <td style="padding:6px 8px;"><strong>${d.title}</strong><br/><span style="color:#64748B;">${d.location}</span></td>
          <td style="padding:6px 8px; color:#334155;">${d.morningActivity}</td>
          <td style="padding:6px 8px; color:#334155;">${d.afternoonActivity}</td>
          <td style="padding:6px 8px; color:#475569;">${d.eveningActivity}<br/><em style="font-size:10px; color:#0B3B70;">${d.mealsIncluded} · ${d.accommodation}</em></td>
        </tr>`
        )
        .join('')}
    </tbody>
  </table>`
      : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${isCommercial ? 'Propuesta Comercial' : 'Dictamen Interno de Costos'} - ${snap.folio}</title>
  <style>
    body { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; color: #0F172A; margin: 32px; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0B3B70; padding-bottom: 16px; margin-bottom: 24px; }
    .brand { font-size: 22px; font-weight: 700; color: #0B3B70; letter-spacing: -0.02em; }
    .meta { text-align: right; font-size: 12px; color: #475569; }
    .section-title { font-size: 14px; font-weight: 700; color: #0B3B70; margin: 20px 0 8px 0; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px; }
    .terms-box { background: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px 16px; border-radius: 6px; font-size: 12px; color: #334155; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Estudiantes Embajadores</div>
      <div style="font-size: 13px; color: #475569; margin-top: 4px;">
        ${isCommercial ? 'Propuesta Comercial de Viaje Educativo Grupal' : 'USO INTERNO EXCLUSIVO — Hoja de Costos y Rentabilidad'}
      </div>
    </div>
    <div class="meta">
      <div><strong>Folio:</strong> ${snap.folio} · <strong>Versión:</strong> v${doc.versionNumber}</div>
      <div><strong>Fecha de emisión:</strong> ${new Date(doc.generatedAt).toLocaleDateString('es-MX')}</div>
      <div><strong>Vigencia de propuesta:</strong> ${doc.validityDate}</div>
    </div>
  </div>

  <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 12px; background:#F8FAFC; padding:14px; border:1px solid #E2E8F0; border-radius:6px; font-size:13px; margin-bottom:20px;">
    <div><span style="color:#64748B; display:block; font-size:11px;">GRUPO / INSTITUCIÓN</span><strong>${snap.groupName}</strong></div>
    <div><span style="color:#64748B; display:block; font-size:11px;">DESTINO</span><strong>${snap.destination}</strong></div>
    <div><span style="color:#64748B; display:block; font-size:11px;">FECHAS ESTIMADAS</span><strong>${snap.dates}</strong></div>
  </div>

  <div class="section-title">Escenarios Económicos Presentados</div>
  ${scenariosHTML}

  ${itinerarySectionHTML}

  <div class="terms-box">
    <p style="margin:0 0 8px 0;"><strong>Condiciones de Pago:</strong> ${doc.paymentTerms}</p>
    <p style="margin:0 0 8px 0;"><strong>Condiciones Comerciales:</strong> ${doc.commercialConditions}</p>
    ${doc.notes ? `<p style="margin:0;"><strong>Notas:</strong> ${doc.notes}</p>` : ''}
  </div>
</body>
</html>`;
}

export function downloadProposalHTMLAsDocument(doc: ProposalDocument): void {
  const html = buildProposalPrintableHTML(doc);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const prefix = doc.type === 'comercial_cliente' ? 'Propuesta_Comercial' : 'Costeo_Interno';
  link.href = url;
  link.setAttribute('download', `${prefix}_${doc.folio}_v${doc.versionNumber}.html`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

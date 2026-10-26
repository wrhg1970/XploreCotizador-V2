import React from 'react';
import {
  LogIn,
  ArrowRight,
  Calculator,
  Columns3,
  ShieldCheck,
  FileCheck2,
  Building2,
} from 'lucide-react';

interface LandingPageProps {
  onLoginWithGoogle: () => void;
  onEnterDemoWorkspace: () => void;
  isSignedIn: boolean;
  userEmail?: string | null;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onLoginWithGoogle,
  onEnterDemoWorkspace,
  isSignedIn,
  userEmail,
}) => {
  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      {/* Top Bar Contract: Zone 1 (Wordmark) — Zone 2 (4 Concise Nav Links) — Zone 3 (1 Primary Action) */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-30">
        <a
          href="#inicio"
          className="text-lg font-bold tracking-tight text-[#0B3B70] whitespace-nowrap shrink-0"
        >
          Xplore Together
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a
            href="#proceso"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Proceso
          </a>
          <a
            href="#hoja-oficial"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Hoja Oficial EE
          </a>
          <a
            href="#comparador-columnas"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Comparador
          </a>
          <a
            href="#gobernanza"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Seguridad
          </a>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onEnterDemoWorkspace}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0B3B70] rounded-lg hover:bg-[#082d56] transition-colors whitespace-nowrap shrink-0"
          >
            {isSignedIn ? 'Ir al Panel Operativo' : 'Iniciar Sesión'}
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section
        id="inicio"
        className="max-w-[1440px] mx-auto w-full px-6 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch"
      >
        {/* Left Column: Value Proposition & Login Actions */}
        <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            <div className="text-xs font-semibold text-[#0B3B70] tracking-tight">
              Estudiantes Embajadores · Plataforma Central de Viajes Grupales
            </div>

            <h1
              className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight leading-[1.12]"
              style={{ textWrap: 'balance' }}
            >
              Cotización financiera, comparación en columnas y propuestas listas para enviar.
            </h1>

            <p className="text-base text-slate-600 leading-relaxed max-w-xl">
              Sustituye hojas de cálculo aisladas por un expediente único auditado. Captura solicitudes por oficina, calcula escenarios con la estructura oficial de rubros de Estudiantes Embajadores, compara opciones en columnas verticales y genera propuestas comerciales sin exponer costos internos.
            </p>
          </div>

          {/* Login & Access Box */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Acceso a la Plataforma Xplore Together
                </h2>
                <p className="text-xs text-slate-500">
                  Autenticación institucional Google OAuth y entorno demostrativo preconfigurado
                </p>
              </div>
              <Building2 className="w-5 h-5 text-[#0B3B70] shrink-0" />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={onLoginWithGoogle}
                className="flex-1 px-4 py-3 text-xs font-semibold text-white bg-[#0B3B70] rounded-lg hover:bg-[#082d56] transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <LogIn className="w-4 h-4" />
                {isSignedIn
                  ? `Continuar como ${userEmail}`
                  : 'Iniciar Sesión con Google (OAuth)'}
              </button>

              <button
                type="button"
                onClick={onEnterDemoWorkspace}
                className="flex-1 px-4 py-3 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <span>Ingresar al Entorno Operativo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
              <span>Oficinas activas: CDMX · Monterrey · Guadalajara · Puebla · Querétaro</span>
              <span>·</span>
              <span>preparado para XploreTogether, WeTravel y Wissify</span>
            </div>
          </div>
        </div>

        {/* Right Column: Live Interactive Preview of the Official EE Quotation Sheet */}
        <div
          id="hoja-oficial"
          className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between"
        >
          <div>
            <div className="bg-[#0B3B70] text-white px-5 py-3.5 flex items-center justify-between">
              <div>
                <div className="text-xs text-blue-200 font-mono">
                  ESTRUCTURA OFICIAL DE RUBROS EE
                </div>
                <div className="text-sm font-bold">
                  OPCIÓN 1 — Verano Grupal UK · Sol Camps Londres y Oxford
                </div>
              </div>
              <div className="text-right font-mono text-xs">
                <div>Divisa: Libras (26.50)</div>
                <div className="text-blue-200">20 Participantes · 21 Días</div>
              </div>
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Left Mini-Table: Conceptos */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-[#134E6F] text-white px-3 py-2 font-semibold flex justify-between">
                  <span>Concepto (Por Alumno)</span>
                  <span>Cantidad</span>
                </div>
                <div className="divide-y divide-slate-100 font-mono tabular-nums">
                  <div className="px-3 py-1.5 flex justify-between">
                    <span className="font-sans text-slate-700">Precio Neto</span>
                    <span>$3,750.00</span>
                  </div>
                  <div className="px-3 py-1.5 flex justify-between">
                    <span className="font-sans text-slate-700">Kit EE + Seguro MSI</span>
                    <span>$150.00</span>
                  </div>
                  <div className="px-3 py-1.5 flex justify-between">
                    <span className="font-sans text-slate-700">Promoción + Envíos + Op.</span>
                    <span>$75.00</span>
                  </div>
                  <div className="px-3 py-1.5 flex justify-between">
                    <span className="font-sans text-slate-700">Otros gastos (avión)</span>
                    <span>$100.00</span>
                  </div>
                  <div className="px-3 py-1.5 flex justify-between">
                    <span className="font-sans text-slate-700">Comisión Coordinadora</span>
                    <span>$120.00</span>
                  </div>
                  <div className="px-3 py-1.5 flex justify-between bg-slate-200/80 font-bold text-slate-900">
                    <span className="font-sans">SubTotal 1</span>
                    <span>$4,195.00</span>
                  </div>
                  <div className="px-3 py-1.5 flex justify-between text-slate-700">
                    <span className="font-sans">Gastos del líder ($2,950 / 20)</span>
                    <span>$147.50</span>
                  </div>
                  <div className="px-3 py-1.5 flex justify-between bg-slate-200/80 font-bold text-slate-900">
                    <span className="font-sans">SubTotal 2</span>
                    <span>$4,342.50</span>
                  </div>
                  <div className="px-3 py-1.5 flex justify-between text-slate-700">
                    <span className="font-sans">% Comisión (18.60%)</span>
                    <span>$807.50</span>
                  </div>
                  <div className="px-3 py-2 flex justify-between bg-sky-100 font-bold text-[#0B3B70]">
                    <span className="font-sans">PRECIO FINAL (GBP)</span>
                    <span>$5,150.00</span>
                  </div>
                  <div className="px-3 py-2 flex justify-between bg-[#134E6F] text-white font-bold">
                    <span className="font-sans">Estimado en pesos</span>
                    <span>$136,475.00</span>
                  </div>
                </div>
              </div>

              {/* Right Mini-Table: Chaperones */}
              <div className="flex flex-col justify-between space-y-3">
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-[#134E6F] text-white px-3 py-2 font-semibold flex justify-between">
                    <span>Gastos de Chaperones</span>
                    <span>Escuela: 0 | EE: 2</span>
                  </div>
                  <div className="divide-y divide-slate-100 font-mono tabular-nums">
                    <div className="px-3 py-1.5 flex justify-between">
                      <span className="font-sans text-slate-700">Fondo de Emergencia</span>
                      <span>$150.00</span>
                    </div>
                    <div className="px-3 py-1.5 flex justify-between">
                      <span className="font-sans text-slate-700">Gastos por día ($25)</span>
                      <span>$675.00</span>
                    </div>
                    <div className="px-3 py-1.5 flex justify-between">
                      <span className="font-sans text-slate-700">Gastos del Viaje</span>
                      <span>$1,000.00</span>
                    </div>
                    <div className="px-3 py-1.5 flex justify-between">
                      <span className="font-sans text-slate-700">Seguro + Kit</span>
                      <span>$300.00</span>
                    </div>
                    <div className="px-3 py-1.5 flex justify-between">
                      <span className="font-sans text-slate-700">Chaperon Extra</span>
                      <span>$1,500.00</span>
                    </div>
                    <div className="px-3 py-1.5 flex justify-between bg-slate-600 text-white font-semibold">
                      <span className="font-sans">SubTotal Chaperones</span>
                      <span>$2,800.00</span>
                    </div>
                    <div className="px-3 py-2 flex justify-between bg-slate-900 text-white font-bold">
                      <span className="font-sans">Total Chaperones</span>
                      <span>$2,950.00</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                  <strong className="text-slate-900 block mb-0.5">
                    Rubros dinámicos integrables:
                  </strong>
                  El Administrador puede agregar nuevos rubros tanto a la tabla de Conceptos como a la de Gastos de Chaperones sin alterar el código.
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
            <span className="text-slate-600">
              Caso precargado listo para probar en el expediente <strong>EE-2026-103</strong>
            </span>
            <button
              onClick={onEnterDemoWorkspace}
              className="font-semibold text-[#0B3B70] hover:underline"
            >
              Abrir en el Cotizador →
            </button>
          </div>
        </div>
      </section>

      {/* 4-Stage Process Section */}
      <section
        id="proceso"
        className="max-w-[1440px] mx-auto w-full px-6 py-10 border-t border-slate-200"
      >
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Cómo funciona el ciclo completo en Xplore Together
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Cuatro etapas conectadas desde la solicitud comercial hasta la propuesta aprobada y sincronizada
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-mono text-[#0B3B70]">
                01. SOLICITUD Y EXPEDIENTE
              </span>
              <FileCheck2 className="w-4 h-4 text-[#0B3B70]" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Registro por oficina y especificaciones
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Genera un folio único automático, asigna oficina (CDMX, MTY, GDL, PUE, QRO), valida fechas de viaje y captura servicios incluidos, excluidos y campos configurables.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-mono text-[#0B3B70]">
                02. HOJA OFICIAL EE
              </span>
              <Calculator className="w-4 h-4 text-[#0B3B70]" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Rubros EE y cálculo bidireccional
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Calcula automáticamente SubTotal 1, prorrateo de Gastos del Líder desde el bloque de Chaperones, SubTotal 2 y permite editar indistintamente el % Comisión o el Precio Final.
            </p>
          </div>

          <div
            id="comparador-columnas"
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-mono text-[#0B3B70]">
                03. COMPARADOR EN COLUMNAS
              </span>
              <Columns3 className="w-4 h-4 text-[#0B3B70]" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Opciones alineadas verticalmente
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Visualiza Opción 1 (20 alumnos), Opción 2 (25 alumnos) y Opción 3 (30 alumnos) en columnas paralelas con todos sus rubros de Conceptos y Chaperones alineados fila por fila.
            </p>
          </div>

          <div
            id="gobernanza"
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-mono text-[#0B3B70]">
                04. APROBACIÓN Y PROPUESTA PDF
              </span>
              <ShieldCheck className="w-4 h-4 text-[#0B3B70]" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Control de envíos y documentos limpios
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Exige aprobaciones vigentes antes de enviar, invalida firmas si cambia un costo material y genera el PDF Comercial ocultando comisiones y costos confidenciales al cliente.
            </p>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="mt-auto bg-white border-t border-slate-200 px-6 py-5">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            <strong className="text-slate-800">Xplore Together</strong> · Estudiantes Embajadores México · Sistema Central de Cotizaciones y Propuestas
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={onEnterDemoWorkspace}
              className="text-[#0B3B70] font-semibold hover:underline"
            >
              Ingresar al Sistema →
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

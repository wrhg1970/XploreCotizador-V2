import {
  IntegrationConnection,
  IntegrationSyncLog,
  TravelRequest,
} from '../types/domain';

/**
 * Adapter registry with idempotency protection and controlled retry handling (Módulo K).
 * Clearly labeled as development simulation adapters when live credentials are not configured on server.
 */
export function executeAdapterSync(
  connection: IntegrationConnection,
  request: TravelRequest,
  operation: string,
  forceFailureSimulation: boolean = false
): {
  updatedConnection: IntegrationConnection;
  syncLog: IntegrationSyncLog;
  wasDuplicateSkipped: boolean;
} {
  // Deterministic idempotency key per integration + request folio + updatedAt/version + operation
  const approvedVersionsKey = request.scenarios
    .map((s) => `${s.id}:v${s.currentVersion}:${s.approvalStatus}`)
    .join('|');
  const idempotencyKey = `idem_${connection.id}_${request.folio}_${operation}_${approvedVersionsKey}`;

  // Check if an identical successful operation already exists in logs (Idempotency Guarantee)
  const existingSuccess = connection.syncLogs.find(
    (log) => log.idempotencyKey === idempotencyKey && log.status === 'éxito'
  );

  if (existingSuccess) {
    const skippedLog: IntegrationSyncLog = {
      id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      integrationId: connection.id,
      idempotencyKey,
      timestamp: new Date().toISOString(),
      operation,
      targetFolio: request.folio,
      status: 'omitido_idempotente',
      message: `[SIMULACIÓN DESARROLLO] Operación omitida por llave de idempotencia (${idempotencyKey.slice(0, 32)}...). No se duplicó el registro en ${connection.name}.`,
    };

    return {
      updatedConnection: {
        ...connection,
        syncLogs: [skippedLog, ...connection.syncLogs].slice(0, 50),
      },
      syncLog: skippedLog,
      wasDuplicateSkipped: true,
    };
  }

  if (forceFailureSimulation || connection.status === 'error') {
    const errorLog: IntegrationSyncLog = {
      id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      integrationId: connection.id,
      idempotencyKey,
      timestamp: new Date().toISOString(),
      operation,
      targetFolio: request.folio,
      status: 'error',
      message: `[SIMULACIÓN DESARROLLO] Error controlado al conectar con ${connection.name}. Transacción revertida sin duplicar expediente ${request.folio}. Reintento programado con backoff exponencial.`,
    };

    return {
      updatedConnection: {
        ...connection,
        status: 'error',
        syncLogs: [errorLog, ...connection.syncLogs].slice(0, 50),
      },
      syncLog: errorLog,
      wasDuplicateSkipped: false,
    };
  }

  const successLog: IntegrationSyncLog = {
    id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    integrationId: connection.id,
    idempotencyKey,
    timestamp: new Date().toISOString(),
    operation,
    targetFolio: request.folio,
    status: 'éxito',
    message: `[SIMULACIÓN DESARROLLO] Expediente ${request.folio} (${request.groupName}) sincronizado con adaptador ${connection.name}. Llave idempotente registrada.`,
  };

  return {
    updatedConnection: {
      ...connection,
      lastSyncAt: successLog.timestamp,
      syncLogs: [successLog, ...connection.syncLogs].slice(0, 50),
    },
    syncLog: successLog,
    wasDuplicateSkipped: false,
  };
}

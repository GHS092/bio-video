export interface SignoRadiologico {
  nombre: string;
  descripcion: string;
}

export interface SignoAusente {
  nombre: string;
  esperadoEn: string;
  explicacion: string;
}

export interface BanderaRoja {
  nombre: string;
  descripcion: string;
}

export interface DiagnosticoDiferencial {
  diagnostico: string;
  justificacion: string;
  criterioXAI: string;
}

export interface SignoIndirecto {
  signoKey: string;
  status: "Presente" | "Ausente" | "Indeterminado";
  valoracionFisica: string;
  importanciaClinica: string;
}

export interface DensidadHounsfield {
  organoDiana: string;
  organoReferencia: string;
  densidadDianaHU: number;
  densidadReferenciaHU: number;
  gradienteHU: number;
  interpretacionClinica: string;
}

export interface AuditoriaRedTeam {
  microHallazgosOcultos: string;
  criticaVolumetrica: string;
  sesgoFalsaSeguridad: string;
  sesgoSobrePatologizacion: string;
  consensoFinal: string;
}

export interface PlanAbordaje {
  laboratoriosUrgentisimos: string[];
  estudiosComplementarios: string[];
}

export interface TratamientoManejo {
  estabilizacionInicial: string[];
  fasePosterior: string[];
}

export interface DebateDialogueEntry {
  role: "Médico Adscrito" | "Abogado del Diablo" | "Anatomista Experto" | "Asesor de Triaje";
  text: string;
  literatureRef: string;
}

export interface ExpandedClinicalDebate {
  medicoAdscritoArgumento: string;
  abogadoDiabloContrapeso: string;
  anatomistaOracle?: string;
  triageSpecialist?: string;
  debateDialogue?: DebateDialogueEntry[];
  consensoAcuerdo: string;
}

export interface SpatialScanningFrame {
  timestampOrFrame: string;
  coordinatesGrid: string;
  organEstructuralBed: string;
  densityOrEchogenecity: string;
  contourSignificance: string;
  ocrLabelDetected?: string;
}

export interface FirmaFisica {
  tejidoControl: string;
  intensidadT1uHU: string;
  intensidadT2oSonico: string;
  comportamientoFisico: string;
  correlacionHistomorfologica: string;
}

export interface CapaPipeline {
  capa: string;
  agenteAsociado: string;
  accionesEjecutadas: string;
  cuestionamientoSesgo: string;
}

export interface HistogramaCalibracion {
  falsoFaroBrillante: string;
  falsoFaroOscuro: string;
  umbralCalibracionDiferencial: string;
}

export interface ConsistenciaMultimodal {
  estudioTC?: string;
  estudioRM?: string;
  analisisDiscrepanciaOjoDeAguila: string;
  consensoSistemicoEficaz: string;
}

export interface Report {
  detectedModality?: string;
  detectedAnatomy?: string;
  technicalQualityEvaluation?: string;
  faseContrasteDetectada?: string;
  sensibilidadOrganoDiana?: string;
  analisisContinuidadTemporal?: string;
  contextoBayesianoAplicado?: string;
  matrizFirmasFisicas?: FirmaFisica[];
  capasAnalisisPipeline?: CapaPipeline[];
  mapeoHistogramasCalibracion?: HistogramaCalibracion;
  consistenciaMultimodal?: ConsistenciaMultimodal;
  findingSummary: string;
  urgencia: "Inmediata" | "Urgente" | "Prioritaria" | "Controlada";
  prioridadAccionCero: string;
  integracionSistematica: string;
  hallazgosCriticos: string[];
  hallazgosRelevantes: string[];
  hallazgosNoSignificativos: string[];
  microAnatomia: string;
  morfometria: string;
  spatialScanningMap?: SpatialScanningFrame[];
  signosRadiologicos: SignoRadiologico[];
  signosAusentes: SignoAusente[];
  banderasRojas: BanderaRoja[];
  rastreoSignosIndirectos?: SignoIndirecto[];
  matrizDensidadHounsfield?: DensidadHounsfield[];
  diagnosticosDiferenciales: {
    alta: DiagnosticoDiferencial;
    media: DiagnosticoDiferencial;
    baja: DiagnosticoDiferencial;
  };
  auditoriaRedTeam: AuditoriaRedTeam;
  clinicalDebate?: ExpandedClinicalDebate;
  planAbordaje: PlanAbordaje;
  tratamientoManejo: TratamientoManejo;
  modelUsed?: string;
  requestedModel?: string;
  fallbackTriggered?: boolean;
}

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export interface SavedExpediente {
  id: string;
  pacienteNombre: string;
  fecha: string;
  report: Report;
  originalFileName: string;
}

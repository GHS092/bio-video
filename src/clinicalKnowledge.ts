// Clinical Knowledge Vault (0 Hardcoding)
// Extensible medical reasoning database for Multimodal Image Evaluation (US, CT, MRI, X-Ray)

export interface ModalityGuideline {
  id: string;
  name: string;
  tag: string;
  physicsPrinciples: string[];
  imagingDescriptors: string[];
  visualArtifacts: string[];
}

export interface AnatomicalLandmark {
  region: string;
  vitalStructures: string[];
  normalAcousticOrDensityProfile: string;
  criticalMeasures: string[];
  warningSigns: string[];
}

export interface CognitiveBiasCheck {
  name: string;
  definition: string;
  clinicalImpact: string;
  mitigationProtocol: string;
}

export const MODALITY_GUIDELINES: ModalityGuideline[] = [
  {
    id: "ultrasound",
    name: "Ecografía / Ultrasonido (US y Doppler)",
    tag: "Acoustic Reflection & Fluid Dynamics",
    physicsPrinciples: [
      "Interfases acústicas y coeficientes de reflexión tisular.",
      "Atenuación sónica proporcional a la profundidad y densidad tisular.",
      "Efecto Doppler lineal y de potencia para hemodinámica de flujo."
    ],
    imagingDescriptors: [
      "Anecogénico (líquidos libres, quistes puros sin ecos internos).",
      "Hiperecogénico (calcificaciones, parénquima graso, aire con sombra dura).",
      "Hipocogénico (edema celular, inflamación, tumores hipercelulares).",
      "Isoecogénico (parénquima glandular preservado, homogeneidad estructural)."
    ],
    visualArtifacts: [
      "Sombra acústica posterior (bloqueo total por calcio/litiasis o aire).",
      "Reforzamiento acústico posterior (líquido que amplifica ecos distales).",
      "Artefacto de reverberación u 'cola de cometa' (aire intersticial/gas).",
      "Artefacto de espejo (interfase pleuro-diafragmática o pericárdica)."
    ]
  },
  {
    id: "computed_tomography",
    name: "Tomografía Computarizada (CT / TAC)",
    tag: "X-Ray Attenuation & Hounsfield Units",
    physicsPrinciples: [
      "Atenuación diferencial de rayos X medida en unidades Hounsfield (HU).",
      "Transitometría de contraste temporal (fase simple, arterial, portal, tardía).",
      "Reconstrucciones multiplanares y volumétricas isométricas."
    ],
    imagingDescriptors: [
      "Hiperdenso (hueso cortical, calcificaciones, hemorragia aguda: +60 a +100 HU).",
      "Hipodenso (grasa: -100 HU; agua o colecciones: 0 a +15 HU; edema).",
      "Isodenso (parénquima normal relativo de órganos sólidos: +40 a +60 HU).",
      "Realce de contraste (vascularización, neovascularización tumoral, hiperemia)."
    ],
    visualArtifacts: [
      "Artefacto por endurecimiento del haz (cercano a hueso denso o prótesis).",
      "Artefacto de volumen parcial (transición rápida de densidades).",
      "Artefactos por movimiento respiratorio (borrosidad cortical)."
    ]
  },
  {
    id: "magnetic_resonance",
    name: "Resonancia Magnética (MRI / RM)",
    tag: "Hydrogen Relaxation & Multiparametric Sequences",
    physicsPrinciples: [
      "Resonancia de núcleos de hidrógeno bajo campos de radiofrecuencia.",
      "Tiempos de relajación longitudinal (T1) y transversal (T2).",
      "Supresión espectral de agua (FLAIR) y supresión de grasa."
    ],
    imagingDescriptors: [
      "Hiperintenso T2 (agua libre, edema, necrosis licuefactiva, inflamación).",
      "Hiperintenso T1 / Hipointenso T2 (grasa subcutánea, hemorragia subaguda).",
      "Hipointenso en T1/T2 (calcio, vasos con flujo rápido 'flow void', aire).",
      "Diferencias en difusión (DWI / ADC) que marcan restricción celular y edema citotóxico."
    ],
    visualArtifacts: [
      "Artefacto de desplazamiento químico (interfase agua-grasa en riñón/órbita).",
      "Artefacto de susceptibilidad magnética (por gas o implantes metálicos).",
      "Artefacto de flujo pulsátil (corriente de LCR o vasos arteriales con pulso)."
    ]
  },
  {
    id: "fluoroscopy_xray",
    name: "Fluoroscopia y Radiografía Digital (X-Ray)",
    tag: "Projectional Radiodensity & Real-Time Motion Test",
    physicsPrinciples: [
      "Proyección bidimensional plana de coeficientes de atenuación integrados.",
      "Tránsito de bario/yodo para valoración luminal dinámica.",
      "Análisis en tiempo real de motilidad dural, cardíaca o intestinal."
    ],
    imagingDescriptors: [
      "Radiolúcido (pulmón normal, gas libre intraperitoneal, aire luminal).",
      "Radiopaco (estructuras óseas, cuerpos extraños, contraste baritado/yodado).",
      "Opacidad alveolar o intersticial (infiltrados, colapsos tisulares, atelectasis)."
    ],
    visualArtifacts: [
      "Magnificación geométrica por distancia objeto-receptor.",
      "Superposición de estructuras en eje Z sumadas en un plano bidimensional.",
      "Artefacto por colimación o dispersión de fotones secundarios."
    ]
  }
];

export const ANATOMICAL_LANDMARKS: AnatomicalLandmark[] = [
  {
    region: "SNC / Cerebro",
    vitalStructures: [
      "Caja craneana y espacio subdural/epidural.",
      "Surcos corticales, ventrículos laterales y tercer ventrículo.",
      "Tronco encefálico, fosa posterior y cerebelo."
    ],
    normalAcousticOrDensityProfile: "Simetría bilateral estricta. Densidad de parénquima de +35 HU (sustancia blanca) a +40 HU (sustancia gris) en CT. Intensidad media en RM con clara diferenciación corticomedular.",
    criticalMeasures: [
      "Desviación de línea media (tolerancia estricta < 5mm).",
      "Diámetros ventriculares (Índice de Evans < 0.3)."
    ],
    warningSigns: [
      "Pérdida de diferenciación entre sustancia gris y blanca (isquemia aguda).",
      "Colapso de surcos corticales (edema difuso, hipertensión intracraneal).",
      "Colecciones semilunares o biconvexas (hematomas subdurales/epidurales)."
    ]
  },
  {
    region: "Tórax / Parénquima Pulmonar y Pleura",
    vitalStructures: [
      "Línea pleural e interfase pleuropulmonar.",
      "Vasos hiliares y ramificación bronquial descendente.",
      "Espacio mediastinal, tráquea y silueta cardíaca."
    ],
    normalAcousticOrDensityProfile: "Línea pleural fina, lisa (<2mm) con deslizamiento dinámico activo ('lung sliding'). En CT, densidad de aire de -800 a -950 HU con trama vascular difusa.",
    criticalMeasures: [
      "Espesor de línea pleural < 2mm.",
      "Índice cardiotorácico en radiografía < 0.50."
    ],
    warningSigns: [
      "Ausencia de deslizamiento pleural ('lung sliding') en ventilación (neumotórax).",
      "Líneas B múltiples o confluentes en US (edema alveolar o distrés hídrico).",
      "Opacidades en vidrio deslustrado ('ground glass') o consolidaciones con broncograma aéreo en CT."
    ]
  },
  {
    region: "Abdomen Superior / Hígado, Vesícula y Vías Biliares",
    vitalStructures: [
      "Estructura lobar hepática y venas suprahepáticas/porta.",
      "Pared de vesícula biliar y luz cecal.",
      "Conducto colédoco y árbol biliar extrahepático."
    ],
    normalAcousticOrDensityProfile: "Hígado homogéneo isoecogénico o ligeramente hiperecogénico respecto a corteza renal. En CT, densidad normal de +50 a +70 HU. Vesícula libre de ecos con pared fina (< 3mm).",
    criticalMeasures: [
      "Pared de la vesícula biliar (< 3mm).",
      "Diámetro del conducto colédoco (< 6mm en jóvenes; < 8mm post-colecistectomía).",
      "Dimensión longitudinal hepática (< 15 cm)."
    ],
    warningSigns: [
      "Espesamiento difuso o en 'doble contorno' de pared vesicular (colecistitis, congestión sistémica).",
      "Litiasis con sombra acústica posterior fija o barro biliar.",
      "Dilatación del conducto colédoco o del árbol intrahepático (obstrucción obstructiva proximal o distal)."
    ]
  },
  {
    region: "Abdomen Superior / Región Pancreática e Intestinal",
    vitalStructures: [
      "Cabeza, cuerpo y cola del páncreas.",
      "Relación estrecha con arteria y vena esplénica.",
      "Conducto pancreático principal (de Wirsung) y asas duodenales adyacentes."
    ],
    normalAcousticOrDensityProfile: "Páncreas isoecogénico o sutilmente hiperecogénico con la edad. Límites lisos y regulares lobulados. En CT, realce homogéneo sin colecciones ni velamiento de grasa peripancreática.",
    criticalMeasures: [
      "Diámetro del conducto pancreático de Wirsung (< 2mm).",
      "Espesor máximo pancreático (< 3cm en cabeza; < 2.5cm en cuerpo/cola)."
    ],
    warningSigns: [
      "Pérdida de límites definidos con velamiento de la grasa peripancreática (pancreatitis aguda).",
      "Colecciones líquidas localizadas o pseudoquistes intraparenquimatosos.",
      "Dilatación persistente del conducto de Wirsung o dilatación biliar simultánea ('signo del doble conducto' sugestivo de proceso expansivo)."
    ]
  },
  {
    region: "Cardíaco / Ecocardiografía Básica",
    vitalStructures: [
      "Grosor de tabique interventricular y pared posterior de ventrículo izquierdo.",
      "Válvulas mitral y aórtica en movimiento sincrónico.",
      "Saco pericárdico circundante."
    ],
    normalAcousticOrDensityProfile: "Fracción de eyección normal (>55%). Movimiento simétrico de paredes sin hipocinesia segmental. Ausencia de espacio libre de eco en saco pericárdico.",
    criticalMeasures: [
      "Grosor de tabique interventricular en diástole (< 11mm).",
      "Espacio pericárdico libre de ecos (< 4mm en diástole es normal)."
    ],
    warningSigns: [
      "Espacio anecogénico en saco pericárdico que colapsa ventrículos (derrame pericárdico / taponamiento).",
      "Hipocinesia, acinesia o discinesia de paredes ventriculares (isquemia cardíaca).",
      "Engrosamiento y limitación de apertura mitro-aórtica (estenosis valvular severa)."
    ]
  },
  {
    region: "Abdomen Posterior / Retroperitoneo, Riñones y Grandes Vasos",
    vitalStructures: [
      "Espacio retroperitoneal, aorta abdominal y vena cava inferior.",
      "Riñones (corteza, médula y senos renales bilaterales).",
      "Uréteres en su trayecto descendente retroperitoneal y glándulas suprarrenales."
    ],
    normalAcousticOrDensityProfile: "Simetría bilateral estricta de contornos renales y planos grasos circundantes (~-100 HU en CT / grasas hipoecoicas limpias en US). Parénquima renal homogéneo con espesor cortical uniforme y diferenciación nítida.",
    criticalMeasures: [
      "Espesor de la corteza renal (> 10 mm).",
      "Diámetro anteroposterior (AP) de la pelvis renal (< 10 mm)."
    ],
    warningSigns: [
      "Borramiento o sustitución nodular del plano graso de seguridad (Gerota) peri-renal/peri-aórtico.",
      "Asimetría unilateral discreta en volumen, realce de contraste parenquimatoso o lobulación de la corteza renal.",
      "Masa o manguito que envuelve de forma concéntrica o excéntrica grandes vasos (aorta/cava) o espacio interaortocavo.",
      "Ectasia pielocalicial o hidronefrosis unilateral/bilateral por compromiso extrínseca de uréteres."
    ]
  }
];

export const COGNITIVE_BIAS_CHECKS: CognitiveBiasCheck[] = [
  {
    name: "Satisfacción de Búsqueda (Satisfaction of Search)",
    definition: "Tendencia a detener la exploración e interpretación del estudio completo una vez que se ha detectado la primera anomalía principal o la más obvia.",
    clinicalImpact: "Omitir fracturas adicionales, metástasis secundarias, perforaciones sutiles u otros órganos comprometidos que cambian radicalmente la conducta post-triaje.",
    mitigationProtocol: "Aplicación estricta de barridos sitematizados por planos anatómicos enteros independientemente de la presencia de una lesión masiva."
  },
  {
    name: "Anclaje Diagnóstico (Anchoring Bias)",
    definition: "Fijación precoz en el primer diagnóstico diferencial sugerido por el cuadro de ingreso o por un hallazgo llamativo inicial, ignorando datos clínicos posteriores.",
    clinicalImpact: "Retrasar la detección de patologías vasculares como un aneurisma disecante tratándolo como dolor biliar o dolor musculoesquelético.",
    mitigationProtocol: "Ejecución de un mapa de signos ausentes obligatorios para retar activamente la hipótesis de mayor probabilidad."
  },
  {
    name: "Cierre Prematuro (Premature Closure)",
    definition: "Aceptación pasiva del diagnóstico más aparente o común antes de que exista suficiente evidencia concluyente para descartar diagnósticos más críticos.",
    clinicalImpact: "Diagnosticar una pancreatitis litiásica sin descartar colecistitis gangrenosa asociada o perforación de víscera hueca periférica.",
    mitigationProtocol: "Escrutinio riguroso del Red Team / Abogado del Diablo sobre por qué se descartan las banderas rojas."
  },
  {
    name: "Sesgo de Normalidad (Normalcy Bias)",
    definition: "Tendencia a asumir que todo está sano o es benigno e incidental ante la ausencia de una catástrofe anatómica obvia (como neumoperitoneo), desestimando signos sutiles pero devastadores como desorganización o heterogeneidad de grasa tisular, asimetría de contorno glandular o realce arterial anómalo.",
    clinicalImpact: "Ignorar u omitir tumores malignos de crecimiento lento o infiltrativos en fases tempranas o intermedias (como adenocarcinomas ductales pancreáticos, colangiocarcinomas o masas tumorales profundas).",
    mitigationProtocol: "Escrutinio meticuloso de transiciones de parénquima, calibre de conductos y regularidad de bordes de órganos sólidos. El Abogado del Diablo debe dudar obligatoriamente de todo reporte pacífico que no descarte con evidencia directa estas sospechas críticas."
  },
  {
    name: "Sesgo de Anclaje Visual y Captura de Atención (Salience Bias / Anchor Point)",
    definition: "Fijación instintiva del ojo clínico sobre un hallazgo central masivo, brillante o calcificado (como una aorta severamente calcificada o una espondiloartrosis vertebral prominente), lo cual monopoliza la atención del modelo de visión y eclipsa la detección de micro-anomalías de baja atenuación en parénquimas periféricos.",
    clinicalImpact: "Enmascaramiento de masas isodensas u organomegalias discretas adyacentes a la lesión ruidosa principal (ej. omitir un tumor renal isodenso por enfocarse exclusivamente en el manguito periaórtico o una placa densa de calcio).",
    mitigationProtocol: "Aplicar el Protocolo de Máscara de Atención: tapar mentalmente la estructura brillante o central dominante y realizar un re-barrido exclusivo de los parénquimas adyacentes en cuadrantes periféricos."
  },
  {
    name: "Omisión del 'Padrino' Primario (Oncogenic Chain of Causality Bias)",
    definition: "Asumir de forma ingenua que grandes masas retroperitoneales o manguitos de partes blandas periaórticos representan fibrosis benignas primarias o entidades idiopáticas (como la Enfermedad de Ormond), obviando que estas masas son habitualmente conglomerados de ganglios metastásicos formados por la diseminación de un tumor primario sólido oculto.",
    clinicalImpact: "Retraso catastrófico en el diagnóstico de carcinomas renales primarios, adenocarcinomas de páncreas o tumores germinales, catalogándolos erróneamente de procesos de Ormond benignos o autoinmunes de IgG4.",
    mitigationProtocol: "Aplicación de la Navaja de Ockham Oncológica: toda masa de aspecto fibrótico o manguito perivascular retroperitoneal activa obligatoriamente la regla de causalidad inversa. El panel tiene prohibido declarar benignidad sin antes auditar frame por frame la regularidad cortical de los riñones, páncreas, testículos o duodeno buscando un sutil origen exofítico unilateral."
  }
];

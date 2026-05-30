import express from "express";
import path from "path";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import os from "os";
import { MODALITY_GUIDELINES, ANATOMICAL_LANDMARKS, COGNITIVE_BIAS_CHECKS } from "./src/clinicalKnowledge";

const upload = multer({ 
  dest: os.tmpdir(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB strict limit
  fileFilter: (req, file, cb) => {
    // Only accept video files
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed"));
    }
  }
});

let aiClient: GoogleGenAI | null = null;
function getAI() {
  if (!aiClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Helper function for transient-error retries and automatic model failovers
async function generateContentWithRetry(
  ai: GoogleGenAI,
  primaryModel: string,
  contents: any,
  config: any,
  maxRetries = 2
): Promise<{ response: any; finalModel: string; fallbackTriggered: boolean }> {
  const modelsToTry = [primaryModel];
  if (primaryModel === "gemini-3.1-pro-preview" || primaryModel === "gemini-2.5-pro") {
    modelsToTry.push("gemini-3.5-flash");
    modelsToTry.push("gemini-3.1-flash-lite");
  } else if (primaryModel === "gemini-3.5-flash") {
    modelsToTry.push("gemini-3.1-flash-lite");
    modelsToTry.push("gemini-3.1-pro-preview");
  } else {
    modelsToTry.push("gemini-3.5-flash");
    modelsToTry.push("gemini-3.1-flash-lite");
    modelsToTry.push("gemini-3.1-pro-preview");
  }

  let lastError: any = null;

  for (const model of modelsToTry) {
    let delay = 1000; // Start with 1 second instead of 2 to reduce latency
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempting content generation with model: ${model} (Attempt ${attempt}/${maxRetries})`);
        const response = await ai.models.generateContent({
          model: model,
          contents: contents,
          config: config,
        });
        return { 
          response, 
          finalModel: model,
          fallbackTriggered: model !== primaryModel
        };
      } catch (error: any) {
        lastError = error;
        const errorMessage = error.message || "";
        const errorCode = error.status || error.code || 0;
        
        console.warn(`Error on model ${model} (Attempt ${attempt}): ${errorMessage} (status: ${errorCode})`);

        // Check if this is a strict quota mismatch with limit 0 (free tier block)
        const isPermanentQuotaBlocked = 
          errorMessage.includes("limit: 0") || 
          errorMessage.toLowerCase().includes("quota exceeded") && errorMessage.includes("limit: 0") ||
          errorMessage.includes("RESOURCE_EXHAUSTED") && errorMessage.includes("limit: 0");

        if (isPermanentQuotaBlocked) {
          console.log(`Permanent zero quota detected for model ${model}. Bypassing retries to save time and switching instantly.`);
          break; // Skip further attempts for this model immediately!
        }

        // Check if error is overload/high demand (503 or demand/busy/unavailable/overloaded text)
        const isServerOverloaded = 
          errorCode === 503 || 
          errorMessage.toLowerCase().includes("demand") ||
          errorMessage.toLowerCase().includes("busy") ||
          errorMessage.toLowerCase().includes("unavailable") ||
          errorMessage.toLowerCase().includes("overloaded");

        if (isServerOverloaded) {
          console.log(`Model ${model} is overloaded or unavailable. Instantly falling back to next model to keep response times fast.`);
          break; // Try the next model immediately without waiting!
        }

        // For other retryable errors (like 429 rate limits or transient errors)
        const isRetryable = 
          errorCode === 429 || 
          errorMessage.toLowerCase().includes("quota") ||
          errorMessage.toLowerCase().includes("limit");

        if (isRetryable && attempt < maxRetries) {
          console.log(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 1.5; // Backoff
        } else {
          // Break to try the alternative fallback model
          break;
        }
      }
    }
    console.log(`Model ${model} failed all retry attempts. Trying fallback companion model...`);
  }

  throw lastError || new Error("All clinical diagnostic models failed to respond due to transient supplier load.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Interacción de consulta interactiva (Chat con la Junta Médica sobre el informe)
  app.post("/api/chat-report", async (req, res) => {
    const { report, message, history, model, agent } = req.body;
    if (!report || !message) {
      return res.status(400).json({ error: "Falta el reporte o el mensaje de la consulta." });
    }

    try {
      const ai = getAI();
      const requestedModel = model;
      const selectedModel = (requestedModel === "gemini-3.1-pro-preview" || requestedModel === "gemini-2.5-pro") 
        ? requestedModel 
        : "gemini-3.5-flash";
      
      const chatHistory = (history || []).map((msg: any) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.text }]
      }));

      // Adjust prompt based on directed agent!
      let agentPersonaIntro = "";
      const agentStr = String(agent || "");
      if (agentStr.includes("Diablo") || agentStr.includes("Devil")) {
        agentPersonaIntro = `
Eres el ABOGADO DEL DIABLO (Clinical Red Team / Auditor Médico Crítico). Tu función es retar consistentemente todos los sesgos (anclaje, satisfacción de búsqueda, cierre prematuro).
Cuestiona las suposiciones simplistas del Médico Adscrito, advierte sobre posibles artefactos de imagen o ruidos de máquina, y exige contrastar con signos ausentes o diagnósticos alternativos de alto impacto vital.
Responde de manera aguda, escéptica pero constructiva y rigurosamente científica.
`;
      } else if (agentStr.includes("Anatomista") || agentStr.includes("Anatomy") || agentStr.includes("Oracle")) {
        agentPersonaIntro = `
Eres el ANATOMISTA EXPERTO Y ORÁCULO FISIOPATOLÓGICO. Tu especialidad es la correlación microscópica, las medidas morfométricas fisiológicas, los planos de vecindad de órganos e hilios y las variantes anatómicas normales o anómalas.
Fundamenta tus comentarios en la literatura médica de estructuras humanas e integridad tisular.
Responde con un vocabulario médico extremadamente rico, referencial, citando reparos anatómicos de alta precisión en base al reporte.
`;
      } else if (agentStr.includes("Epicentro") || agentStr.includes("Origen") || agentStr.includes("EP")) {
        agentPersonaIntro = `
Eres el AGENTE EPICENTRO (Buscador del Origen de la Masa). Tu especialidad es el rastreo tridimensional y temporal para localizar el epicentro anatómico de cualquier lesión o infiltración de partes blandas.
Tu objetivo es discriminar rigurosamente si la masa nace de forma intrínseca dentro del parénquima de un órgano sólido (ej. tumor renal cortical primario, masa hepática, adenocarcinomas profundos) o si se origina fuera del órgano y simplemente lo comprime de forma extrínseca o lo desplaza.
Fundamenta tus comentarios en el análisis del volumen original, el comportamiento del parénquima y las interfases tisulares que conectan la lesión con su entorno geográfico.
`;
      } else if (agentStr.includes("Simetría") || agentStr.includes("Symmetry") || agentStr.includes("AS")) {
        agentPersonaIntro = `
Eres el AUDITOR DE SIMETRÍA (Especialista en Comparación Contralateral). Tu especialidad es la comparación analítica milimétrica entre las estructuras bilaterales homólogas (riñón derecho vs. izquierdo, pulmón vs. pulmón, hemisferios cerebrales, espacios grasos periféricos) que aparecen en el video.
Tu misión es identificar asimetrías de volumen, diferencias en el histograma de densidad, sutiles borramientos de grasa perivisceral o alteraciones del contorno unilateral que actúen como "faros" para localizar procesos patológicos tempranos o lesiones que pretendan pasar desapercibidas.
Responde de manera precisa, comparando ambos lados con rigor numérico e histogramas relativos.
`;
      } else if (agentStr.includes("Triaje") || agentStr.includes("Triage") || agentStr.includes("Asesor")) {
        agentPersonaIntro = `
Eres el ASESOR DE TRIAJE Y INTERVENCIÓN PROCEDURAL. Tu focalización absoluta es la seguridad del paciente en el minuto cero.
Diseñas pautas de soporte agudo inmediato, escalas de gravedad, monitoreo de banderas rojas y la programación de laboratorios y estudios complementarios urgentes.
Responde de manera ejecutiva, priorizada, protectora y orientada netamente a la acción médica crítica.
`;
      } else {
        // Default / Médico Adscrito
        agentPersonaIntro = `
Eres el MÉDICO ADSCRITO (Attending Radiologist). Tu papel es balancear la evidencia de hallazgos, guiar las principales sospechas diagnósticas basándote en la densidad, ecogenicidad, atenuación o flujo capturado en el video, y emitir el juicio clínico de consenso.
Responde de manera elocuente, equilibrada, confiable y con alto liderazgo clínico.
`;
      }

      const contextInstruction = `
${agentPersonaIntro}

Has analizado previamente el caso del paciente y la junta ha generado este reporte clínico estructurado en JSON:
${JSON.stringify(report, null, 2)}

Aquí está la Base de Conocimientos Médicos de Referencia (Literature Vault) que tiene el sistema para guiar tu razonamiento científico sin inventar pautas:
- Directrices por modalidad física: ${JSON.stringify(MODALITY_GUIDELINES)}
- Guías de anatomía y límites críticos: ${JSON.stringify(ANATOMICAL_LANDMARKS)}
- Controles de sesgos cognitivos: ${JSON.stringify(COGNITIVE_BIAS_CHECKS)}

Tu papel es responder con precisión extrema a las consultas del usuario, manteniéndote fiel a tu personaje asignado.
Focalízate en esclarecer las dudas sobre los hallazgos descritos, la fisiopatología, la estratificación, el tratamiento y la justificación científica.
Responde de manera elocuente y estructurada en ESPAÑOL, utilizando terminología clínica de muy alta escuela pero comprensible, y citando de forma implícita el reporte de hallazgos.
`;

      const { response, finalModel, fallbackTriggered } = await generateContentWithRetry(
        ai,
        selectedModel,
        [
          ...chatHistory,
          { role: "user", parts: [{ text: message }] }
        ],
        {
          systemInstruction: contextInstruction,
        }
      );

      res.json({ text: response.text || "La junta médica no pudo emitir una recomendación verbal en este momento." });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || "Error al procesar la consulta con la junta médica." });
    }
  });

  app.post("/api/analyze-video", (req, res, next) => {
    upload.single("video")(req, res, (err) => {
      if (err) {
        if (err.message === "File too large") {
          return res.status(400).json({ error: "File exceeds the 50MB limit." });
        }
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  }, async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No video uploaded, or invalid file type." });
    }

    try {
      const ai = getAI();
      console.log(`Uploaded to ${req.file.path}`);

      // 1. Upload to Gemini File API
      const fileUploadResult = await ai.files.upload({
        file: req.file.path,
        config: {
          mimeType: req.file.mimetype,
        },
      });

      console.log(`File uploaded to Gemini as ${fileUploadResult.name}`);

      // 2. Wait for processing
      let fileRes = await ai.files.get({ name: fileUploadResult.name });
      while (fileRes.state === "PROCESSING") {
        console.log("Processing...");
        await new Promise((resolve) => setTimeout(resolve, 3000));
        fileRes = await ai.files.get({ name: fileUploadResult.name });
      }

      if (fileRes.state === "FAILED") {
        throw new Error("Video processing failed.");
      }

      console.log("File is ready!");

      const additionalContext = req.body.additionalContext || "";
      const pacienteNombre = req.body.pacienteNombre || "Paciente Sin Historial Directo";
      const selectedFilter = req.body.selectedFilter || "default";
      const continualRulesStr = req.body.continualRules || "[]";

      // 3. Generate Report
      const prompt = `
IDENTIFICACIÓN DEL EXPEDIENTE MÓDULO ACTIVO:
- Paciente: ${pacienteNombre}
- Sospecha Clínica de Entrada / Sintomatología / Indicios Proporcionados por el Médico Remitente: "${additionalContext}"
- Filtro de Ventana o Soft-Windowing Seleccionado por el Clínico en UI: "${selectedFilter.toUpperCase()}" (Nota: El archivo de video se transmite de forma pura para conservar la máxima fidelidad y calidad de píxeles nativos, pero el clínico está observando a través de este filtro de ventana específico y requiere correlacionar el diagnóstico bajo esta perspectiva de contraste o atenuación).

REGLAS ACTIVAS DE CALIBRACIÓN DILIGENCIAL Y PARCHES DEL ARNÉS CONTINUO (Continual Harness Dynamic Overrides):
${continualRulesStr}
*(Nota: Si alguna regla de este arnés continuo de auto-corrección coincide con las mediciones, ángulos, ruidos o segmentaciones en las secuencias de este video, aplica el factor corrector correspondiente y documéntalo en el análisis morfométrico).*

Eres un pánel consolidado de la Junta Médica del Hospital que actúa bajo los más altos estándares clínicos y científicos (0 HARDCODING o cableados estáticos de patología en código).
Para evaluar este video radiológico, debes simular y ejecutar un proceso de debate interactivo en tiempo real entre seis "Agentes Especiales Clínicos" internos:

1. **Médico Adscrito (Radiólogo Principal - "Médico Adscrito")**: Postula el diagnóstico principal basado en los contrastes, densidades, ecogenicidades y morfologías observadas temporalmente en el barrido del video.
2. **Abogado del Diablo ("Abogado del Diablo" - Red Team del hospital)**: Cuestiona con sano escepticismo científico las hipótesis del Médico Adscrito, audita sesgos cognitivos clave (anclaje, satisfacción de búsqueda, cierre prematuro o sesgo de normalidad) y exige explicar posibles artefactos técnicos o signos ausentes cruciales. Exige descartar de manera sistemática la hipótesis de neoplasia primaria biológica agresiva y de filiación directa ante cualquier masa.
3. **Anatomista Experto ("Anatomista Experto" - Oráculo Estructural)**: Valida la integridad de la estructura anatómica humana, hilios y relaciones de vecindad tisular contrastándolos con pautas de la literatura normal.
4. **Agente Epicentro ("Agente Epicentro" - Buscador del Origen de la Masa / Clínico Arqueólogo)**: Su función exclusiva es rastrear el origen o "epicentro" tridimensional de la lesión. No asume que una estructura desplazada está sana. Examina minuciosamente frame por frame los planos de las interfases grasas que conectan la masa con los parénquimas de órganos contiguos. Determina con rigor geométrico si la masa nace intrínsecamente del parénquima de un órgano sólido cercano (lesión primaria exofítica con afectación ganglionar regional) o si se origina de forma independiente en el espacio intersticial/conectivo circundante (p. ej. retroperitoneal o mediastínico puro).
5. **Auditor de Simetría y Textorrealce de Parénquimas ("Auditor de Simetría" - Inspector de Parénquimas)**: Aplica una regla de comparación de simetría bilateral estricta y deconstrucción de textura. Su misión es escanear comparativamente de izquierda a derecha de forma milimétrica los órganos homólogos representados (ej. riñón vs. riñón, pulmón vs. pulmón, hemisferios) en las mismas coordenadas axiales o espaciales. Debe auditar diferencias discretas en el contorno, volumen cortical, espesores y, fundamentalmente, homogeneidad de textura e histogramas de densidad intra-parenquimatosa. Si constata cualquier variación focal superior a 10 HU en CT o una distorsión ecogénica asimétrica dentro de un parénquima unilateral, emitirá un dictamen de "Alerta de Deformidad o Masa Isodensa Unilateral", invalidando inmediatamente las aserciones de normalidad de dicho órgano. Esto cancela radicalmente el sesgo de normalidad.
6. **Asesor de Triaje ("Asesor de Triaje" - Especialista de Intervención)**: Prioriza la pauta de tratamiento del minuto cero, la estratificación de riesgo inmediato en base a banderas rojas, laboratorios urgentísimos y pautas protectoras de soporte.

Para guiar su debate de razonamiento y evitar cualquier tipo de asunción o sesgo previo (0 Hardcoding), utilicen como marco de referencia obligado esta Base de Literatura Clínica Avanzada:
- Pautas de Modalidad y Física: ${JSON.stringify(MODALITY_GUIDELINES)}
- Hitos de Anatomía y Límites Morfométricos: ${JSON.stringify(ANATOMICAL_LANDMARKS)}
- Prevención de Sesgos Diagnósticos: ${JSON.stringify(COGNITIVE_BIAS_CHECKS)}

DIRECTRIZ CLÍNICA INTENSIFICADA DE LUPA DE ALTA RESOLUCIÓN Y LUCHA CONTRA EL SESGO DE NORMALIDAD (NORMALCY BIAS) Y ANCLAJE VISUAL (SALIENCE BIAS):
- Si el "Médico Remitente" ha proporcionado alguna Sospecha Clínica de Entrada o sintomatología específica (ejemplo descriptivo: dolor, masa detectable, sospecha tumoral o disfunción orgánica local), el pánel DEBE enfocar con lente de aumento microscópica la región y parénquima correspondiente detectado en los frames (por ejemplo, las zonas viscerales, hilios, espacios vasculares o el retroperitoneo, según el área identificada de forma dinámica).
- PROTOCOLO DE ARQUEOLOGÍA CLÍNICA Y BÚSQUEDA DEL "PADRINO" PRIMARIO (Lógica Inversa contra Tumores Ocultos - Rastreador de Continuidad): Queda estrictamente establecido por consenso clínico que un gran conglomerado de aspecto ganglionar, masa infiltrante perivascular o manguito de partes blandas (p. ej. retroperitoneal, mediastínico o hiliar) en el cuerpo casi nunca nace de forma aislada. Su sola detección activa obligatoriamente la búsqueda inversa de su origen o "Padrino" (el tumor primario en órganos sólidos de vecindad como riñón, páncreas, testículo, hígado, bazo o pulmones). El panel debe escanear frame por frame los límites corticales de estos órganos. Una alteración mínima en la regularidad del contorno de un polo de un órgano vecino (como una lobulación exofítica de la corteza renal, un sutil abombamiento o una asimetría de realce en fase de contraste) que se confunda con la masa se catalogará como el origen neoplásico primario de la lesión, reclasificando el caso de "Masa de Primario Oculto" a "Carcinoma Primario de Órgano Específico con Metástasis Conglomerada Regional".
- PROTOCOLO DE LA NAVAJA DE OCKHAM ONCOLÓGICA ("Lo Frecuente es Frecuente" vs. Rarezas Inmunológicas): Estadísticamente, un conglomerado de ganglios masivos destructivos o manguitos perivasculares rodeando la aorta/cava es prioritariamente una neoplasia metastásica (adenopatías fusionadas) originada de un cáncer primario de órganos adyacentes o de un linfoma, antes que una enfermedad inflamatoria o autoinmune rara (como la Fibrosis Retroperitoneal de Ormond). Queda ESTRICTAMENTE PROHIBIDO para el panel cerrar el caso con un diagnóstico de benignidad o enfermedad autoinmune de Ormond sin haber rastreado y descartado exhaustivamente un tumor primario (como un hipernefroma renal, adenocarcinoma de páncreas, etc.) en los parénquimas sólidos circundantes.
- PROTOCOLO DE ANÁLISIS POR SUSTRACCIÓN O MÁSCARA DE ATENCIÓN (Prevención de Secuestro de Atención / Salience Bias): Cuando se detecte una anomalía masiva, hiperdensa, o de alto brillo que capture intuitivamente la atención diagnóstica (ej. una gran masa periaórtica o una calcificación vertebral prominente), el panel implementará una "sustracción computacional de atención". Conceptualmente, el panel "borrará" o aplicará una "máscara opaca" sobre ese hallazgo ruidoso dominante y forzará un re-barrido independiente del fondo de la imagen, analizando detalladamente los parénquimas y estructuras circundantes (p. ej. corteza lene, fascias de Gerota, lechos grasos, conductos hiliares). Esto evita que el destello de una metástasis masiva enmascare el sutil tumor primario isodenso que la originó.
- PROTOCOLO DE COMPARATIVA DE ASIMETRÍA BILATERAL DE ÓRGANOS HOMÓLOGOS (Auditor de Simetría): Si en la secuencia de video se visualizan estructuras bilaterales homólogas (como riñón vs. riñón, pulmón vs. pulmón, espacios perirrenales, hemisferios), el Auditor de Simetría debe realizar un escrutinio comparativo estricto lado-a-lado en los mismos niveles axiales. Debe auditar diferencias discretas en el contorno, volumen, contorno lobular, densidad en unidades Hounsfield (HU), regularidad de la grasa periférica o realce tisular. Cualquier discrepancia sutil o borramiento localizado de grasa unilateral se elevará de inmediato como un foco de alta sospecha primaria (Faro Rojo o epicentro potencial), desafiando la aparente normalidad del lado afectado.
- PROTOCOLO DE DEBATE REFORZADO DEL ABOGADO DEL DIABLO (Duda Feroz, Búsqueda del Primario y Sesgo de Satisfacción de Búsqueda): El Abogado del Diablo actuará con el doble de destructividad científica aplicando un loop cognitivo interno en el debate. Asumirá como axioma inicial que la hipótesis descriptiva de Médico Adscrito es incompleta y que sufre de "satisfacción de búsqueda" (dejar de buscar tras hallar el primer gran tumor). El Abogado del Diablo debe evaluar obsesivamente los tejidos clasificados como "No significativos" o "Normales" de los órganos vecinos distorsionados o desplazados, auditar sus contornos buscando microrupturas, y exigir argumentos rigurosos que justifiquen por qué se descartan neoplasias discretas o asimetrías tempranas de hilios en zonas etiquetadas erróneamente como sanas. Si la masa retroperitoneal compromete un órgano (ej. borra grasa perirrenal), el Abogado del Diablo impugnará ferozmente la etiqueta de "compresión pasiva secundaria", indicando que muy posiblemente el órgano es el origen ("Padrino") del tumor.
- PROTOCOLO DE EROSIÓN Y AUDITORÍA GEOMÉTRICA DE CONTORNOS (Edge, Contour & Micro-Texture Auditor): Analicen frame por frame la consistencia geométrica de los contornos, límites y la micro-textura de toda masa o alteración tisular detectada. Las estructuras sanas siguen curvas matemáticas continuas suaves. Si deforma o toca un órgano sólido, evalúen minuciosamente los márgenes de su interfase: ¿el contorno del órgano es liso y continuo, o es lobulado, multinodular, o se interrumpe de forma abrupta por la masa? Cataloguen la pérdida localizada de grasa interfacial entre el contorno de un órgano simétrico y la masa bajo la sospecha activa de penetración capsular directa por tumor primario antes que simple desplazamiento inofensivo.
- PROTOCOLO DE HISTOGRAMAS DE ATENUACIÓN EN CUADRANTES VIRTUALES (Desacoplamiento del Faro de Fijación): Para evitar que las estructuras centrales prominentes y luminosas (ej. calcificaciones densas de alta intensidad, sombras óseas vertebrales, o luces de vasos) actúen como "faro brillante" que secuestre el canal de atención visual, dividan visualmente de forma estricta cada frame en 4 cuadrantes. El panel tiene la obligación de escanear y reportar primero los cuadrantes periféricos y fosas parénquimas orgánicas (como la fosa renal bilateral, lecho pancreático, bazo o hígado) antes de permitir que la atención se fije y se sature en el eje central vascular/óseo principal.
- PROTOCOLO DE CORRELACIÓN DE DEPENDENCIA ÓRGANO-ANATÓMICA (Relación Causa-Efecto): Si se constatan de forma simultánea alteraciones de densidad o morfología en un parénquima sólido orgánico (ej. polo renal sutil, área periampular/pancreática, parénquima hepático o esplénico) y anomalías o manguitos tisulares en las cadenas de drenaje o espacios vasculares de vecindad (retroperitoneo o mediastino), el consenso de la junta médica descartará tratarlas como entidades fisiopatológicas aisladas o independientes. El sistema priorizará un modelo unificado de correlación causal (Lesión primaria parenquimatosa + diseminación focal o conglomerado masivo linfático regional) antes de considerar procesos sistémicos incidentales independientes.
- PROTOCOLO DE RASTREO TEMPORAL DE DESAPARICIÓN DE GRASA INTERFÁSICA (Historiador Temporal): Los planos de interfase y compartimento graso de seguridad se caracterizan por el color negro/hipodenso (~-100 HU en CT, o una interfase limpia de vacío sónico en US/MR) alrededor de las estructuras y bordes de los órganos. Rastreen frame por frame si este plano de grasa de seguridad es sustituido de forma nodular, lobulada o difusa por tejido de densidad intermedia o ecogenicidad superior (por ejemplo, tejido de partes blandas de +30 a +55 HU). De ocurrir, clasifíquenlo obligatoriamente bajo la hipótesis prioritaria de proceso infiltrativo primario o conglomerado de masas neoplásicas regionales, y eviten catalogarlo inmediatamente como una entidad inflamatoria o benigna simple sin antes descartar malignidad.
- PROTOCOLO DE DESAFÍO AL "DESPLAZAMIENTO COMPLACIENTE" Y BÚSQUEDA DEL PRIMARIO OCULTO (Malicia Oncológica de 360 Grados): Al detectar una masa, conglomerado o manguito que "desplaza" lateralmente, comprime o deforma un órgano contiguo (por ejemplo, polos renales inferiores, eje pancreático, páncreas, duodeno o bazo), queda ESTRICTAMENTE PROHIBIDO que el panel asuma de forma ingenua o complaciente que dicho órgano está "sano" o "indemne". El Auditor de Simetría y el Agente Epicentro deben rastrear minuciosamente los 360 grados del plano graso que rodea el contorno del órgano. Una interrupción de la fascia grasa de seguridad de baja densidad, una imperfección exofítica lobulada de la corteza, o una deformidad del polo renal/pancreático se debe catalogar de inmediato bajo sospecha de tumor primario de origen orgánico específico (ej. masa renal primaria) que ha originado secundariamente el conglomerado ganglionar regional, instando activamente a recomendar una Reconstrucción Multiplanar (MPR) en cortes coronal y sagital para resolver el conflicto de continuidad pre/post vertebral.
- PROTOCOLO DEL AGENTE CARTÓGRAFO (Mapeo de Intensidad Relativa de Señal): Antes de postular cualquier hipótesis clínica, el panel clasificará las señales de la lesión respecto a tejidos y sustancias patrón universales de control biológico: Líquido Libre/Agua Pura (LCR, orina, líquido simple), músculo esquelético, grasa, hueso cortical/calcio y gas/aire. Si los rasgos físicos sugieren una composición idéctica a líquido puro (en RM hiperintensa en T2 e hipointensa en T1; en US totalmente anecogénica con reforzamiento posterior; en CT hipodensa de 0 a +15 HU), la lesión debe tratarse estrictamente como de naturaleza quística o líquida simple. En tal caso, se debe favorecer un diagnóstico de patología quística benigna de la zona de forma prioritaria, penalizando una sospecha tumoral sólida neoplásica celular, a menos que existan signos inequívocos de realce interno de contraste o componentes celulares sólidos vascularizados.
- PROTOCOLO DE MAPEO DE HISTOGRAMA VISUAL (Calibración De Pantalla / Lente): Se instruye al clínico de IA a autocalibrar el brillo de su interpretación identificando las estructuras que representan el polo de brillo máximo ("faro brillante", ej. canal de líquido libre, contraste intravascular) y de oscuridad máxima o vacío de eco ("faro de vacío", ej. aire alveolar, grasa subcutánea, vacío de flujo central anterior) para contrarrestar aberraciones ópticas o variaciones de ganancia del equipo radiológico.
- PROTOCOLO DE CONSISTENCIA MULTIMODAL (TC vs RM): En casos de afectación u erosión de estructuras duras corticales u óseas, comparen cruzadamente los hallazgos físicos entre modalidades. Si la TC muestra una remodelación o desgaste óseo liso continuo por aposición pasiva o presión mecánica de larga data pero sin una masa de densidad sólida vascularizada asociada, y la RM revela una señal de líquido biológico libre puro sin realce interno o celularidad restrictiva, el panel concluira un origen de remodelación mecánica o hidrostática benigna por vecindad y descartará un proceso tumoral o infiltración de partes blandas sólida osteolítica agresiva. Esto erradica el sesgo de anclaje diagnóstico.
- PROTOCOLO DE CONVOLUCIÓN DE SOFT-WINDOWING (Simulación de Ventanas): El clínico de IA debe evaluar mentalmente los marcos simétricos alterando el contraste y brillo en las siguientes modalidades de visualización para descartar lesiones ocultas de acuerdo al filtro activo de la interfaz del usuario:
  1. *Estándar (Grises/Doppler / default):* Para valorar homogeneidad global en escala de grises cruda o Doppler color basal.
  2. *Vascular/Contraste (vascular):* Para observar el realce de hilios vasculares y descartar obstrucciones o trombos.
  3. *Ventana Pulmonar (pulmonary):* Destacar parénquimas aéreos y coeficientes de atenuación de muy bajo HU.
  4. *Estructura Ósea/Cortical (bone):* Analizar erosiones óseas finas, remodelaciones foraminales lisas o discontinuidades óseas.
  5. *Lupa de Parénquima Profundo (lupa):* Estrechar la ventana de atenuación para resaltar gradientes finos de ecogenicidad o densidad entre tejido orgánico normal e infiltraciones tumorales isodensas silenciosas.
  6. *Filtro Térmico de Alta Sensibilidad / Termografía / Pseudocolor (termico):* Si este filtro está seleccionado, traduzcan mentalmente las intensidades de escala de grises del video a gradientes espectrales térmicos (termografía continua o pseudo-color / rainbow spectrum). Las áreas de máxima intensidad o reflectividad (faro brillante, ej: vasos activos, flujo hipervascular, o realce tumoral activo) corresponden a áreas candentes de emisión metabólica o inflamatoria alta (rojo incandescente, naranja y amarillo brillante), mientras que las áreas anecogénicas o líquidas (como LCR, orina o líquido libre simple estático) corresponden a zonas frías de baja reflectividad (tonalidades azul-púrpura profundo o cian). Busquen con atención micro-heterogeneidades espectrales (áreas frías de necrosis o tabiques fibrosos de baja emisión rodeados por parches calientes hipermetabólicos de alta captación asimétrica): un conglomerado tumoral activo o neoplasia irregular manifestará este patrón moteado/parcheado térmico analógico sutil, a diferencia de un proceso cicatricial o fibrosis madura inactiva que se visualizará homogénea y estable.
- PROTOCOLO DE MATRIZ DE DENSIDAD COMPARADA (Anatomía Comparada): Compare sistemáticamente el tejido del órgano bajo evaluación con parénquimas de control adyacentes sanos en el mismo nivel espacial (páncreas vs bazo, bazo vs hígado, corteza renal vs bazo). Un gradiente de diferencia de contraste o caída abrupta de densidad focal o segmentaria (>15 HU de diferencia localizada) es altamente sugerente de malignidad o isquemia, requiriendo su reporte inmediato.
- PROTOCOLO DE RASTREO TEMPORAL Y CONTINUIDAD DE CONDUCTOS: El video es un barrido secuencial volumetricamente continuo. El pánel no debe analizar frames de forma estática; debe rastrear el transcurso continuo de los conductos (ej: Wirsung, conducto biliar común, arteria aorta, vasos retroperitoneales) de inicio a fin de los cortes, buscando activamente interrupciones abruptas (amputación), dilataciones retrógradas sutiles o efecto de masa que distorsione los bordes lobulillares del páncreas u otros órganos.
- JERARQUÍA DE ANÁLISIS EN CAPAS DE ABSTRACCIÓN: Para estructurar el reporte, se procesará obligatoriamente a través de estas 3 etapas lógicas del cerebro clínico:
  * *Capa 1: Descriptor de Señal Física:* Catalogar ecogenicidad pura, densidades HU o atenuaciones de espines magnéticos y compararlos con referentes de control antes de colocar etiquetas de enfermedad.
  * *Capa 2: Auditoría de Interfases Geométricas:* Inspeccionar la sutil erosión ósea (festoneado suave por presión vs lisis agresiva apolillada) o el desplazamiento tisular liso de grasa vs destrucción de planos fasciales.
  * *Capa 3: Comité Clínico de Consenso:* Generar un debate racional entre los seis miembros de la junta médica guiados por la audacia crítica del Abogado del Diablo, ponderando todos los sesgos hasta asentar un reporte de consenso definitivo de alto calibre.
- "0 HARDCODING" no representa en absoluto evadir, suavizar ni tapar diagnósticos de mal pronóstico declarando perezosamente que todo está normal o que son incidentales inespecíficos. Si el video radiológico muestra indicios o signos físico-anatómicos de malignidad, neoplasia parenquimatosa o infiltrativa, masas de aspecto tumoral sólidas/quísticas complejas, obstrucciones biliares o arteriales, o adenopatías profundas (como borramiento localizado de grasa, hiporrealce focal, nódulos espiculados, o amputación abrupta de conductos), el pánel DEBE identificarlos, mapear su densidad/atenuación e incluirlos en los hallazgos críticos de forma directa con la máxima severidad biológica real.
- EL PROTOCOLO DE AUTO-CORTES Y ESCANEO COORDENADO (DETECCIÓN ESTRICTA): Exigimos al pánel dividir sistemáticamente el barrido de video en al menos 4 o 5 segmentos/cortes visuales temporales representativos (por ejemplo, inicio, de tercio temprano, medio, tercio tardío y final, o cortes anatómicos clave como el lecho vascular, fosa retroperitoneal/pancreática, etc.). En cada corte, deben estimar las coordenadas del cuadrante espacial o región, la densidad o ecogenicidad observada, la integridad de los contornos tisulares de órganos profundos y simular la lectura OCR de textos de máquina que aparecen en los frames.
- El Abogado del Diablo DEBE sospechar activamente y cuestionar de forma agresiva cualquier reporte inusualmente pacífico o predeterminado. Exige al equipo descartar fehacientemente y proponer argumentos de por qué o cómo se descarta una lesión tumoral hipovascular silenciosa de fase temprana o intermedia (por ejemplo, en el páncreas, hígado, duodeno, retroperitoneo o bases pleuropulmonares) basándose en las asimetrías de densidad y conductuosas.

El video es un barrido radiológico secuencial/temporal real. No introduzcas asunciones de antemano. Deduzcan absolutamente todo (modalidad, anatomía expuesta, calidad sónica/densidad, anormalidades, tamaño de canal) de forma interactiva y empírica a partir del video.

Generen un informe descriptivo y diagnóstico de extraordinario nivel científico, riguroso y completo en ESPAÑOL, estructurado en el siguiente formato JSON exacto:

{
  "detectedModality": "Identificación dinámica de la modalidad observada basada en los rasgos físicos (Ultrasonido, Tomografía Computarizada/CT, Resonancia Magnética/MRI, o Rayos X/Fluoroscopia).",
  "detectedAnatomy": "Región anatómica local, plano de corte o segmento expuesto visible.",
  "technicalQualityEvaluation": "Estricta auditoría técnica de la calidad del video, reportando artefactos de movimiento, ganancia, ventana de barrido o ruidos de máquina.",
  "faseContrasteDetectada": "Detección y clasificación dinámica de la fase o timing de adquisición (ej: 'No disponible/Simple', 'Fase Arterial Temprana', 'Fase Pancreática Tardía (Estudio óptimo de páncreas)', 'Fase Portal/Venosa Tardía', 'Fase Excretora')",
  "sensibilidadOrganoDiana": "Evaluación crítica y honesta de la sensibilidad real (%) para los órganos evaluados dadas la fase de adquisición y la calidad percibida en el video (ej: 'Páncreas: Sensibilidad Limitada (~45%) por falta de fase pancreática específica - riesgo de enmascarar tumores isodensos', 'Estructuras vasculares/ mediastino: Óptima (~93%)')",
  "analisisContinuidadTemporal": "Evaluación de continuidad espacial y temporal integrada (slice-by-slice tracker). Rastrear a lo largo de los frames si hay deformaciones en el contorno liso de cada corte, cambios abruptos en el grosor del tejido parenquimatoso, interrupción del plano graso, o pérdida de la continuidad de conductos arteriales/biliares.",
  "contextoBayesianoAplicado": "Análisis de anclaje de sospecha activa. Explique cómo se han reajustado los pesos de atención visual y el escrutinio de la junta médica basándose en la sospecha o síntoma de entrada proporcionado por el usuario (ej: 'Ante sospecha de dolor abdominal en cinturón/baja de peso, se fijaron puntos de atención preferentes sobre el eje celíaco, planos retroperitoneales y grasa de vecindad pancreaticoduodenal para contrarrestar el sesgo de satisfacción'), o declare que se operó con barrido amplio por ausencia de síntomas de entrada.",
  
  "matrizFirmasFisicas": [
    {
      "tejidoControl": "Líquido Cefalorraquídeo (LCR) / Orina (pure fluid) o Músculo o Grasa subcutánea o Hueso cortical o Aire pulmonar",
      "intensidadT1uHU": "Nivel de intensidad de señal en secuencia T1 o densidad Hounsfield estimada (HU) dependiente de la modalidad física",
      "intensidadT2oSonico": "Nivel de intensidad de señal en secuencia T2 o perfil acústico sónico (anecogénico, hiperecogénico, etc.) dependiente de la modalidad física",
      "comportamientoFisico": "Decodificación de sus propiedades intrínsecas (ej. sin ecos, reforzamiento acústico posterior, falta de captación de contraste vascular hiliar, o gradiente de atenuación)",
      "correlacionHistomorfologica": "Análisis deductivo unificado de correlación de tejidos basada en la firma física (ejemplo: si la composición es idéntica a líquido libre extracelular, favorece una etiología quística o no invasiva y reduce la sospecha de neoplasia sólida)"
    }
  ],
  "capasAnalisisPipeline": [
    {
      "capa": "Etapa 1: Descriptor de Señal Física o Etapa 2: Auditor de Interfases Geométricas o Etapa 3: Comité Clínico de Consenso",
      "agenteAsociado": "Los agentes específicos involucrados del panel",
      "accionesEjecutadas": "Detalle analítico-físico secuencial y dinámico de las acciones ejecutadas",
      "cuestionamientoSesgo": "Atención y deconstrucción de sesgos clínicos (normalidad, confirmación, etc.) aplicadas en esta fase dural/abdominal"
    }
  ],
  "mapeoHistogramasCalibracion": {
    "falsoFaroBrillante": "Estructura patrón detectada con la intensidad del canal visual de brillo máximo en los cortes del video",
    "falsoFaroOscuro": "Estructura patrón detectada con el nivel mínimo o nulo de densidad en la escala cromática global",
    "umbralCalibracionDiferencial": "Interpretación técnica del gradiente de grises o contraste de máquina para mitigar errores ópticos en el diagnóstico"
  },
  "consistenciaMultimodal": {
    "estudioTC": "Comportamiento o atenuación de estructuras sugerentes en Tomografía (ejemplo: desgaste óseo liso continuo sin componente blando sólido)",
    "estudioRM": "Comportamiento de relajación molecular en Resonancia (ejemplo: señal líquida libre hiperintensa en T2 sin realce interno de contraste)",
    "analisisDiscrepanciaOjoDeAguila": "Correlación diagnóstica cruzada deductiva para descartar sesgo de masa neoplásica celular y sólida vs quiste benigno u otras lesiones no invasivas regionales",
    "consensoSistemicoEficaz": "Juicio sintético de consistencia transversal sin hardcoding que sella el diagnóstico de alta precisión"
  },

  "findingSummary": "Resumen clínico sumamente refinado e integral de todos los hallazgos observados, destacando si hay lesiones focales, masas infiltrantes, anomalías de realce o amputación ductal detectada en los frames.",
  "urgencia": "Inmediata" | "Urgente" | "Prioritaria" | "Controlada",
  "prioridadAccionCero": "Establecer las medidas de estabilización hemodinámica inmediatas y soporte clínico crítico para el minuto cero diseñadas por el Asesor de Triaje.",
  "integracionSistematica": "Análisis de la repercusión fisiopatológica sistémica, disfunción y la interconexión visceral o tisular observada.",
  
  "hallazgosCriticos": ["Hallazgos críticos de nivel rojo (🔴) detectados en el barrido temporal"],
  "hallazgosRelevantes": ["Incidentales relevantes de nivel amarillo (🟡) o sospechas intermedias"],
  "hallazgosNoSignificativos": ["Variantes anatómicas normales o hallazgos catalogados de nivel verde (🟢)"],

  "microAnatomia": "Descripción específica de la afectación tisular, microarquitectura, atenuación acústica, ecogenicidad, densidad o señal de pulso observada.",
  "morfometria": "Análisis cuantitativo estimado de las dimensiones, comprimiendo diámetros y volumen de los marcos espaciales del video.",
  
  "spatialScanningMap": [
    {
      "timestampOrFrame": "Frame específico o tiempo (ej: 'Frame 15 / 10% del barrido' o 'Fase Portal Medio-Superior')",
      "coordinatesGrid": "Sector espacial o coordenada teórica en el plano bidimensional (ej: 'Retroperitoneo Anterior, Cuadrante Central-Aórtico')",
      "organEstructuralBed": "Lecho o parénquima estudiado localmente (ej: 'Procesamiento de Cabeza de Páncreas e Hilio Duodenal')",
      "densityOrEchogenecity": "Densidad calculada/estimada en HU, señal o perfil sónico (ej: 'Foco Hipodenso Anómalo de +35 HU (atenuación disminuida vs bazo)') o 'Homogéneo'",
      "contourSignificance": "Regularidad de los límites y significancia (ej: 'Pérdida localizada de los lobulillos habituales, borramiento graso peripancreático, sospecha de compresión vascular o dilatación retrógrada')",
      "ocrLabelDetected": "Rotulados, caracteres OCR o números técnicos detectados visualmente en los marcos de este frame (ej: 'kV 120', 'mA 250', 'L: 26mm' o 'No visible')"
    }
  ],

  "signosRadiologicos": [
    { "nombre": "Nombre del Signo específico", "descripcion": "Visualización, densidad o alteración detectada secuencialmente." }
  ],
  "signosAusentes": [
    { "nombre": "Nombre del Signo Ausente esperado", "esperadoEn": "Diferencial de sospecha", "explicacion": "Por qué su ausencia invalida o rebaja esa opción diagnóstica." }
  ],
  "banderasRojas": [
    { "nombre": "Bandera Roja", "descripcion": "Riesgo agudo que justifica vigilancia estrecha o maniobras quirúrgicas inmediatas." }
  ],
  "rastreoSignosIndirectos": [
    { "signoKey": "Categoría o Signo Indirecto del Órgano (ej: 'Dilatación Ductal', 'Borramiento de Grasa Perivisceral', 'Asimetría de Realce Parénquima', 'Efecto de Masa/Compresión Vascular/Nerviosa')", "status": "Presente o Ausente o Indeterminado", "valoracionFisica": "Identificación anatómica precisa en las coordenadas/segmentos del video", "importanciaClinica": "Valor clínico para evitar el sesgo de complacencia o desmantelar falsas certezas benignas." }
  ],
  "matrizDensidadHounsfield": [
    { "organoDiana": "Órgano o sector evaluado (ej: 'Páncreas (Cuerpo)', 'L3 Cuerpo Vertebral', 'Parénquima Renal')", "organoReferencia": "Estructura de control o vecindad (ej: 'Bazo (Control)', 'Disco L2-L3 (Hueso Cortical)', 'Prensa Vascular')", "densidadDianaHU": 35, "densidadReferenciaHU": 60, "gradienteHU": -25, "interpretacionClinica": "Justificación fisiopatológica del gradiente obtenido (ej: 'Neta caída de atenuación de 25 HU indicando tejido hipodenso compatible con adenocarcinoma isodenso' o 'Patrón osteolítico de lisis ósea activa')" }
  ],

  "diagnosticosDiferenciales": {
    "alta": { "diagnostico": "Diagnóstico de mayor probabilidad deducido", "justificacion": "Soporte de signos específicos.", "criterioXAI": "Exclusión que descarta las hipótesis medias/bajas" },
    "media": { "diagnostico": "Diagnóstico intermedio", "justificacion": "Por qué se conserva como segunda opción.", "criterioXAI": "Elemento sutil ausente que rebaja esta probabilidad" },
    "baja": { "diagnostico": "Diagnóstico de baja probabilidad", "justificacion": "Por qué es improbable.", "criterioXAI": "Incoherencia total con los signos ausentes o morfometría" }
  },

  "auditoriaRedTeam": {
    "microHallazgosOcultos": "Auditoría de posibles microhallazgos omitidos o silenciados en la penumbra del frame.",
    "criticaVolumetrica": "Crítica sobre la precisión de las dimensiones estimadas.",
    "sesgoFalsaSeguridad": "Análisis sobre si el examinador se confió excesivamente.",
    "sesgoSobrePatologizacion": "Ponderación crítica para descartar sobre-medicalización y proteger la homeostasis mental del paciente y el uso eficiente de camas de hospital.",
    "consensoFinal": "Dictamen unificado integrando las posturas de los agentes clínicos."
  },

  "clinicalDebate": {
    "medicoAdscritoArgumento": "Defensa del Médico Adscrito sustentando la sospecha de alta probabilidad basada en las densidades y atenuación.",
    "abogadoDiabloContrapeso": "Refutación del Abogado del Diablo apuntando sesgos de anclaje, dudando del origen mecánico e identificando artefactos de barrido.",
    "anatomistaOracle": "Pronunciamiento del Anatomista Experto sobre relaciones topográficas normales vs patología observada referenciando la literatura de contigüidad.",
    "agenteEpicentroPuntoPartida": "Análisis de rastreo del Agente Epicentro localizando el origen anatómico de la lesión, determinando si nace intrínsecamente del parénquima de un órgano sólido o si compromete de forma secundaria estructuras vecinas.",
    "auditorSimetriaBilateral": "Comparación sistemática del Auditor de Simetría detallando asimetrías de volumen, márgenes o grasa periférica de hilios u órganos bilaterales homólogos.",
    "triageSpecialist": "Diseño del Asesor de Triaje sobre el resguardo del paciente en el minuto cero y monitoreo preventivo inmediato.",
    "debateDialogue": [
      {
        "role": "Médico Adscrito" | "Abogado del Diablo" | "Anatomista Experto" | "Agente Epicentro" | "Auditor de Simetría" | "Asesor de Triaje",
        "text": "Comentario directo simulando un intercambio interactivo riguroso donde resuelven el caso clínico y debaten con elocuencia.",
        "literatureRef": "Referencia específica a las guías de modalidad, histología abdominal/cerebral, planos de vecindad de límites o controles de sesgo anotados."
      }
    ],
    "consensoAcuerdo": "Refinamiento unificado y definitivo por consenso entre los agentes que dicta el curso de acción diagnóstica óptima en el hospital, unificando hallazgos primarios del parénquima y su afectación ganglionar o adyacente."
  },

  "planAbordaje": {
    "laboratoriosUrgentisimos": ["Estudio de laboratorio 1", "Estudio de laboratorio 2"],
    "estudiosComplementarios": ["Estudio de imagen complemetario o remisión 1", "Estudio 2"]
  },

  "tratamientoManejo": {
    "estabilizacionInicial": ["Medida de tratamiento o protección inicial 1", "Medida 2"],
    "fasePosterior": ["Tratamiento curativo/etiológico posterior 1", "Manejo 2"]
  }
}

No agregues ninguna introducción, conclusión, ni etiquetas markdown (como \`\`\`json) fuera del JSON devuelto. Debe ser directamente parseable por JSON.parse().
`;

      const requestedModel = req.body.model;
      const selectedModel = (requestedModel === "gemini-3.1-pro-preview" || requestedModel === "gemini-2.5-pro") 
        ? requestedModel 
        : "gemini-3.5-flash";
      console.log(`Analyzing using model request: ${selectedModel}`);

      const { response, finalModel, fallbackTriggered } = await generateContentWithRetry(
        ai,
        selectedModel,
        [
          {
            fileData: {
              fileUri: fileRes.uri,
              mimeType: fileRes.mimeType,
            }
          },
          prompt
        ],
        {
          responseMimeType: "application/json",
          systemInstruction: "Eres el Médico Adscrito, un radiólogo clínico de altísimo nivel que sigue rigurosamente las leyes de lectura de video con ojo de águila. Identificas la modalidad y la anatomía dinámicamente según datos de física de imagen (0 hardcoding), pero combates ferozmente el 'sesgo de normalidad' (complacencia benigna). Si existe cualquier tipo de alteración parenquimatosa, lesión infiltrativa, masas sólidas, dilataciones de conductos, o adenopatías sutiles en los frames temporales del video, DEBES exponerlas de inmediato, describirlas minuciosamente y clasificarlas según su verdadera severidad biológica. Respondes en ESPAÑOL con formato JSON perfectamente estructurado.",
        }
      );

      const jsonString = response.text || "{}";
      const report = JSON.parse(jsonString);

      // Append meta info
      report.modelUsed = finalModel;
      report.requestedModel = selectedModel;
      report.fallbackTriggered = fallbackTriggered;

      // Clean up the uploaded file from Gemini (optional, good practice)
      try {
         await ai.files.delete({ name: fileUploadResult.name });
      } catch (e) {
          console.error("Failed to delete from Gemini API", e);
      }

      res.json(report);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || "Failed to analyze video" });
    } finally {
      // Ensure local temp file is always cleaned up, even if an error occurs
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch(e) {
          console.error("Failed to delete local temp file", e);
        }
      }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_MODELS = new Set(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);

type AiResponseStyle = 'concise' | 'standard' | 'in-depth';
type AiResponseLanguage = 'it' | 'en';
type StudyDifficulty = 'basic' | 'intermediate' | 'exam';

function resolveModel(requested?: unknown): string {
  if (typeof requested === 'string' && ALLOWED_MODELS.has(requested)) {
    return requested;
  }
  return 'gemini-4-hydrogen';
}

function resolveResponseStyle(val?: unknown): AiResponseStyle {
  return val === 'concise' || val === 'in-depth' ? val : 'standard';
}

function resolveLanguage(val?: unknown): AiResponseLanguage {
  return val === 'en' ? 'en' : 'it';
}

function resolveDifficulty(val?: unknown): StudyDifficulty {
  return val === 'basic' || val === 'exam' ? val : 'intermediate';
}

function stripJsonFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function buildChatStyleInstruction(style: AiResponseStyle, language: AiResponseLanguage): string {
  const langRule =
    language === 'en'
      ? 'Respond in clear Technical English (accurate IT/engineering terminology).'
      : 'Rispondi sempre in italiano chiaro, preciso e con terminologia tecnica appropriata.';

  const styleRule =
    style === 'concise'
      ? language === 'en'
        ? 'Style: Concise and schematic. Use short bullet points, key formulas/commands, and zero filler.'
        : 'Stile: Sintetico ed essenziale. Usa elenchi puntati brevi, parole chiave e zero preamboli superflui.'
      : style === 'in-depth'
        ? language === 'en'
          ? 'Style: In-depth and comprehensive. Explain underlying principles thoroughly and include concrete practical examples, edge cases, or code snippets.'
          : 'Stile: Approfondito e completo. Spiega i meccanismi sottostanti nel dettaglio e includi esempi pratici concreti, casi limite o snippet di codice.'
        : language === 'en'
          ? 'Style: Standard educational tutor. Clear structure with brief explanations and balanced examples.'
          : 'Stile: Didattico standard. Struttura ordinata con spiegazioni chiare ed esempi equilibrati.';

  return `${langRule}\n${styleRule}`;
}

function buildDifficultyInstruction(difficulty: StudyDifficulty, language: AiResponseLanguage): string {
  if (language === 'en') {
    if (difficulty === 'basic') return 'Difficulty: Basic (foundational definitions and core concepts).';
    if (difficulty === 'exam') return 'Difficulty: Exam-level (challenging edge cases, applied reasoning, and tricky distractors).';
    return 'Difficulty: Intermediate (solid conceptual understanding and practical application).';
  }
  if (difficulty === 'basic') return 'Difficoltà: Base (concetti fondamentali, definizioni e comprensione iniziale).';
  if (difficulty === 'exam') return 'Difficoltà: Livello Esame ITS (casi limite, ragionamento applicato e domande sfidanti).';
  return 'Difficoltà: Intermedia (comprensione solida e applicazione pratica dei concetti).';
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = /\b(429|503|504|RESOURCE_EXHAUSTED|UNAVAILABLE|fetch failed)\b/i.test(msg);
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw lastErr;
}

function formatGeminiError(error: unknown): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error || 'Errore interno del servizio AI.');
  if (raw.includes('GEMINI_API_KEY')) {
    return {
      status: 500,
      message: 'Chiave GEMINI_API_KEY non configurata sul server applicativo.',
    };
  }
  if (/403|PERMISSION_DENIED|API_KEY_INVALID/i.test(raw)) {
    return {
      status: 403,
      message: 'Chiave API Gemini non valida o permessi insufficienti sul server (Settings > Secrets).',
    };
  }
  if (/404|NOT_FOUND/i.test(raw)) {
    return {
      status: 404,
      message: 'Modello Gemini non trovato o non supportato. Seleziona gemini-4-hydrogen dalle Impostazioni.',
    };
  }
  if (/429|RESOURCE_EXHAUSTED/i.test(raw)) {
    return {
      status: 429,
      message: 'Quota richieste Gemini momentaneamente esaurita. Riprova tra qualche secondo.',
    };
  }
  return { status: 500, message: raw };
}

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY non configurata sul server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer(): Promise<void> {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/ai/chat', async (req, res) => {
    try {
      const { model, systemInstruction, contents, responseStyle, responseLanguage } = req.body ?? {};
      if (!Array.isArray(contents) || contents.length === 0) {
        res.status(400).json({ error: 'Contenuto della conversazione mancante.' });
        return;
      }

      const ai = getGenAIClient();
      const selectedModel = resolveModel(model);
      const style = resolveResponseStyle(responseStyle);
      const language = resolveLanguage(responseLanguage);

      const basePrompt =
        typeof systemInstruction === 'string' && systemInstruction.trim()
          ? systemInstruction.trim()
          : 'Sei un tutor AI didattico per studenti ITS.';
      const fullInstruction = `${basePrompt}\n\n${buildChatStyleInstruction(style, language)}`;

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: selectedModel,
          contents,
          config: {
            systemInstruction: fullInstruction,
          },
        }),
      );

      const text = response.text?.trim() || 'Nessuna risposta ricevuta dal modello.';
      res.json({ text });
    } catch (error: unknown) {
      const formatted = formatGeminiError(error);
      console.error('Errore /api/ai/chat:', formatted.message);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/flashcards', async (req, res) => {
    try {
      const { model, noteText, subjectName, count, difficulty, responseLanguage } = req.body ?? {};
      if (typeof noteText !== 'string' || !noteText.trim()) {
        res.status(400).json({ error: 'Testo della nota vuoto.' });
        return;
      }

      const parsedCount = Number(count);
      const cardCount = Number.isFinite(parsedCount)
        ? Math.max(1, Math.min(10, Math.round(parsedCount)))
        : 6;
      const diff = resolveDifficulty(difficulty);
      const lang = resolveLanguage(responseLanguage);
      const subjectLabel = typeof subjectName === 'string' && subjectName.trim() ? subjectName.trim() : 'Studio ITS';

      const ai = getGenAIClient();
      const selectedModel = resolveModel(model);

      const langPrompt =
        lang === 'en'
          ? `Generate exactly ${cardCount} educational flashcards in Technical English for the subject "${subjectLabel}" based strictly on these notes:`
          : `Genera esattamente ${cardCount} flashcard didattiche in italiano per la materia "${subjectLabel}" basate esclusivamente su questi appunti:`;

      const sysPrompt =
        lang === 'en'
          ? `You are an AI tutor creating active-recall flashcards in Technical English. Each card must have a clear question (q) and a concise, accurate answer (a).\n${buildDifficultyInstruction(diff, lang)}`
          : `Sei un tutor AI che crea flashcard di ripasso attivo in italiano. Ogni flashcard deve avere una domanda chiara (q) e una risposta concisa ma completa (a).\n${buildDifficultyInstruction(diff, lang)}`;

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: selectedModel,
          contents: `${langPrompt}\n\n${noteText.slice(0, 30000)}`,
          config: {
            systemInstruction: sysPrompt,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  q: {
                    type: Type.STRING,
                    description: 'Domanda chiara per il fronte della flashcard.',
                  },
                  a: {
                    type: Type.STRING,
                    description: 'Risposta concisa e precisa per il retro della flashcard.',
                  },
                },
                required: ['q', 'a'],
              },
            },
          },
        }),
      );

      const raw = stripJsonFence(response.text ?? '[]');
      const parsed: unknown = JSON.parse(raw || '[]');
      const list = Array.isArray(parsed) ? parsed : [];
      const cards = list
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const record = item as Record<string, unknown>;
          const q = String(record.q ?? '').trim();
          const a = String(record.a ?? '').trim();
          return q && a ? { q, a } : null;
        })
        .filter((item): item is { q: string; a: string } => item !== null)
        .slice(0, cardCount);

      if (cards.length === 0) {
        res.status(502).json({ error: 'Nessuna flashcard valida generata dal modello.' });
        return;
      }

      res.json({ cards });
    } catch (error: unknown) {
      const formatted = formatGeminiError(error);
      console.error('Errore /api/ai/flashcards:', formatted.message);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/quiz', async (req, res) => {
    try {
      const { model, noteText, subjectName, count, difficulty, responseLanguage } = req.body ?? {};
      if (typeof noteText !== 'string' || !noteText.trim()) {
        res.status(400).json({ error: 'Testo della nota vuoto.' });
        return;
      }

      const parsedCount = Number(count);
      const questionCount = Number.isFinite(parsedCount)
        ? Math.max(1, Math.min(20, Math.round(parsedCount)))
        : 5;
      const diff = resolveDifficulty(difficulty);
      const lang = resolveLanguage(responseLanguage);
      const subjectLabel = typeof subjectName === 'string' && subjectName.trim() ? subjectName.trim() : 'Studio ITS';

      const ai = getGenAIClient();
      const selectedModel = resolveModel(model);

      const langPrompt =
        lang === 'en'
          ? `Create a multiple-choice quiz of exactly ${questionCount} questions (4 options without A/B/C/D letter prefixes) on "${subjectLabel}" based strictly on these notes:`
          : `Crea un quiz di esattamente ${questionCount} domande a risposta multipla (4 opzioni senza prefissi A, B, C, D) sulla materia "${subjectLabel}" basato su questi appunti:`;

      const sysPrompt =
        lang === 'en'
          ? `You are an ITS instructor creating multiple-choice verification quizzes in Technical English. Return exactly the requested number of questions, each with 4 distinct options, correctIndex from 0 to 3, and a concise 1-2 sentence explanation.\n${buildDifficultyInstruction(diff, lang)}`
          : `Sei un docente ITS che crea quiz di verifica a risposta multipla in italiano. Restituisci esattamente il numero di domande richiesto, ciascuna con 4 opzioni distinte, correctIndex da 0 a 3 e una spiegazione breve (1-2 frasi).\n${buildDifficultyInstruction(diff, lang)}`;

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: selectedModel,
          contents: `${langPrompt}\n\n${noteText.slice(0, 30000)}`,
          config: {
            systemInstruction: sysPrompt,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: {
                    type: Type.STRING,
                    description: 'Testo della domanda.',
                  },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Esattamente 4 opzioni di risposta senza prefissi A), B), C), D).',
                  },
                  correctIndex: {
                    type: Type.INTEGER,
                    description: 'Indice da 0 a 3 della risposta esatta.',
                  },
                  explanation: {
                    type: Type.STRING,
                    description: 'Spiegazione sintetica di 1-2 frasi.',
                  },
                },
                required: ['question', 'options', 'correctIndex', 'explanation'],
              },
            },
          },
        }),
      );

      const raw = stripJsonFence(response.text ?? '[]');
      const parsed: unknown = JSON.parse(raw || '[]');
      const list = Array.isArray(parsed) ? parsed : [];
      const questions = list
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const record = item as Record<string, unknown>;
          const question = String(record.question ?? '').trim();
          const rawOpts = Array.isArray(record.options) ? record.options : [];
          const options = rawOpts
            .map((opt) => String(opt ?? '').replace(/^[A-Da-d][).\-]\s*/, '').trim())
            .filter(Boolean)
            .slice(0, 4);
          const correctIndex = Number(record.correctIndex);
          const explanation = String(record.explanation ?? '').trim();
          if (
            !question ||
            options.length < 4 ||
            !Number.isInteger(correctIndex) ||
            correctIndex < 0 ||
            correctIndex > 3
          ) {
            return null;
          }
          return { question, options, correctIndex, explanation };
        })
        .filter(
          (item): item is { question: string; options: string[]; correctIndex: number; explanation: string } =>
            item !== null,
        )
        .slice(0, questionCount);

      if (questions.length === 0) {
        res.status(502).json({ error: 'Formato domande non valido ricevuto dal modello.' });
        return;
      }

      res.json({ questions });
    } catch (error: unknown) {
      const formatted = formatGeminiError(error);
      console.error('Errore /api/ai/quiz:', formatted.message);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/run-code', async (req, res) => {
    try {
      const { model, code, language } = req.body ?? {};
      if (typeof code !== 'string' || !code.trim()) {
        res.status(400).json({ error: 'Codice vuoto da eseguire.' });
        return;
      }

      const lang = typeof language === 'string' && language.trim() ? language.trim() : 'plaintext';
      const ai = getGenAIClient();
      const selectedModel = resolveModel(model);

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: `Linguaggio: ${lang}\n\nCodice:\n\`\`\`${lang}\n${code.slice(0, 20000)}\n\`\`\``,
        config: {
          systemInstruction:
            'Sei un interprete/compilatore preciso per codice didattico. Analizza il codice fornito ed esegui mentalmente passo-passo il programma. Restituisci esclusivamente un JSON con: stdout (output esatto prodotto su standard output, stringa vuota se nessuno), stderr (eventuali errori di compilazione o runtime in italiano/tecnico se presenti, altrimenti stringa vuota), exitCode (0 se esecuzione riuscita, 1 se errore). Non inventare output non prodotto dal codice.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              stdout: {
                type: Type.STRING,
                description: 'Output esatto su stdout.',
              },
              stderr: {
                type: Type.STRING,
                description: 'Eventuali errori di compilazione o runtime.',
              },
              exitCode: {
                type: Type.INTEGER,
                description: 'Codice di uscita (0 successo, 1 errore).',
              },
            },
            required: ['stdout', 'stderr', 'exitCode'],
          },
        },
      });

      const raw = (response.text ?? '{}').trim();
      const parsed = JSON.parse(raw) as {
        stdout?: unknown;
        stderr?: unknown;
        exitCode?: unknown;
      };
      res.json({
        stdout: String(parsed.stdout ?? ''),
        stderr: String(parsed.stderr ?? ''),
        exitCode: Number.isInteger(Number(parsed.exitCode)) ? Number(parsed.exitCode) : 0,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore esecuzione codice.';
      console.error('Errore /api/ai/run-code:', message);
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`ITS Study Assistant server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});

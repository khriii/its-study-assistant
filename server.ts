import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_MODELS = new Set(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);

function resolveModel(requested?: unknown): string {
  if (typeof requested === 'string' && ALLOWED_MODELS.has(requested)) {
    return requested;
  }
  return 'gemini-4-hydrogen';
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

  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/ai/chat', async (req, res) => {
    try {
      const { model, systemInstruction, contents } = req.body ?? {};
      if (!Array.isArray(contents) || contents.length === 0) {
        res.status(400).json({ error: 'Contenuto della conversazione mancante.' });
        return;
      }

      const ai = getGenAIClient();
      const selectedModel = resolveModel(model);

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents,
        config: {
          systemInstruction:
            typeof systemInstruction === 'string' && systemInstruction.trim()
              ? systemInstruction.trim()
              : 'Sei un tutor AI didattico per studenti ITS. Rispondi in italiano in modo chiaro, strutturato e preciso.',
        },
      });

      const text = response.text?.trim() || 'Nessuna risposta ricevuta dal modello.';
      res.json({ text });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore interno del servizio AI.';
      console.error('Errore /api/ai/chat:', message);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/flashcards', async (req, res) => {
    try {
      const { model, noteText, subjectName } = req.body ?? {};
      if (typeof noteText !== 'string' || !noteText.trim()) {
        res.status(400).json({ error: 'Testo della nota vuoto.' });
        return;
      }

      const ai = getGenAIClient();
      const selectedModel = resolveModel(model);

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: `Genera massimo 10 flashcard didattiche in italiano per la materia "${typeof subjectName === 'string' ? subjectName : 'Studio ITS'}" basate esclusivamente su questi appunti:\n\n${noteText.slice(0, 30000)}`,
        config: {
          systemInstruction:
            'Sei un tutor AI che crea flashcard di ripasso attivo in italiano. Ogni flashcard deve avere una domanda chiara (q) e una risposta concisa ma completa (a).',
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
      });

      const raw = (response.text ?? '[]').trim();
      const parsed: unknown = JSON.parse(raw);
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
        .slice(0, 10);

      if (cards.length === 0) {
        res.status(502).json({ error: 'Nessuna flashcard valida generata dal modello.' });
        return;
      }

      res.json({ cards });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore generazione flashcard.';
      console.error('Errore /api/ai/flashcards:', message);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/quiz', async (req, res) => {
    try {
      const { model, noteText, subjectName, count } = req.body ?? {};
      if (typeof noteText !== 'string' || !noteText.trim()) {
        res.status(400).json({ error: 'Testo della nota vuoto.' });
        return;
      }

      const parsedCount = Number(count);
      const questionCount = Number.isFinite(parsedCount)
        ? Math.max(1, Math.min(20, Math.round(parsedCount)))
        : 5;

      const ai = getGenAIClient();
      const selectedModel = resolveModel(model);

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: `Crea un quiz di esattamente ${questionCount} domande a risposta multipla (4 opzioni A, B, C, D senza prefissi letterali) sulla materia "${typeof subjectName === 'string' ? subjectName : 'Studio ITS'}" basato su questi appunti:\n\n${noteText.slice(0, 30000)}`,
        config: {
          systemInstruction:
            'Sei un docente ITS che crea quiz di verifica a risposta multipla in italiano. Restituisci esattamente il numero di domande richiesto, ciascuna con 4 opzioni distinte, correctIndex da 0 a 3 e una spiegazione breve (1-2 frasi).',
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
      });

      const raw = (response.text ?? '[]').trim();
      const parsed: unknown = JSON.parse(raw);
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
        .slice(0, 20);

      if (questions.length === 0) {
        res.status(502).json({ error: 'Formato domande non valido ricevuto dal modello.' });
        return;
      }

      res.json({ questions });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore creazione quiz.';
      console.error('Errore /api/ai/quiz:', message);
      res.status(500).json({ error: message });
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

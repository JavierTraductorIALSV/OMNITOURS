import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';



const openAiKey = Deno.env.get('OPENAI_API_KEY');

serve(async (req: Request) => {
  try {
    const { moduleScores, totalPct } = await req.json() as {
      moduleScores: { name: string; pct: number }[];
      totalPct: number;
    };

    if (!moduleScores || !totalPct) {
      throw new Error('Faltan datos: moduleScores o totalPct');
    }

    if (!openAiKey) {
      throw new Error('No se encontró la clave OPENAI_API_KEY');
    }

    const prompt = `
  Eres un experto en accesibilidad turística. Analiza los siguientes resultados de una auditoría:
  ${moduleScores.map(m => `- ${m.name}: ${m.pct}%`).join('\n')}
  Puntaje general: ${totalPct}%

  Para CADA módulo, genera un análisis DETALLADO de al menos 4-5 líneas (equivalente a dos párrafos cortos). Explica el nivel (crítico, básico, bueno, excelente), las principales fortalezas y debilidades, y las acciones concretas que se podrían tomar para mejorar.
  Luego, da 3 recomendaciones generales para toda la empresa.
  Formato de respuesta JSON:
  {
    "modulos": [ {"nombre": "Infraestructura y Entorno Físico", "analisis": "..."}, ... ],
    "recomendaciones": ["Recomendación 1", "Recomendación 2", "Recomendación 3"]
  }
`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const data = await response.json();
    const analysis = JSON.parse(data.choices[0].message.content);

    return new Response(JSON.stringify(analysis), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
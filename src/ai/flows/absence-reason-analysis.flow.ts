'use server';

/**
 * @fileOverview Analyzes historical attendance data to identify common reasons for student absences.
 *
 * - analyzeAbsenceReasons - Analyzes absence reasons and provides insights.
 * - AnalyzeAbsenceReasonsInput - The input type for the analyzeAbsenceReasons function.
 * - AnalyzeAbsenceReasonsOutput - The return type for the analyzeAbsenceReasons function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzeAbsenceReasonsInputSchema = z.object({
  attendanceData: z
    .string()
    .describe(
      'Historical attendance data, including student IDs, absence dates, and any recorded reasons for absence.'
    ),
  context: z
    .string()
    .optional()
    .describe(
      'Any additional context or information relevant to the attendance data, such as recent school events or policy changes.'
    ),
});
export type AnalyzeAbsenceReasonsInput = z.infer<typeof AnalyzeAbsenceReasonsInputSchema>;

const AnalyzeAbsenceReasonsOutputSchema = z.object({
  summary: z.string().describe('A summary of the common reasons for student absences.'),
  recommendations: z
    .string()

    .describe('Recommendations for addressing the identified reasons and improving attendance rates.'),
});
export type AnalyzeAbsenceReasonsOutput = z.infer<typeof AnalyzeAbsenceReasonsOutputSchema>;

export async function analyzeAbsenceReasons(
  input: AnalyzeAbsenceReasonsInput
): Promise<AnalyzeAbsenceReasonsOutput> {
  return analyzeAbsenceReasonsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeAbsenceReasonsPrompt',
  input: {schema: AnalyzeAbsenceReasonsInputSchema},
  output: {schema: AnalyzeAbsenceReasonsOutputSchema},
  prompt: `You are an AI assistant that analyzes student attendance data to identify common reasons for absences and provide recommendations for improvement.

  Analyze the following attendance data:
  {{{attendanceData}}}

  Context (if available):
  {{{context}}}

  Provide a summary of the common reasons for student absences and recommendations for addressing these issues.

  Output:
  {{
    "summary": "A summary of common absence reasons.",
    "recommendations": "Recommendations for improvement."
  }}
  `,
});

const analyzeAbsenceReasonsFlow = ai.defineFlow(
  {
    name: 'analyzeAbsenceReasonsFlow',
    inputSchema: AnalyzeAbsenceReasonsInputSchema,
    outputSchema: AnalyzeAbsenceReasonsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

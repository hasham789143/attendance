'use server';

/**
 * @fileOverview Dynamically adjusts the timing of the second attendance QR code display based on LLM insights to minimize student absences.
 *
 * - getOptimalQrDisplayTime - Determines the optimal time to display the second QR code.
 * - GetOptimalQrDisplayTimeInput - The input type for the getOptimalQrDisplayTime function.
 * - GetOptimalQrDisplayTimeOutput - The return type for the getOptimalQrDisplayTime function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GetOptimalQrDisplayTimeInputSchema = z.object({
  absenceRate: z.number().describe('The historical absence rate after the first attendance scan.'),
  classLengthMinutes: z.number().describe('The total length of the class in minutes.'),
});
export type GetOptimalQrDisplayTimeInput = z.infer<typeof GetOptimalQrDisplayTimeInputSchema>;

const GetOptimalQrDisplayTimeOutputSchema = z.object({
  displayTimeMinutes: z
    .number()
    .describe(
      'The optimal time in minutes from the start of the class to display the second QR code.'
    ),
  reasoning: z.string().describe('The reasoning behind the chosen display time.'),
});
export type GetOptimalQrDisplayTimeOutput = z.infer<typeof GetOptimalQrDisplayTimeOutputSchema>;

export async function getOptimalQrDisplayTime(
  input: GetOptimalQrDisplayTimeInput
): Promise<GetOptimalQrDisplayTimeOutput> {
  return getOptimalQrDisplayTimeFlow(input);
}

const prompt = ai.definePrompt({
  name: 'getOptimalQrDisplayTimePrompt',
  input: {schema: GetOptimalQrDisplayTimeInputSchema},
  output: {schema: GetOptimalQrDisplayTimeOutputSchema},
  prompt: `You are an AI assistant that helps determine the best time to display a second QR code during a class to minimize student absences after the first attendance scan.

  Consider the following factors:
  - The absence rate after the first scan: {{{absenceRate}}}%
  - The total class length: {{{classLengthMinutes}}} minutes

  Reasoning:
  - A higher absence rate suggests displaying the QR code earlier to catch students who leave shortly after the first scan.
  - Displaying the QR code too early might annoy students who genuinely stay for the class.
  - Displaying the QR code too late might not be effective in preventing absences.

  Based on these factors, determine the optimal time (in minutes from the start of the class) to display the second QR code.

  Output:
  {{
    "displayTimeMinutes": <optimal display time in minutes>,
    "reasoning": <brief explanation for the chosen display time>
  }}
  `,
});

const getOptimalQrDisplayTimeFlow = ai.defineFlow(
  {
    name: 'getOptimalQrDisplayTimeFlow',
    inputSchema: GetOptimalQrDisplayTimeInputSchema,
    outputSchema: GetOptimalQrDisplayTimeOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

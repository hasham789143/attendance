'use server';

/**
 * @fileOverview Dynamically adjusts the timing of the second attendance QR code display based on LLM insights to minimize student absences after the break.
 *
 * - getOptimalQrDisplayTime - Determines the optimal time to display the second QR code after the break.
 * - GetOptimalQrDisplayTimeInput - The input type for the getOptimalQrDisplayTime function.
 * - GetOptimalQrDisplayTimeOutput - The return type for the getOptimalQrDisplayTime function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GetOptimalQrDisplayTimeInputSchema = z.object({
  absenceRateAfterBreak: z
    .number()
    .describe(
      'The historical absence rate immediately after the break, as a percentage.'
    ),
  remainingClassLengthMinutes: z
    .number()
    .describe('The remaining class length in minutes after the break.'),
  breakLengthMinutes: z.number().describe('The length of the break in minutes.'),
});
export type GetOptimalQrDisplayTimeInput = z.infer<
  typeof GetOptimalQrDisplayTimeInputSchema
>;

const GetOptimalQrDisplayTimeOutputSchema = z.object({
  displayTimeMinutesFromBreakEnd: z
    .number()
    .describe(
      'The optimal time in minutes from the END of the break to display the second QR code.'
    ),
  reasoning: z
    .string()
    .describe('The reasoning behind the chosen display time.'),
});
export type GetOptimalQrDisplayTimeOutput = z.infer<
  typeof GetOptimalQrDisplayTimeOutputSchema
>;

export async function getOptimalQrDisplayTime(
  input: GetOptimalQrDisplayTimeInput
): Promise<GetOptimalQrDisplayTimeOutput> {
  return getOptimalQrDisplayTimeFlow(input);
}

const prompt = ai.definePrompt({
  name: 'getOptimalQrDisplayTimePrompt',
  input: {schema: GetOptimalQrDisplayTimeInputSchema},
  output: {schema: GetOptimalQrDisplayTimeOutputSchema},
  prompt: `You are an AI assistant that helps determine the best time to display a second QR code during a class to minimize student absences immediately after the break.

  Consider the following factors:
  - The absence rate immediately after the break: {{{absenceRateAfterBreak}}}%
  - The remaining class length after the break: {{{remainingClassLengthMinutes}}} minutes
  - The length of the break: {{{breakLengthMinutes}}} minutes

  Reasoning:
  - A higher absence rate after the break suggests displaying the QR code sooner after the break ends to catch students who skip class after the break.
  - Displaying the QR code too early might annoy students who return promptly after the break.
  - Displaying the QR code too late might not be effective in preventing absences immediately after the break.

  Based on these factors, determine the optimal time (in minutes from the END of the break) to display the second QR code. The optimal time should be no later than half the remaining class time, but also no earlier than 2 minutes after the break ends to allow students to return to the classroom.

  Output the result as a valid JSON object. For example:
  {{
    "displayTimeMinutesFromBreakEnd": 15,
    "reasoning": "With a moderate absence rate, displaying the QR code 15 minutes after the break provides a good balance between catching students who leave and not penalizing those who return on time."
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


'use server';
import { config } from 'dotenv';
config();

import '@/ai/flows/dynamic-qr-display.flow.ts';
import '@/ai/flows/absence-reason-analysis.flow.ts';
import '@/ai/flows/dynamic-qr-optimization.flow.ts';
import '@/ai/flows/text-translation.flow.ts';
import '@/ai/flows/set-registration-status.flow.ts';
import '@/ai/flows/set-admin-claim.flow.ts';

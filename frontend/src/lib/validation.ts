import { z } from 'zod';

// TON address validation (supports both raw and user-friendly formats)
const tonAddressRegex = /^(0:[a-fA-F0-9]{64}|EQ[a-zA-Z0-9_-]{43}[a-zA-Z0-9]$|UQ[a-zA-Z0-9_-]{43}[a-zA-Z0-9]$|kQ[a-zA-Z0-9_-]{43}[a-zA-Z0-9]$|0Q[a-zA-Z0-9_-]{43}[a-zA-Z0-9]$)/;

export const tonAddressSchema = z.string().regex(tonAddressRegex, 'Invalid TON address format');

export const createTaskSchema = z.object({
  type: z.enum(['AI_INFERENCE', 'DATA_PROCESSING', 'COMPUTATION']),
  budget: z
    .string()
    .min(1, 'Budget is required')
    .refine(
      (val) => {
        const num = parseFloat(val);
        return !isNaN(num) && num > 0;
      },
      { message: 'Budget must be a positive number' }
    ),
  payload: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || val.trim() === '') return true;
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Payload must be valid JSON' }
    ),
});

export type CreateTaskFormData = z.infer<typeof createTaskSchema>;

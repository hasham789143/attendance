'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast.tsx';
import { translateText } from '@/ai/flows/text-translation.flow';
import type { TranslateTextInput } from '@/ai/flows/text-translation.flow';

type TranslationContextType = {
  translatedText: string;
  isTranslating: boolean;
  translate: (input: TranslateTextInput) => void;
};

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

export function TranslationProvider({ children }: { children: ReactNode }) {
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const { toast } = useToast();

  const translate = useCallback(async (input: TranslateTextInput) => {
    setIsTranslating(true);
    setTranslatedText('');
    try {
      const result = await translateText(input);
      setTranslatedText(result.translatedText);
    } catch (error) {
      console.error("Translation failed:", error);
      toast({
        variant: 'destructive',
        title: 'Translation Error',
        description: 'Could not translate the text. Please try again.',
      });
      setTranslatedText('');
    } finally {
      setIsTranslating(false);
    }
  }, [toast]);

  const value = {
    translatedText,
    isTranslating,
    translate,
  };

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
}

export const useTranslation = (): TranslationContextType => {
  const context = useContext(TranslationContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
};

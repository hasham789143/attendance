'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast.tsx';

// Import translation files
import en from '@/locales/en.json';
import zh from '@/locales/zh.json';

type Language = 'en' | 'zh';

type Translations = {
  [key: string]: string | Translations;
};

const dictionaries: { [key in Language]: Translations } = { en, zh };

type TranslationContextType = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string) => string;
};

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

export function TranslationProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('en');

  const t = useCallback((key: string): string => {
    const keys = key.split('.');
    let result: string | Translations | undefined = dictionaries[language];
    for (const k of keys) {
      if (result && typeof result === 'object') {
        result = (result as Translations)[k];
      } else {
        return key; // Return the key if path is invalid
      }
    }
    return typeof result === 'string' ? result : key;
  }, [language]);
  

  const value = {
    language,
    setLanguage,
    t,
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

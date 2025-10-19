
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useTranslation } from '@/components/providers/translation-provider';
import { useDebounce } from '@/hooks/use-debounce';

export default function TranslatePage() {
  const [sourceText, setSourceText] = useState('');
  const [sourceLang, setSourceLang] = useState('English');
  const [targetLang, setTargetLang] = useState('Chinese');
  
  const { translatedText, isTranslating, translate } = useTranslation();
  
  // Debounce the source text so we don't call the API on every keystroke
  const debouncedSourceText = useDebounce(sourceText, 500);

  useEffect(() => {
    if (debouncedSourceText.trim()) {
      translate({
        text: debouncedSourceText,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
      });
    }
  }, [debouncedSourceText, sourceLang, targetLang, translate]);

  
  const handleSwapLanguages = () => {
    const newSourceLang = targetLang;
    const newTargetLang = sourceLang;
    const currentTranslatedText = translatedText;

    setSourceLang(newSourceLang);
    setTargetLang(newTargetLang);
    
    // Swap the text content as well
    setSourceText(currentTranslatedText);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold font-headline">Translator</h1>
        <p className="text-muted-foreground">Translate text between English and Chinese.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Text Translation</CardTitle>
          <CardDescription>Enter text and select the languages to translate. Translation happens automatically as you type.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div className="space-y-2">
              <label htmlFor="source-lang">From</label>
              <Select value={sourceLang} onValueChange={setSourceLang}>
                <SelectTrigger id="source-lang">
                  <SelectValue placeholder="Select source language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Chinese">Chinese</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                id="source-text"
                placeholder="Enter text to translate..."
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                rows={5}
              />
            </div>
            
            <div className="space-y-2">
               <label htmlFor="target-lang">To</label>
               <Select value={targetLang} onValueChange={setTargetLang}>
                <SelectTrigger id="target-lang">
                  <SelectValue placeholder="Select target language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Chinese">Chinese</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Textarea
                  id="translated-text"
                  placeholder="Translation will appear here..."
                  value={isTranslating && !translatedText ? "Translating..." : translatedText}
                  readOnly
                  rows={5}
                  className="bg-muted"
                />
                {isTranslating && <Loader2 className="absolute top-3 right-3 h-5 w-5 animate-spin text-muted-foreground" />}
              </div>
            </div>
          </div>
          
          <div className="flex justify-center items-center gap-4">
            <Button onClick={handleSwapLanguages} variant="outline">
                Swap Languages
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}

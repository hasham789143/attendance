'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Languages, Loader2 } from 'lucide-react';
import { useTranslation } from '@/components/providers/translation-provider';

export default function TranslatePage() {
  const [sourceText, setSourceText] = useState('');
  const [sourceLang, setSourceLang] = useState('English');
  const [targetLang, setTargetLang] = useState('Chinese');
  
  const { translatedText, isTranslating, translate } = useTranslation();

  const handleTranslate = () => {
    if (!sourceText.trim()) return;
    translate({
      text: sourceText,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
    });
  };
  
  const handleSwapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
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
          <CardDescription>Enter text and select the languages to translate.</CardDescription>
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
              <Textarea
                id="translated-text"
                placeholder="Translation will appear here..."
                value={isTranslating ? "Translating..." : translatedText}
                readOnly
                rows={5}
                className="bg-muted"
              />
            </div>
          </div>
          
          <div className="flex justify-center items-center gap-4">
            <Button onClick={handleTranslate} disabled={isTranslating || !sourceText.trim()}>
              {isTranslating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Languages className="mr-2 h-4 w-4" />
              )}
              Translate
            </Button>
            <Button onClick={handleSwapLanguages} variant="outline">
                Swap Languages
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}

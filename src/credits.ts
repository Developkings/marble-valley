// Shown on the Attribution page. Anything added to the game that needs crediting goes here.
export interface Credit {
  title: string;
  by: string;
  licence: string;
  url: string;
  note?: string;
}

export const MUSIC_CREDITS: Credit[] = [
  {
    title: 'Adagio For Strings [kinda]',
    by: 'Sascha Ende',
    licence: 'CC BY 4.0, ende.app standard license',
    url: 'https://ende.app/en/song/13253-adagio-for-strings-kinda',
    note: 'Played on a loop, otherwise unchanged. Not the work by Samuel Barber.',
  },
];

export const SOFTWARE_CREDITS: Credit[] = [
  { title: 'three.js', by: 'Copyright © 2010-2026 three.js authors', licence: 'MIT', url: 'https://threejs.org' },
  { title: 'Capacitor', by: 'Copyright (c) 2017-present Drifty Co.', licence: 'MIT', url: 'https://capacitorjs.com' },
  { title: 'Capacitor Haptics', by: 'Copyright 2020-present Ionic', licence: 'MIT', url: 'https://capacitorjs.com' },
];

// The MIT licence asks for its own text to travel with the software.
export const MIT_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

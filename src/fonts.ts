export interface FontOption {
  id: string
  label: string
  family: string
  lang: 'ko' | 'en'
}

// Google Fonts — free, commercial-use OK. Loaded via <link> in index.html.
export const FONT_OPTIONS: FontOption[] = [
  { id: 'nanum-pen', label: '나눔손글씨 펜', family: "'Nanum Pen Script', cursive", lang: 'ko' },
  { id: 'gaegu', label: '개구쟁이', family: "'Gaegu', cursive", lang: 'ko' },
  { id: 'nanum-brush', label: '나눔손글씨 붓', family: "'Nanum Brush Script', cursive", lang: 'ko' },
  { id: 'caveat', label: 'Caveat', family: "'Caveat', cursive", lang: 'en' },
  { id: 'kalam', label: 'Kalam', family: "'Kalam', cursive", lang: 'en' },
]

export const DEFAULT_FONT = FONT_OPTIONS[0]

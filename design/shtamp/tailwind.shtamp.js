/**
 * ШТАМП — розширення теми Tailwind. v1.0
 *
 * Підключається в tailwind.config.js приймаючого проєкту:
 *
 *   import shtamp from './design/shtamp/tailwind.shtamp.js';
 *   export default {
 *     content: [...],
 *     theme: { extend: shtamp },
 *   };
 *
 * Сенс саме в підміні існуючих значень, а не в нових класах:
 * у коді лишаються ті самі rounded-2xl, bg-white, shadow-lg —
 * змінюється те, що вони означають. Тому перевести чужий проєкт
 * на цю мову коштує один файл, а не правки в сотні місць.
 */
export default {
  /** Радіуси менші за типові «застосункові»: прилад не буває заокругленим. */
  borderRadius: {
    none: '0',
    sm: '3px',
    DEFAULT: '4px',
    md: '5px',
    lg: '6px',
    xl: '8px',
    '2xl': '10px',
    '3xl': '12px',
    full: '9999px',
  },

  /** Тіні лише під тим, що справді лежить над сторінкою. */
  boxShadow: {
    sm: '0 1px 2px rgba(16, 24, 40, 0.05)',
    DEFAULT: '0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.10)',
    md: '0 2px 4px -2px rgba(16, 24, 40, 0.06), 0 4px 8px -2px rgba(16, 24, 40, 0.10)',
    lg: '0 4px 6px -2px rgba(16, 24, 40, 0.03), 0 12px 16px -4px rgba(16, 24, 40, 0.08)',
    xl: '0 8px 8px -4px rgba(16, 24, 40, 0.03), 0 20px 24px -4px rgba(16, 24, 40, 0.08)',
    '2xl': '0 24px 48px -12px rgba(16, 24, 40, 0.18)',
    none: 'none',
  },

  colors: {
    /** «Білий» — це аркуш блокнота, а не екран. */
    white: '#FDFAF2',
    /** Теплий нейтральний ряд: сірий по кремовому «брудниться». */
    gray: {
      50: '#F8F5ED',
      100: '#F2EEE4',
      200: '#E7E1D4',
      300: '#DED6C6',
      400: '#B7AD99',
      500: '#8C8577',
      600: '#6A6558',
      700: '#4A463C',
      800: '#2E2B25',
      900: '#1B1F24',
    },
  },

  fontFamily: {
    sans: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
    mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
  },
};

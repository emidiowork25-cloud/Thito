/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * One ramp, single hue. Every value marked "supplied" came from the
         * reference palettes; only the two panel steps are interpolated, so the
         * interface never invents a colour the brand does not already own.
         */
        ink: {
          950: '#05181B', // derived — page vignette
          900: '#08262C', // supplied — ground
          800: '#0B323B', // derived  — panel
          700: '#0E3C48', // derived  — panel raised
          600: '#124A59', // supplied — border
          500: '#196174', // derived  — border active / hover
        },
        teal: {
          DEFAULT: '#22819A', // supplied — brand, structural fills
        },
        sky: {
          DEFAULT: '#90C2E7', // supplied — primary highlight
        },
        mist: {
          DEFAULT: '#CDD4DD', // supplied — secondary text
        },
        paper: {
          DEFAULT: '#FEF7F8', // supplied — primary text
        },
        faint: {
          DEFAULT: '#8CA8B3', // derived — tertiary text, clears 4.5:1 on panel
        },

        /**
         * Semantic states sit outside the brand hue deliberately: a monitoring
         * wall cannot distinguish "on air" from "failed" using two shades of
         * the same blue.
         */
        signal: {
          live: '#5FD9A4',
          warn: '#E8B36B',
          fault: '#F2685C',
        },
      },
      fontFamily: {
        // Stand-in for Gotham Condensed Bold, which is commercially licensed
        // and cannot be vendored. Swap the first entry once a webfont licence
        // is in place — nothing else needs to change.
        display: ['Barlow Condensed', 'Montserrat', 'system-ui', 'sans-serif'],
        sans: ['Montserrat', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        panel: 'inset 0 1px 0 rgba(144,194,231,.06), 0 1px 2px rgba(0,0,0,.3)',
      },
    },
  },
  plugins: [],
};

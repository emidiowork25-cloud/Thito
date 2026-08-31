/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Chapa Quente Color Palette
        brand: {
          darkBg: '#031B2B',    // Navy/Dark Background
          cyan: '#11BACA',      // Cyan Accent
          orange: '#FFA24D',    // Warm Orange
          red: '#A60E35',       // Deep Red
        },
        // Semantic colors
        primary: '#FFA24D',     // Orange - Primary Action
        secondary: '#11BACA',   // Cyan - Secondary Action
        accent: '#A60E35',      // Red - Highlights
        dark: '#031B2B',        // Navy - Dark backgrounds
      },
    },
  },
  plugins: [],
};

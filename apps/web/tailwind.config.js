/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand palette — same hex values used in the HTML mockup
        primary: { DEFAULT: '#1E5F74', dark: '#16485A', light: '#2B7D96' },
        accent:  { DEFAULT: '#FF7A00', dark: '#E66E00', light: '#FFB774' },
        ink: '#1F2937',
        muted: '#6B7280',
        line: '#E5E7EB',
        bg:   '#F4F6F8',
      },
      fontFamily: {
        sans: ['Cairo', 'Tajawal', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.04)',
      },
    },
  },
  plugins: [require('tailwindcss-rtl')],
};

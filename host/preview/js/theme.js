tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        serif: ["Georgia", "ui-serif", "Times New Roman", "serif"],
      },
      colors: {
        cream: "#f4efe6",
        ink: "#2a2118",
        muted: "#6d6256",
        panel: "#fffdf8",
        line: "#e4d8c8",
        input: "#cbbba8",
        navy: "#1e2a3a",
        err: "#8a2a22",
        ok: "#2d5a3a",
        wait: "#7a5a20",
        waitbg: "#fff8e6",
        okbg: "#eef6ef",
        row: "#eadfce",
      },
    },
  },
}

document.write(`<style type="text/tailwindcss">
@layer base {
  a { @apply text-navy; }
}
@layer components {
  .banner { @apply bg-navy px-3 py-1.5 text-center text-xs tracking-wide text-cream; }
  .banner a { @apply text-cream underline-offset-2 hover:underline; }
  .wrap { @apply mx-auto max-w-5xl px-4 py-6 pb-16; }
  .app-header { @apply mb-2 flex flex-wrap items-baseline justify-between gap-4; }
  .app-header h1 { @apply mb-1 text-xl font-bold; }
  .muted { @apply text-sm text-muted; }
  .tabs { @apply mb-4 flex flex-wrap gap-x-3.5 gap-y-2 border-b border-line py-2 pb-3; }
  .tabs a { @apply text-sm text-muted no-underline; }
  .tabs a[aria-current="page"] { @apply border-b-2 border-navy pb-0.5 font-bold text-ink; }
  .panel { @apply mb-4 border border-line bg-panel p-4; }
  .panel h2 { @apply mb-2.5 mt-0 text-base font-bold; }
  .btn { @apply inline-block cursor-pointer border-0 bg-navy px-3.5 py-2 text-center font-serif text-white no-underline; }
  .btn-ghost { @apply border border-input bg-transparent text-navy; }
  .btn-row { @apply mt-3 flex flex-wrap gap-2; }
  .field { @apply mb-1 block text-sm; }
  .field-input { @apply w-full border border-input bg-white px-2.5 py-2 font-serif text-ink; }
  .grid-form { @apply grid items-end gap-2.5; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
  .cards { @apply mb-4 grid gap-3; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
  .card { @apply block border border-line bg-panel p-4 text-inherit no-underline; }
  .card strong { @apply mb-1.5 block; }
  .code { @apply mt-2 text-4xl font-bold tracking-[0.2em]; }
  table.data { @apply w-full border-collapse text-sm; }
  table.data th, table.data td { @apply border-b border-row px-1.5 py-2 text-left align-top; }
  table.data th { @apply text-xs font-bold text-muted; }
  .badge { @apply inline-block border px-2 py-0.5 text-xs tracking-wide; }
  .badge-wait { @apply border-[#e2c98a] bg-waitbg text-wait; }
  .badge-ok { @apply border-[#b7d4be] bg-okbg text-ok; }
  .callout { @apply mb-4 border border-line border-l-[3px] bg-panel p-4; }
  .callout-stop { @apply border-l-err; }
  .callout-warn { @apply border-l-wait; }
  .login-page { @apply grid min-h-[calc(100vh-28px)] place-items-center px-4 py-6; }
  .login-page form { @apply w-full max-w-sm border border-line bg-panel px-6 py-7; }
  .login-page h1 { @apply mb-2 text-xl font-bold; }
  .login-page .btn { @apply mt-4 w-full; }
  .rules dt { @apply mt-2.5 font-bold; }
  .rules dt:first-child { @apply mt-0; }
  .rules dd { @apply mt-1 text-muted; }
  .map ol { @apply list-decimal space-y-2.5 pl-5; }
  .map a { @apply font-bold; }
}
</style>`)
